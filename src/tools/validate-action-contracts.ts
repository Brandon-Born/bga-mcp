import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { DiagnosticResultSchema, type DiagnosticResult } from '../diagnostics.js';
import type { PolicyBoundary } from '../policy.js';
import { ACTION_CONTRACT_RULES, validateActionContracts } from '../rules/action-contracts.js';
import { loadProjectContext, publishFailure } from './project-context.js';

export const VALIDATE_ACTION_CONTRACTS_TOOL = 'validate_action_contracts';

export const ValidateActionContractsInputSchema = z.strictObject({
  projectRoot: z
    .string()
    .min(1)
    .describe('Absolute path of a project root the server was started with.'),
});

export const ValidateActionContractsOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
  clientSourcesRead: z.number().int().nonnegative(),
  phpSourcesRead: z.number().int().nonnegative(),
  trace: z.strictObject({
    clientCalls: z.array(
      z.strictObject({
        action: z.string(),
        argumentNames: z.array(z.string()),
        style: z.enum(['ajaxcall', 'performAction']),
        source: z.string(),
      }),
    ),
    entryPoints: z.array(
      z.strictObject({
        action: z.string(),
        argumentNames: z.array(z.string()),
        source: z.string(),
      }),
    ),
    declaredActions: z.array(z.string()),
    gameMethods: z.array(z.string()),
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

export type ValidateActionContractsResult = z.infer<typeof ValidateActionContractsOutputSchema>;

const DESCRIPTION = `Trace a BGA project's player actions across its client and server.

Follows each action from the client call, to the entry point in the action
class, to the game method that handles it, and compares the arguments each side
expects. Reports actions the client calls that no state allows, actions a state
declares that nothing calls, missing entry points and game methods, and
argument disagreements.

Only a duplicated entry point and a broken naming convention are reported as
facts; every cross-file claim is a heuristic that carries its known limitations.
A call assembled at runtime is reported as unsupported, never guessed at.
Read-only, and no network access.`;

export function summarizeActionContracts(
  diagnostics: DiagnosticResult,
  callCount: number,
  entryPointCount: number,
): string {
  const { summary } = diagnostics;
  const lines = [
    `Action contracts: ${String(callCount)} client calls, ${String(entryPointCount)} entry points, status ${diagnostics.status}.`,
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

export function registerValidateActionContracts(server: McpServer, policy: PolicyBoundary): void {
  server.registerTool(
    VALIDATE_ACTION_CONTRACTS_TOOL,
    {
      title: 'Validate BGA action contracts',
      description: DESCRIPTION,
      inputSchema: ValidateActionContractsInputSchema,
      outputSchema: ValidateActionContractsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectRoot }) => {
      try {
        const result = await policy.runWithTimeout(VALIDATE_ACTION_CONTRACTS_TOOL, async () => {
          const context = await loadProjectContext(policy, projectRoot, {
            withPhpSources: true,
            withClientSources: true,
          });
          const trace = validateActionContracts(
            context.model,
            context.clientSources,
            context.phpSources,
          );
          return {
            schemaVersion: 1,
            layout: context.model.layout,
            clientSourcesRead: context.clientSources.length,
            phpSourcesRead: context.phpSources.length,
            trace: {
              clientCalls: trace.clientCalls.map((call) => ({
                action: call.action,
                argumentNames: [...call.argumentNames],
                style: call.style,
                source: call.source,
              })),
              entryPoints: trace.entryPoints.map((entry) => ({
                action: entry.action,
                argumentNames: [...entry.argumentNames],
                source: entry.source,
              })),
              declaredActions: [...trace.declaredActions],
              gameMethods: [...trace.gameMethods],
            },
            rules: ACTION_CONTRACT_RULES.map((rule) => ({
              ...rule,
              falsePositives: [...rule.falsePositives],
            })),
            diagnostics: trace.diagnostics,
          } satisfies ValidateActionContractsResult;
        });

        const structuredContent = ValidateActionContractsOutputSchema.parse(result);
        const text = summarizeActionContracts(
          result.diagnostics,
          result.trace.clientCalls.length,
          result.trace.entryPoints.length,
        );
        policy.assertOutputWithinLimit(
          VALIDATE_ACTION_CONTRACTS_TOOL,
          `${JSON.stringify(structuredContent)}${text}`,
        );
        return { content: [{ type: 'text', text }], structuredContent };
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
