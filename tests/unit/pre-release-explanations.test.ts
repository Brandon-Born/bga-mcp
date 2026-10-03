// secret-scan:allow-file Synthetic non-secret assignments test the final publication boundary.
import { DEFAULT_POLICY_CONFIG, PolicyBoundary } from '../../src/policy.js';
import type { DiagnosticResult } from '../../src/diagnostics.js';
import { publishResult } from '../../src/publish.js';
import {
  aggregateValidations,
  type GroupRunner,
  type RuleGroup,
} from '../../src/rules/aggregate.js';
import { auditPreRelease, type RuleCatalog } from '../../src/rules/pre-release.js';
import { summarizeFindings, unsupportedSyntaxFinding } from '../../src/rules/uncertainty.js';
import {
  RunPreReleaseAuditOutputSchema,
  summarizePreRelease,
} from '../../src/tools/run-pre-release-audit.js';

const catalog: RuleCatalog = {
  catalogVersion: 'test',
  checks: [
    {
      id: 'database.first',
      automatable: true,
      summary: 'First',
      group: 'database',
      tool: 'audit_database_usage',
    },
    {
      id: 'database.second',
      automatable: true,
      summary: 'Second',
      group: 'database',
      tool: 'audit_database_usage',
    },
    {
      id: 'state.first',
      automatable: true,
      summary: 'State',
      group: 'state-machine',
      tool: 'validate_state_machine',
    },
    {
      id: 'manual.first',
      automatable: false,
      summary: 'Manual',
      manualReason: 'Needs observation.',
    },
  ],
};

function blocker(uri: string, message = 'Unresolved values remain unchecked.') {
  return {
    ...unsupportedSyntaxFinding({
      code: 'shared.unsupported-syntax',
      construct: 'dynamic values',
      language: 'php',
      uri,
      message,
      suggestion: 'Inspect the value construction and escaping separately.',
    }),
    locations: [{ uri, range: { start: { line: 12, column: 5 } } }],
  };
}

async function audit(runners: readonly GroupRunner[], limit = 200) {
  const diagnosticsByGroup = new Map<RuleGroup, DiagnosticResult>();
  const aggregate = await aggregateValidations(
    runners.map((runner) => ({
      id: runner.id,
      run: async () => {
        const result = await runner.run();
        diagnosticsByGroup.set(runner.id, result);
        return result;
      },
    })),
    { maxFindings: limit },
  );
  return auditPreRelease(
    catalog,
    aggregate.groups.map((group) => ({
      ...group,
      coverageDiagnostics: diagnosticsByGroup.get(group.id),
    })),
    aggregate.diagnostics,
    undefined,
  );
}

it('attributes same-code blockers to their actual validator rather than another group', async () => {
  const result = await audit([
    { id: 'database', run: () => summarizeFindings([blocker('modules/php/Game.php')]) },
    { id: 'state-machine', run: () => summarizeFindings([blocker('modules/php/States/Turn.php')]) },
  ]);
  const database = result.checks[0]?.reason;
  expect(database).toContain('modules/php/Game.php:12:5');
  expect(database).toContain('Inspect the value construction');
  expect(database).not.toContain('States/Turn.php');
  expect(result.checks[2]?.reason).toContain('States/Turn.php:12:5');
  expect(result.checks[2]?.reason).not.toContain('modules/php/Game.php');
});

it('retains actual coverage blockers when aggregate truncation drops them', async () => {
  const result = await audit(
    [
      {
        id: 'database',
        run: () =>
          summarizeFindings([
            blocker('modules/php/Game.php'),
            {
              kind: 'issue',
              code: 'database.first',
              severity: 'error',
              certainty: 'certain',
              message: 'Missing table.',
              locations: [],
              evidence: [{ kind: 'source', message: 'Literal table.' }],
              suggestions: [],
            },
          ]),
      },
    ],
    1,
  );
  expect(result.checks[0]?.outcome).toBe('failed');
  expect(result.checks[1]?.outcome).toBe('unsupported');
  expect(result.checks[1]?.reason).toContain('modules/php/Game.php:12:5');
  expect(result.checks[1]?.reason).not.toContain('Missing table.');
});

