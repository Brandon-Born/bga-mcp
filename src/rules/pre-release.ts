import type { DiagnosticFinding, DiagnosticResult } from '../diagnostics.js';
import type { GroupOutcome, RuleGroup } from './aggregate.js';

/** A catalogued check, as read from `config/rule-catalog.json`. */
export interface CatalogCheck {
  readonly id: string;
  readonly automatable: boolean;
  readonly summary: string;
  readonly group?: RuleGroup;
  readonly tool?: string;
  readonly severity?: string;
  readonly certainty?: string;
  readonly manualReason?: string;
}

export interface RuleCatalog {
  readonly catalogVersion: string;
  readonly checks: readonly CatalogCheck[];
}

export type CheckOutcome = 'passed' | 'failed' | 'unsupported' | 'manual-required';

export interface CheckResult {
  readonly id: string;
  readonly outcome: CheckOutcome;
  readonly summary: string;
  readonly group?: RuleGroup;
  readonly severity?: string;
  readonly certainty?: string;
  /** Findings for a failed check, exactly as its rule produced them. */
  readonly findings?: readonly DiagnosticFinding[];
  /** Why the check could not produce a verdict. */
  readonly reason?: string;
}

export interface PreReleaseAudit {
  readonly catalogVersion: string;
  readonly counts: Record<CheckOutcome, number>;
  readonly checks: readonly CheckResult[];
}

/**
 * Turns validator output into a pre-release verdict per catalogued check.
 *
 * The rule that matters: a check only passes when the validator that owns it
 * actually ran and produced no finding for it. A group that failed, was
 * skipped, or reported unsupported syntax leaves its checks `unsupported`, and
 * a manual check is always `manual-required`. Nothing here can turn an
 * unimplemented or unrun check into a pass.
 */
export function auditPreRelease(
  catalog: RuleCatalog,
  groups: readonly GroupOutcome[],
  diagnostics: DiagnosticResult,
): PreReleaseAudit {
  const byGroup = new Map(groups.map((group) => [group.id, group]));
  const findingsByCode = new Map<string, DiagnosticFinding[]>();
  for (const finding of diagnostics.findings) {
    findingsByCode.set(finding.code, [...(findingsByCode.get(finding.code) ?? []), finding]);
  }

  const checks: CheckResult[] = [];
  for (const check of catalog.checks) {
    if (!check.automatable) {
      checks.push({
        id: check.id,
        outcome: 'manual-required',
        summary: check.summary,
        reason: check.manualReason ?? 'This check cannot be automated.',
      });
      continue;
    }

    const group = check.group === undefined ? undefined : byGroup.get(check.group);
    const shared = {
      id: check.id,
      summary: check.summary,
      ...(check.group === undefined ? {} : { group: check.group }),
      ...(check.severity === undefined ? {} : { severity: check.severity }),
      ...(check.certainty === undefined ? {} : { certainty: check.certainty }),
    };

    if (group?.ran !== true) {
      checks.push({
        ...shared,
        outcome: 'unsupported',
        reason:
          group === undefined
            ? 'The validator that owns this check did not run.'
            : `The ${group.id} validator ${group.status === 'failed' ? 'failed' : 'was skipped'}, so this check has no verdict.`,
      });
      continue;
    }

    const findings = findingsByCode.get(check.id) ?? [];
    if (findings.length > 0) {
      checks.push({ ...shared, outcome: 'failed', findings });
      continue;
    }

    // The validator ran, but could not read the part of the project this check
    // examines. Absence of a finding is not evidence of a pass.
    if (group.status === 'unsupported') {
      checks.push({
        ...shared,
        outcome: 'unsupported',
        reason: `The ${group.id} validator could not read what this check examines.`,
      });
      continue;
    }

    checks.push({ ...shared, outcome: 'passed' });
  }

  const counts: Record<CheckOutcome, number> = {
    passed: 0,
    failed: 0,
    unsupported: 0,
    'manual-required': 0,
  };
  for (const check of checks) {
    counts[check.outcome] += 1;
  }

  return { catalogVersion: catalog.catalogVersion, counts, checks };
}
