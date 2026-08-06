import { z } from 'zod';

export const DIAGNOSTIC_CONTRACT_VERSION = 1 as const;
export const DIAGNOSTIC_SCHEMA_ID =
  'https://github.com/Brandon-Born/bga-mcp/raw/main/config/diagnostics.schema.json';

export const DiagnosticSeveritySchema = z.enum(['error', 'warning', 'information']);
export const DiagnosticCertaintySchema = z.enum(['certain', 'likely', 'possible']);

const DiagnosticPositionSchema = z.strictObject({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export const DiagnosticLocationSchema = z
  .strictObject({
    uri: z.string().min(1),
    range: z
      .strictObject({
        start: DiagnosticPositionSchema,
        end: DiagnosticPositionSchema.optional(),
      })
      .optional(),
  })
  .superRefine((location, context) => {
    const start = location.range?.start;
    const end = location.range?.end;
    if (
      start !== undefined &&
      end !== undefined &&
      (end.line < start.line || (end.line === start.line && end.column < start.column))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Location range end must not precede its start',
        path: ['range', 'end'],
      });
    }
  });

export const DiagnosticEvidenceSchema = z.strictObject({
  kind: z.enum(['source', 'relationship', 'runtime', 'heuristic']),
  message: z.string().min(1),
  location: DiagnosticLocationSchema.optional(),
});

export const DiagnosticSuggestionSchema = z.strictObject({
  message: z.string().min(1),
  location: DiagnosticLocationSchema.optional(),
});

const DiagnosticCodeSchema = z.string().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
const FindingCoreShape = {
  code: DiagnosticCodeSchema,
  message: z.string().min(1),
  locations: z.array(DiagnosticLocationSchema),
  evidence: z.array(DiagnosticEvidenceSchema).min(1),
  suggestions: z.array(DiagnosticSuggestionSchema),
};

export const DiagnosticIssueSchema = z
  .strictObject({
    kind: z.literal('issue'),
    ...FindingCoreShape,
    severity: DiagnosticSeveritySchema,
    certainty: z.literal('certain'),
  })
  .superRefine((finding, context) => {
    if (finding.evidence.some((evidence) => evidence.kind === 'heuristic')) {
      context.addIssue({
        code: 'custom',
        message: 'Certain findings cannot rely on heuristic evidence',
        path: ['evidence'],
      });
    }
  });

export const DiagnosticHeuristicSchema = z
  .strictObject({
    kind: z.literal('heuristic'),
    ...FindingCoreShape,
    severity: DiagnosticSeveritySchema,
    certainty: z.enum(['likely', 'possible']),
  })
  .superRefine((finding, context) => {
    if (!finding.evidence.some((evidence) => evidence.kind === 'heuristic')) {
      context.addIssue({
        code: 'custom',
        message: 'Heuristic findings require heuristic evidence',
        path: ['evidence'],
      });
    }
  });

export const UnsupportedSyntaxSchema = z.strictObject({
  kind: z.literal('unsupported-syntax'),
  ...FindingCoreShape,
  certainty: z.literal('certain'),
  syntax: z.strictObject({
    language: z.string().min(1),
    construct: z.string().min(1),
  }),
});

export const DiagnosticFindingSchema = z.union([
  DiagnosticIssueSchema,
  DiagnosticHeuristicSchema,
  UnsupportedSyntaxSchema,
]);

const DiagnosticSummarySchema = z.strictObject({
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  information: z.number().int().nonnegative(),
  unsupported: z.number().int().nonnegative(),
});

export const DiagnosticResultSchema = z
  .strictObject({
    schemaVersion: z.literal(DIAGNOSTIC_CONTRACT_VERSION),
    status: z.enum(['passed', 'findings', 'unsupported']),
    summary: DiagnosticSummarySchema,
    findings: z.array(DiagnosticFindingSchema),
  })
  .superRefine((result, context) => {
    const actual = {
      errors: 0,
      warnings: 0,
      information: 0,
      unsupported: 0,
    };

    for (const finding of result.findings) {
      if (finding.kind === 'unsupported-syntax') {
        actual.unsupported += 1;
      } else if (finding.severity === 'error') {
        actual.errors += 1;
      } else if (finding.severity === 'warning') {
        actual.warnings += 1;
      } else {
        actual.information += 1;
      }
    }

    for (const key of ['errors', 'warnings', 'information', 'unsupported'] as const) {
      if (result.summary[key] !== actual[key]) {
        context.addIssue({
          code: 'custom',
          message: `Summary ${key} must equal ${String(actual[key])}`,
          path: ['summary', key],
        });
      }
    }

    const expectedStatus =
      result.findings.length === 0
        ? 'passed'
        : actual.unsupported === result.findings.length
          ? 'unsupported'
          : 'findings';
    if (result.status !== expectedStatus) {
      context.addIssue({
        code: 'custom',
        message: `Status must be ${expectedStatus}`,
        path: ['status'],
      });
    }
  })
  .meta({
    title: 'bga-mcp diagnostic result',
    description: 'Version 1 wire contract for bga-mcp diagnostic results.',
  });

export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;
export type DiagnosticCertainty = z.infer<typeof DiagnosticCertaintySchema>;
export type DiagnosticLocation = z.infer<typeof DiagnosticLocationSchema>;
export type DiagnosticEvidence = z.infer<typeof DiagnosticEvidenceSchema>;
export type DiagnosticSuggestion = z.infer<typeof DiagnosticSuggestionSchema>;
export type DiagnosticFinding = z.infer<typeof DiagnosticFindingSchema>;
export type DiagnosticResult = z.infer<typeof DiagnosticResultSchema>;

export function parseDiagnosticResult(value: unknown): DiagnosticResult {
  return DiagnosticResultSchema.parse(value);
}

export function getDiagnosticResultJsonSchema(): object {
  return {
    ...z.toJSONSchema(DiagnosticResultSchema, { reused: 'ref' }),
    $id: DIAGNOSTIC_SCHEMA_ID,
  };
}
