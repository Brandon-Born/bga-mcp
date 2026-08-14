import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import type { Evidence } from './lib/evidence.js';
import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';
import { collectDeclarations, type ScenarioDeclaration } from './lib/scenarios.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const testsRoot = resolve(repositoryRoot, 'tests');

interface AcceptanceCase {
  readonly item: string;
  readonly case: string;
  readonly boundary: 'packaged' | 'repository';
  readonly scenarios?: readonly string[];
  readonly missing?: string;
}

interface AcceptanceMap {
  readonly cases: readonly AcceptanceCase[];
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

/**
 * Checks that every acceptance case the map claims to have evidence for really
 * has it, in the place the case says.
 *
 * The point of the map is to stop a criterion from being satisfied by
 * something weaker than it asks for. So a `packaged` case has to be proven by
 * an assertion under `tests/e2e/`, running against the installed artifact, and
 * that assertion has to have passed in the run this evidence describes. A case
 * with nothing behind it is recorded as missing and counted; it is never
 * treated as covered.
 */
export function check(
  map: AcceptanceMap,
  declarations: readonly ScenarioDeclaration[],
  evidence: Evidence | null,
): GateReport {
  const report = new GateReport();
  const runnable = declarations.filter((declaration) => declaration.runnable);
  const results = new Map(
    [
      ...(evidence?.capabilities ?? []).flatMap((capability) => capability.scenarios),
      ...(evidence?.claims ?? []).flatMap((claim) => claim.scenarios),
    ].map((scenario) => [scenario.id, scenario]),
  );

  for (const entry of map.cases) {
    const label = `${entry.item}: ${entry.case}`;
    for (const scenario of entry.scenarios ?? []) {
      const declaring = runnable.filter((declaration) => declaration.id === scenario);
      report.require(
        declaring.length > 0,
        `${label} names ${scenario}, which no runnable test declares`,
      );
      if (entry.boundary === 'packaged') {
        report.require(
          declaring.some((declaration) => declaration.file.startsWith('e2e/')),
          `${label} names ${scenario}, which is not declared by a packaged test — a source-launched server does not prove a packaged case`,
        );
      }

      const result = results.get(scenario);
      report.require(
        result !== undefined,
        `${label} names ${scenario}, which the retained evidence does not record`,
      );
      report.require(
        result === undefined || result.status === 'passed',
        `${label} names ${scenario}, which the retained evidence records as ${result?.status ?? 'absent'}`,
      );
      report.require(
        result === undefined ||
          entry.boundary === 'repository' ||
          result.tests.every((test) => test.file.startsWith('tests/e2e/')),
        `${label} names ${scenario}, whose retained result came from outside tests/e2e`,
      );
    }
  }

  // The artifact those packaged assertions ran against has to be the packed
  // one, and the same one for every suite.
  const packaged = map.cases.some((entry) => entry.boundary === 'packaged' && entry.scenarios);
  if (packaged && evidence !== null) {
    report.require(
      evidence.package.artifactDigest !== undefined,
      'The map claims packaged evidence, but the run recorded no packed artifact',
    );
    for (const run of evidence.package.artifactRuns ?? []) {
      report.require(
        run.digest === evidence.package.artifactDigest,
        `The ${run.suite} suite ran against ${run.digest}, not the artifact this evidence describes`,
      );
    }
  }

  return report;
}

function seededEvidence(scenario: string, file: string): Evidence {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-09T00:00:00.000Z',
    source: { commit: '0'.repeat(40), clean: true },
    package: {
      name: 'bga-mcp',
      version: '0.0.0-seed',
      lockDigest: `sha256:${'0'.repeat(64)}`,
      artifactDigest: `sha256:${'1'.repeat(64)}`,
      artifactRuns: [{ suite: 'seed', digest: `sha256:${'1'.repeat(64)}` }],
    },
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
    ci: [],
    capabilities: [
      {
        kind: 'tool',
        name: 'seed',
        stability: 'implemented',
        status: 'passed',
        supportedLayouts: [],
        environments: ['local'],
        protocolVersions: ['2025-11-25'],
        ci: { id: 'ci-1', conclusion: 'success', covers: 'this-commit' },
        scenarios: [
          {
            id: scenario,
            status: 'passed',
            tests: [{ file, title: `[${scenario}] seeded`, status: 'passed' }],
          },
        ],
      },
    ],
    claims: [],
    scenarios: { required: 1, passed: 1, failed: 0, missing: 0 },
    tests: { files: 1, total: 1, passed: 1, failed: 0, skipped: 0 },
  };
}

