import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { CapabilityManifest, ReleaseInventory } from '../../scripts/lib/release.js';
import { verifyReleaseInventory } from '../../scripts/lib/release.js';
import { connectStdio } from '../helpers/mcp.js';
import { installPackagedServer } from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

describe('first local-only release inventory', () => {
  it('[E2E-RELEASE-LOCAL-ONLY] installs the release profile and discovers exactly the frozen verified local capability set', async () => {
    const installed = await installPackagedServer('release-inventory', {});
    const packageRoot = resolve(dirname(installed.cli), '..');
    const releaseCli = resolve(dirname(installed.cli), 'release-cli.js');

    try {
      const inventory = JSON.parse(
        await readFile(resolve(packageRoot, 'config/release.json'), 'utf8'),
      ) as ReleaseInventory;
      const manifest = JSON.parse(
        await readFile(resolve(packageRoot, 'config/capabilities.json'), 'utf8'),
      ) as CapabilityManifest;
      await expect(
        readFile(resolve(packageRoot, 'config/release.schema.json'), 'utf8'),
      ).resolves.toContain('first-release inventory');
      await expect(readFile(releaseCli, 'utf8')).resolves.toContain('first-local-only');

      const connection = await connectStdio(process.execPath, [releaseCli], {
        protocolVersion: '2025-11-25',
      });
      const processId = connection.transport.pid;
      try {
        const tools = (await connection.client.listTools()).tools.map((tool) => tool.name).sort();
        const resources = (await connection.client.listResources()).resources
          .map((resource) => resource.uri)
          .sort();
        const templates = (await connection.client.listResourceTemplates()).resourceTemplates.map(
          (template) => template.uriTemplate,
        );
        const prompts = (await connection.client.listPrompts()).prompts.map(
          (prompt) => prompt.name,
        );

        expect(tools).toEqual([...inventory.capabilities.tools].sort());
        expect(resources).toEqual([...inventory.capabilities.resources].sort());
        expect(templates).toEqual([]);
        expect(prompts).toEqual(inventory.capabilities.prompts);
        expect(inventory.adapters).toEqual([]);

        const report = verifyReleaseInventory(inventory, manifest, {
          tools,
          resources,
          prompts,
        });
        expect(report.failures).toEqual([]);

        for (const excluded of ['check_setup', 'read_studio_logs', 'search_bga_docs']) {
          await expect(
            connection.client.callTool({ name: excluded, arguments: {} }),
          ).rejects.toThrow(/capabilit|not found|method/iu);
        }
      } finally {
        await connection.client.close();
        if (processId !== null) await waitForProcessExit(processId);
      }
      expect(connection.stderr()).toBe('');

      await expect(
        connectStdio(process.execPath, [releaseCli], {
          protocolVersion: '2026-07-28',
          timeoutMs: 2_000,
        }),
      ).rejects.toThrow(/protocol|version|support/iu);

      const help = await runCommand(process.execPath, [releaseCli, '--help']);
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toContain('local-only bga-mcp release');
      expect(help.stdout).not.toContain('--allow-network');
      expect(help.stdout).not.toContain('--experimental-studio-logs');

      for (const option of ['--allow-network', '--experimental-studio-logs', '--studio-check']) {
        const refused = await runCommand(process.execPath, [releaseCli, option]);
        expect(refused.exitCode).toBe(2);
        expect(refused.stdout).toBe('');
        expect(refused.stderr).toContain(`${option} is unavailable in the local-only release`);
      }
    } finally {
      await installed.cleanup();
    }
  });
});
