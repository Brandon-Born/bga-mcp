import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { connectStdio } from '../helpers/mcp.js';
import { installPackagedServer, digestDirectory, callTool } from '../helpers/packaged.js';
import { waitForProcessExit } from '../helpers/scenario.js';

describe('installed complete internal model', () => {
  it('[E2E-NORMALIZED-PROJECT] keeps omitted/unreadable normalization unknown and refuses output budgets without disclosing configuration values', async () => {
    const installed = await installPackagedServer('normalized-project-limits', {
      modern: 'modern',
    });
    try {
      const root = installed.projects.modern;
      await writeFile(resolve(root, 'modules/js/Oversized.js'), 'x'.repeat(262_145));
      await writeFile(resolve(root, 'dbmodel.sql'), 'x'.repeat(1_048_577));
      await writeFile(
        resolve(root, 'gameoptions.json'),
        '{"100":{"name":"configuration-value-not-for-publication","values":{}}}',
      );
      await writeFile(
        resolve(root, 'stats.jsonc'),
        '{"configuration-key-not-for-publication":1,"table":false}',
      );
      const before = await digestDirectory(root);
      const connection = await connectStdio(installed.publicCommand.command, [
        ...installed.publicCommand.arguments,
        '--project-root',
        root,
      ]);
      const pid = connection.transport.pid;
      try {
        const inspected = await callTool(connection.client, 'inspect_project', {});
        expect(inspected.isError).toBe(false);
        expect(JSON.stringify(inspected)).not.toContain('configuration-value-not-for-publication');
        expect(JSON.stringify(inspected)).not.toContain('configuration-key-not-for-publication');
        expect(JSON.stringify(inspected)).toContain('modules/js/Oversized.js');
        expect(JSON.stringify(inspected)).toContain('Schema file could not be read.');
        expect(JSON.stringify(inspected)).toContain('Unrecognized statistics section.');
        expect(JSON.stringify(inspected)).toContain('table statistics is not an object.');
        expect((await callTool(connection.client, 'audit_database_usage', {})).isError).toBe(true);
        expect((await callTool(connection.client, 'validate_action_contracts', {})).isError).toBe(
          false,
        );
        expect(await callTool(connection.client, 'inspect_project', {})).toEqual(inspected);
        expect(await digestDirectory(root)).toBe(before);
        expect(connection.stderr()).toBe('');
      } finally {
        await connection.client.close();
        if (pid !== null) await waitForProcessExit(pid);
      }
      const small = await connectStdio(installed.publicCommand.command, [
        ...installed.publicCommand.arguments,
        '--project-root',
        root,
        '--max-output-bytes',
        '1024',
      ]);
      const smallPid = small.transport.pid;
      try {
        const refused = await callTool(small.client, 'inspect_project', {});
        expect(refused.isError).toBe(true);
        expect(refused.text).toContain('policy.output.too-large');
        expect(JSON.stringify(refused)).not.toContain('configuration-value-not-for-publication');
      } finally {
        await small.client.close();
        if (smallPid !== null) await waitForProcessExit(smallPid);
      }
    } finally {
      await installed.cleanup();
    }
  });
  it('[E2E-NORMALIZED-PROJECT] publishes bounded normalized receipts and matching contracts through the unchanged public schema', async () => {
    const installed = await installPackagedServer('normalized-project', {
      modern: 'modern',
      legacy: 'legacy',
      hybrid: 'hybrid',
    });
    try {
      for (const [layout, root] of Object.entries(installed.projects)) {
        await writeFile(
          resolve(root, 'gameoptions.jsonc'),
          '{"100":{"name":"Mode","values":{"1":{"name":"Base"}}}}',
        );
        await writeFile(
          resolve(root, 'stats.jsonc'),
          '{"table":{"turns":{"id":10,"name":"Turns","type":"int"}},"player":{"turns":{"id":10,"name":"Turns","type":"int"}}}',
        );
        const before = await digestDirectory(root);
        const connection = await connectStdio(installed.publicCommand.command, [
          ...installed.publicCommand.arguments,
          '--project-root',
          root,
        ]);
        const pid = connection.transport.pid;
        try {
          const discovery = await connection.client.listTools();
          expect(discovery.tools).toHaveLength(7);
          const inspected = await callTool(connection.client, 'inspect_project', {});
          expect(inspected.isError).toBe(false);
          expect(inspected.structured?.layout).toBe(layout);
          const detection = inspected.structured?.detection as {
            signals: { id: string; description: string; files: string[] }[];
          };
          const receipt = (id: string) => {
            const entry = detection.signals.find((entry) => entry.id === `normalized.${id}`);
            if (entry === undefined) throw new Error(`Missing normalized receipt ${id}`);
            return entry;
          };
          expect(receipt('statistics').files).toContain('stats.jsonc');
          expect(receipt('statistics').description).toMatch(/2 normalized source fact/);
          expect(receipt('tests').description).toMatch(/no tests were executed/);
          expect(receipt('options').files).toContain('gameoptions.jsonc');
          if (layout !== 'modern')
            expect(receipt('options').description).toMatch(/Legacy PHP configuration/);
          const action = await callTool(connection.client, 'validate_action_contracts', {});
          const notifications = await callTool(connection.client, 'validate_notifications', {});
          const database = await callTool(connection.client, 'audit_database_usage', {});
          expect([action.isError, notifications.isError, database.isError]).toEqual([
            false,
            false,
            false,
          ]);
          const actionTrace = action.structured?.trace as {
            clientCalls: unknown[];
            entryPoints: unknown[];
          };
          const notificationTrace = notifications.structured?.trace as {
            sent: unknown[];
            handlers: unknown[];
          };
          expect(receipt('actions').description).toMatch(
            new RegExp(
              `^${String(actionTrace.clientCalls.length + actionTrace.entryPoints.length)} normalized`,
            ),
          );
          expect(receipt('notifications').description).toMatch(
            new RegExp(
              `^${String(notificationTrace.sent.length + notificationTrace.handlers.length)} normalized`,
            ),
          );
          expect(receipt('database').description).toMatch(
            new RegExp(
              `^${String((database.structured?.schema as unknown[]).length + (database.structured?.queries as unknown[]).length)} normalized`,
            ),
          );
          expect(await callTool(connection.client, 'inspect_project', {})).toEqual(inspected);
          expect(
            (
              await callTool(connection.client, 'inspect_project', {
                projectRoot: installed.temporaryRoot,
              })
            ).isError,
          ).toBe(true);
          expect(await digestDirectory(root)).toBe(before);
          expect(connection.stderr()).toBe('');
        } finally {
          await connection.client.close();
          if (pid !== null) await waitForProcessExit(pid);
        }
      }
    } finally {
      await installed.cleanup();
    }
  });
});
