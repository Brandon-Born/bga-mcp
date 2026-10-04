// secret-scan:allow-file Synthetic filename/value canaries test publication redaction.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RunPreReleaseAuditOutputSchema } from '../../src/tools/run-pre-release-audit.js';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
} from '../helpers/packaged.js';

type Audit = ReturnType<typeof RunPreReleaseAuditOutputSchema.parse>;
const INDEPENDENT = [
  'database.audit.unavailable',
  'database.column.duplicate',
  'database.table.duplicate',
];
const QUERY_CHECKS = [
  'database.table.undeclared',
  'database.column.undeclared',
  'database.column.unused',
  'database.query.interpolated',
];
const FORMATTED =
  '\nstatic::DbQuery(sprintf("INSERT INTO player (player_id, player_color) VALUES %s", assembleRows("private-row-canary")));';

async function setup(root: string, layout: string) {
  const path = resolve(
    root,
    layout === 'legacy' ? 'bgamcplegacy.game.php' : 'modules/php/Game.php',
  );
  const original = await readFile(path, 'utf8');
  // SQL-looking examples outside documented helpers do not run queries. Keep
  // the original fixture's methods while isolating the one synthetic setup call.
  await writeFile(
    path,
    original.replace(/\b(?:DbQuery|getObjectListFromDB)\b/gu, 'fixtureExample') + FORMATTED,
  );
  await writeFile(
    resolve(root, 'dbmodel.sql'),
    '-- original comment-only schema\r\n-- CREATE TABLE ignored (id INT);\r\n',
  );
}

it('[E2E-DATABASE-INDEPENDENT-CHECKS] retains independent evidence and all unknown query coverage through the installed public command', async () => {
  const server = await installPackagedServer('database-independent', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      await setup(root, layout);
      await writeFile(
        resolve(root, 'local-password=filename-redaction-canary.js'),
        'export const outside = true;',
      );
      await mkdir(resolve(root, 'modules'), { recursive: true });
      await writeFile(
        resolve(root, 'modules/zz-unread.php'),
        '<?php ' + ' '.repeat(262_145) + 'unread-body-canary',
      );
      const before = await digestDirectory(root);
      const session = await withPublicPackagedServer(
        server,
        ['--project-root', root],
        async (client) => {
          const database = await callTool<{
            queries: { tables: string[]; columns: string[]; text: string }[];
            diagnostics: { findings: { code: string }[] };
          }>(client, 'audit_database_usage', {});
          expect(database.isError).toBe(false);
          expect(database.structured?.queries).toHaveLength(1);
          expect(database.structured?.queries[0]).toMatchObject({
            tables: ['player'],
            columns: ['player.player_color', 'player.player_id'],
            text: 'INSERT INTO player (player_id, player_color) VALUES %s',
          });
          expect(database.structured?.diagnostics.findings.map((f) => f.code)).toEqual(
            expect.arrayContaining([
              'database.unsupported-syntax',
              'project.source.unsupported-syntax',
              'project.source.read-limit',
            ]),
          );
          const response = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(response.isError).toBe(false);
          const data = RunPreReleaseAuditOutputSchema.parse(response.structured);
          expect(
            data.checks.filter((check) => check.outcome === 'passed').map((check) => check.id),
          ).toEqual(INDEPENDENT);
          expect(data.counts).toEqual({
            passed: 3,
            failed: 0,
            unsupported: 30,
            'manual-required': 8,
          });
          for (const id of QUERY_CHECKS) {
            const check = data.checks.find((entry) => entry.id === id);
            expect(check?.outcome).toBe('unsupported');
            expect(check?.reason).toContain('unresolved VALUES');
            expect(check?.reason).toContain('project.source.read-limit');
          }
          expect(data.checks[0]?.reason ?? '').not.toContain('private-row-canary');
          expect(data.checks.find((check) => check.id === INDEPENDENT[0])?.reason).toContain(
            'availability only',
          );
          expect(data.checks.find((check) => check.id === INDEPENDENT[1])?.reason).toContain(
            'does not validate runtime SQL',
          );
          for (const canary of [
            'private-row-canary',
            'filename-redaction-canary',
            'unread-body-canary',
            'completedChecks',
          ])
            expect(JSON.stringify(response)).not.toContain(canary);
          expect(JSON.stringify(response)).toContain('[redacted');
          expect(await callTool<Audit>(client, 'run_pre_release_audit', {})).toEqual(response);
          expect(
            JSON.stringify(await client.readResource({ uri: 'bga://project/diagnostics' })),
          ).toContain('database.unsupported-syntax');
          const outside = await callTool(client, 'run_pre_release_audit', {
            projectRoot: server.temporaryRoot,
          });
          expect(outside.isError).toBe(true);
          expect(outside.text).toContain('policy.root.not-allowed');
        },
      );
      expect(session.stderr).toBe('');
      expect(await digestDirectory(root)).toBe(before);
      await withPublicPackagedServer(
        server,
        ['--project-root', root, '--max-output-bytes', '1000'],
        async (client) => {
          const response = await callTool(client, 'run_pre_release_audit', {});
          expect(response.isError).toBe(true);
          expect(response.text).toContain('policy.output.too-large');
          expect(JSON.stringify(response)).not.toContain('filename-redaction-canary');
        },
      );
      expect(await digestDirectory(root)).toBe(before);
    }
  } finally {
    await server.cleanup();
  }
}, 240_000);

