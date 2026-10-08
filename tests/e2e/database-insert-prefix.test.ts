import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AuditDatabaseUsageOutputSchema } from '../../src/tools/audit-database-usage.js';
import type { RunPreReleaseAuditOutputSchema } from '../../src/tools/run-pre-release-audit.js';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
} from '../helpers/packaged.js';

type Database = ReturnType<typeof AuditDatabaseUsageOutputSchema.parse>;
type Audit = ReturnType<typeof RunPreReleaseAuditOutputSchema.parse>;
const QUERY_CHECKS = [
  'database.table.undeclared',
  'database.column.undeclared',
  'database.column.unused',
  'database.query.interpolated',
];

it('[E2E-DATABASE-INSERT-PREFIX] separates readable INSERT targets from unknown tails across installed consumers and layouts', async () => {
  const server = await installPackagedServer('insert-prefix', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      const path = resolve(
        root,
        layout === 'legacy' ? 'bgamcplegacy.game.php' : 'modules/php/Game.php',
      );
      await writeFile(
        path,
        `<?php class PrefixProbe {
          public function setup(): void {
            self::DbQuery('INSERT INTO player (player_id, player_name) VALUES ' . implode(',', makeRows('private-tail-canary')));
          }
        }`,
      );
      await writeFile(resolve(root, 'dbmodel.sql'), '-- No custom tables\n');
      const before = await digestDirectory(root);
      const session = await withPublicPackagedServer(
        server,
        ['--project-root', root],
        async (client) => {
          expect((await client.listTools()).tools).toHaveLength(7);
          expect((await client.listResources()).resources).toHaveLength(3);
          const response = await callTool<Database>(client, 'audit_database_usage', {});
          expect(response.isError).toBe(false);
          expect(response.structured?.layout).toBe(layout);
          expect(response.structured?.queries).toEqual([
            {
              tables: ['player'],
              columns: ['player.player_id', 'player.player_name'],
              interpolated: false,
              text: 'INSERT INTO player (player_id, player_name) VALUES [unresolved]',
              source: layout === 'legacy' ? 'bgamcplegacy.game.php' : 'modules/php/Game.php',
            },
          ]);
          expect(response.structured?.diagnostics.status).toBe('unsupported');
          expect(
            response.structured?.diagnostics.findings.map((finding) => finding.code),
          ).not.toContain('database.audit.unavailable');
          expect(JSON.stringify(response)).toContain('unresolved VALUES');
          expect(JSON.stringify(response)).not.toMatch(/private-tail-canary|makeRows/);
          expect(await callTool<Database>(client, 'audit_database_usage', {})).toEqual(response);
          const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(
            audit.structured?.checks.find((check) => check.id === 'database.audit.unavailable')
              ?.outcome,
          ).toBe('passed');
          for (const id of QUERY_CHECKS)
            expect(audit.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
              'unsupported',
            );
          expect(JSON.stringify(audit)).toContain('unresolved VALUES');
          const aggregate = await callTool<{ diagnostics: Database['diagnostics'] }>(
            client,
            'validate_project',
            {},
          );
          expect(aggregate.structured?.diagnostics.status).not.toBe('passed');
          expect(JSON.stringify(aggregate)).toContain('unresolved VALUES');
          const resource = await client.readResource({ uri: 'bga://project/diagnostics' });
          expect(JSON.stringify(resource)).toContain('unresolved VALUES');
          expect(JSON.stringify([audit, aggregate, resource])).not.toMatch(
            /private-tail-canary|makeRows/,
          );
          const outside = await callTool(client, 'audit_database_usage', {
            projectRoot: server.temporaryRoot,
          });
          expect(outside.isError).toBe(true);
          expect(outside.text).toContain('policy.root.not-allowed');
        },
      );
      expect(session.stderr).toBe('');
      expect(await digestDirectory(root)).toBe(before);
    }
  } finally {
    await server.cleanup();
  }
}, 240_000);

it('[E2E-DATABASE-INSERT-PREFIX-NEGATIVE] refuses operators that can replace the INSERT and reports unreadable queries', async () => {
  const server = await installPackagedServer('insert-prefix-negative', { modern: 'modern' });
  const root = server.projects.modern;
  try {
    await writeFile(resolve(root, 'dbmodel.sql'), '-- No custom tables\n');
    const session = await withPublicPackagedServer(
      server,
      ['--project-root', root],
      async (client) => {
        for (const expression of [
          `'INSERT INTO ghost (id) VALUES ' . $rows ? 'DELETE FROM player' : 'UPDATE player SET player_id=1'`,
          `'INSERT INTO ghost (id) VALUES ' . $rows . ' suffix'`,
          `'INSERT INTO ' . $table . ' (id) VALUES ' . $rows`,
        ]) {
          await writeFile(
            resolve(root, 'modules/php/Game.php'),
            `<?php self::DbQuery(${expression});`,
          );
          const before = await digestDirectory(root);
          const response = await callTool<Database>(client, 'audit_database_usage', {});
          expect(response.isError).toBe(false);
          expect(response.structured?.queries).toEqual([]);
          expect(response.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
          expect(
            response.structured?.diagnostics.findings.map((finding) => finding.code),
          ).toContain('database.audit.unavailable');
          expect(
            response.structured?.diagnostics.findings.map((finding) => finding.code),
          ).not.toContain('database.table.undeclared');
          const aggregate = await callTool<{ diagnostics: Database['diagnostics'] }>(
            client,
            'validate_project',
            {},
          );
          expect(aggregate.structured?.diagnostics.status).not.toBe('passed');
          expect(JSON.stringify(aggregate)).toContain('database.unsupported-syntax');
          expect(
            JSON.stringify(await client.readResource({ uri: 'bga://project/diagnostics' })),
          ).toContain('database.unsupported-syntax');
          const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(
            audit.structured?.checks.find((check) => check.id === 'database.audit.unavailable')
              ?.outcome,
          ).toBe('failed');
          for (const id of QUERY_CHECKS)
            expect(audit.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
              'unsupported',
            );
          expect(await digestDirectory(root)).toBe(before);
        }
      },
    );
    expect(session.stderr).toBe('');
  } finally {
    await server.cleanup();
  }
}, 240_000);
