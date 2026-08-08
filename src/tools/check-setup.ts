import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { PolicyBoundary } from '../policy.js';
import { buildSetupStatus, type SetupStatus } from '../setup/status.js';
import { publishFailure } from './project-context.js';

export const CHECK_SETUP_TOOL = 'check_setup';

export const CheckSetupInputSchema = z.strictObject({});

export const CheckSetupOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  ready: z.boolean(),
  findings: z.array(
    z.strictObject({
      code: z.string(),
      status: z.enum(['ok', 'action-needed', 'unavailable']),
      summary: z.string(),
      nextAction: z.string().optional(),
    }),
  ),
});

const DESCRIPTION = `Report what this server can currently do, and what it needs.

Says which project roots are available, whether network access and Studio log
reading are on, and for anything missing, exactly what to do about it. Call this
first when a capability refuses, or when helping someone set the server up:
every finding carries a stable code and a next action you can act on or repeat.

A capability that is switched off is reported as off, with the flag that enables
it, rather than omitted. Credentials are never reported — only whether one was
found and where from. Read-only, and no network access.`;

/** Renders the report as the short text a human reads first. */
export function summarizeSetup(status: SetupStatus): string {
  const lines = status.findings.map((entry) => {
    const mark = entry.status === 'ok' ? 'ok' : entry.status === 'unavailable' ? 'off' : 'todo';
    return entry.nextAction === undefined
      ? `[${mark}] ${entry.summary}`
      : `[${mark}] ${entry.summary}\n       ${entry.nextAction}`;
  });
  lines.unshift(
    status.ready
      ? 'The server is ready to use.'
      : 'The server needs something before it can be used.',
  );
  return lines.join('\n');
}

/**
 * Registers the setup report.
 *
 * Deliberately available whatever else is configured, and never refusing: a
 * capability that tells you why things are refusing is useless if it refuses
 * too.
 */
export function registerCheckSetup(server: McpServer, policy: PolicyBoundary): void {
  server.registerTool(
    CHECK_SETUP_TOOL,
    {
      title: 'Check the bga-mcp setup',
      description: DESCRIPTION,
      inputSchema: CheckSetupInputSchema,
      outputSchema: CheckSetupOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const structuredContent = await policy.runWithTimeout(
          CHECK_SETUP_TOOL,
          async () => await buildSetupStatus(policy),
        );
        const parsed = CheckSetupOutputSchema.parse(structuredContent);
        const text = summarizeSetup(structuredContent);
        policy.assertOutputWithinLimit(CHECK_SETUP_TOOL, `${JSON.stringify(parsed)}${text}`);
        return { content: [{ type: 'text', text }], structuredContent: parsed };
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
