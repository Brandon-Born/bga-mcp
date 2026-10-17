import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AuditDatabaseUsageOutputSchema } from '../../src/tools/audit-database-usage.js';
import type { RunPreReleaseAuditOutputSchema } from '../../src/tools/run-pre-release-audit.js';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
} from '../helpers/packaged.js';

type Database = ReturnType<typeof AuditDatabaseUsageOutputSchema.parse>;
type Audit = ReturnType<typeof RunPreReleaseAuditOutputSchema.parse>;

it('[E2E-DATABASE-ALIAS-BINDINGS] preserves alias ownership through installed tools, resources and layouts', async () => {
  const server = await installPackagedServer('alias-bindings', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      const phpPath = resolve(
        root,
        layout === 'legacy' ? 'bgamcplegacy.game.php' : 'modules/php/Game.php',
      );
      const original = (await readFile(phpPath, 'utf8')).replace(
        /\b(?:DbQuery|getObjectListFromDB)\b/gu,
        'fixtureExample',
      );
      await writeFile(
        resolve(root, 'dbmodel.sql'),
        'CREATE TABLE card (card_id INT); CREATE TABLE token (token_id INT);',
      );
      const session = await withPublicPackagedServer(
        server,
        ['--project-root', root],
        async (client) => {
          for (const from of ['card AS token JOIN token AS t', 'token t JOIN card token']) {
            await writeFile(
              phpPath,
              original +
                `\nself::DbQuery("SELECT token.card_id, t.token_id FROM ${from} ON token.card_id = t.token_id WHERE token.card_id = 'private-alias-canary JOIN card private_alias_canary JOIN card private_alias_canary private_alias_canary.card_secret'");`,
            );
            const before = await digestDirectory(root);
            const result = await callTool<Database>(client, 'audit_database_usage', {});
            expect(result.isError).toBe(false);
            expect(result.structured?.queries[0]?.columns).toEqual([
              'card.card_id',
              'token.token_id',
            ]);
            expect(result.structured?.diagnostics.findings).toEqual([]);
            expect(JSON.stringify(result)).not.toContain('private-alias-canary');
            expect(JSON.stringify(result)).not.toContain('private_alias_canary');
            expect(await callTool<Database>(client, 'audit_database_usage', {})).toEqual(result);
            const aggregate = await callTool<{ diagnostics: Database['diagnostics'] }>(
              client,
              'validate_project',
              { groups: ['database'] },
            );
            expect(aggregate.structured?.diagnostics.findings).toEqual([]);
            const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
            for (const id of ['database.column.undeclared', 'database.column.unused'])
              expect(audit.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
                'passed',
              );
            const resource = JSON.stringify(
              await client.readResource({ uri: 'bga://project/diagnostics' }),
            );
            expect(resource).not.toContain('database.column.undeclared');
            expect(resource).not.toContain('database.column.unused');
            expect(resource).not.toContain('private-alias-canary');
            expect(await digestDirectory(root)).toBe(before);
          }
          for (const query of [
            'SELECT a.card_id FROM card a JOIN token a ON a.card_id = a.card_id',
            'SELECT a.card_id, A.token_id FROM card a JOIN token A ON a.card_id = A.token_id',
            'SELECT card.card_id FROM card c',
            'SELECT card_id FROM card c JOIN card d ON c.card_id = d.card_id',
          ]) {
            await writeFile(phpPath, original + `\nself::DbQuery("${query}");`);
            const before = await digestDirectory(root);
            const result = await callTool<Database>(client, 'audit_database_usage', {});
            expect(result.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
            expect(
              result.structured?.diagnostics.findings.filter(
                (finding) => finding.code !== 'database.unsupported-syntax',
              ),
            ).toEqual([]);
            const held = await callTool<Audit>(client, 'run_pre_release_audit', {});
            for (const id of ['database.column.undeclared', 'database.column.unused'])
              expect(held.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
                'unsupported',
              );
            expect(await digestDirectory(root)).toBe(before);
          }
          await writeFile(
            phpPath,
            original +
              '\nself::DbQuery("SELECT token.missing, t.token_id FROM card token JOIN token t ON token.card_id = t.token_id");',
          );
          const missing = await callTool<Database>(client, 'audit_database_usage', {});
          expect(
            missing.structured?.diagnostics.findings.find(
              (finding) => finding.code === 'database.column.undeclared',
            )?.message,
          ).toContain("table 'card'");
          const outside = await callTool(client, 'audit_database_usage', {
            projectRoot: server.temporaryRoot,
          });
          expect(outside.isError).toBe(true);
          expect(outside.text).toContain('policy.root.not-allowed');
        },
      );
      expect(session.stderr).toBe('');
    }
  } finally {
    await server.cleanup();
  }
});

