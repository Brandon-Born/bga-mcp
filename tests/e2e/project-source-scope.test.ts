import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

const SCOPE = 'project.source.unsupported-syntax';
interface Result {
  fileCount?: number;
  diagnostics?: { status: string; findings: { code: string; locations: { uri: string }[] }[] };
  trace?: { sent?: { source: string }[]; clientCalls?: { source: string }[] };
  queries?: { source: string }[];
  checks?: { outcome: string }[];
}
const tools = [
  'inspect_project',
  'validate_state_machine',
  'validate_action_contracts',
  'validate_notifications',
  'audit_database_usage',
  'validate_project',
  'run_pre_release_audit',
];
let server: PackagedServer<'mixed' | 'legacy' | 'hybrid'>;
beforeAll(async () => {
  server = await installPackagedServer('project-source-scope', {
    mixed: 'modern-source-scope-unreadable',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
}, 240_000);
afterAll(async () => {
  await server.cleanup();
});

it('[E2E-PROJECT-SOURCE-SCOPE] inventories copied and disabled sources without turning them into production contracts or clean verdicts', async () => {
  const root = server.projects.mixed;
  const before = await digestDirectory(root);
  const expected = JSON.parse(
    await readFile(
      new URL('../fixtures/projects/modern-source-scope-unreadable/expected.json', import.meta.url),
      'utf8',
    ),
  ) as { files: string[] };
  const session = await withPublicPackagedServer(
    server,
    ['--project-root', root],
    async (client) => {
      for (const tool of tools) {
        const response = await callTool<Result>(client, tool, { projectRoot: root });
        expect(response.isError, tool).toBe(false);
        const result = response.structured;
        expect(result, tool).toBeDefined();
        if (tool === 'run_pre_release_audit') {
          const automated = result?.checks?.filter((check) => check.outcome !== 'manual-required');
          expect(automated?.length).toBeGreaterThan(0);
          expect(automated?.every((check) => check.outcome === 'unsupported')).toBe(true);
          expect(await digestDirectory(root)).toBe(before);
          continue;
        }
        expect(result?.diagnostics?.status, tool).toBe('unsupported');
        expect(result?.diagnostics?.findings.length, tool).toBeGreaterThanOrEqual(1);
        expect(
          result?.diagnostics?.findings.every((finding) => finding.code === SCOPE),
          tool,
        ).toBe(true);
        expect(
          new Set(
            result?.diagnostics?.findings.flatMap((finding) =>
              finding.locations.map((location) => location.uri),
            ),
          ),
        ).toEqual(
          new Set([
            'misc/generator.php',
            'tests/sample.js',
            'private/studio-baseline/modules/php/Game.php',
            'private/studio-baseline/modules/js/Game.js',
          ]),
        );
        expect(await digestDirectory(root)).toBe(before);
        if (tool === 'inspect_project') expect(result?.fileCount).toBe(expected.files.length);
        if (tool === 'validate_notifications') expect(result?.trace?.sent).toHaveLength(1);
        if (tool === 'validate_action_contracts')
          expect(result?.trace?.clientCalls).toHaveLength(2);
        if (tool === 'audit_database_usage') {
          expect(result?.queries?.length).toBeGreaterThan(0);
          expect(result?.queries?.every((query) => query.source.startsWith('modules/'))).toBe(true);
        }
      }
      for (const uri of ['bga://project/summary', 'bga://project/diagnostics']) {
        const response = await client.readResource({ uri });
        expect(JSON.stringify(response)).toContain(SCOPE);
        expect(JSON.stringify(response)).not.toContain('absent_table');
      }
      const states = await client.readResource({ uri: 'bga://project/states' });
      const content = states.contents[0];
      expect(content).toHaveProperty('text');
      if (content === undefined || !('text' in content)) throw new Error('Missing states JSON');
      const parsed = JSON.parse(content.text) as {
        sources: string[];
        validation: Result['diagnostics'];
      };
      expect(parsed.sources.every((source) => source.startsWith('modules/php/States/'))).toBe(true);
      expect(parsed.validation?.status).toBe('unsupported');
    },
  );
  expect(session.stderr).toBe('');
  expect(await digestDirectory(root)).toBe(before);
}, 180_000);

it('[E2E-PROJECT-SOURCE-SELECTION] binds the verdict to an explicit canonical root and retains legacy contracts without expanding access', async () => {
  const canonical = resolve(server.temporaryRoot, 'canonical');
  await cp(server.projects.mixed, canonical, { recursive: true });
  // Caller preparation, never server mutation. This is a different source set.
  for (const path of ['private', 'misc', 'tests'])
    await rm(resolve(canonical, path), { recursive: true });
  const before = await digestDirectory(canonical);
  const session = await withPublicPackagedServer(
    server,
    ['--project-root', canonical],
    async (client) => {
      for (const tool of tools) {
        const response = await callTool<Result>(client, tool, {});
        expect(response.isError, tool).toBe(false);
        if (tool !== 'run_pre_release_audit')
          expect(response.structured?.diagnostics?.findings, tool).toEqual([]);
      }
      const refused = await callTool(client, 'inspect_project', {
        projectRoot: server.projects.mixed,
      });
      expect(refused.isError).toBe(true);
      expect(JSON.stringify(refused)).not.toContain('absent_table');
      expect(
        (await callTool<Result>(client, 'inspect_project', {})).structured?.diagnostics?.status,
      ).toBe('passed');
    },
  );
  expect(session.stderr).toBe('');
  expect(await digestDirectory(canonical)).toBe(before);
  await expect(readFile(resolve(canonical, 'tests/sample.js'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  for (const root of [server.projects.legacy, server.projects.hybrid]) {
    const legacyBefore = await digestDirectory(root);
    await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
      for (const tool of tools) {
        const response = await callTool<Result>(client, tool, {});
        expect(response.isError, tool).toBe(false);
        expect(
          response.structured?.diagnostics?.findings.some((finding) => finding.code === SCOPE),
          tool,
        ).not.toBe(true);
      }
      for (const uri of [
        'bga://project/summary',
        'bga://project/diagnostics',
        'bga://project/states',
      ]) {
        expect(JSON.stringify(await client.readResource({ uri }))).not.toContain(SCOPE);
      }
    });
    expect(await digestDirectory(root)).toBe(legacyBefore);
  }
}, 180_000);

it('[E2E-PROJECT-SOURCE-MODULES] reads ignored and unusually located modules while reporting arbitrary outside source uncertainty', async () => {
  const root = resolve(server.temporaryRoot, 'module-control');
  await cp(server.projects.mixed, root, { recursive: true });
  await writeFile(
    resolve(root, 'modules/Shared/Runtime.php'),
    "<?php class SharedRuntime { public function send() { $this->notifyAllPlayers('runtimeControl', '', []); } }\n",
  );
  // Outside source is classified before consuming the contract-read budget.
  await writeFile(resolve(root, 'aaa-bulk.php'), '<?php ' + ' '.repeat(262_145));
  const before = await digestDirectory(root);
  await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
    const result = (await callTool<Result>(client, 'validate_notifications', {})).structured;
    expect(
      result?.trace?.sent?.filter((entry) => entry.source === 'modules/Shared/Runtime.php'),
    ).toHaveLength(1);
    expect(
      result?.diagnostics?.findings.filter(
        (finding) => finding.code === 'notification.sent.not-handled',
      ),
    ).toEqual([expect.objectContaining({ locations: [{ uri: 'modules/Shared/Runtime.php' }] })]);
    expect(result?.diagnostics?.findings.filter((finding) => finding.code === SCOPE)).toHaveLength(
      1,
    );
    expect(
      result?.diagnostics?.findings.find((finding) => finding.code === SCOPE)?.locations,
    ).toContainEqual({ uri: 'aaa-bulk.php' });
    const aggregate = (await callTool<Result>(client, 'validate_project', {})).structured;
    expect(
      aggregate?.diagnostics?.findings.some(
        (finding) => finding.code === 'notification.sent.not-handled',
      ),
    ).toBe(true);
  });
  expect(await digestDirectory(root)).toBe(before);
}, 180_000);
