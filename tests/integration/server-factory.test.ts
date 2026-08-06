import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { createServer } from '../../src/server.js';

describe('production server factory', () => {
  it('reports exact identity and no public capabilities', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    const client = new Client({ name: 'factory-test', version: '1.0.0' });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect(client.getServerVersion()).toEqual({
        name: 'bga-mcp',
        version: '0.0.0-development',
      });
      expect(client.getServerCapabilities()).toEqual({});
    } finally {
      await client.close();
      await server.close();
    }
  });
});
