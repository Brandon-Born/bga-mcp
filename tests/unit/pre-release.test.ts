import type { DiagnosticFinding, DiagnosticResult } from '../../src/diagnostics.js';
import type { GroupOutcome } from '../../src/rules/aggregate.js';
import { auditPreRelease, type RuleCatalog } from '../../src/rules/pre-release.js';

const EMPTY = { errors: 0, warnings: 0, information: 0, unsupported: 0 };

function group(
  id: GroupOutcome['id'],
  status: GroupOutcome['status'],
  ran = status !== 'failed' && status !== 'skipped',
): GroupOutcome {
  return { id, requested: true, ran, status, summary: { ...EMPTY }, findingCount: 0 };
}

function finding(code: string): DiagnosticFinding {
  return {
    kind: 'issue',
    code,
    severity: 'error',
    certainty: 'certain',
    message: `${code} happened`,
    locations: [{ uri: 'states.inc.php' }],
    evidence: [{ kind: 'relationship', message: 'seeded' }],
    suggestions: [{ message: 'fix it' }],
  };
}

function diagnostics(findings: readonly DiagnosticFinding[]): DiagnosticResult {
  return {
    schemaVersion: 1,
    status: findings.length === 0 ? 'passed' : 'findings',
    summary: { ...EMPTY, errors: findings.length },
    findings: [...findings],
  };
}

const CATALOG: RuleCatalog = {
  catalogVersion: '9.9.9',
  checks: [
    {
      id: 'state.initial.missing',
      automatable: true,
      summary: 'The framework enters state 1 first.',
      group: 'state-machine',
      tool: 'validate_state_machine',
      severity: 'error',
      certainty: 'certain',
    },
    {
      id: 'database.table.undeclared',
      automatable: true,
      summary: 'A query names a table the schema does not declare.',
      group: 'database',
      tool: 'audit_database_usage',
      severity: 'error',
      certainty: 'certain',
    },
    {
      id: 'manual.artwork.rights',
      automatable: false,
      summary: 'Artwork is originally created or licensed for redistribution.',
      manualReason: 'A tool cannot judge provenance.',
    },
  ],
};

describe('pre-release audit', () => {
  it('passes a check only when its validator ran and found nothing', () => {
    const audit = auditPreRelease(
      CATALOG,
      [group('state-machine', 'passed'), group('database', 'passed')],
      diagnostics([]),
    );
    expect(audit.catalogVersion).toBe('9.9.9');
    expect(audit.counts).toEqual({ passed: 2, failed: 0, unsupported: 0, 'manual-required': 1 });
  });

  it('fails a check and carries its findings unchanged', () => {
    const seeded = finding('state.initial.missing');
    const audit = auditPreRelease(
      CATALOG,
      [group('state-machine', 'findings'), group('database', 'passed')],
      diagnostics([seeded]),
    );
    const failed = audit.checks.find((check) => check.id === 'state.initial.missing');
    expect(failed?.outcome).toBe('failed');
    expect(failed?.findings).toEqual([seeded]);
    expect(audit.counts.failed).toBe(1);
  });

  it('[E2E-PRE-RELEASE-MANUAL-NEVER-PASSES] never counts a manual check as passed', () => {
    const audit = auditPreRelease(
      CATALOG,
      [group('state-machine', 'passed'), group('database', 'passed')],
      diagnostics([]),
    );
    const manual = audit.checks.find((check) => check.id === 'manual.artwork.rights');
    expect(manual?.outcome).toBe('manual-required');
    expect(manual?.reason).toContain('cannot judge provenance');
    expect(
      audit.checks.filter((check) => check.outcome === 'passed').map((c) => c.id),
    ).not.toContain('manual.artwork.rights');
  });

  it('[E2E-PRE-RELEASE-PARTIAL-SUPPORT] never turns an unrun or unreadable check into a pass', () => {
    const failedGroup = auditPreRelease(
      CATALOG,
      [group('state-machine', 'passed'), group('database', 'failed')],
      diagnostics([]),
    );
    const afterFailure = failedGroup.checks.find(
      (check) => check.id === 'database.table.undeclared',
    );
    expect(afterFailure?.outcome).toBe('unsupported');
    expect(afterFailure?.reason).toContain('failed');

    const skipped = auditPreRelease(
      CATALOG,
      [group('state-machine', 'passed'), group('database', 'skipped')],
      diagnostics([]),
    );
    expect(skipped.checks.find((check) => check.id === 'database.table.undeclared')?.outcome).toBe(
      'unsupported',
    );

    const unreadable = auditPreRelease(
      CATALOG,
      [group('state-machine', 'unsupported'), group('database', 'passed')],
      diagnostics([]),
    );
    const unread = unreadable.checks.find((check) => check.id === 'state.initial.missing');
    expect(unread?.outcome).toBe('unsupported');
    expect(unread?.reason).toContain('could not read');

    const missingGroup = auditPreRelease(
      CATALOG,
      [group('state-machine', 'passed')],
      diagnostics([]),
    );
    expect(
      missingGroup.checks.find((check) => check.id === 'database.table.undeclared')?.outcome,
    ).toBe('unsupported');
  });

  it('[E2E-PRE-RELEASE-UNSUPPORTED-PRESERVED] leaves a check unsupported when its validator read only part of the project', () => {
    // The validator ran and found a real defect elsewhere, but also reported a
    // construct it could not read. A check with no finding of its own has not
    // been shown to pass: its input was incomplete.
    const partial: GroupOutcome = {
      ...group('state-machine', 'findings'),
      summary: { ...EMPTY, unsupported: 1 },
      findingCount: 1,
    };
    const audit = auditPreRelease(
      CATALOG,
      [partial, group('database', 'passed')],
      diagnostics([finding('database.table.undeclared')]),
    );

    const check = audit.checks.find((entry) => entry.id === 'state.initial.missing');
    expect(check?.outcome).toBe('unsupported');
    expect(check?.reason).toContain('could not read');
    expect(audit.counts.unsupported).toBe(1);
    expect(audit.counts.failed).toBe(1);
  });

  it('counts every check exactly once', () => {
    const audit = auditPreRelease(
      CATALOG,
      [group('state-machine', 'findings'), group('database', 'failed')],
      diagnostics([finding('state.initial.missing')]),
    );
    const total = Object.values(audit.counts).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(CATALOG.checks.length);
    expect(audit.checks).toHaveLength(CATALOG.checks.length);
  });
});
