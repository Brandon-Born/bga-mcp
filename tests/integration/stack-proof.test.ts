import { fileURLToPath } from 'node:url';

import { connectStdio } from '../helpers/mcp.js';

const proofServer = fileURLToPath(new URL('../fixtures/proof-server.ts', import.meta.url));

describe('selected stack proof', () => {
  it('lists, invokes, and shuts down a real test tool over stdio', async () => {
    const connection = await connectStdio(process.execPath, ['--import', 'tsx', proofServer], {
      protocolVersion: '2025-11-25',
    });

    try {
      expect(connection.client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
      const listed = await connection.client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(['milestone_proof']);

      const result = await connection.client.callTool({
        name: 'milestone_proof',
        arguments: { value: 'verified-over-stdio' },
      });
      expect(result.structuredContent).toEqual({
        echoed: 'verified-over-stdio',
      });
    } finally {
      await connection.client.close();
    }

    expect(connection.stderr()).toBe('');
  });
});
