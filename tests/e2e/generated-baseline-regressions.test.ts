import { cp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

interface Result {
  diagnostics: { status: string; findings: { code: string; locations: { uri: string }[] }[] };
  components: { id: string; present: boolean; files: string[] }[];
  trace: { gameMethods: string[]; clientCalls: { source: string }[] };
  complete: { declarations: boolean; edges: boolean };
  checks: { group?: string; outcome: string }[];
  states: { initial: { ids: number[]; origin: string } };
}

let server: PackagedServer<'modern' | 'legacy' | 'hybrid'>;
beforeAll(async () => {
  server = await installPackagedServer('generated-baseline-regressions', {
    modern: 'modern-generated-regression',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
}, 240_000);
afterAll(async () => {
  await server.cleanup();
});

async function copy(name: string): Promise<string> {
  const root = resolve(server.temporaryRoot, 'variants', name);
  await cp(server.projects.modern, root, { recursive: true });
  return root;
}

it('[E2E-STATE-UNCONFIRMED-INITIAL] preserves the official class-only default ambiguity without false entry or reachability verdicts', async () => {
  for (const id of [2, 12]) {
    const root = await copy(`unconfirmed-initial-${String(id)}`);
    const gamePath = resolve(root, 'modules/php/Game.php');
    const game = await readFile(gamePath, 'utf8');
    await writeFile(gamePath, game.replace('return PlayerTurn::class;', 'return;'));
    const constantsPath = resolve(root, 'modules/php/StateConstants.php');
    const constants = await readFile(constantsPath, 'utf8');
    await writeFile(
      constantsPath,
      constants.replace('STATE_PLAYER_TURN = 2', `STATE_PLAYER_TURN = ${String(id)}`),
    );
    const before = await digestDirectory(root);
    await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
      const inspected = await callTool<Result>(client, 'inspect_project', { projectRoot: root });
      expect(inspected.structured?.states.initial).toMatchObject({ ids: [], origin: 'unresolved' });
      const states = await callTool<Result>(client, 'validate_state_machine', {
        projectRoot: root,
      });
      expect(states.structured?.complete).toMatchObject({ declarations: true, edges: false });
      const findings = states.structured?.diagnostics.findings ?? [];
      expect(findings).toContainEqual(
        expect.objectContaining({ code: 'project.states.unsupported' }),
      );
      expect(
        findings.find((finding) => finding.code === 'project.states.unsupported')?.locations.length,
      ).toBeGreaterThan(0);
      expect(findings.map((finding) => finding.code)).not.toContain('state.initial.missing');
      expect(findings.map((finding) => finding.code)).not.toContain('state.unreachable');
      const aggregate = await callTool<Result>(client, 'validate_project', {
        projectRoot: root,
        groups: ['state-machine'],
      });
      expect(aggregate.structured?.diagnostics.status).not.toBe('passed');
      const audit = await callTool<Result>(client, 'run_pre_release_audit', { projectRoot: root });
      const stateChecks =
        audit.structured?.checks.filter((check) => check.group === 'state-machine') ?? [];
      expect(stateChecks.length).toBeGreaterThan(0);
      expect(stateChecks.every((check) => check.outcome === 'unsupported')).toBe(true);
      for (const uri of [
        'bga://project/states',
        'bga://project/summary',
        'bga://project/diagnostics',
      ]) {
        const resource = await client.readResource({ uri });
        expect(JSON.stringify(resource)).toContain('unconfirmed');
      }
    });
    expect(await digestDirectory(root)).toBe(before);
    // Explicit setup returns remain readable for both state identifiers.
    await writeFile(gamePath, game);
    await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
      const inspected = await callTool<Result>(client, 'inspect_project', { projectRoot: root });
      expect(inspected.structured?.states.initial).toMatchObject({
        ids: [id],
        origin: 'setup-new-game',
      });
    });
  }
  // Independently migrated declarations retain the documented legacy default.
  await withPublicPackagedServer(
    server,
    ['--project-root', server.projects.hybrid],
    async (client) => {
      const inspected = await callTool<Result>(client, 'inspect_project', {
        projectRoot: server.projects.hybrid,
      });
      expect(inspected.structured?.states.initial).toMatchObject({ ids: [2], origin: 'default' });
    },
  );
  await withPublicPackagedServer(
    server,
    ['--project-root', server.projects.legacy],
    async (client) => {
      const inspected = await callTool<Result>(client, 'inspect_project', {
        projectRoot: server.projects.legacy,
      });
      expect(inspected.structured?.states.initial).toMatchObject({ ids: [1], origin: 'state-1' });
    },
  );
}, 180_000);

