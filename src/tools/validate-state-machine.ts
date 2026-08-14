import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { DiagnosticResultSchema, type DiagnosticResult } from '../diagnostics.js';
import type { PolicyBoundary } from '../policy.js';
import { publishFailure, publishResult } from '../publish.js';
import { STATE_MACHINE_RULES, validateStateMachine } from '../rules/state-machine.js';
import {
  isProjectRootInputRequired,
  loadProjectContext,
  resolveProjectRootForRequest,
} from './project-context.js';

export const VALIDATE_STATE_MACHINE_TOOL = 'validate_state_machine';

export const ValidateStateMachineInputSchema = z.strictObject({
  projectRoot: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Absolute path of a project root the server was started with. Optional when exactly one root is configured; with none or several, the call is refused rather than guessed.',
    ),
});

export const ValidateStateMachineOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
  statesRead: z.boolean(),
  statesSource: z.string().nullable(),
  stateCount: z.number().int().nonnegative(),
  phpSourcesRead: z.number().int().nonnegative(),
  /** Where the framework enters the machine, and how that was established. */
  initialState: z.strictObject({
    ids: z.array(z.number().int()),
    origin: z.enum(['setup-new-game', 'state-1', 'default', 'unresolved']),
    evidence: z.string(),
  }),
  /** What the reader read completely, and so which rules were allowed to speak. */
  complete: z.strictObject({ declarations: z.boolean(), edges: z.boolean() }),
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

Reads states from states.inc.php, from state classes under modules/php/States,
or from both at once while a project is part-way through migrating them. The
entry point comes from what the project's own generation uses to declare it:
the state class setupNewGame returns, or the reserved identifier 1, or the
framework default. Identifiers 1 and 99 belong to the framework and are never
reported as the project's mistake.

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

export function registerValidateStateMachine(
  server: McpServer,
  policy: PolicyBoundary,
  era: 'legacy' | 'modern' = 'legacy',
): void {
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
    async ({ projectRoot }, context) => {
      try {
        const outcome = await policy.runWithTimeout(VALIDATE_STATE_MACHINE_TOOL, async (signal) => {
          const resolution = await resolveProjectRootForRequest(
            policy,
            projectRoot,
            era,
            context,
            undefined,
            signal,
          );
          if (isProjectRootInputRequired(resolution)) {
            return resolution;
          }
          const project = await loadProjectContext(policy, resolution, {
            withPhpSources: true,
            signal,
          });
          const diagnostics = validateStateMachine(project.model, project.phpSources, signal);
          return {
            schemaVersion: 1,
            layout: project.model.layout,
            statesRead: project.model.states.parsed,
            statesSource: project.model.states.source,
            stateCount: project.model.states.definitions.length,
            phpSourcesRead: project.phpSources.length,
            initialState: {
              ids: [...project.model.states.initial.ids],
              origin: project.model.states.initial.origin,
              evidence: project.model.states.initial.evidence,
            },
            complete: { ...project.model.states.complete },
            rules: STATE_MACHINE_RULES.map((rule) => ({
              ...rule,
              falsePositives: [...rule.falsePositives],
            })),
            diagnostics,
          } satisfies ValidateStateMachineResult;
        });
        if (isProjectRootInputRequired(outcome)) {
          return outcome;
        }
        const result = outcome;

        return publishResult(
          policy,
          VALIDATE_STATE_MACHINE_TOOL,
          ValidateStateMachineOutputSchema,
          result,
          (published) =>
            summarizeValidation(published.diagnostics, published.stateCount, published.layout),
        );
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