function proveGateDetectsSeededDefects(): void {
  const sound: AcceptanceMap = {
    cases: [
      {
        item: 'BGA-000',
        case: 'a seeded acceptance case',
        boundary: 'packaged',
        scenarios: ['E2E-SEED'],
      },
    ],
  };
  const declared: ScenarioDeclaration[] = [
    { id: 'E2E-SEED', file: 'e2e/seed.test.ts', runnable: true },
  ];
  const evidence = seededEvidence('E2E-SEED', 'tests/e2e/seed.test.ts');

  if (check(sound, declared, evidence).failed) {
    throw new Error('The acceptance-map gate rejected a sound map');
  }

  expectSeededFailure('undeclared acceptance evidence', check(sound, [], evidence));
  expectSeededFailure(
    'skipped acceptance evidence',
    check(
      sound,
      [{ id: 'E2E-SEED', file: 'e2e/seed.test.ts', runnable: false, reason: 'inside it.skip' }],
      evidence,
    ),
  );
  expectSeededFailure(
    'source-launched acceptance evidence',
    check(
      sound,
      [{ id: 'E2E-SEED', file: 'integration/seed.test.ts', runnable: true }],
      seededEvidence('E2E-SEED', 'tests/integration/seed.test.ts'),
    ),
  );
  expectSeededFailure('unrecorded acceptance evidence', check(sound, declared, null));
  expectSeededFailure(
    'failed acceptance evidence',
    check(sound, declared, {
      ...evidence,
      capabilities: evidence.capabilities.map((capability) => ({
        ...capability,
        scenarios: capability.scenarios.map((scenario) => ({
          ...scenario,
          status: 'failed' as const,
        })),
      })),
    }),
  );
  expectSeededFailure(
    'acceptance evidence from another artifact',
    check(sound, declared, {
      ...evidence,
      package: {
        ...evidence.package,
        artifactRuns: [{ suite: 'seed', digest: `sha256:${'2'.repeat(64)}` }],
      },
    }),
  );
}

async function main(): Promise<void> {
  const schema = await loadJson<object>('config/acceptance-map.schema.json');
  const map = await loadJson<AcceptanceMap>('config/acceptance-map.json');

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(map)) {
    const report = new GateReport();
    report.require(false, `Invalid acceptance map: ${ajv.errorsText(validate.errors)}`);
    reportOrExit('Acceptance map', report, '');
    return;
  }

  proveGateDetectsSeededDefects();

  const declarations = await collectDeclarations(testsRoot);
  const evidence = await loadJson<Evidence>('.artifacts/verification-evidence.json').catch(
    () => null,
  );
  const report = check(map, declarations, evidence);

  const covered = map.cases.filter((entry) => entry.scenarios !== undefined).length;
  const missing = map.cases.length - covered;
  const items = new Set(map.cases.map((entry) => entry.item)).size;
  reportOrExit(
    'Acceptance map',
    report,
    `Acceptance map is consistent and its gate detects seeded defects: ${String(covered)} of ${String(map.cases.length)} acceptance cases across ${String(items)} backlog items are proven by a passing assertion at the boundary they name, and ${String(missing)} are recorded as not yet proven.`,
  );
}

await main();