it('[E2E-INSPECT-JSONC-COMPONENTS] inventories JSONC, JSON, PHP and independently migrated components without inventing missing files', async () => {
  for (const [name, extensions] of [
    ['jsonc', ['jsonc', 'jsonc', 'jsonc']],
    ['json', ['json', 'json', 'json']],
    ['php', ['inc.php', 'inc.php', 'inc.php']],
    ['mixed', ['inc.php', 'jsonc', 'json']],
  ] as const) {
    const root = await copy(name);
    const stems = ['gameoptions', 'gamepreferences', 'stats'];
    for (const [index, stem] of stems.entries()) {
      const extension = extensions[index];
      if (extension === undefined) throw new Error('Missing configuration extension in test case');
      if (extension !== 'jsonc') {
        await rename(resolve(root, `${stem}.jsonc`), resolve(root, `${stem}.${extension}`));
      }
      await writeFile(
        resolve(root, `${stem}.${extension}`),
        extension === 'inc.php' ? '<?php' : '{}',
      );
    }
    const before = await digestDirectory(root);
    const session = await withPublicPackagedServer(
      server,
      ['--project-root', root],
      async (client) => {
        const response = await callTool<Result>(client, 'inspect_project', { projectRoot: root });
        expect(response.isError).toBe(false);
        expect(response.structured?.diagnostics.findings).toEqual([]);
        for (const id of ['options', 'preferences', 'statistics']) {
          expect(response.structured?.components.find((entry) => entry.id === id)?.present).toBe(
            true,
          );
        }
        const summary = await client.readResource({ uri: 'bga://project/summary' });
        expect(JSON.stringify(summary)).not.toContain('project.component.missing');
      },
    );
    expect(session.stderr).toBe('');
    expect(await digestDirectory(root)).toBe(before);
  }
  const missing = await copy('missing');
  await rm(resolve(missing, 'stats.jsonc'));
  await withPublicPackagedServer(server, ['--project-root', missing], async (client) => {
    const response = await callTool<Result>(client, 'inspect_project', { projectRoot: missing });
    expect(
      response.structured?.components.find((entry) => entry.id === 'statistics')?.present,
    ).toBe(false);
    expect(response.structured?.diagnostics.findings.map((finding) => finding.code)).toContain(
      'project.component.missing',
    );
  });
}, 180_000);

