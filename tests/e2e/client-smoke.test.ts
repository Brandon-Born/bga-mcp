import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { exerciseClientFlow } from '../../scripts/lib/client-flow.js';
import { connectStdio } from '../helpers/mcp.js';
import { digestDirectory, installPackagedServer } from '../helpers/packaged.js';
import { waitForProcessExit } from '../helpers/scenario.js';

describe('maintained supported client smoke flow', () => {
  it('[E2E-CLIENT-SDK-SMOKE] discovers and uses the public inventory across layouts, refuses invalid and outside calls, restarts and cleans up', async () => {
    const matrix = JSON.parse(
      await readFile(resolve(import.meta.dirname, '../../config/client-smoke.json'), 'utf8'),
    ) as { clients: { name: string; fixtures: string[] }[] };
    const supported = matrix.clients.find(
      (client) => client.name === '@modelcontextprotocol/client',
    );
    expect(supported).toBeDefined();
    const fixtures = Object.fromEntries(
      (supported?.fixtures ?? []).map((fixture) => {
        const name = fixture.split('/').at(-1);
        if (!name) throw new Error('Missing fixture name');
        return [name, name];
      }),
    );
    const server = await installPackagedServer('client-sdk-smoke', fixtures);
    try {
      const inventory = JSON.parse(
        await readFile(resolve(server.packageRoot, 'config/release.json'), 'utf8'),
      ) as { capabilities: { tools: string[]; resources: string[] } };
      for (const [layout, project] of Object.entries(server.projects)) {
        const before = await digestDirectory(project);
        const connection = await connectStdio(server.publicCommand.command, [
          ...server.publicCommand.arguments,
          '--project-root',
          project,
        ]);
        const pid = connection.transport.pid;
        try {
          await exerciseClientFlow(
            {
              listTools: async () =>
                (await connection.client.listTools()).tools.map((tool) => tool.name),
              listResources: async () =>
                (await connection.client.listResources()).resources.map((resource) => resource.uri),
              callTool: async (name, args) =>
                await connection.client.callTool({ name, arguments: args }),
              readResource: async (uri) => await connection.client.readResource({ uri }),
            },
            inventory.capabilities,
            project,
            server.temporaryRoot,
            layout,
          );
        } finally {
          await connection.client.close();
          if (pid !== null) await waitForProcessExit(pid);
        }
        expect(connection.stderr()).toBe('');
        expect(await digestDirectory(project)).toBe(before);
        const restarted = await connectStdio(server.publicCommand.command, [
          ...server.publicCommand.arguments,
          '--project-root',
          project,
        ]);
        const restartedPid = restarted.transport.pid;
        try {
          expect(
            (await restarted.client.callTool({ name: 'inspect_project', arguments: {} })).isError,
          ).not.toBe(true);
        } finally {
          await restarted.client.close();
          if (restartedPid !== null) await waitForProcessExit(restartedPid);
        }
        expect(await digestDirectory(project)).toBe(before);
      }
    } finally {
      await server.cleanup();
    }
  }, 180_000);
});
