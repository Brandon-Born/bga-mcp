import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { DiagnosticFindingSchema } from '../diagnostics.js';
import type { PolicyBoundary } from '../policy.js';
import { aggregateValidations } from '../rules/aggregate.js';
import { auditPreRelease, type PreReleaseAudit, type RuleCatalog } from '../rules/pre-release.js';
import { createValidatorRunners } from '../rules/validators.js';
import { loadProjectContext, publishFailure, resolveProjectRoot } from './project-context.js';

export const RUN_PRE_RELEASE_AUDIT_TOOL = 'run_pre_release_audit';

export const RunPreReleaseAuditInputSchema = z.strictObject({
  projectRoot: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Absolute path of a project root the server was started with. Optional when exactly one root is configured; with none or several, the call is refused rather than guessed.',
    ),
});

export const RunPreReleaseAuditOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
  catalogVersion: z.string(),
  counts: z.strictObject({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    unsupported: z.number().int().nonnegative(),
    'manual-required': z.number().int().nonnegative(),
  }),
  checks: z.array(
    z.strictObject({
      id: z.string(),
      outcome: z.enum(['passed', 'failed', 'unsupported', 'manual-required']),
      summary: z.string(),
      group: z.enum(['state-machine', 'action-contracts', 'notifications', 'database']).optional(),
      severity: z.string().optional(),
      certainty: z.string().optional(),
      findings: z.array(DiagnosticFindingSchema).optional(),
      reason: z.string().optional(),
    }),
  ),
});

export type RunPreReleaseAuditResult = z.infer<typeof RunPreReleaseAuditOutputSchema>;

const DESCRIPTION = `Run the catalogued pre-release checks against a BGA project.

Reports passed, failed, unsupported, and manual-required checks separately, and
names the rule-catalog version it used.

Every validator behind these checks reads the legacy, modern, and part-migrated
layouts.

A check passes only when the validator that owns it ran and produced no finding
for it. A validator that failed, was skipped, or could not read the part of the
project a check examines leaves that check unsupported, never passed. Checks
that cannot be automated are always reported as manual-required. Read-only, and
no network access.`;

export function summarizePreRelease(audit: PreReleaseAudit, layout: string): string {
  const lines = [
    `Pre-release audit of a ${layout} project against rule catalog ${audit.catalogVersion}.`,
    `${String(audit.counts.passed)} passed, ${String(audit.counts.failed)} failed, ${String(audit.counts.unsupported)} unsupported, ${String(audit.counts['manual-required'])} manual-required.`,
  ];
  const failed = audit.checks.filter((entry) => entry.outcome === 'failed');
  for (const check of failed.slice(0, 10)) {
    lines.push(`- failed: ${check.id} (${String(check.findings?.length ?? 0)} findings)`);
  }
  if (failed.length > 10) {
    lines.push(`- …and ${String(failed.length - 10)} more failed checks in the full result.`);
  }
  if (audit.counts['manual-required'] > 0) {
    lines.push(
      `${String(audit.counts['manual-required'])} checks still need a human; they are never counted as passed.`,
    );
  }
  return lines.join('\n');
}

/**
 * Registers the pre-release audit.
 *
 * The catalog ships with the package, so the audit reports the exact version
 * of the checks it applied and a client can tell two runs apart.
 */
export function registerRunPreReleaseAudit(
  server: McpServer,
  policy: PolicyBoundary,
  catalog: RuleCatalog,
): void {
  server.registerTool(
    RUN_PRE_RELEASE_AUDIT_TOOL,
    {
      title: 'Run a BGA pre-release audit',
      description: DESCRIPTION,
      inputSchema: RunPreReleaseAuditInputSchema,
      outputSchema: RunPreReleaseAuditOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectRoot }) => {
      try {
        const root = await resolveProjectRoot(policy, projectRoot);
        const result = await policy.runWithTimeout(RUN_PRE_RELEASE_AUDIT_TOOL, async () => {
          const context = await loadProjectContext(policy, root, {
            withPhpSources: true,
            withClientSources: true,
          });

          const runners = createValidatorRunners(policy, root, context);

          const aggregate = await aggregateValidations(runners, { maxFindings: 5_000 });
          const audit = auditPreRelease(catalog, aggregate.groups, aggregate.diagnostics);
          return { audit, layout: context.model.layout };
        });

        const structuredContent = RunPreReleaseAuditOutputSchema.parse({
          schemaVersion: 1,
          layout: result.layout,
          catalogVersion: result.audit.catalogVersion,
          counts: result.audit.counts,
          checks: result.audit.checks,
        });
        const text = summarizePreRelease(result.audit, result.layout);
        policy.assertOutputWithinLimit(
          RUN_PRE_RELEASE_AUDIT_TOOL,
          `${JSON.stringify(structuredContent)}${text}`,
        );
        return { content: [{ type: 'text', text }], structuredContent };
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
