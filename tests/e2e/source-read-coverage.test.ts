// secret-scan:allow-file Synthetic filename canaries test publication redaction.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
} from '../helpers/packaged.js';

const LIMIT = 'project.source.read-limit';
interface Finding {
  code: string;
  kind: string;
  message: string;
  locations: { uri: string }[];
}
interface Result {
  diagnostics?: { status: string; findings: Finding[] };
  status?: string;
  groups?: { id: string; status: string }[];
  checks?: { id: string; outcome: string; reason?: string; group?: string }[];
  counts?: { passed: number; failed: number; unsupported: number; 'manual-required': number };
  queries?: { source: string }[];
  trace?: { sent?: { source: string }[] };
}
const tools = [
  'validate_state_machine',
  'validate_action_contracts',
  'validate_notifications',
  'audit_database_usage',
  'validate_project',
  'run_pre_release_audit',
];

it('[E2E-PROJECT-SOURCE-BYTE-LIMIT] discloses omitted source bodies and reads later fitting sources across all layouts', async () => {
  const server = await installPackagedServer('source-byte-limit', {
    modern: 'modern',
    legacy: 'legacy',
    hybrid: 'hybrid',
  });
  try {
    for (const root of Object.values(server.projects)) {
      const omitted = 'modules/zz-omitted.php';
      await mkdir(resolve(root, 'modules'), { recursive: true });
      await writeFile(
        resolve(root, omitted),
        '<?php ' + ' '.repeat(262_145) + '\nprivate-source-body-canary',
      );
      const before = await digestDirectory(root);
      await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
        for (const tool of tools) {
          const response = await callTool<Result>(client, tool, {});
          expect(response.isError, tool).toBe(false);
          expect(JSON.stringify(response), tool).not.toContain('private-source-body-canary');
          if (tool === 'run_pre_release_audit') {
            expect(response.structured?.counts?.passed).toBe(1);
            expect(
              response.structured?.checks?.find((c) => c.id === 'database.audit.unavailable')
                ?.outcome,
            ).toBe('passed');
            expect(
              response.structured?.checks
                ?.filter(
                  (c) => c.outcome !== 'manual-required' && c.id !== 'database.audit.unavailable',
                )
                .every((c) => c.outcome === 'unsupported'),
            ).toBe(true);
            expect(
              response.structured?.checks?.find(
                (c) => c.group === 'database' && c.outcome === 'unsupported',
              )?.reason,
            ).toContain(LIMIT);
            expect(response.text).toContain('262144-byte source budget');
          } else {
            expect(
              response.structured?.diagnostics?.findings.filter((f) => f.code === LIMIT),
              tool,
            ).toContainEqual(expect.objectContaining({ locations: [{ uri: omitted }] }));
            expect(response.structured?.diagnostics?.status, tool).not.toBe('passed');
            expect(
              response.structured?.diagnostics?.findings.some((f) =>
                f.code.endsWith('.unavailable'),
              ),
              tool,
            ).toBe(false);
          }
          expect(await callTool<Result>(client, tool, {}), tool).toEqual(response);
        }
        const diagnostics = await client.readResource({ uri: 'bga://project/diagnostics' });
        expect(JSON.stringify(diagnostics)).toContain(LIMIT);
        // Shared inspection now reads the bounded contract sets and must
        // disclose the same omitted source rather than a clean structural verdict.
        const inspection = await callTool<Result>(client, 'inspect_project', {});
        expect(inspection.isError).toBe(false);
        expect(inspection.structured?.diagnostics?.status).not.toBe('passed');
        expect(inspection.structured?.diagnostics?.findings).toContainEqual(
          expect.objectContaining({
            code: LIMIT,
            kind: 'unsupported-syntax',
            locations: [{ uri: omitted }],
          }),
        );
        expect(
          JSON.stringify(await client.readResource({ uri: 'bga://project/states' })),
        ).toContain(LIMIT);
        expect(
          JSON.stringify(await client.readResource({ uri: 'bga://project/summary' })),
        ).toContain(LIMIT);
      });
      expect(await digestDirectory(root)).toBe(before);

      // Known defects in a readable later source remain reported, while
      // absence-dependent notification/unused-column conclusions are withheld.
      const known = 'modules/zz-known.php';
      await writeFile(
        resolve(root, known),
        "<?php class KnownSource { function send() { $this->notifyAllPlayers('limitControl', '', []); $this->DbQuery('SELECT absent FROM missing_limit_table'); } }\n",
      );
      const changedBefore = await digestDirectory(root);
      await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
        const notifications = (await callTool<Result>(client, 'validate_notifications', {}))
          .structured;
        expect(notifications?.trace?.sent?.some((s) => s.source === known)).toBe(true);
        expect(notifications?.diagnostics?.findings.some((f) => f.kind === 'heuristic')).toBe(
          false,
        );
        for (const tool of ['audit_database_usage', 'validate_project']) {
          const data = (await callTool<Result>(client, tool, {})).structured;
          expect(
            data?.diagnostics?.findings.some((f) => f.code === 'database.table.undeclared'),
          ).toBe(true);
          expect(data?.diagnostics?.findings.some((f) => f.code === 'database.column.unused')).toBe(
            false,
          );
          expect(
            data?.diagnostics?.findings.some((f) => f.code === 'notification.sent.not-handled'),
          ).toBe(false);
        }
        const audit = (await callTool<Result>(client, 'run_pre_release_audit', {})).structured;
        expect(audit?.counts?.failed).toBeGreaterThan(0);
        expect(audit?.counts?.passed).toBe(1);
        expect(audit?.checks?.filter((c) => c.outcome === 'passed').map((c) => c.id)).toEqual([
          'database.audit.unavailable',
        ]);
        expect(audit?.counts?.['manual-required']).toBeGreaterThan(0);
      });
      expect(await digestDirectory(root)).toBe(changedBefore);
    }
  } finally {
    await server.cleanup();
  }
}, 240_000);

