import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { DiagnosticResultSchema } from '../diagnostics.js';
import type { PolicyBoundary } from '../policy.js';
import {
  DEFAULT_MAX_FINDINGS,
  RULE_GROUPS,
  aggregateStatus,
  aggregateValidations,
  type AggregateResult,
} from '../rules/aggregate.js';
import { createValidatorRunners } from '../rules/validators.js';
import { loadProjectContext, publishFailure, resolveProjectRoot } from './project-context.js';

export const VALIDATE_PROJECT_TOOL = 'validate_project';

export const ValidateProjectInputSchema = z.strictObject({
  projectRoot: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Absolute path of a project root the server was started with. Optional when exactly one root is configured; with none or several, the call is refused rather than guessed.',
    ),
  groups: z
    .array(z.enum(RULE_GROUPS))
    .min(1)
    .optional()
    .describe('Validators to run. Every group runs when this is omitted.'),
  maxFindings: z
    .number()
    .int()
    .positive()
    .max(5_000)
    .optional()
    .describe(
      `Maximum findings to return, least severe dropped first (default ${String(DEFAULT_MAX_FINDINGS)}).`,
    ),
});

export const ValidateProjectOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
  status: z.enum(['passed', 'findings', 'unsupported', 'incomplete']),
  groups: z.array(
    z.strictObject({
      id: z.enum(RULE_GROUPS),
      requested: z.boolean(),
      ran: z.boolean(),
      status: z.enum(['passed', 'findings', 'unsupported', 'skipped', 'failed']),
      summary: z.strictObject({
        errors: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative(),
        information: z.number().int().nonnegative(),
        unsupported: z.number().int().nonnegative(),
      }),
      findingCount: z.number().int().nonnegative(),
      error: z.strictObject({ code: z.string(), message: z.string() }).optional(),
    }),
  ),
  truncation: z.strictObject({
    limit: z.number().int().positive(),
    omitted: z.number().int().nonnegative(),
  }),
  diagnostics: DiagnosticResultSchema,
});

export type ValidateProjectResult = z.infer<typeof ValidateProjectOutputSchema>;

const DESCRIPTION = `Run every BGA project validator and combine the results.

Runs the state machine, action contract, notification, and database validators,
or only the groups requested, and returns their findings together with a
per-group breakdown.

Every validator reads the legacy, modern, and part-migrated layouts.

Findings keep the evidence, certainty, and locations their validator produced;
aggregation reorders, it never rewrites. A validator that fails is reported as
failed with its error code and makes the whole run 'incomplete' — a broken part
can never leave the result looking clean. When the result is bounded, the least
severe findings are dropped first and the number omitted is reported.
Read-only, and no network access.`;

export function summarizeProjectValidation(status: string, aggregate: AggregateResult): string {
  const { summary } = aggregate.diagnostics;
  const lines = [
    `Project validation: status ${status}.`,
    `Findings: ${String(summary.errors)} errors, ${String(summary.warnings)} warnings, ${String(summary.information)} information, ${String(summary.unsupported)} unsupported.`,
  ];
  for (const group of aggregate.groups) {
    const detail =
      group.status === 'failed'
        ? `failed (${group.error?.code ?? 'unknown'})`
        : group.status === 'skipped'
          ? 'skipped'
          : `${group.status}, ${String(group.findingCount)} findings`;
    lines.push(`- ${group.id}: ${detail}`);
  }
  if (aggregate.truncation.omitted > 0) {
    lines.push(
      `${String(aggregate.truncation.omitted)} findings were omitted by the ${String(aggregate.truncation.limit)} finding limit.`,
    );
  }
  return lines.join('\n');
}

export function registerValidateProject(server: McpServer, policy: PolicyBoundary): void {
  server.registerTool(
    VALIDATE_PROJECT_TOOL,
    {
      title: 'Validate a BGA project',
      description: DESCRIPTION,
      inputSchema: ValidateProjectInputSchema,
      outputSchema: ValidateProjectOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectRoot, groups, maxFindings }) => {
      try {
        const root = resolveProjectRoot(policy, projectRoot);
        const result = await policy.runWithTimeout(VALIDATE_PROJECT_TOOL, async () => {
          const context = await loadProjectContext(policy, root, {
            withPhpSources: true,
            withClientSources: true,
          });

          const runners = createValidatorRunners(policy, root, context);

          const aggregate = await aggregateValidations(runners, {
            ...(groups === undefined ? {} : { groups }),
            ...(maxFindings === undefined ? {} : { maxFindings }),
          });

          return {
            schemaVersion: 1,
            layout: context.model.layout,
            status: aggregateStatus(aggregate.groups, aggregate.diagnostics),
            groups: aggregate.groups.map((group) => ({
              id: group.id,
              requested: group.requested,
              ran: group.ran,
              status: group.status,
              summary: { ...group.summary },
              findingCount: group.findingCount,
              ...(group.error === undefined ? {} : { error: { ...group.error } }),
            })),
            truncation: { ...aggregate.truncation },
            diagnostics: aggregate.diagnostics,
            aggregate,
          };
        });

        const { aggregate, ...published } = result;
        const structuredContent = ValidateProjectOutputSchema.parse(published);
        const text = summarizeProjectValidation(published.status, aggregate);
        policy.assertOutputWithinLimit(
          VALIDATE_PROJECT_TOOL,
          `${JSON.stringify(structuredContent)}${text}`,
        );
        return { content: [{ type: 'text', text }], structuredContent };
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
