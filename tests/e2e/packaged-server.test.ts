import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { connectStdio } from '../helpers/mcp.js';
import { assertManifestMatchesRuntime, validateManifestSchema } from '../helpers/manifest.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

describe('packaged bga-mcp server', () => {
  it('packs, installs, serves both protocol eras, shuts down, and uninstalls', async () => {
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
        ['pnpm', 'add', '--offline', '--dir', installRoot, archive],
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
      ) as never;
      const schema = JSON.parse(
        await readFile(resolve(packageRoot, 'config/capabilities.schema.json'), 'utf8'),
      ) as object;
      validateManifestSchema(schema, manifest);

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
          expect(connection.client.getServerCapabilities()).toEqual({});
          if (protocolVersion === '2025-11-25') {
            expect(await connection.client.ping()).toEqual({});
          } else {
            await expect(connection.client.ping()).rejects.toThrow(
              /not supported by the negotiated protocol version/iu,
            );
          }
          expect(await connection.client.listTools()).toEqual({ tools: [] });
          expect(await connection.client.listResources()).toEqual({
            resources: [],
          });
          expect(await connection.client.listPrompts()).toEqual({ prompts: [] });
          await expect(
            connection.client.callTool({ name: 'not_advertised', arguments: {} }),
          ).rejects.toThrow(/capabilit|not found|method/iu);

          if (protocolVersion === '2026-07-28') {
            expect(connection.client.getDiscoverResult()).toMatchObject({
              supportedVersions: ['2026-07-28'],
              capabilities: {},
              resultType: 'complete',
            });
          }
          assertManifestMatchesRuntime(manifest, {
            server: packageMetadata,
            tools: [],
            resources: [],
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