it('[E2E-DATABASE-TABLE-CASE] preserves runtime table-case uncertainty through installed consumers and layouts', async () => {
  const server = await installPackagedServer('table-case', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      const phpPath = resolve(
        root,
        layout === 'legacy' ? 'bgamcplegacy.game.php' : 'modules/php/Game.php',
      );
      const original = (await readFile(phpPath, 'utf8')).replace(
        /\b(?:DbQuery|getObjectListFromDB)\b/gu,
        'fixtureExample',
      );
      const schemaPath = resolve(root, 'dbmodel.sql');
      const session = await withPublicPackagedServer(
        server,
        ['--project-root', root],
        async (client) => {
          for (const [schema, query, table, duplicateOutcome] of [
            [
              'CREATE TABLE Card (Card_ID INT);',
              "SELECT card_id FROM card WHERE card_id = 'private-table-canary'",
              'card',
              'passed',
            ],
            ['-- framework only', 'SELECT player_id FROM Player', 'Player', 'passed'],
            [
              'CREATE TABLE Card (card_id INT); CREATE TABLE card (extra INT);',
              'SELECT missing FROM card',
              'card',
              'unsupported',
            ],
            [
              'CREATE TABLE Card (card_id INT); CREATE TABLE IF NOT EXISTS card (extra INT);',
              'SELECT missing FROM card',
              'card',
              'unsupported',
            ],
          ] as const) {
            await writeFile(schemaPath, schema);
            await writeFile(phpPath, original + `\nself::DbQuery("${query}");`);
            const before = await digestDirectory(root);
            const result = await callTool<Database>(client, 'audit_database_usage', {});
            expect(result.isError).toBe(false);
            expect(result.structured?.queries[0]?.tables).toEqual([table]);
            expect(result.structured?.diagnostics.findings.map((finding) => finding.code)).toEqual([
              'database.unsupported-syntax',
            ]);
            expect(result.structured?.diagnostics.findings[0]?.suggestions[0]?.message).toContain(
              'spelling',
            );
            expect(JSON.stringify(result)).not.toContain('private-table-canary');
            expect(await callTool<Database>(client, 'audit_database_usage', {})).toEqual(result);
            const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
            expect(
              audit.structured?.checks.find((check) => check.id === 'database.audit.unavailable')
                ?.outcome,
            ).toBe('passed');
            for (const id of ['database.table.duplicate', 'database.column.duplicate'])
              expect(audit.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
                duplicateOutcome,
              );
            for (const id of [
              'database.table.undeclared',
              'database.column.undeclared',
              'database.column.unused',
              'database.query.interpolated',
            ])
              expect(audit.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
                'unsupported',
              );
            const aggregate = await callTool<{ diagnostics: Database['diagnostics'] }>(
              client,
              'validate_project',
              { groups: ['database'] },
            );
            expect(
              aggregate.structured?.diagnostics.findings.map((finding) => finding.code),
            ).toEqual(['database.unsupported-syntax']);
            const resource = JSON.stringify(
              await client.readResource({ uri: 'bga://project/diagnostics' }),
            );
            expect(resource).toContain('database.unsupported-syntax');
            expect(resource).not.toContain('database.table.undeclared');
            expect(resource).not.toContain('private-table-canary');
            expect(await digestDirectory(root)).toBe(before);
          }
          await writeFile(schemaPath, 'CREATE TABLE Card (card_id INT);');
          await writeFile(phpPath, original + '\nself::DbQuery("SELECT id FROM absent");');
          const missing = await callTool<Database>(client, 'audit_database_usage', {});
          expect(
            missing.structured?.diagnostics.findings.some(
              (finding) => finding.code === 'database.table.undeclared',
            ),
          ).toBe(true);
          const outside = await callTool(client, 'audit_database_usage', {
            projectRoot: server.temporaryRoot,
          });
          expect(outside.isError).toBe(true);
          expect(outside.text).toContain('policy.root.not-allowed');
        },
      );
      expect(session.stderr).toBe('');
    }
  } finally {
    await server.cleanup();
  }
});

