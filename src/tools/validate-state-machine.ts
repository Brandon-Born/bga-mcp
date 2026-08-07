import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { DiagnosticResultSchema, type DiagnosticResult } from '../diagnostics.js';
import type { PolicyBoundary } from '../policy.js';
import { STATE_MACHINE_RULES, validateStateMachine } from '../rules/state-machine.js';
import { loadProjectContext, publishFailure } from './project-context.js';

export const VALIDATE_STATE_MACHINE_TOOL = 'validate_state_machine';

export const ValidateStateMachineInputSchema = z.strictObject({
  projectRoot: z
    .string()
    .min(1)
    .describe('Absolute path of a project root the server was started with.'),
});

export const ValidateStateMachineOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
  statesRead: z.boolean(),
  statesSource: z.string().nullable(),
  stateCount: z.number().int().nonnegative(),
  phpSourcesRead: z.number().int().nonnegative(),
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

export type ValidateStateMachineResult = z.infer<typeof ValidateStateMachineOutputSchema>;

const DESCRIPTION = `Validate a BGA project's state machine across its files.

Checks the entry state, duplicate identifiers and names, unknown state types,
transition targets, unreachable states, dead ends, and whether the action, args,
and possible-action methods a state names are declared in readable PHP source.

Structural findings are reported as facts. Cross-file handler findings are
reported as heuristics with their known limitations, never as facts. Syntax the
reader cannot interpret is reported rather than passed over, so an unreadable
project never returns a clean result. Read-only, and no network access.`;

/** Renders the result as the short text an agent or a human reads first. */
export function summarizeValidation(
  diagnostics: DiagnosticResult,
  stateCount: number,
  layout: string,
): string {
  const { summary } = diagnostics;
  const lines = [
    `State machine for ${layout} layout: ${String(stateCount)} states read, status ${diagnostics.status}.`,
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

export function registerValidateStateMachine(server: McpServer, policy: PolicyBoundary): void {
  server.registerTool(
    VALIDATE_STATE_MACHINE_TOOL,
    {
      title: 'Validate a BGA state machine',
      description: DESCRIPTION,
      inputSchema: ValidateStateMachineInputSchema,
      outputSchema: ValidateStateMachineOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectRoot }) => {
      try {
        const result = await policy.runWithTimeout(VALIDATE_STATE_MACHINE_TOOL, async () => {
          const context = await loadProjectContext(policy, projectRoot, { withPhpSources: true });
          const diagnostics = validateStateMachine(context.model, context.phpSources);
          return {
            schemaVersion: 1,
            layout: context.model.layout,
            statesRead: context.model.states.parsed,
            statesSource: context.model.states.source,
            stateCount: context.model.states.definitions.length,
            phpSourcesRead: context.phpSources.length,
            rules: STATE_MACHINE_RULES.map((rule) => ({
              ...rule,
              falsePositives: [...rule.falsePositives],
            })),
            diagnostics,
          } satisfies ValidateStateMachineResult;
        });

        const structuredContent = ValidateStateMachineOutputSchema.parse(result);
        const text = summarizeValidation(result.diagnostics, result.stateCount, result.layout);
        policy.assertOutputWithinLimit(
          VALIDATE_STATE_MACHINE_TOOL,
          `${JSON.stringify(structuredContent)}${text}`,
        );
        return { content: [{ type: 'text', text }], structuredContent };
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
