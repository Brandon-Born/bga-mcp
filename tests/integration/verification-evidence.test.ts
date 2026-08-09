// secret-scan:allow-file Seeded non-secret sample credential that proves the evidence scan works.
import { join, resolve } from 'node:path';

import {
  buildCapabilityEvidence,
  canonicalize,
  conformanceStatus,
  indexScenarioResults,
  integrityDigest,
  sealEvidence,
  summarizeScenarios,
  type Evidence,
  type Manifest,
  type VitestReport,
} from '../../scripts/lib/evidence.js';
import { scanText } from '../../scripts/lib/secret-scan.js';

/** Split so the literal never appears as a single token in the repository. */
const SEEDED_CREDENTIAL = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

const CI_RUN = {
  id: 'ci-1',
  workflow: 'CI',
  url: 'https://github.com/example/example/actions/runs/1',
  commit: '0'.repeat(40),
  completedAt: '2026-08-07T00:00:00Z',
  conclusion: 'success' as const,
  jobs: ['ubuntu-latest / Node 22'],
};

const manifest: Manifest = {
  ciRuns: [CI_RUN],
  transports: [
    {
      name: 'stdio',
      stability: 'implemented',
      protocolVersions: ['2025-11-25'],
      requiredScenarios: ['E2E-STDIO-LEGACY-INITIALIZE'],
      ciEvidence: 'ci-1',
    },
  ],
  capabilities: {
    tools: [
      {
        name: 'inspect_project',
        stability: 'verified',
        protocolVersions: ['2025-11-25'],
        requiredScenarios: ['E2E-INSPECT-PROJECT-MODERN', 'E2E-INSPECT-PROJECT-HYBRID'],
        ciEvidence: 'ci-1',
      },
    ],
    resources: [],
    prompts: [],
  },
  adapters: [],
};

function report(...titles: readonly (readonly [string, string])[]): VitestReport {
  return {
    numTotalTests: titles.length,
    numPassedTests: titles.filter(([, status]) => status === 'passed').length,
    numFailedTests: titles.filter(([, status]) => status === 'failed').length,
    numPendingTests: 0,
    testResults: [
      {
        name: '/repo/tests/e2e/inspect-project.test.ts',
        assertionResults: titles.map(([title, status]) => ({ title, status, duration: 3 })),
      },
    ],
  };
}