it('[E2E-DATABASE-INDEPENDENT-REFUSAL] refuses schema completeness guesses, missing reads and hidden defects', async () => {
  const server = await installPackagedServer('database-independent-refusal', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      await setup(root, layout);
      const session = await withPublicPackagedServer(
        server,
        ['--project-root', root],
        async (client) => {
          for (const schema of [
            'CREATE TABLE card (card_id INT);',
            'CREATE TABLE card (card_id INT); CREATE TABLE $unknown (id INT);',
            '/*!80000 CREATE TABLE hidden (id INT) */;',
            '--not-a-comment CREATE TABLE hidden (id INT);',
            '-- comment\rCREATE TABLE hidden (id INT);',
            '/* ordinary block comment */',
          ]) {
            await writeFile(resolve(root, 'dbmodel.sql'), schema);
            const before = await digestDirectory(root);
            const response = await callTool<Audit>(client, 'run_pre_release_audit', {});
            expect(response.isError).toBe(false);
            const checks = response.structured?.checks.filter(
              (check) => check.group === 'database',
            );
            expect(
              checks?.filter((check) => check.outcome === 'passed').map((check) => check.id),
            ).toEqual([INDEPENDENT[0]]);
            expect(
              checks
                ?.filter((check) => check.id !== INDEPENDENT[0])
                .every((check) => check.outcome === 'unsupported'),
            ).toBe(true);
            expect(await digestDirectory(root)).toBe(before);
          }
          await writeFile(
            resolve(root, 'dbmodel.sql'),
            'CREATE TABLE card (card_id INT, card_id INT); CREATE TABLE card (card_id INT);',
          );
          const defects = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(
            defects.structured?.checks
              .filter((check) => check.group === 'database' && check.outcome === 'failed')
              .map((check) => check.id),
          ).toEqual(INDEPENDENT.slice(1));
          await rm(resolve(root, 'dbmodel.sql'));
          const missing = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(
            missing.structured?.checks.find((check) => check.id === INDEPENDENT[0])?.outcome,
          ).toBe('failed');
          expect(
            missing.structured?.checks
              .filter((check) => check.group === 'database')
              .some((check) => check.outcome === 'passed'),
          ).toBe(false);
          await writeFile(resolve(root, 'dbmodel.sql'), ' '.repeat(1_048_577));
          const before = await digestDirectory(root);
          const unreadable = await callTool<Audit>(client, 'run_pre_release_audit', {});
          expect(unreadable.isError).toBe(false);
          const held = unreadable.structured?.checks.filter((check) => check.group === 'database');
          expect(held).toHaveLength(7);
          expect(
            held?.every(
              (check) => check.outcome === 'unsupported' && check.reason?.includes('failed'),
            ),
          ).toBe(true);
          expect(await digestDirectory(root)).toBe(before);
        },
      );
      expect(session.stderr).toBe('');
    }
  } finally {
    await server.cleanup();
  }
}, 240_000);
