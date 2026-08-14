import type { DiagnosticFinding, DiagnosticResult } from '../diagnostics.js';
import { cancellationCheckpoint } from '../deadline.js';
import { toPublicError, type ErrorCode } from '../errors.js';

/** The validators `validate_project` can run. */
export const RULE_GROUPS = [
  'state-machine',
  'action-contracts',
  'notifications',
  'database',
] as const;

export type RuleGroup = (typeof RULE_GROUPS)[number];

export const DEFAULT_MAX_FINDINGS = 200;

export interface GroupOutcome {
  readonly id: RuleGroup;
  /** False when the caller did not select this group. */
  readonly requested: boolean;
  /** False when the group was skipped, or failed before producing a result. */
  readonly ran: boolean;
  readonly status: 'passed' | 'findings' | 'unsupported' | 'skipped' | 'failed';
  readonly summary: { errors: number; warnings: number; information: number; unsupported: number };
  readonly findingCount: number;
  /** Present only when the group failed. The aggregate can never hide this. */
  readonly error?: { code: ErrorCode; message: string };
}

export interface AggregateResult {
  readonly groups: readonly GroupOutcome[];
  readonly diagnostics: DiagnosticResult;
  readonly truncation: { limit: number; omitted: number };
}

const EMPTY_SUMMARY = { errors: 0, warnings: 0, information: 0, unsupported: 0 } as const;

function order(findings: readonly DiagnosticFinding[], signal?: AbortSignal): DiagnosticFinding[] {
  cancellationCheckpoint(signal);
  const ordered = [...findings].sort((left, right) => {
    const byCode = left.code.localeCompare(right.code);
    if (byCode !== 0) {
      return byCode;
    }
    const byLocation = (left.locations[0]?.uri ?? '').localeCompare(right.locations[0]?.uri ?? '');
    return byLocation === 0 ? left.message.localeCompare(right.message) : byLocation;
  });
  cancellationCheckpoint(signal);
  return ordered;
}

/** Errors first, then warnings, then information, then unsupported. */
const SEVERITY_RANK: Record<string, number> = {
  error: 0,
  warning: 1,
  information: 2,
};

function rank(finding: DiagnosticFinding): number {
  if (finding.kind === 'unsupported-syntax') {
    return 3;
  }
  return SEVERITY_RANK[finding.severity] ?? 2;
}

function summarize(findings: readonly DiagnosticFinding[], signal?: AbortSignal): DiagnosticResult {
  const summary = { errors: 0, warnings: 0, information: 0, unsupported: 0 };
  for (const finding of findings) {
    cancellationCheckpoint(signal);
    if (finding.kind === 'unsupported-syntax') {
      summary.unsupported += 1;
    } else if (finding.severity === 'error') {
      summary.errors += 1;
    } else if (finding.severity === 'warning') {
      summary.warnings += 1;
    } else {
      summary.information += 1;
    }
  }
  const status =
    findings.length === 0
      ? 'passed'
      : summary.unsupported === findings.length
        ? 'unsupported'
        : 'findings';
  return { schemaVersion: 1, status, summary, findings: [...findings] };
}

export interface GroupRunner {
  readonly id: RuleGroup;
  run: () => DiagnosticResult | Promise<DiagnosticResult>;
}

/**
 * Runs the selected validators and combines their results.
 *
 * Three properties matter more than convenience here:
 *
 * - A validator that throws is reported as `failed` with its public error code.
 *   It is never silently dropped, and it never leaves the aggregate looking
 *   clean.
 * - Findings keep the evidence, certainty, and locations their validator gave
 *   them. Aggregation reorders, it does not rewrite.
 * - When the result is bounded, the least severe findings are dropped first and
 *   the number omitted is reported.
 */
export async function aggregateValidations(
  runners: readonly GroupRunner[],
  options: {
    readonly groups?: readonly RuleGroup[];
    readonly maxFindings?: number;
    /** The deadline's signal, checked between groups so an expired run stops. */
    readonly signal?: AbortSignal;
  } = {},
): Promise<AggregateResult> {
  const requested = new Set<RuleGroup>(options.groups ?? RULE_GROUPS);
  const limit = options.maxFindings ?? DEFAULT_MAX_FINDINGS;

  const groups: GroupOutcome[] = [];
  const collected: DiagnosticFinding[] = [];

  for (const group of RULE_GROUPS) {
    // Between groups rather than inside a rule: a validator is a bounded pass
    // over sources already in memory, and the honest place to stop is where
    // one finishes.
    cancellationCheckpoint(options.signal);
    const runner = runners.find((candidate) => candidate.id === group);
    if (!requested.has(group) || runner === undefined) {
      groups.push({
        id: group,
        requested: requested.has(group),
        ran: false,
        status: 'skipped',
        summary: { ...EMPTY_SUMMARY },
        findingCount: 0,
      });
      continue;
    }

    try {
      const result = await runner.run();
      cancellationCheckpoint(options.signal);
      collected.push(...result.findings);
      groups.push({
        id: group,
        requested: true,
        ran: true,
        status: result.status,
        summary: { ...result.summary },
        findingCount: result.findings.length,
      });
    } catch (error) {
      // Cancellation belongs to the whole MCP operation, not to one validator.
      // Do not turn a deadline into an ordinary `failed` group and continue
      // spending time in the remaining groups.
      cancellationCheckpoint(options.signal);
      const published = toPublicError(error);
      groups.push({
        id: group,
        requested: true,
        ran: false,
        status: 'failed',
        summary: { ...EMPTY_SUMMARY },
        findingCount: 0,
        error: { code: published.code, message: published.message },
      });
    }
  }

  // Drop the least severe findings first, so a bounded result keeps what
  // matters most rather than whatever happened to be sorted first.
  const ordered = order(collected, options.signal);
  const kept =
    ordered.length <= limit
      ? ordered
      : [...ordered].sort((left, right) => rank(left) - rank(right)).slice(0, limit);

  return {
    groups,
    diagnostics: summarize(order(kept, options.signal), options.signal),
    truncation: { limit, omitted: ordered.length - kept.length },
  };
}

/**
 * The status of the run as a whole.
 *
 * A failed validator outranks everything: an aggregate that could not run one
 * of its parts is never reported as passed or as merely having findings.
 */
export function aggregateStatus(
  groups: readonly GroupOutcome[],
  diagnostics: DiagnosticResult,
): 'passed' | 'findings' | 'unsupported' | 'incomplete' {
  if (groups.some((group) => group.status === 'failed')) {
    return 'incomplete';
  }
  return diagnostics.status;
}