it('[E2E-DATABASE-COLUMN-CASE] compares supported column names across installed tools, resources and layouts', async () => {
  const server = await installPackagedServer('column-case', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      const phpPath = resolve(
        root,
        layout === 'legacy' ? 'bgamcplegacy.game.php' : 'modules/php/Game.php',
      );
      const original = (await readFile(phpPath, 'utf8')).replace(
        /\b(?:DbQuery|getObjectListFromDB)\b/gu,
        'fixtureExample',
      );
      const schemaPath = resolve(root, 'dbmodel.sql');
      const setCase = async (schema: string, query: string) => {
        await writeFile(schemaPath, schema);
        await writeFile(phpPath, original + '\n' + query);
        return digestDirectory(root);
      };
      let before = await setCase(
        'CREATE TABLE card (Card_ID INT, Label VARCHAR(20));',
        'self::DbQuery("SELECT CARD_id, lAbEl FROM card");',
      );
      const session = await withPublicPackagedServer(
        server,
        ['--project-root', root],
        async (client) => {
          const result = await callTool<Database>(client, 'audit_database_usage', {});
          expect(result.isError).toBe(false);
          const database = AuditDatabaseUsageOutputSchema.parse(result.structured);
          expect(database.schema).toEqual([{ name: 'card', columns: ['Card_ID', 'Label'] }]);
          expect(database.queries[0]?.columns).toEqual(['card.CARD_id', 'card.lAbEl']);
          expect(database.diagnostics.findings).toEqual([]);
          expect(await callTool<Database>(client, 'audit_database_usage', {})).toEqual(result);
          const aggregate = await callTool<{ diagnostics: Database['diagnostics'] }>(
            client,
            'validate_project',
            { groups: ['database'] },
          );
          expect(aggregate.structured?.diagnostics.findings).toEqual([]);
          const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
          for (const id of ['database.column.undeclared', 'database.column.unused'])
            expect(audit.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
              'passed',
            );
          const resource = JSON.stringify(
            await client.readResource({ uri: 'bga://project/diagnostics' }),
          );
          expect(resource).not.toContain('database.column.undeclared');
          expect(resource).not.toContain('database.column.unused');
          expect(await digestDirectory(root)).toBe(before);

          before = await setCase(
            'CREATE TABLE card (Card_ID INT);',
            'self::DbQuery(sprintf("INSERT INTO card (CARD_id) VALUES %s", rows("private-case-canary")));',
          );
          const partial = await callTool<Database>(client, 'audit_database_usage', {});
          expect(partial.structured?.diagnostics.findings.map((finding) => finding.code)).toEqual([
            'database.unsupported-syntax',
          ]);
          expect(JSON.stringify(partial)).not.toContain('private-case-canary');
          const held = await callTool<Audit>(client, 'run_pre_release_audit', {});
          for (const id of [
            'database.table.undeclared',
            'database.column.undeclared',
            'database.column.unused',
            'database.query.interpolated',
          ])
            expect(held.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
              'unsupported',
            );
          expect(await digestDirectory(root)).toBe(before);

          before = await setCase(
            'CREATE TABLE card (Card_ID INT, CARD_id INT);',
            'self::DbQuery("INSERT INTO card (card_id) VALUES " . $rows);',
          );
          const duplicate = await callTool<Database>(client, 'audit_database_usage', {});
          const finding = duplicate.structured?.diagnostics.findings.find(
            (entry) => entry.code === 'database.column.duplicate',
          );
          expect(finding?.certainty).toBe('certain');
          expect(finding?.message).toContain("'CARD_id'");
          expect(duplicate.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
          const failed = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(
            failed.structured?.checks.find((check) => check.id === 'database.column.duplicate')
              ?.outcome,
          ).toBe('failed');
          const failedAggregate = await callTool<{ diagnostics: Database['diagnostics'] }>(
            client,
            'validate_project',
            { groups: ['database'] },
          );
          expect(
            failedAggregate.structured?.diagnostics.findings.some(
              (entry) => entry.code === 'database.column.duplicate',
            ),
          ).toBe(true);
          expect(
            JSON.stringify(await client.readResource({ uri: 'bga://project/diagnostics' })),
          ).toContain('database.column.duplicate');
          expect(await callTool<Database>(client, 'audit_database_usage', {})).toEqual(duplicate);
          expect(await digestDirectory(root)).toBe(before);

          before = await setCase(
            'CREATE TABLE card (Card_ID INT);',
            'self::DbQuery("SELECT Missing FROM card");',
          );
          const missing = await callTool<Database>(client, 'audit_database_usage', {});
          expect(
            missing.structured?.diagnostics.findings.find(
              (entry) => entry.code === 'database.column.undeclared',
            )?.message,
          ).toContain("'Missing'");
          expect(await digestDirectory(root)).toBe(before);
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
});
