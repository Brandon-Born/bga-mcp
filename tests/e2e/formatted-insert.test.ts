import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
} from '../helpers/packaged.js';

interface Result {
  queries: { tables: string[]; columns: string[]; text: string; interpolated: boolean }[];
  diagnostics: { status: string; findings: { code: string; message: string }[] };
  checks: { group: string; outcome: string }[];
}

it('[E2E-DATABASE-FORMATTED-INSERT] reads invariant INSERT targets and preserves unknown values through public consumers', async () => {
  const server = await installPackagedServer('formatted-insert', {
    modern: 'modern',
    legacy: 'legacy',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      const path = resolve(
        root,
        layout === 'modern' ? 'modules/php/Game.php' : 'bgamcplegacy.game.php',
      );
      const original = await readFile(path, 'utf8');
      // Original test source, not copied from a game or generated template.
      await writeFile(
        path,
        `${original}\nself::DbQuery(sprintf("INSERT INTO card (card_id, card_typo) VALUES %s", buildRows("private-row-canary")));\nself::DbQuery(sprintf("INSERT INTO absent (absent_id) VALUES %s", $rows));\nself::DbQuery(sprintf("INSERT INTO %s (card_id) VALUES %s", $table, $rows));`,
      );
      const before = await digestDirectory(root);
      await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
        expect((await client.listTools()).tools.map((tool) => tool.name)).toContain(
          'audit_database_usage',
        );
        const response = await callTool<Result>(client, 'audit_database_usage', {
          projectRoot: root,
        });
        expect(response.isError).toBe(false);
        expect(response.structured?.queries).toContainEqual(
          expect.objectContaining({
            tables: ['card'],
            columns: ['card.card_id', 'card.card_typo'],
            interpolated: false,
            text: 'INSERT INTO card (card_id, card_typo) VALUES %s',
          }),
        );
        const codes =
          response.structured?.diagnostics.findings.map((finding) => finding.code) ?? [];
        expect(codes).toContain('database.column.undeclared');
        expect(codes).toContain('database.table.undeclared');
        expect(codes).not.toContain('database.column.unused');
        expect(codes.filter((code) => code === 'database.unsupported-syntax')).toHaveLength(3);
        expect(JSON.stringify(response)).not.toContain('private-row-canary');
        expect(response.structured?.queries.flatMap((query) => query.tables)).not.toContain('s');
        for (const name of ['validate_project', 'run_pre_release_audit']) {
          const result = await callTool<Result>(client, name, { projectRoot: root });
          expect(result.isError).toBe(false);
          if (name === 'validate_project') {
            expect(result.structured?.diagnostics.status).not.toBe('passed');
            expect(
              result.structured?.diagnostics.findings.map((finding) => finding.code),
            ).toContain('database.unsupported-syntax');
          } else {
            expect(
              result.structured?.checks
                .filter((check) => check.group === 'database')
                .some((check) => check.outcome === 'unsupported'),
            ).toBe(true);
          }
          expect(JSON.stringify(result)).not.toContain('private-row-canary');
        }
        const resource = await client.readResource({ uri: 'bga://project/diagnostics' });
        expect(JSON.stringify(resource)).toContain('unresolved VALUES');
        expect(JSON.stringify(resource)).not.toContain('private-row-canary');
        const repeat = await callTool<Result>(client, 'audit_database_usage', {
          projectRoot: root,
        });
        expect(repeat.structured).toEqual(response.structured);
      });
      expect(await digestDirectory(root)).toBe(before);
    }
  } finally {
    await server.cleanup();
  }
}, 240_000);
