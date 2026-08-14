import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  capabilityCompatibilityFailures,
  type CapabilityCompatibilityManifest,
  type CompatibilityMatrix,
} from '../../scripts/lib/compatibility.js';
import { connectStdio } from '../helpers/mcp.js';
import { assertManifestMatchesRuntime, validateManifestSchema } from '../helpers/manifest.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

interface PackagedApi {
  readonly DIAGNOSTIC_CONTRACT_VERSION: number;
  readonly getDiagnosticResultJsonSchema: () => object;
  readonly parseDiagnosticResult: (value: unknown) => unknown;
}

describe('packaged bga-mcp server', () => {
  it('[E2E-PACK-INSTALL-REMOVE][E2E-STDIO-LEGACY-INITIALIZE][E2E-STDIO-MODERN-DISCOVER][E2E-STDIO-UNADVERTISED-METHOD][E2E-STDIO-SHUTDOWN][E2E-POLICY-CONFIG-FAILS-CLOSED] packs, installs, serves both protocol eras, refuses unsafe configuration, shuts down, and uninstalls', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-e2e-'));
    const packRoot = resolve(temporaryRoot, 'pack');
    const installRoot = resolve(temporaryRoot, 'install');
    let installed = false;

    try {
      await mkdir(packRoot);
      await mkdir(installRoot);
      await writeFile(
        resolve(installRoot, 'package.json'),
        `${JSON.stringify({ name: 'bga-mcp-e2e-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
      );
      const pack = await runCommand(
        corepackCommand,
        ['pnpm', 'pack', '--pack-destination', packRoot],
        { cwd: repositoryRoot, timeoutMs: 60_000 },
      );
      expect(pack.exitCode, `${pack.stderr}\n${pack.stdout}`).toBe(0);
      const archives = (await readdir(packRoot)).filter((file) => file.endsWith('.tgz'));
      expect(archives).toHaveLength(1);
      const archiveName = archives[0];
      if (archiveName === undefined) {
        throw new Error('Package manager produced no tarball');
      }
      const archive = resolve(packRoot, archiveName);

      const install = await runCommand(
        corepackCommand,
        ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, archive],
        { timeoutMs: 60_000 },
      );
      expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
      installed = true;

      const packageRoot = resolve(installRoot, 'node_modules/bga-mcp');
      const cli = resolve(packageRoot, 'dist/cli.js');
      await expect(access(cli)).resolves.toBeUndefined();

      const packageMetadata = JSON.parse(
        await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
      ) as { name: string; version: string };
      expect(packageMetadata.name).toBe('bga-mcp');

      const manifest = JSON.parse(
        await readFile(resolve(packageRoot, 'config/capabilities.json'), 'utf8'),
      ) as CapabilityCompatibilityManifest & Parameters<typeof assertManifestMatchesRuntime>[0];
      const schema = JSON.parse(
        await readFile(resolve(packageRoot, 'config/capabilities.schema.json'), 'utf8'),
      ) as object;
      validateManifestSchema(schema, manifest);
      const compatibility = JSON.parse(
        await readFile(resolve(packageRoot, 'config/compatibility.json'), 'utf8'),
      ) as CompatibilityMatrix;
      expect(capabilityCompatibilityFailures(compatibility, manifest)).toEqual([]);

      const diagnosticsSchema = JSON.parse(
        await readFile(resolve(packageRoot, 'config/diagnostics.schema.json'), 'utf8'),
      ) as object;
      const packageApi = (await import(
        pathToFileURL(resolve(packageRoot, 'dist/index.js')).href
      )) as PackagedApi;
      expect(packageApi.DIAGNOSTIC_CONTRACT_VERSION).toBe(1);
      expect(packageApi.getDiagnosticResultJsonSchema()).toEqual(diagnosticsSchema);
      const packagedDiagnostic = {
        schemaVersion: 1,
        status: 'passed',
        summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
        findings: [],
      } as const;
      expect(packageApi.parseDiagnosticResult(packagedDiagnostic)).toEqual(packagedDiagnostic);
      expect(() =>
        packageApi.parseDiagnosticResult({
          ...packagedDiagnostic,
          summary: { ...packagedDiagnostic.summary, errors: 1 },
        }),
      ).toThrow('Summary errors must equal 0');

      for (const protocolVersion of ['2025-11-25', '2026-07-28'] as const) {
        const connection = await connectStdio(process.execPath, [cli], {
          protocolVersion,
        });
        const processId = connection.transport.pid;
        try {
          expect(connection.client.getNegotiatedProtocolVersion()).toBe(protocolVersion);
          expect(connection.client.getProtocolEra()).toBe(
            protocolVersion === '2026-07-28' ? 'modern' : 'legacy',
          );
          expect(connection.client.getServerVersion()).toEqual({
            name: packageMetadata.name,
            version: packageMetadata.version,
          });
          expect(connection.client.getServerCapabilities()).toEqual({
            tools: { listChanged: true },
            resources: { listChanged: true },
          });
          if (protocolVersion === '2025-11-25') {
            expect(await connection.client.ping()).toEqual({});
          } else {
            await expect(connection.client.ping()).rejects.toThrow(
              /not supported by the negotiated protocol version/iu,
            );
          }
          const tools = await connection.client.listTools();
          expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
            'audit_database_usage',
            'check_setup',
            'inspect_project',
            'read_studio_logs',
            'run_pre_release_audit',
            'search_bga_docs',
            'validate_action_contracts',
            'validate_notifications',
            'validate_project',
            'validate_state_machine',
          ]);
          expect(tools.tools[0]?.annotations).toMatchObject({ readOnlyHint: true });
          const resources = await connection.client.listResources();
          expect(resources.resources.map((entry) => entry.uri).sort()).toEqual([
            // The documentation template lists one entry per known topic, so
            // a client sees the topics rather than a URI shape to guess at.
            'bga://docs/client',
            'bga://docs/cookbook',
            'bga://docs/file-reference',
            'bga://docs/game-logic',
            'bga://docs/migration',
            'bga://docs/states',
            'bga://docs/studio',
            'bga://framework/version',
            'bga://project/diagnostics',
            'bga://project/states',
            'bga://project/summary',
          ]);
          expect(await connection.client.listPrompts()).toEqual({ prompts: [] });
          await expect(
            connection.client.callTool({ name: 'not_advertised', arguments: {} }),
          ).rejects.toThrow(/capabilit|not found|method/iu);

          if (protocolVersion === '2026-07-28') {
            expect(connection.client.getDiscoverResult()).toMatchObject({
              supportedVersions: ['2026-07-28'],
              capabilities: { tools: { listChanged: true }, resources: { listChanged: true } },
              resultType: 'complete',
            });
          }
          assertManifestMatchesRuntime(manifest, {
            server: packageMetadata,
            tools: tools.tools.map((tool) => tool.name),
            resources: resources.resources.map((entry) => entry.uri),
            prompts: [],
          });
        } finally {
          await connection.client.close();
          if (processId !== null) {
            await waitForProcessExit(processId);
          }
        }
        expect(connection.stderr()).toBe('');
      }

      await expect(
        connectStdio(process.execPath, [cli], {
          protocolVersion: '2099-01-01',
          timeoutMs: 2_000,
        }),
      ).rejects.toThrow(/protocol|version|support/iu);

      const invalid = await runCommand(process.execPath, [cli, '--not-a-real-option'], {
        timeoutMs: 5_000,
      });
      expect(invalid.exitCode).toBe(2);
      expect(invalid.stdout).toBe('');
      expect(invalid.stderr).toContain('Unknown option: --not-a-real-option');

      const projectRoot = resolve(temporaryRoot, 'project');
      const missingRoot = resolve(temporaryRoot, 'missing-project');
      await mkdir(projectRoot);

      for (const [arguments_, expected] of [
        [['--operation-timeout-ms', '0'], '--operation-timeout-ms requires a positive integer'],
        [['--max-output-bytes', 'lots'], '--max-output-bytes requires a positive integer'],
        [['--allow-remote-project', '../escape'], '[config.invalid]'],
        [['--project-root', missingRoot], '[policy.root.unavailable]'],
        [['--project-root', 'relative-root'], '[policy.root.unavailable]'],
      ] as const) {
        const rejected = await runCommand(process.execPath, [cli, ...arguments_], {
          cwd: temporaryRoot,
          timeoutMs: 10_000,
        });
        expect(rejected.exitCode, `${arguments_.join(' ')}: ${rejected.stderr}`).toBe(2);
        expect(rejected.stdout).toBe('');
        expect(rejected.stderr).toContain(expected);
        expect(rejected.stderr).not.toContain(missingRoot);
      }

      const configured = await connectStdio(
        process.execPath,
        [cli, '--project-root', projectRoot, '--operation-timeout-ms', '5000'],
        { timeoutMs: 5_000 },
      );
      const configuredProcessId = configured.transport.pid;
      try {
        expect(configured.client.getServerCapabilities()).toEqual({
          tools: { listChanged: true },
          resources: { listChanged: true },
        });
        expect((await configured.client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(
          [
            'audit_database_usage',
            'check_setup',
            'inspect_project',
            'read_studio_logs',
            'run_pre_release_audit',
            'search_bga_docs',
            'validate_action_contracts',
            'validate_notifications',
            'validate_project',
            'validate_state_machine',
          ],
        );
      } finally {
        await configured.client.close();
        if (configuredProcessId !== null) {
          await waitForProcessExit(configuredProcessId);
        }
      }
      expect(configured.stderr()).toBe('');

      const uninstall = await runCommand(
        corepackCommand,
        ['pnpm', 'remove', '--dir', installRoot, 'bga-mcp'],
        { timeoutMs: 30_000 },
      );
      expect(uninstall.exitCode, `${uninstall.stderr}\n${uninstall.stdout}`).toBe(0);
      installed = false;
      await expect(access(packageRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      if (installed) {
        await runCommand(corepackCommand, ['pnpm', 'remove', '--dir', installRoot, 'bga-mcp'], {
          timeoutMs: 30_000,
        }).catch(() => undefined);
      }
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 120_000);
});
