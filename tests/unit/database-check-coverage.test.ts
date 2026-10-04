import type { DiagnosticResult } from '../../src/diagnostics.js';
import type { PolicyBoundary } from '../../src/policy.js';
import type { ProjectContext } from '../../src/tools/project-context.js';
import { aggregateValidations, type GroupOutcome } from '../../src/rules/aggregate.js';
import { auditPreRelease, type RuleCatalog } from '../../src/rules/pre-release.js';
import { createValidatorRunners } from '../../src/rules/validators.js';

const IDS = [
  'database.audit.unavailable',
  'database.table.duplicate',
  'database.column.duplicate',
  'database.table.undeclared',
  'database.column.undeclared',
  'database.column.unused',
  'database.query.interpolated',
];
const CATALOG: RuleCatalog = {
  catalogVersion: '1.0.0',
  checks: IDS.map((id) => ({
    id,
    automatable: true,
    summary: id,
    group: 'database',
    tool: 'audit_database_usage',
  })),
};
const PHP =
  '<?php static::DbQuery(sprintf("INSERT INTO player (player_id) VALUES %s", $untrusted));';
type PrivateResult = DiagnosticResult & {
  completedChecks?: readonly { id: string; reason: string }[];
};

async function run(schema: string | null, php = PHP, maxFindings = 5_000) {
  const policy = {
    readProjectFile: () => Promise.resolve(schema ?? ''),
  } as unknown as PolicyBoundary;
  const context = {
    model: {
      components: schema === null ? [] : [{ id: 'database', files: ['dbmodel.sql'] }],
      diagnostics: { findings: [] },
    },
    phpSources: [{ path: 'modules/php/Game.php', text: php }],
  } as unknown as ProjectContext;
  const runner = createValidatorRunners(policy, '/configured', context).find(
    (entry) => entry.id === 'database',
  );
  if (runner === undefined) throw new Error('Missing database runner');
  let result: PrivateResult | undefined;
  const aggregate = await aggregateValidations(
    [
      {
        id: 'database',
        run: async () => {
          result = await runner.run();
          return result;
        },
      },
    ],
    { maxFindings },
  );
  const audit = auditPreRelease(
    CATALOG,
    aggregate.groups.map((group) => ({
      ...group,
      coverageDiagnostics: result,
      completedChecks: result?.completedChecks,
    })),
    aggregate.diagnostics,
  );
  if (result === undefined) throw new Error('Database runner produced no result');
  return { result, audit };
}

describe('independent database check evidence', () => {
  it('[UNIT-DATABASE-INDEPENDENT-COVERAGE] completes only three independent checks on an inert schema', async () => {
    const { result, audit } = await run(
      ' -- original example\r\n\t-- CREATE TABLE ghost (ghost_id INT);\r\n \t\n',
    );
    expect(audit.checks.slice(0, 3).map((check) => check.outcome)).toEqual([
      'passed',
      'passed',
      'passed',
    ]);
    expect(audit.checks.slice(3).map((check) => check.outcome)).toEqual(
      Array(4).fill('unsupported'),
    );
    expect(audit.checks[0]?.reason).toContain('availability only');
    expect(audit.checks[1]?.reason).toContain('does not validate runtime SQL');
    expect(result.summary.unsupported).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('completedChecks');
  });

  it.each([
    'CREATE TABLE card (card_id INT);',
    'CREATE TABLE card (card_id INT); CREATE TABLE $unknown (id INT);',
    'ALTER TABLE player ADD player_extra INT;',
    '/*!80000 CREATE TABLE hidden (hidden_id INT) */;',
    '/*M! CREATE TABLE hidden (hidden_id INT) */;',
    '/* ordinary block comment */',
    '# hash comment',
    '--not-a-comment CREATE TABLE hidden (hidden_id INT);',
    '\uFEFF-- ambiguous leading character',
    '-- ordinary line\rCREATE TABLE hidden (hidden_id INT);',
    '-- ordinary line\nCREATE TABLE hidden (hidden_id INT);',
  ])(
    '[UNIT-DATABASE-INDEPENDENT-COVERAGE] does not attest duplicate absence for %s',
    async (schema) => {
      const { audit } = await run(schema);
      expect(audit.checks[0]?.outcome).toBe('passed');
      expect(audit.checks.slice(1).every((check) => check.outcome === 'unsupported')).toBe(true);
    },
  );

  it('[UNIT-DATABASE-INDEPENDENT-COVERAGE] retains schema defects and cannot hide truncated defects into passes', async () => {
    const schema = 'CREATE TABLE card (card_id INT, card_id INT); CREATE TABLE card (card_id INT);';
    const complete = await run(schema);
    expect(complete.audit.checks.slice(1, 3).map((check) => check.outcome)).toEqual([
      'failed',
      'failed',
    ]);
    const truncated = await run(schema, PHP, 0);
    expect(truncated.audit.checks.slice(1, 3).map((check) => check.outcome)).toEqual([
      'unsupported',
      'unsupported',
    ]);
  });

  it('[UNIT-DATABASE-INDEPENDENT-COVERAGE] requires an actual schema and readable reference for availability', async () => {
    expect((await run(null)).audit.checks[0]?.outcome).toBe('failed');
    expect(
      (await run('-- no declarations\n', '<?php static::DbQuery($unknown);')).audit.checks[0]
        ?.outcome,
    ).toBe('failed');
    expect((await run(null, PHP, 0)).audit.checks[0]?.outcome).toBe('unsupported');
  });

  it('[UNIT-DATABASE-INDEPENDENT-COVERAGE] refuses missing or query-dependent attestation', async () => {
    const { result } = await run('-- original schema\n');
    const base: GroupOutcome = {
      id: 'database',
      requested: true,
      ran: true,
      status: result.status,
      summary: result.summary,
      findingCount: result.findings.length,
    };
    const absent = auditPreRelease(CATALOG, [base], result);
    expect(absent.checks.every((check) => check.outcome === 'unsupported')).toBe(true);
    const forged = auditPreRelease(
      CATALOG,
      [{ ...base, completedChecks: IDS.map((id) => ({ id, reason: 'seeded' })) } as GroupOutcome],
      result,
    );
    expect(forged.checks.slice(3).every((check) => check.outcome === 'unsupported')).toBe(true);
  });

  it.each(['failed', 'skipped', 'unrequested', 'different-group'] as const)(
    '[UNIT-DATABASE-INDEPENDENT-COVERAGE] refuses %s group evidence',
    (mode) => {
      const summary = { errors: 0, warnings: 0, information: 0, unsupported: 1 };
      const group = {
        id: mode === 'different-group' ? 'state-machine' : 'database',
        requested: mode !== 'unrequested',
        ran: true,
        status: mode === 'failed' || mode === 'skipped' ? mode : 'unsupported',
        summary,
        findingCount: 1,
        completedChecks: IDS.map((id) => ({ id, reason: 'seeded' })),
      } as GroupOutcome;
      const catalog: RuleCatalog =
        mode === 'different-group'
          ? {
              ...CATALOG,
              checks: CATALOG.checks.map((check) => ({ ...check, group: 'state-machine' })),
            }
          : CATALOG;
      const result = auditPreRelease(catalog, [group], {
        schemaVersion: 1,
        status: 'unsupported',
        summary,
        findings: [],
      });
      expect(result.checks.every((check) => check.outcome === 'unsupported')).toBe(true);
    },
  );
});
