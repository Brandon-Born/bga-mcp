import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { DEFAULT_SERVER_CONFIG } from '../../src/config.js';
import { createDefaultServer, createServerWithPolicy } from '../../src/server.js';

describe('production server factory', () => {
  it('reports exact identity and its advertised capabilities', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = await createDefaultServer();
    const client = new Client({ name: 'factory-test', version: '1.0.0' });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect(client.getServerVersion()).toEqual({
        name: 'bga-mcp',
        version: '0.0.0-development',
      });
      expect(client.getServerCapabilities()).toEqual({ tools: { listChanged: true } });
      expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
        'audit_database_usage',
        'inspect_project',
        'validate_action_contracts',
        'validate_notifications',
        'validate_project',
        'validate_state_machine',
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('prepares the policy boundary before anything is served', async () => {
    const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-factory-')));
    try {
      const prepared = await createServerWithPolicy({
        ...DEFAULT_SERVER_CONFIG,
        projectRoots: [temporaryRoot],
      });
      expect(prepared.policy.projectRoots).toEqual([temporaryRoot]);
      const server = prepared.create();
      try {
        expect(server).toBeDefined();
      } finally {
        await server.close();
      }

      await expect(
        createServerWithPolicy({
          ...DEFAULT_SERVER_CONFIG,
          projectRoots: [resolve(temporaryRoot, 'missing')],
        }),
      ).rejects.toMatchObject({ code: 'policy.root.unavailable' });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
