import { link, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DiagnosticResult } from '../../src/diagnostics.js';
import type { RunPreReleaseAuditOutputSchema } from '../../src/tools/run-pre-release-audit.js';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
} from '../helpers/packaged.js';

interface Result {
  diagnostics: DiagnosticResult;
}
type Audit = ReturnType<typeof RunPreReleaseAuditOutputSchema.parse>;
const CODE = 'state.transition.name-undeclared';
const UNKNOWN = 'state.transition.call-unresolved';
/** Replace only this installed directory entry, preserving pnpm hardlinked peers. */
async function replaceInstalledModule(path: string, text: string): Promise<void> {
  const temporary = path + '.state-transition-probe';
  await writeFile(temporary, text);
  await rename(temporary, path);
}

const states = (shared = false) => `<?php
$machinestates = [
  2 => ['name' => 'chooseCard', 'type' => 'activeplayer', 'possibleactions' => [], 'transitions' => ['resolve' => 3]],
  3 => ['name' => 'roundEnd', 'type' => 'game', 'action' => 'stRoundEnd', 'transitions' => ['nextRound' => 2, 'finish' => 99]],
  ${shared ? "4 => ['name' => 'shared', 'type' => 'game', 'action' => 'stRoundEnd', 'transitions' => ['different' => 99]]," : ''}
];`;

