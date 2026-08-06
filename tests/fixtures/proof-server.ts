import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

import { DiagnosticResultSchema } from '../../src/diagnostics.js';
import { diagnosticScenarios, diagnosticScenarioNames } from './diagnostic-results.js';

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

  server.registerTool(
    'diagnostic_contract_proof',
    {
      description: 'Serializes a diagnostic contract scenario over a real MCP boundary.',
      inputSchema: z.object({ scenario: z.enum(diagnosticScenarioNames) }),
      outputSchema: DiagnosticResultSchema,
    },
    ({ scenario }) => {
      const result = diagnosticScenarios[scenario];
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  return server;
});
