// secret-scan:allow-file Synthetic filename/value canaries prove publication redaction.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RunPreReleaseAuditOutputSchema } from '../../src/tools/run-pre-release-audit.js';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
} from '../helpers/packaged.js';

type Audit = ReturnType<typeof RunPreReleaseAuditOutputSchema.parse>;

it('[E2E-PRE-RELEASE-COVERAGE-REASONS] attributes and groups actual coverage limits through the installed public command', async () => {
  const server = await installPackagedServer('pre-release-explanations', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const [layout, root] of Object.entries(server.projects)) {
      const source =
        layout === 'modern'
          ? 'modules/php/Game.php'
          : layout === 'legacy'
            ? 'bgamcplegacy.game.php'
            : 'modules/php/Game.php';
      const path = resolve(root, source);
      const original = await readFile(path, 'utf8');
      await writeFile(
        path,
        `${original}\nself::DbQuery(sprintf("INSERT INTO card (card_id) VALUES %s", buildRows("private-value-canary")));`,
      );
      const before = await digestDirectory(root);
      await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
        const response = await callTool<Audit>(client, 'run_pre_release_audit', {});
        expect(response.isError).toBe(false);
        const data = RunPreReleaseAuditOutputSchema.parse(response.structured);
        expect(
          data.checks.find((check) => check.id === 'database.audit.unavailable')?.outcome,
        ).toBe('passed');
        const database = data.checks.filter(
          (check) => check.group === 'database' && check.id !== 'database.audit.unavailable',
        );
        expect(database.length).toBeGreaterThan(0);
        expect(database.every((check) => check.outcome === 'unsupported')).toBe(true);
        expect(new Set(database.map((check) => check.reason)).size).toBe(1);
        expect(database[0]?.reason).toContain(`database.unsupported-syntax at ${source}`);
        expect(database[0]?.reason).toContain('unresolved VALUES');
        expect(database[0]?.reason).toContain('not confirmed defects in each check');
        expect(database[0]?.reason).toContain('See audit_database_usage');
        expect(response.text.match(/database\.unsupported-syntax/gu)).toHaveLength(1);
        for (const check of data.checks.filter((entry) => entry.group !== 'database')) {
          expect(check.reason ?? '').not.toContain('database.unsupported-syntax');
        }
        expect(JSON.stringify(response)).not.toContain('private-value-canary');
        const repeat = await callTool<Audit>(client, 'run_pre_release_audit', {});
        expect(repeat).toEqual(response);
      });
      expect(await digestDirectory(root)).toBe(before);

      // Actual outside-source uncertainty is shared by several groups; it is
      // never guessed from a code prefix or silently treated as a game defect.
      const secret = 'filename-only-redaction-canary';
      await writeFile(
        resolve(root, `local-password=${secret}.js`),
        'export const localOnly = true;',
      );
      const scopedBefore = await digestDirectory(root);
      await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
        const response = await callTool<Audit>(client, 'run_pre_release_audit', {});
        expect(response.isError).toBe(false);
        const data = RunPreReleaseAuditOutputSchema.parse(response.structured);
        for (const group of ['state-machine', 'action-contracts', 'notifications', 'database']) {
          const checks = data.checks.filter(
            (check) => check.group === group && check.id !== 'database.audit.unavailable',
          );
          expect(checks.every((check) => check.outcome === 'unsupported')).toBe(true);
          expect(checks[0]?.reason).toContain('project.source.unsupported-syntax');
          if (group !== 'database')
            expect(checks[0]?.reason).not.toContain('database.unsupported-syntax');
        }
        expect(JSON.stringify(response)).not.toContain(secret);
        expect(JSON.stringify(response)).toContain('[redacted');
        expect(data.counts.failed).toBe(0);
        expect(data.counts['manual-required']).toBeGreaterThan(0);
      });
      expect(await digestDirectory(root)).toBe(scopedBefore);
      await withPublicPackagedServer(
        server,
        ['--project-root', root, '--max-output-bytes', '1000'],
        async (client) => {
          const response = await callTool(client, 'run_pre_release_audit', {});
          expect(response.isError).toBe(true);
          expect(response.text).toContain('policy.output.too-large');
          expect(JSON.stringify(response)).not.toContain(secret);
        },
      );
    }
  } finally {
    await server.cleanup();
  }
}, 240_000);
