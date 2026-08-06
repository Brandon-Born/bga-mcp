import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

serveStdio(() => {
  const server = new McpServer(
    { name: 'bga-mcp-stack-proof', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'milestone_proof',
    {
      description: 'Proves the selected stack over a real stdio MCP boundary.',
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.object({ echoed: z.string() }),
    },
    ({ value }) => ({
      content: [{ type: 'text', text: value }],
      structuredContent: { echoed: value },
    }),
  );

  return server;
});