/** Rebuilds every object with its keys in the opposite order, content unchanged. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => reverseKeys(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([key, entry]) => [key, reverseKeys(entry)]),
    );
  }
  return value;
}

function evidenceFor(vitest: VitestReport): Evidence {
  const capabilities = buildCapabilityEvidence(
    manifest,
    indexScenarioResults(vitest, '/repo'),
    '0'.repeat(40),
  );
  return sealEvidence({
    schemaVersion: 1,
    generatedAt: '2026-08-07T00:00:00.000Z',
    source: { commit: '0'.repeat(40), clean: true },
    package: { name: 'bga-mcp', version: '0.0.0-test', lockDigest: `sha256:${'0'.repeat(64)}` },
    environment: {
      node: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      packageManager: 'pnpm@11.15.1',
      ci: true,
    },
    protocol: {
      supportedVersions: ['2025-11-25'],
      transports: ['stdio'],
      conformance: {
        status: 'passed',
        coverage: [{ version: '2025-11-25', status: 'passed', runs: 1 }],
        runs: [],
      },
    },
    ci: [CI_RUN],
    capabilities,
    claims: [],
    scenarios: summarizeScenarios(capabilities),
    tests: { files: 1, total: 1, passed: 1, failed: 0, skipped: 0 },
  });
}

describe('verification evidence', () => {
  it('[GATE-EVIDENCE-COVERAGE] records a scenario that did not run as missing rather than omitting it', () => {
    const evidence = evidenceFor(
      report(
        ['[E2E-STDIO-LEGACY-INITIALIZE] negotiates the legacy protocol version', 'passed'],
        ['[E2E-INSPECT-PROJECT-MODERN] describes a modern project', 'passed'],
      ),
    );

    const tool = evidence.capabilities.find((entry) => entry.name === 'inspect_project');
    // The manifest requires two scenarios; only one ran. The artifact must not
    // be able to look complete by leaving the other one out.
    expect(tool?.scenarios.map((scenario) => [scenario.id, scenario.status])).toEqual([
      ['E2E-INSPECT-PROJECT-MODERN', 'passed'],
      ['E2E-INSPECT-PROJECT-HYBRID', 'missing'],
    ]);
    expect(tool?.status).toBe('missing');
    expect(evidence.scenarios).toEqual({ required: 3, passed: 2, failed: 0, missing: 1 });

    const transport = evidence.capabilities.find((entry) => entry.name === 'stdio');
    expect(transport?.status).toBe('passed');
    expect(transport?.scenarios[0]?.tests[0]).toMatchObject({
      file: 'tests/e2e/inspect-project.test.ts',
      status: 'passed',
      durationMs: 3,
    });
  });

  it('[GATE-EVIDENCE-COVERAGE] separates a CI run it cannot place from one outside this history', () => {
    const results = indexScenarioResults(
      report(['[E2E-STDIO-LEGACY-INITIALIZE] negotiates the legacy protocol version', 'passed']),
      '/repo',
    );
    const other = '1'.repeat(40);

    // A checkout that holds the run's commit and does not have it in its
    // history: the run really does belong to another line of work.
    const foreign = buildCapabilityEvidence(manifest, results, other, {
      ancestors: new Map(),
      present: new Set([CI_RUN.commit]),
    });
    expect(foreign[0]?.ci.covers).toBe('stale');

    // A shallow checkout, which is what CI does by default. Nothing is known
    // about the run either way, and saying it is outside this history would be
    // the artifact stating something it cannot see.
    const shallow = buildCapabilityEvidence(manifest, results, other, {
      ancestors: new Map(),
      present: new Set(),
    });
    expect(shallow[0]?.ci.covers).toBe('unknown');

    // Neither may stand behind a verified capability; only the reason differs.
    const ancestor = buildCapabilityEvidence(manifest, results, other, {
      ancestors: new Map([[CI_RUN.commit, 2]]),
      present: new Set([CI_RUN.commit]),
    });
    expect(ancestor[0]?.ci).toMatchObject({ covers: 'ancestor', commitsBehind: 2 });
  });

  it('[GATE-EVIDENCE-COVERAGE] reports a failed test as a failed scenario and capability', () => {
    const evidence = evidenceFor(
      report(
        ['[E2E-STDIO-LEGACY-INITIALIZE] negotiates the legacy protocol version', 'passed'],
        ['[E2E-INSPECT-PROJECT-MODERN] describes a modern project', 'failed'],
        ['[E2E-INSPECT-PROJECT-HYBRID] reads a part-migrated project', 'passed'],
      ),
    );

    const tool = evidence.capabilities.find((entry) => entry.name === 'inspect_project');
    expect(tool?.status).toBe('failed');
    expect(tool?.scenarios[0]?.status).toBe('failed');
    expect(evidence.scenarios).toEqual({ required: 3, passed: 2, failed: 1, missing: 0 });
  });

  it('[GATE-EVIDENCE-TAMPER] detects any edit to a sealed document', () => {
    const evidence = evidenceFor(
      report(
        ['[E2E-STDIO-LEGACY-INITIALIZE] negotiates the legacy protocol version', 'passed'],
        ['[E2E-INSPECT-PROJECT-MODERN] describes a modern project', 'failed'],
        ['[E2E-INSPECT-PROJECT-HYBRID] reads a part-migrated project', 'passed'],
      ),
    );

    expect(evidence.integrity?.value).toBe(integrityDigest(evidence));

    // The edit a reader would most want to catch: a failed scenario relabelled
    // as passed after the run.
    const forged: Evidence = {
      ...evidence,
      capabilities: evidence.capabilities.map((capability) => ({
        ...capability,
        status: 'passed' as const,
        scenarios: capability.scenarios.map((scenario) => ({
          ...scenario,
          status: 'passed' as const,
        })),
      })),
    };
    expect(forged.capabilities[1]?.status).toBe('passed');
    expect(integrityDigest(forged)).not.toBe(evidence.integrity?.value);

    // The digest ignores key order, so the same content always seals the same
    // way however the document was assembled or reserialized.
    expect(integrityDigest(reverseKeys(evidence) as Evidence)).toBe(evidence.integrity?.value);
    expect(canonicalize({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('[GATE-EVIDENCE-COVERAGE] refuses to call conformance passed when a claimed version was not measured', () => {
    expect(conformanceStatus([{ status: 'passed' }, { status: 'passed' }])).toBe('passed');
    expect(conformanceStatus([{ status: 'passed' }, { status: 'not-run' }])).toBe('partial');
    // A stated reason does not upgrade the result. 2026-07-28 is the repository's
    // real case: the official server suite tests it over Streamable HTTP, which
    // this product does not ship, so it measures the harness rather than the
    // server. Recording why it was not measured is not the same as measuring it.
    expect(conformanceStatus([{ status: 'passed' }, { status: 'not-applicable' }])).toBe('partial');
    expect(conformanceStatus([{ status: 'passed' }, { status: 'failed' }])).toBe('failed');
    expect(conformanceStatus([{ status: 'not-run' }])).toBe('missing');
    expect(conformanceStatus([{ status: 'not-applicable' }])).toBe('missing');
    expect(conformanceStatus([])).toBe('missing');
  });

  it('[GATE-EVIDENCE-REDACTION] finds a credential carried into the artifact by a test title', () => {
    const evidence = evidenceFor(
      report([`[E2E-INSPECT-PROJECT-MODERN] leaks ${SEEDED_CREDENTIAL}`, 'passed']),
    );

    const findings = scanText(JSON.stringify(evidence, null, 2), 'verification-evidence.json');
    expect(findings.map((finding) => finding.rule)).toContain('aws-access-key');
    expect(findings[0]?.preview).not.toContain(SEEDED_CREDENTIAL);
  });
});

describe('retained test paths', () => {
  it('[GATE-EVIDENCE-COVERAGE] records a path relative to the repository, in the platform spelling', () => {
    // Regression: a string replace missed on Windows, where the reporter and
    // the script disagreed about the case of the drive letter, and every
    // retained path stayed absolute — which read as a test living outside the
    // tree it is plainly inside. `relative` is what settles it, and this runs
    // on each supported platform with that platform's separators and casing.
    const root = resolve('/repo/project');
    const index = indexScenarioResults(
      {
        testResults: [
          {
            name: join(root, 'tests', 'e2e', 'inspect-project.test.ts'),
            assertionResults: [
              {
                title: '[E2E-INSPECT-PROJECT-MODERN] describes a modern project',
                status: 'passed',
              },
            ],
          },
        ],
      },
      root,
    );

    expect(index.get('E2E-INSPECT-PROJECT-MODERN')?.[0]?.file).toBe(
      'tests/e2e/inspect-project.test.ts',
    );
  });
});
