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
const ABSENCE = [
  'database.table.undeclared',
  'database.column.undeclared',
  'database.column.unused',
];

async function probe(root: string, layout: string) {
  const path = resolve(
    root,
    layout === 'legacy' ? 'bgamcplegacy.game.php' : 'modules/php/Game.php',
  );
  const text = await readFile(path, 'utf8');
  await writeFile(
    path,
    text.replace(
      /\}\s*$/u,
      `public function schemaCoverageProbe(): void {
    self::DbQuery("SELECT card_extra FROM card");
    self::DbQuery("SELECT * FROM alternate");
  }\n}`,
    ),
  );
}

it('[E2E-DATABASE-SCHEMA-COVERAGE] keeps mixed schema coverage unknown across installed tools, resources and layouts', async () => {
  const server = await installPackagedServer('schema-coverage', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      await probe(root, layout);
      const path = resolve(root, 'dbmodel.sql');
      await writeFile(
        path,
        (await readFile(path, 'utf8')) +
          '\nALTER TABLE card ADD card_extra INT;\nCREATE VIEW alternate AS SELECT card_id FROM card;',
      );
      const before = await digestDirectory(root);
      const session = await withPublicPackagedServer(
        server,
        ['--project-root', root],
        async (client) => {
          const result = await callTool<Database>(client, 'audit_database_usage', {});
          expect(result.isError).toBe(false);
          const database = AuditDatabaseUsageOutputSchema.parse(result.structured);
          expect(database.schema.map((table) => table.name)).toContain('card');
          expect(database.diagnostics.summary.unsupported).toBeGreaterThan(0);
          expect(
            database.diagnostics.findings.some((finding) => ABSENCE.includes(finding.code)),
          ).toBe(false);
          expect(
            database.diagnostics.findings.find(
              (finding) => finding.code === 'database.unsupported-syntax',
            )?.suggestions[0]?.message,
          ).toContain('schema');
          expect(await callTool<Database>(client, 'audit_database_usage', {})).toEqual(result);
          const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
          for (const id of ABSENCE)
            expect(audit.structured?.checks.find((check) => check.id === id)?.outcome).toBe(
              'unsupported',
            );
          const aggregate = await callTool<{ diagnostics: Database['diagnostics'] }>(
            client,
            'validate_project',
            {},
          );
          expect(
            aggregate.structured?.diagnostics.findings.some(
              (finding) => finding.code === 'database.unsupported-syntax',
            ),
          ).toBe(true);
          expect(
            JSON.stringify(await client.readResource({ uri: 'bga://project/diagnostics' })),
          ).toContain('database.unsupported-syntax');
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

it('[E2E-DATABASE-SCHEMA-LEXICAL] refuses phantom declarations and uncertain regions while preserving known defects', async () => {
  const server = await installPackagedServer('schema-lexical', { modern: 'modern' });
  const root = server.projects.modern;
  try {
    await probe(root, 'modern');
    const session = await withPublicPackagedServer(
      server,
      ['--project-root', root],
      async (client) => {
        const path = resolve(root, 'dbmodel.sql');
        await writeFile(
          path,
          `CREATE TABLE card (card_id INT, label TEXT DEFAULT 'CREATE TABLE phantom (id INT); -- value', choice ENUM('a, b)', 'c''d')) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,
        );
        const clean = await callTool<Database>(client, 'audit_database_usage', {});
        expect(clean.structured?.schema).toEqual([
          { name: 'card', columns: ['card_id', 'label', 'choice'] },
        ]);
        expect(
          clean.structured?.diagnostics.findings.some(
            (finding) => finding.code === 'database.unsupported-syntax',
          ),
        ).toBe(false);
        // Missing references remain meaningful when the whole naming subset was read.
        expect(clean.structured?.diagnostics.findings.map((finding) => finding.code)).toEqual(
          expect.arrayContaining(['database.table.undeclared', 'database.column.undeclared']),
        );
        for (const schema of [
          '/*!80000 CREATE TABLE phantom (id INT); */; CREATE TABLE card (card_id INT);',
          '/* CREATE TABLE phantom (id INT); */ CREATE TABLE card (card_id INT);',
          '/*+ unexamined hint */ CREATE TABLE card (card_id INT);',
          'CREATE TABLE card (card_id INT); -- uncertain Studio preprocessing',
          'CREATE TABLE card (card_id INT, -- column removed by Studio\n label INT);',
          "CREATE TABLE card (label TEXT DEFAULT 'unterminated",
          String.raw`CREATE TABLE card (label TEXT DEFAULT 'ambiguous\'text'); CREATE TABLE phantom (id INT);`,
          'CREATE TABLE card (card_id INT); CREATE VIEW alternate AS SELECT card_id FROM card;',
        ]) {
          await writeFile(path, schema);
          const before = await digestDirectory(root);
          const result = await callTool<Database>(client, 'audit_database_usage', {});
          expect(result.isError).toBe(false);
          expect(result.structured?.schema.some((table) => table.name === 'phantom')).toBe(false);
          expect(result.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
          expect(
            result.structured?.diagnostics.findings.some((finding) =>
              ABSENCE.includes(finding.code),
            ),
          ).toBe(false);
          expect(await digestDirectory(root)).toBe(before);
        }
        await writeFile(
          path,
          'CREATE TABLE card (card_id INT, card_id INT); CREATE TABLE card (card_id INT); ALTER TABLE card ADD card_extra INT;',
        );
        const defects = await callTool<Audit>(client, 'run_pre_release_audit', {});
        expect(
          defects.structured?.checks
            .filter((check) => check.group === 'database' && check.outcome === 'failed')
            .map((check) => check.id),
        ).toEqual(['database.column.duplicate', 'database.table.duplicate']);
      },
    );
    expect(session.stderr).toBe('');
    const before = await digestDirectory(root);
    await withPublicPackagedServer(
      server,
      ['--project-root', root, '--max-output-bytes', '1000'],
      async (client) => {
        const response = await callTool(client, 'audit_database_usage', {});
        expect(response.isError).toBe(true);
        expect(response.text).toContain('policy.output.too-large');
      },
    );
    expect(await digestDirectory(root)).toBe(before);
  } finally {
    await server.cleanup();
  }
}, 240_000);

it('[E2E-DATABASE-SCHEMA-MODE] keeps unknown ANSI_QUOTES semantics partial without discarding independent declarations', async () => {
  const server = await installPackagedServer('schema-mode', { modern: 'modern' });
  const root = server.projects.modern;
  try {
    await probe(root, 'modern');
    const session = await withPublicPackagedServer(
      server,
      ['--project-root', root],
      async (client) => {
        for (const uncertain of [
          'CREATE TABLE "card" (card_extra INT);',
          'CREATE TABLE card (card_extra INT, label TEXT DEFAULT "example");',
        ]) {
          await writeFile(
            resolve(root, 'dbmodel.sql'),
            'CREATE TABLE before_mode (id INT); ' +
              uncertain +
              ' CREATE TABLE after_mode (id INT);',
          );
          const before = await digestDirectory(root);
          const result = await callTool<Database>(client, 'audit_database_usage', {});
          expect(result.isError).toBe(false);
          expect(result.structured?.schema.map((table) => table.name)).toEqual([
            'before_mode',
            'after_mode',
          ]);
          expect(
            result.structured?.diagnostics.findings.some(
              (finding) =>
                finding.code === 'database.unsupported-syntax' &&
                finding.message.includes('ANSI_QUOTES'),
            ),
          ).toBe(true);
          expect(
            result.structured?.diagnostics.findings.some((finding) =>
              ABSENCE.includes(finding.code),
            ),
          ).toBe(false);
          const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
          for (const id of ABSENCE)
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
