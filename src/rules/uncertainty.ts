import type { DiagnosticFinding, DiagnosticResult, DiagnosticSeverity } from '../diagnostics.js';

/**
 * Shared handling for what a rule cannot prove.
 *
 * Three kinds of result exist, and the difference between them is the whole
 * point of this project:
 *
 * - **certain** — proven from the source that was read. Reported as a fact.
 * - **heuristic** — depends on code the reader cannot see. Carries heuristic
 *   evidence and the rule's known limitations, and is never a fact.
 * - **unsupported syntax** — a construct the reader could not interpret at all.
 *   Reported with its location and reason, so it can never become an implicit
 *   pass or a fabricated relationship.
 *
 * Every rule module builds its findings here, so the distinction cannot drift
 * apart between validators.
 */

export interface RuleDefinition {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly certainty: 'certain' | 'likely' | 'possible';
  readonly summary: string;
  readonly falsePositives: readonly string[];
}

export interface FindingInput {
  readonly code: string;
  readonly message: string;
  readonly evidence: string;
  readonly uri: string | null;
  readonly suggestion: string;
}

export function certainFinding(rule: RuleDefinition, input: FindingInput): DiagnosticFinding {
  return {
    kind: 'issue',
    code: input.code,
    severity: rule.severity,
    certainty: 'certain',
    message: input.message,
    locations: input.uri === null ? [] : [{ uri: input.uri }],
    evidence: [{ kind: 'relationship', message: input.evidence }],
    suggestions: [{ message: input.suggestion }],
  };
}

/**
 * A claim that depends on code the reader cannot see.
 *
 * The rule's recorded false positives travel with every finding, so a developer
 * reading one result knows how it can be wrong without consulting the catalog.
 */
export function heuristicFinding(rule: RuleDefinition, input: FindingInput): DiagnosticFinding {
  return {
    kind: 'heuristic',
    code: input.code,
    severity: rule.severity,
    certainty: rule.certainty === 'certain' ? 'likely' : rule.certainty,
    message: input.message,
    locations: input.uri === null ? [] : [{ uri: input.uri }],
    evidence: [
      { kind: 'heuristic', message: input.evidence },
      { kind: 'source', message: `Known limitation: ${rule.falsePositives.join(' ')}` },
    ],
    suggestions: [{ message: input.suggestion }],
  };
}

export interface UnsupportedInput {
  readonly code: string;
  readonly construct: string;
  readonly language: string;
  readonly uri: string | null;
  readonly message?: string;
  readonly suggestion?: string;
}

/**
 * A construct the reader could not interpret.
 *
 * This is never an error against the project: it is the tool reporting its own
 * limit, with the location and the construct so the developer can judge it.
 */
export function unsupportedSyntaxFinding(input: UnsupportedInput): DiagnosticFinding {
  return {
    kind: 'unsupported-syntax',
    code: input.code,
    certainty: 'certain',
    message: input.message ?? `Part of the project could not be read: ${input.construct}.`,
    locations: input.uri === null ? [] : [{ uri: input.uri }],
    evidence: [{ kind: 'source', message: `Unsupported construct: ${input.construct}` }],
    suggestions: [
      {
        message:
          input.suggestion ??
          'Use a literal form this reader can interpret, or confirm the dynamic form is intended.',
      },
    ],
    syntax: { language: input.language, construct: input.construct },
  };
}

/** Deterministic ordering: by code, then location, then message. */
export function orderFindings(findings: readonly DiagnosticFinding[]): DiagnosticFinding[] {
  return [...findings].sort((left, right) => {
    const byCode = left.code.localeCompare(right.code);
    if (byCode !== 0) {
      return byCode;
    }
    const byLocation = (left.locations[0]?.uri ?? '').localeCompare(right.locations[0]?.uri ?? '');
    return byLocation === 0 ? left.message.localeCompare(right.message) : byLocation;
  });
}

/**
 * Builds the shared diagnostic result.
 *
 * A result made entirely of unsupported syntax reports `unsupported`, never
 * `passed`: a reader that understood nothing has proven nothing.
 */
export function summarizeFindings(findings: readonly DiagnosticFinding[]): DiagnosticResult {
  const summary = { errors: 0, warnings: 0, information: 0, unsupported: 0 };
  for (const finding of findings) {
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
  return { schemaVersion: 1, status, summary, findings: orderFindings(findings) };
}