it('[E2E-CONTRACT-EDITOR-HELPERS] excludes helpers from contracts and preserves genuine runtime uncertainty and missing methods through every consumer', async () => {
  const root = server.projects.modern;
  const before = await digestDirectory(root);
  const session = await withPublicPackagedServer(
    server,
    ['--project-root', root],
    async (client) => {
      for (const name of [
        'validate_action_contracts',
        'validate_notifications',
        'audit_database_usage',
        'validate_project',
      ]) {
        const response = await callTool<Result>(client, name, { projectRoot: root });
        expect(response.isError).toBe(false);
        expect(response.structured?.diagnostics.findings, name).toEqual([]);
        if (name === 'validate_action_contracts') {
          expect(response.structured?.trace.gameMethods).not.toContain('missingRuntimeHandler');
          expect(response.structured?.trace.clientCalls).toHaveLength(2);
        }
      }
      const diagnostics = await client.readResource({ uri: 'bga://project/diagnostics' });
      expect(JSON.stringify(diagnostics)).not.toContain('referenceOnly');
      expect(JSON.stringify(diagnostics)).not.toContain('unsupported-syntax');
      const audit = await callTool<Result>(client, 'run_pre_release_audit', { projectRoot: root });
      expect(
        audit.structured?.checks
          .filter((check) => check.group === 'action-contracts' || check.group === 'notifications')
          .every((check) => check.outcome === 'passed'),
      ).toBe(true);
      expect(audit.structured?.checks.some((check) => check.outcome === 'manual-required')).toBe(
        true,
      );
    },
  );
  expect(session.stderr).toBe('');
  expect(await digestDirectory(root)).toBe(before);

  const declarationOnly = await copy('declaration-only');
  await rename(
    resolve(declarationOnly, 'modules/js/Game.js'),
    resolve(declarationOnly, 'modules/js/Game.d.ts'),
  );
  await withPublicPackagedServer(server, ['--project-root', declarationOnly], async (client) => {
    const response = await callTool<Result>(client, 'inspect_project', {
      projectRoot: declarationOnly,
    });
    expect(
      response.structured?.components.find((entry) => entry.id === 'client-logic')?.present,
    ).toBe(false);
    expect(response.structured?.diagnostics.findings.map((finding) => finding.code)).toContain(
      'project.component.missing',
    );
  });

  const computed = await copy('computed');
  const clientPath = resolve(computed, 'modules/js/Game.js');
  await writeFile(
    clientPath,
    (await readFile(clientPath, 'utf8')) + '\nthis.bga.actions.performAction(actionName, args);\n',
  );
  await withPublicPackagedServer(server, ['--project-root', computed], async (client) => {
    const response = await callTool<Result>(client, 'validate_action_contracts', {
      projectRoot: computed,
    });
    expect(response.structured?.diagnostics.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'action.unsupported-syntax',
          locations: [{ uri: 'modules/js/Game.js' }],
        }),
      ]),
    );
  });

  const legacy = server.projects.legacy;
  const game = resolve(legacy, 'bgamcplegacy.game.php');
  await writeFile(
    game,
    (await readFile(game, 'utf8')).replace('function actPass(', 'function realOtherMethod('),
  );
  await writeFile(
    resolve(legacy, '_ide_helper.php'),
    '<?php class FrameworkReference { public function actPass($comment) {} }',
  );
  await withPublicPackagedServer(server, ['--project-root', legacy], async (client) => {
    const response = await callTool<Result>(client, 'validate_action_contracts', {
      projectRoot: legacy,
    });
    expect(response.structured?.diagnostics.findings.map((finding) => finding.code)).toContain(
      'action.game-method.missing',
    );
  });
}, 180_000);

it('[E2E-STATE-DELEGATED-RETURNS] resolves documented delegation and keeps missing or computed delegates inconclusive across state and aggregate consumers', async () => {
  const root = server.projects.modern;
  const before = await digestDirectory(root);
  const session = await withPublicPackagedServer(
    server,
    ['--project-root', root],
    async (client) => {
      const states = await callTool<Result>(client, 'validate_state_machine', {
        projectRoot: root,
      });
      expect(states.structured?.complete).toEqual({ declarations: true, edges: true });
      expect(states.structured?.diagnostics.findings).toEqual([]);
      const resource = await client.readResource({ uri: 'bga://project/states' });
      expect(JSON.stringify(resource)).not.toContain('cannot resolve');
      const statePayload = JSON.parse((resource.contents[0] as { text: string }).text) as Result;
      expect(statePayload.complete).toEqual({ declarations: true, edges: true });
      const aggregate = await callTool<Result>(client, 'validate_project', { projectRoot: root });
      expect(aggregate.structured?.diagnostics.findings).toEqual([]);
      const audit = await callTool<Result>(client, 'run_pre_release_audit', { projectRoot: root });
      expect(
        audit.structured?.checks
          .filter((check) => check.group === 'state-machine')
          .every((check) => check.outcome === 'passed'),
      ).toBe(true);
    },
  );
  expect(session.stderr).toBe('');
  expect(await digestDirectory(root)).toBe(before);

  for (const [name, expression] of [
    ['missing-delegate', '$this->actAbsent()'],
    ['computed-delegate', '$this->{$action}()'],
  ] as const) {
    const partial = await copy(name);
    const file = resolve(partial, 'modules/php/States/PlayerTurn.php');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace('$this->actAdvance($playerId)', expression),
    );
    await withPublicPackagedServer(server, ['--project-root', partial], async (client) => {
      for (const tool of ['validate_state_machine', 'validate_project']) {
        const response = await callTool<Result>(client, tool, { projectRoot: partial });
        const codes = response.structured?.diagnostics.findings.map((finding) => finding.code);
        expect(codes).toContain('project.states.unsupported');
        expect(codes).not.toContain('state.dead-end');
        expect(codes).not.toContain('state.unreachable');
      }
      const audit = await callTool<Result>(client, 'run_pre_release_audit', {
        projectRoot: partial,
      });
      expect(
        audit.structured?.checks
          .filter((check) => check.group === 'state-machine')
          .some((check) => check.outcome === 'unsupported'),
      ).toBe(true);
    });
  }
}, 180_000);
