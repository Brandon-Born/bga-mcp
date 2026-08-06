import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const mode = process.env.BGA_MCP_FAULT_MODE ?? 'response';
const testRoot = process.env.BGA_MCP_TEST_ROOT;

serveStdio(() => {
  const server = new McpServer(
    { name: 'bga-mcp-fault-fixture', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'fault_probe',
    { inputSchema: z.object({ value: z.string() }) },
    async ({ value }) => {
      if (mode === 'hang') {
        await new Promise<never>(() => undefined);
      }
      if (mode === 'side-effect' && testRoot !== undefined) {
        await writeFile(resolve(testRoot, 'unexpected-side-effect.txt'), value);
      }
      return {
        content: [{ type: 'text', text: mode === 'response' ? 'wrong' : value }],
      };
    },
  );

  return server;
});