it('does not assign a different group blocker to a clean check', async () => {
  const result = await audit([
    { id: 'database', run: () => summarizeFindings([blocker('Game.php')]) },
    { id: 'state-machine', run: () => summarizeFindings([]) },
  ]);
  expect(result.checks[2]).toMatchObject({ outcome: 'passed' });
  expect(result.checks[2]?.reason).toBeUndefined();
  expect(result.checks[3]).toMatchObject({
    outcome: 'manual-required',
    reason: 'Needs observation.',
  });
});

it('keeps check outcomes and makes group-level uncertainty explicit', async () => {
  const result = await audit([
    { id: 'database', run: () => summarizeFindings([blocker('Game.php')]) },
  ]);
  expect(result.counts).toEqual({ passed: 0, failed: 0, unsupported: 3, 'manual-required': 1 });
  expect(result.checks[0]?.reason).toBe(result.checks[1]?.reason);
  expect(result.checks[0]?.reason).toContain('not confirmed defects in each check');
});

it('bounds blocker multiplicity deterministically and discloses omitted causes', async () => {
  const causes = ['e.php', 'd.php', 'c.php', 'b.php', 'a.php'].map((path) => blocker(path));
  const result = await audit([{ id: 'database', run: () => summarizeFindings(causes) }]);
  const reason = result.checks[0]?.reason ?? '';
  expect(reason).toContain('a.php:12:5');
  expect(reason).toContain('c.php:12:5');
  expect(reason).not.toContain('d.php');
  expect(reason).toContain('2 additional blocker(s) omitted');
  expect(reason).toContain('See audit_database_usage');
  const repeated = await audit([
    { id: 'database', run: () => summarizeFindings([...causes].reverse()) },
  ]);
  expect(repeated).toEqual(result);
});

it('reports the stable error code for a failed validator without fabricating syntax causes', async () => {
  const result = await audit([
    {
      id: 'database',
      run: () => {
        throw new TypeError('private-stack-canary');
      },
    },
  ]);
  expect(result.checks[0]).toMatchObject({ outcome: 'unsupported' });
  expect(result.checks[0]?.reason).toContain('internal.unexpected');
  expect(result.checks[0]?.reason).not.toContain('private-stack-canary');
  expect(result.checks[0]?.reason).not.toContain('coverage blockers');
});

it('summarizes repeated reasons once while naming their affected checks', async () => {
  const result = await audit([
    { id: 'database', run: () => summarizeFindings([blocker('Game.php')]) },
  ]);
  const text = summarizePreRelease(
    RunPreReleaseAuditOutputSchema.parse({ schemaVersion: 1, layout: 'modern', ...result }),
    'modern',
  );
  expect(text.match(/shared\.unsupported-syntax/gu)).toHaveLength(1);
  expect(text).toContain('2 checks (database.first, database.second)');
  expect(text).toContain('never counted as passed');
});

it('redacts full source strings before rendering summaries without clipping a secret assignment', async () => {
  const secret = 'unit-only-redaction-canary';
  const result = await audit([
    {
      id: 'database',
      run: () =>
        summarizeFindings([blocker('Game.php', `${'prefix '.repeat(80)}password=${secret}`)]),
    },
  ]);
  const policy = await PolicyBoundary.create(DEFAULT_POLICY_CONFIG);
  const published = publishResult(
    policy,
    'run_pre_release_audit',
    RunPreReleaseAuditOutputSchema,
    { schemaVersion: 1, layout: 'modern', ...result },
    (value) => summarizePreRelease(value, value.layout),
  );
  expect(JSON.stringify(published)).not.toContain(secret);
  expect(JSON.stringify(published)).toContain('[redacted');
  expect(published.structuredContent.counts).toEqual(result.counts);
});
