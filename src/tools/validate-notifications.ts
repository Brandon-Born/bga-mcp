import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { DiagnosticResultSchema, type DiagnosticResult } from '../diagnostics.js';
import type { PolicyBoundary } from '../policy.js';
import { NOTIFICATION_RULES, validateNotifications } from '../rules/notifications.js';
import { loadProjectContext, publishFailure } from './project-context.js';

export const VALIDATE_NOTIFICATIONS_TOOL = 'validate_notifications';

export const ValidateNotificationsInputSchema = z.strictObject({
  projectRoot: z
    .string()
    .min(1)
    .describe('Absolute path of a project root the server was started with.'),
});

export const ValidateNotificationsOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
  serverSourcesRead: z.number().int().nonnegative(),
  clientSourcesRead: z.number().int().nonnegative(),
  trace: z.strictObject({
    sent: z.array(
      z.strictObject({
        name: z.string(),
        payloadKeys: z.array(z.string()),
        scope: z.enum(['all', 'player']),
        source: z.string(),
      }),
    ),
    handlers: z.array(
      z.strictObject({
        name: z.string(),
        binding: z.enum(['subscribe', 'method']),
        payloadKeys: z.array(z.string()),
        source: z.string(),
      }),
    ),
  }),
  rules: z.array(
    z.strictObject({
      code: z.string(),
      severity: z.enum(['error', 'warning', 'information']),
      certainty: z.enum(['certain', 'likely', 'possible']),
      summary: z.string(),
      falsePositives: z.array(z.string()),
    }),
  ),
  diagnostics: DiagnosticResultSchema,
});

export type ValidateNotificationsResult = z.infer<typeof ValidateNotificationsOutputSchema>;

const DESCRIPTION = `Compare the notifications a BGA server sends with the handlers its client declares.

A notification nobody handles fails silently at runtime: no error, the
interface simply never updates. This tool reports notifications sent with no
handler, handlers with no sender, duplicate subscriptions, and payload keys the
two sides disagree about.

A duplicate subscription is reported as a fact. Every claim spanning the two
sides is a heuristic that carries its known limitations, and a notification
built at runtime is reported as unsupported rather than guessed at. Read-only,
and no network access.`;

export function summarizeNotifications(
  diagnostics: DiagnosticResult,
  sentCount: number,
  handlerCount: number,
): string {
  const { summary } = diagnostics;
  const lines = [
    `Notifications: ${String(sentCount)} sent, ${String(handlerCount)} handlers, status ${diagnostics.status}.`,
    `Findings: ${String(summary.errors)} errors, ${String(summary.warnings)} warnings, ${String(summary.information)} information, ${String(summary.unsupported)} unsupported.`,
  ];
  for (const finding of diagnostics.findings.slice(0, 10)) {
    const certainty = finding.kind === 'heuristic' ? ` (${finding.certainty})` : '';
    lines.push(`- ${finding.code}${certainty}: ${finding.message}`);
  }
  if (diagnostics.findings.length > 10) {
    lines.push(`- …and ${String(diagnostics.findings.length - 10)} more.`);
  }
  return lines.join('\n');
}

export function registerValidateNotifications(server: McpServer, policy: PolicyBoundary): void {
  server.registerTool(
    VALIDATE_NOTIFICATIONS_TOOL,
    {
      title: 'Validate BGA notifications',
      description: DESCRIPTION,
      inputSchema: ValidateNotificationsInputSchema,
      outputSchema: ValidateNotificationsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectRoot }) => {
      try {
        const result = await policy.runWithTimeout(VALIDATE_NOTIFICATIONS_TOOL, async () => {
          const context = await loadProjectContext(policy, projectRoot, {
            withPhpSources: true,
            withClientSources: true,
          });
          const trace = validateNotifications(context.phpSources, context.clientSources);
          return {
            schemaVersion: 1,
            layout: context.model.layout,
            serverSourcesRead: context.phpSources.length,
            clientSourcesRead: context.clientSources.length,
            trace: {
              sent: trace.sent.map((notification) => ({
                name: notification.name,
                payloadKeys: [...notification.payloadKeys],
                scope: notification.scope,
                source: notification.source,
              })),
              handlers: trace.handlers.map((handler) => ({
                name: handler.name,
                binding: handler.binding,
                payloadKeys: [...handler.payloadKeys],
                source: handler.source,
              })),
            },
            rules: NOTIFICATION_RULES.map((rule) => ({
              ...rule,
              falsePositives: [...rule.falsePositives],
            })),
            diagnostics: trace.diagnostics,
          } satisfies ValidateNotificationsResult;
        });

        const structuredContent = ValidateNotificationsOutputSchema.parse(result);
        const text = summarizeNotifications(
          result.diagnostics,
          result.trace.sent.length,
          result.trace.handlers.length,
        );
        policy.assertOutputWithinLimit(
          VALIDATE_NOTIFICATIONS_TOOL,
          `${JSON.stringify(structuredContent)}${text}`,
        );
        return { content: [{ type: 'text', text }], structuredContent };
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
