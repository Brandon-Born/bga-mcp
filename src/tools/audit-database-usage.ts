import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { DiagnosticResultSchema, type DiagnosticResult } from '../diagnostics.js';
import type { PolicyBoundary } from '../policy.js';
import { publishFailure, publishResult } from '../publish.js';
import { DATABASE_RULES, auditDatabaseUsage } from '../rules/database.js';
import { loadProjectContext, resolveProjectRoot } from './project-context.js';

export const AUDIT_DATABASE_USAGE_TOOL = 'audit_database_usage';

export const AuditDatabaseUsageInputSchema = z.strictObject({
  projectRoot: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Absolute path of a project root the server was started with. Optional when exactly one root is configured; with none or several, the call is refused rather than guessed.',
    ),
});

export const AuditDatabaseUsageOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
  schemaSource: z.string().nullable(),
  phpSourcesRead: z.number().int().nonnegative(),
  schema: z.array(z.strictObject({ name: z.string(), columns: z.array(z.string()) })),
  queries: z.array(
    z.strictObject({
      tables: z.array(z.string()),
      columns: z.array(z.string()),
      interpolated: z.boolean(),
      text: z.string(),
      source: z.string(),
    }),
  ),
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

export type AuditDatabaseUsageResult = z.infer<typeof AuditDatabaseUsageOutputSchema>;

const DESCRIPTION = `Compare a BGA project's dbmodel.sql with the queries its PHP sources run.

Reports tables a query names that the schema never declares, columns a query
names that its table does not have, columns declared but never used, and
queries that interpolate a PHP value into their text instead of escaping it.

dbmodel.sql, DbQuery, and getObjectListFromDB are unchanged across the layouts,
so this applies equally to a legacy, modern, or part-migrated project.

A table that is missing from the schema is reported as a fact. Column-level
claims are heuristics, because aliases, expressions, and SELECT * all limit
what a textual reader can see. A query assembled from several expressions is
reported as unsupported rather than reconstructed. Read-only, and no network
access.`;

export function summarizeDatabaseAudit(
  diagnostics: DiagnosticResult,
  tableCount: number,
  queryCount: number,
): string {
  const { summary } = diagnostics;
  const lines = [
    `Database usage: ${String(tableCount)} declared tables, ${String(queryCount)} readable queries, status ${diagnostics.status}.`,
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

export function registerAuditDatabaseUsage(server: McpServer, policy: PolicyBoundary): void {
  server.registerTool(
    AUDIT_DATABASE_USAGE_TOOL,
    {
      title: 'Audit BGA database usage',
      description: DESCRIPTION,
      inputSchema: AuditDatabaseUsageInputSchema,
      outputSchema: AuditDatabaseUsageOutputSchema,
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
        const result = await policy.runWithTimeout(AUDIT_DATABASE_USAGE_TOOL, async (signal) => {
          const context = await loadProjectContext(policy, root, { withPhpSources: true, signal });
          const schemaPath = context.model.components
            .find((component) => component.id === 'database')
            ?.files.find((file) => file.endsWith('.sql'));
          const schemaSource =
            schemaPath === undefined
              ? null
              : {
                  path: schemaPath,
                  text: await policy.readProjectFile(root, schemaPath),
                };

          const audit = auditDatabaseUsage(schemaSource, context.phpSources);
          return {
            schemaVersion: 1,
            layout: context.model.layout,
            schemaSource: schemaPath ?? null,
            phpSourcesRead: context.phpSources.length,
            schema: audit.tables.map((table) => ({
              name: table.name,
              columns: [...table.columns],
            })),
            queries: audit.queries.map((query) => ({
              tables: [...query.tables],
              columns: [...query.columns],
              interpolated: query.interpolated,
              text: query.text,
              source: query.source,
            })),
            rules: DATABASE_RULES.map((rule) => ({
              ...rule,
              falsePositives: [...rule.falsePositives],
            })),
            diagnostics: audit.diagnostics,
          } satisfies AuditDatabaseUsageResult;
        });

        return publishResult(
          policy,
          AUDIT_DATABASE_USAGE_TOOL,
          AuditDatabaseUsageOutputSchema,
          result,
          (published) =>
            summarizeDatabaseAudit(
              published.diagnostics,
              published.schema.length,
              published.queries.length,
            ),
        );
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
