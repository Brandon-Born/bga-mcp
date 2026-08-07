import type { DiagnosticFinding, DiagnosticResult } from '../../src/diagnostics.js';
import {
  DEFAULT_MAX_FINDINGS,
  RULE_GROUPS,
  aggregateStatus,
  aggregateValidations,
  type GroupRunner,
  type RuleGroup,
} from '../../src/rules/aggregate.js';
import { ERROR_CODES, PolicyViolationError } from '../../src/errors.js';

function issue(code: string, severity: 'error' | 'warning' | 'information'): DiagnosticFinding {
  return {
    kind: 'issue',
    code,
    severity,
    certainty: 'certain',
    message: `${code} happened`,
    locations: [{ uri: 'states.inc.php' }],
    evidence: [{ kind: 'relationship', message: 'seeded' }],
    suggestions: [{ message: 'fix it' }],
  };
}

function result(findings: readonly DiagnosticFinding[]): DiagnosticResult {
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
  return {
    schemaVersion: 1,
    status: findings.length === 0 ? 'passed' : 'findings',
    summary,
    findings: [...findings],
  };
}

function runner(id: RuleGroup, findings: readonly DiagnosticFinding[]): GroupRunner {
  return { id, run: () => result(findings) };
}

const ALL_RUNNERS: GroupRunner[] = [
  runner('state-machine', [issue('state.transition.target-exists', 'error')]),
  runner('action-contracts', [issue('action.entry-point.missing', 'warning')]),
  runner('notifications', [issue('notification.sent.not-handled', 'warning')]),
  runner('database', [issue('database.column.unused', 'information')]),
];

describe('validation aggregation', () => {
  it('runs every group by default and reports each one', async () => {
    const aggregate = await aggregateValidations(ALL_RUNNERS);
    expect(aggregate.groups.map((group) => group.id)).toEqual([...RULE_GROUPS]);
    expect(aggregate.groups.every((group) => group.ran)).toBe(true);
    expect(aggregate.diagnostics.summary).toEqual({
      errors: 1,
      warnings: 2,
      information: 1,
      unsupported: 0,
    });
    expect(aggregate.truncation).toEqual({ limit: DEFAULT_MAX_FINDINGS, omitted: 0 });
  });

  it('preserves each finding exactly as its validator produced it', async () => {
    const aggregate = await aggregateValidations(ALL_RUNNERS);
    const original = issue('state.transition.target-exists', 'error');
    const carried = aggregate.diagnostics.findings.find(
      (finding) => finding.code === original.code,
    );
    expect(carried).toEqual(original);
  });

  it('runs only the requested groups and marks the rest skipped', async () => {
    const aggregate = await aggregateValidations(ALL_RUNNERS, { groups: ['database'] });
    const byId = Object.fromEntries(aggregate.groups.map((group) => [group.id, group]));

    expect(byId.database).toMatchObject({ requested: true, ran: true, status: 'findings' });
    expect(byId['state-machine']).toMatchObject({
      requested: false,
      ran: false,
      status: 'skipped',
      findingCount: 0,
    });
    expect(aggregate.diagnostics.findings.map((finding) => finding.code)).toEqual([
      'database.column.unused',
    ]);
  });

  it('reports a failed validator and never hides it', async () => {
    const aggregate = await aggregateValidations([
      ...ALL_RUNNERS.slice(0, 3),
      {
        id: 'database',
        run: () => {
          throw new PolicyViolationError(
            ERROR_CODES.policyOutputTooLarge,
            'The file is too large to read.',
          );
        },
      },
    ]);

    const failed = aggregate.groups.find((group) => group.id === 'database');
    expect(failed).toMatchObject({
      ran: false,
      status: 'failed',
      error: { code: 'policy.output.too-large' },
    });
    expect(aggregateStatus(aggregate.groups, aggregate.diagnostics)).toBe('incomplete');

    // The groups that did run keep their findings.
    expect(aggregate.diagnostics.findings).toHaveLength(3);
  });

  it('collapses an unexpected failure to a stable code', async () => {
    const aggregate = await aggregateValidations([
      {
        id: 'state-machine',
        run: () => {
          throw new TypeError('cannot read /home/dev/.ssh/key');
        },
      },
    ]);
    const failed = aggregate.groups.find((group) => group.id === 'state-machine');
    expect(failed?.error?.code).toBe('internal.unexpected');
    expect(JSON.stringify(failed)).not.toContain('.ssh');
  });

  it('keeps the most severe findings when the result is bounded', async () => {
    const aggregate = await aggregateValidations(
      [
        runner('state-machine', [
          issue('zzz.information', 'information'),
          issue('yyy.warning', 'warning'),
          issue('aaa.error', 'error'),
        ]),
      ],
      { maxFindings: 2 },
    );

    expect(aggregate.truncation).toEqual({ limit: 2, omitted: 1 });
    expect(aggregate.diagnostics.findings.map((finding) => finding.code)).toEqual([
      'aaa.error',
      'yyy.warning',
    ]);
    // The summary describes what was returned, so it stays consistent.
    expect(aggregate.diagnostics.summary).toEqual({
      errors: 1,
      warnings: 1,
      information: 0,
      unsupported: 0,
    });
    // The per-group breakdown still reports the full count.
    expect(aggregate.groups[0]?.findingCount).toBe(3);
  });

  it('passes only when every requested group passed', async () => {
    const clean = await aggregateValidations([
      runner('state-machine', []),
      runner('action-contracts', []),
      runner('notifications', []),
      runner('database', []),
    ]);
    expect(aggregateStatus(clean.groups, clean.diagnostics)).toBe('passed');

    const withFindings = await aggregateValidations(ALL_RUNNERS);
    expect(aggregateStatus(withFindings.groups, withFindings.diagnostics)).toBe('findings');
  });

  it('orders findings deterministically', async () => {
    const first = await aggregateValidations(ALL_RUNNERS);
    const second = await aggregateValidations(ALL_RUNNERS);
    expect(JSON.stringify(first.diagnostics)).toBe(JSON.stringify(second.diagnostics));
    const codes = first.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toEqual([...codes].sort());
  });
});