it('[E2E-PROJECT-SOURCE-FILE-LIMIT] reports capped module sets, redacts omitted paths and preserves output refusal', async () => {
  const server = await installPackagedServer('source-file-limit', { modern: 'modern' });
  try {
    const root = server.projects.modern;
    const directory = resolve(root, 'modules/control');
    await mkdir(directory);
    for (let i = 0; i < 202; i += 1)
      await writeFile(resolve(directory, `module-${String(i).padStart(3, '0')}.php`), '<?php');
    const secret = 'omitted-filename-canary';
    await writeFile(resolve(directory, `zz-password=${secret}.php`), '<?php');
    const before = await digestDirectory(root);
    await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
      let readableDbReference = false;
      for (const tool of tools) {
        const response = await callTool<Result>(client, tool, {});
        expect(response.isError, tool).toBe(false);
        expect(JSON.stringify(response)).not.toContain(secret);
        if (tool === 'run_pre_release_audit') {
          expect(response.structured?.counts?.passed).toBe(readableDbReference ? 1 : 0);
          expect(
            response.structured?.checks?.find((c) => c.id === 'database.audit.unavailable')
              ?.outcome,
          ).toBe(readableDbReference ? 'passed' : 'failed');
          expect(
            response.structured?.checks
              ?.filter((c) => c.outcome === 'passed')
              .every((c) => c.id === 'database.audit.unavailable'),
          ).toBe(true);
          expect(response.text).toContain('200 source-file limit');
        } else {
          if (tool === 'audit_database_usage')
            readableDbReference = (response.structured?.queries?.length ?? 0) > 0;
          expect(JSON.stringify(response)).toContain('[redacted');
          expect(response.structured?.diagnostics?.findings.some((f) => f.code === LIMIT)).toBe(
            true,
          );
        }
      }
      const diagnostics = await client.readResource({ uri: 'bga://project/diagnostics' });
      expect(JSON.stringify(diagnostics)).toContain(LIMIT);
      expect(JSON.stringify(diagnostics)).not.toContain(secret);
      expect(JSON.stringify(await client.readResource({ uri: 'bga://project/states' }))).toContain(
        LIMIT,
      );
    });
    expect(await digestDirectory(root)).toBe(before);
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
  } finally {
    await server.cleanup();
  }
}, 240_000);