it('[E2E-STATE-HANDLER-TRANSITIONS] diagnoses and repairs a round-flow typo across installed state consumers without changing the game', async () => {
  const server = await installPackagedServer('handler-transitions', {
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      const source = layout === 'legacy' ? 'bgamcplegacy.game.php' : 'modules/php/Game.php';
      // Delete no project files; use an original array-state round flow in each copied fixture.
      await writeFile(resolve(root, 'states.inc.php'), states());
      const game = async (body: string) =>
        await writeFile(
          resolve(root, source),
          `<?php\nclass ${layout === 'legacy' ? 'BgaMcpLegacy' : 'Game'} {\n  function stRoundEnd() {\n    ${body}\n  }\n}`,
        );
      await game('$this->gamestate->nextState("endRound");');
      let before = await digestDirectory(root);
      const session = await withPublicPackagedServer(
        server,
        ['--project-root', root],
        async (client) => {
          expect((await client.listTools()).tools).toHaveLength(7);
          const response = await callTool<Result>(client, 'validate_state_machine', {});
          expect(response.isError).toBe(false);
          const finding = response.structured?.diagnostics.findings.find(
            (entry) => entry.code === CODE,
          );
          expect(finding).toMatchObject({
            kind: 'heuristic',
            certainty: 'likely',
            locations: [
              { uri: source, range: { start: { line: 4, column: 5 } } },
              { uri: 'states.inc.php' },
            ],
          });
          expect(finding?.message).toContain('roundEnd');
          expect(finding?.suggestions[0]?.message).toContain('nextRound');
          expect(finding?.evidence[0]?.message).toContain('finish');
          expect(await callTool<Result>(client, 'validate_state_machine', {})).toEqual(response);
          const aggregate = await callTool<Result>(client, 'validate_project', {});
          expect(aggregate.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(
            CODE,
          );
          const resource = await client.readResource({ uri: 'bga://project/diagnostics' });
          expect(JSON.stringify(resource)).toContain(CODE);
          const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(audit.structured?.checks.find((entry) => entry.id === CODE)?.outcome).toBe(
            'failed',
          );
          expect(await digestDirectory(root)).toBe(before);

          // The caller edits the same root; MCP observes the repair without writing it.
          await game('$this->gamestate->nextState("nextRound");');
          before = await digestDirectory(root);
          const repaired = await callTool<Result>(client, 'validate_state_machine', {});
          expect(
            repaired.structured?.diagnostics.findings.map((entry) => entry.code),
          ).not.toContain(CODE);
          const repairedAudit = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(repairedAudit.structured?.checks.find((entry) => entry.id === CODE)?.outcome).toBe(
            'passed',
          );
          expect(await digestDirectory(root)).toBe(before);

          for (const body of [
            '$this->gamestate->nextState($chosen);',
            '$later = function () { $this->gamestate->nextState("wrong"); };',
            '$later = FUNCTION () { $this->gamestate->nextState("wrong"); };',
            '$later = FN () => $this->gamestate->nextState("wrong");',
          ]) {
            await game(body);
            const unknown = await callTool<Result>(client, 'validate_state_machine', {});
            expect(unknown.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(
              UNKNOWN,
            );
            expect(
              unknown.structured?.diagnostics.findings.map((entry) => entry.code),
            ).not.toContain(CODE);
            const unknownAudit = await callTool<Audit>(client, 'run_pre_release_audit', {});
            expect(
              unknownAudit.structured?.checks.find((entry) => entry.id === CODE)?.outcome,
            ).toBe('unsupported');
          }

          for (const body of [
            '$THIS->gamestate->nextState("wrong");',
            '$other-> /* dynamic property */ $this->gamestate->nextState("wrong");',
            '$this->GameState->nextState("wrong");',
            '// $this->gamestate->nextState("wrong");',
            '$text = \'$this->gamestate->nextState("wrong");\';',
          ]) {
            await game(body);
            const unrelated = await callTool<Result>(client, 'validate_state_machine', {});
            expect(
              unrelated.structured?.diagnostics.findings.map((entry) => entry.code),
            ).not.toContain(CODE);
          }
          await writeFile(
            resolve(root, source),
            `<?php class ${layout === 'legacy' ? 'BgaMcpLegacy' : 'Game'} {}`,
          );
          await mkdir(resolve(root, 'modules/php'), { recursive: true });
          await writeFile(
            resolve(root, 'modules/php/Unrelated.php'),
            `<?php class Other { function stRoundEnd() { $this->gamestate->nextState('wrong'); } }`,
          );
          const unrelated = await callTool<Result>(client, 'validate_state_machine', {});
          expect(
            unrelated.structured?.diagnostics.findings.map((entry) => entry.code),
          ).not.toContain(CODE);
          expect(unrelated.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(
            UNKNOWN,
          );
          await writeFile(
            resolve(root, 'states.inc.php'),
            states().replace("'nextRound' => 2, 'finish' => 99", "'' => 99"),
          );
          await game('$this->gamestate->nextState();');
          const unnamed = await callTool<Result>(client, 'validate_state_machine', {});
          expect(unnamed.structured?.diagnostics.findings.map((entry) => entry.code)).not.toContain(
            CODE,
          );
          await writeFile(resolve(root, 'states.inc.php'), states(true));
          await game('$this->gamestate->nextState("wrong");');
          const finalDigest = await digestDirectory(root);
          const shared = await callTool<Result>(client, 'validate_state_machine', {});
          expect(shared.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(
            UNKNOWN,
          );
          expect(shared.structured?.diagnostics.findings.map((entry) => entry.code)).not.toContain(
            CODE,
          );
          const outside = await callTool(client, 'validate_state_machine', {
            projectRoot: server.temporaryRoot,
          });
          expect(outside.isError).toBe(true);
          expect(outside.text).toContain('policy.root.not-allowed');
          expect(await digestDirectory(root)).toBe(finalDigest);
        },
      );
      expect(session.stderr).toBe('');
    }
  } finally {
    await server.cleanup();
  }
}, 240_000);

it('[E2E-STATE-HANDLER-TRANSITIONS] detects an installed checker-removal mutant and restores the original module', async () => {
  const server = await installPackagedServer('handler-transition-mutation', { legacy: 'legacy' });
  const root = server.projects.legacy;
  const modulePath = resolve(server.packageRoot, 'dist/rules/state-machine.js');
  const original = await readFile(modulePath, 'utf8');
  const peer = resolve(server.temporaryRoot, 'state-machine-hardlinked-peer.js');
  try {
    await link(modulePath, peer);
    expect(await readFile(peer, 'utf8')).toBe(original);
    await writeFile(resolve(root, 'states.inc.php'), states());
    await writeFile(
      resolve(root, 'bgamcplegacy.game.php'),
      `<?php class BgaMcpLegacy {
      function stRoundEnd() { $this->gamestate->nextState('endRound'); }
    }`,
    );
    const before = await digestDirectory(root);
    const invoke = async () =>
      (
        await withPublicPackagedServer(
          server,
          ['--project-root', root],
          async (client) => await callTool<Result>(client, 'validate_state_machine', {}),
        )
      ).result;
    const baseline = await invoke();
    expect(baseline.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(CODE);
    const mutant = original.replace(
      '...validateHandlerTransitions(model, sources, signal)',
      '...[]',
    );
    expect(mutant).not.toBe(original);
    await replaceInstalledModule(modulePath, mutant);
    expect(await readFile(modulePath, 'utf8')).toBe(mutant);
    expect(await readFile(peer, 'utf8')).toBe(original);
    const mutated = await invoke();
    expect(mutated.isError).toBe(false);
    expect(mutated.structured?.diagnostics).toMatchObject({
      schemaVersion: 1,
      status: 'passed',
      findings: [],
    });
    expect(() =>
      expect(mutated.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(CODE),
    ).toThrow();
    expect(await readFile(modulePath, 'utf8')).toBe(mutant);
    expect(await readFile(peer, 'utf8')).toBe(original);
    await replaceInstalledModule(modulePath, original);
    const restored = await invoke();
    expect(restored.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(CODE);
    expect(await readFile(modulePath, 'utf8')).toBe(original);
    expect(await readFile(peer, 'utf8')).toBe(original);
    expect(await digestDirectory(root)).toBe(before);
  } finally {
    await replaceInstalledModule(modulePath, original);
    await server.cleanup();
  }
}, 240_000);

it('[E2E-STATE-HANDLER-TRANSITIONS] retains explicit unknown coverage when the real installed project listing is truncated', async () => {
  const server = await installPackagedServer('handler-transition-listing', { legacy: 'legacy' });
  const root = server.projects.legacy;
  try {
    await writeFile(resolve(root, 'states.inc.php'), states());
    await writeFile(
      resolve(root, 'bgamcplegacy.game.php'),
      `<?php class BgaMcpLegacy {
      function stRoundEnd() { $this->gamestate->nextState('endRound'); }
    }`,
    );
    const noise = resolve(root, 'zz-listing-budget');
    await mkdir(noise);
    for (let start = 0; start < 5_100; start += 100) {
      await Promise.all(
        Array.from(
          { length: 100 },
          async (_, index) =>
            await writeFile(resolve(noise, `file-${String(start + index)}.txt`), ''),
        ),
      );
    }
    const before = await digestDirectory(root);
    await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
      const result = await callTool<Result>(client, 'validate_state_machine', {});
      expect(result.isError).toBe(false);
      expect(result.structured?.diagnostics.status).not.toBe('passed');
      expect(result.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(UNKNOWN);
      expect(result.structured?.diagnostics.findings.map((entry) => entry.code)).not.toContain(
        CODE,
      );
      const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
      expect(audit.structured?.checks.find((entry) => entry.id === CODE)?.outcome).toBe(
        'unsupported',
      );
    });
    expect(await digestDirectory(root)).toBe(before);
  } finally {
    await server.cleanup();
  }
}, 240_000);

it('[E2E-STATE-HANDLER-TRANSITIONS] preserves the existing unsupported state-class imperative-transition boundary', async () => {
  const server = await installPackagedServer('handler-transition-state-class', {
    modern: 'modern-state-classes',
  });
  const root = server.projects.modern;
  try {
    const path = resolve(root, 'modules/php/States/NextPlayer.php');
    const original = await readFile(path, 'utf8');
    expect(original).toContain("return 'nextTurn';");
    await writeFile(
      path,
      original.replace(
        "return 'nextTurn';",
        "$this->gamestate->nextState('notNamed'); return 'nextTurn';",
      ),
    );
    const before = await digestDirectory(root);
    await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
      const result = await callTool<Result>(client, 'validate_state_machine', {});
      expect(result.isError).toBe(false);
      expect(result.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
      expect(JSON.stringify(result.structured?.diagnostics)).toContain('imperative nextState');
      expect(result.structured?.diagnostics.findings.map((entry) => entry.code)).not.toContain(
        CODE,
      );
    });
    expect(await digestDirectory(root)).toBe(before);
  } finally {
    await server.cleanup();
  }
}, 240_000);
