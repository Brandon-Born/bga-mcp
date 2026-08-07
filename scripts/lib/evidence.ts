import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Builds the verification evidence document from what a gate run recorded.
 *
 * The builder is separate from the script that writes the file so the gate can
 * assemble a deliberately defective document and prove it is rejected. Nothing
 * here reads a value that a passing run does not already produce: the point of
 * the artifact is to say what was actually verified, so a field that has to be
 * asserted by hand does not belong in it.
 */

export type ResultStatus = 'passed' | 'failed' | 'missing';

export interface TestResult {
  readonly file: string;
  readonly title: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly durationMs?: number;
}

export interface ScenarioResult {
  readonly id: string;
  readonly status: ResultStatus;
  readonly tests: readonly TestResult[];
}

export interface CapabilityEvidence {
  readonly kind: 'transport' | 'tool' | 'resource' | 'prompt' | 'adapter';
  readonly name: string;
  readonly stability: 'experimental' | 'implemented' | 'verified';
  readonly status: ResultStatus;
  readonly scenarios: readonly ScenarioResult[];
}

export interface Evidence {
  readonly $schema?: string;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly source: { readonly commit: string; readonly clean: boolean };
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly lockDigest: string;
  };
  readonly environment: {
    readonly node: string;
    readonly platform: string;
    readonly arch: string;
    readonly packageManager: string;
    readonly ci: boolean;
    readonly runner?: string;
  };
  readonly protocol: {
    readonly supportedVersions: readonly string[];
    readonly transports: readonly string[];
    readonly conformance: {
      readonly status: ResultStatus | 'partial';
      readonly coverage: readonly {
        readonly version: string;
        readonly status: 'passed' | 'failed' | 'not-run' | 'not-applicable';
        readonly runs: number;
        readonly reason?: string;
        readonly baselinedScenarios?: number;
      }[];
      readonly runs: readonly {
        readonly candidate: string;
        readonly scenario: string;
        readonly status: 'passed' | 'failed';
      }[];
    };
  };
  readonly capabilities: readonly CapabilityEvidence[];
  readonly scenarios: {
    readonly required: number;
    readonly passed: number;
    readonly failed: number;
    readonly missing: number;
  };
  readonly tests: {
    readonly files: number;
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly integrity?: { readonly algorithm: 'sha256'; readonly value: string };
}

export interface Manifest {
  readonly transports: readonly {
    readonly name: string;
    readonly stability: 'experimental' | 'implemented' | 'verified';
    readonly protocolVersions: readonly string[];
    readonly requiredScenarios: readonly string[];
  }[];
  readonly capabilities: Record<
    'tools' | 'resources' | 'prompts',
    readonly {
      readonly name: string;
      readonly stability: 'experimental' | 'implemented' | 'verified';
      readonly requiredScenarios: readonly string[];
    }[]
  >;
  readonly adapters: readonly {
    readonly name: string;
    readonly stability: 'experimental' | 'implemented' | 'verified';
    readonly requiredScenarios: readonly string[];
  }[];
}

/** One executable test, as the Vitest JSON reporter records it. */
interface VitestAssertion {
  readonly title?: string;
  readonly fullName?: string;
  readonly status?: string;
  readonly duration?: number;
}

interface VitestFile {
  readonly name?: string;
  readonly assertionResults?: readonly VitestAssertion[];
}

export interface VitestReport {
  readonly numTotalTests?: number;
  readonly numPassedTests?: number;
  readonly numFailedTests?: number;
  readonly numPendingTests?: number;
  readonly testResults?: readonly VitestFile[];
}

const IDENTIFIER = /\[([A-Z0-9]+(?:-[A-Z0-9]+)+)\]/gu;

function normalizeStatus(status: string | undefined): 'passed' | 'failed' | 'skipped' {
  if (status === 'passed') {
    return 'passed';
  }
  return status === 'pending' || status === 'skipped' || status === 'todo' ? 'skipped' : 'failed';
}

/**
 * Indexes every test run by the scenario identifiers its title declares.
 *
 * A scenario with no test in the index did not run, which the evidence records
 * as `missing` rather than silently omitting it — an absent result is the case
 * this artifact exists to make visible.
 */
export function indexScenarioResults(
  report: VitestReport,
  repositoryRoot: string,
): Map<string, TestResult[]> {
  const index = new Map<string, TestResult[]>();
  for (const file of report.testResults ?? []) {
    const path = (file.name ?? '')
      .replace(repositoryRoot, '')
      .replace(/^[\\/]/u, '')
      .split('\\')
      .join('/');
    for (const assertion of file.assertionResults ?? []) {
      const title = assertion.fullName ?? assertion.title ?? '';
      const result: TestResult = {
        file: path,
        title,
        status: normalizeStatus(assertion.status),
        ...(typeof assertion.duration === 'number' && assertion.duration >= 0
          ? { durationMs: assertion.duration }
          : {}),
      };
      for (const match of title.matchAll(IDENTIFIER)) {
        const id = match[1];
        if (id === undefined) {
          continue;
        }
        index.set(id, [...(index.get(id) ?? []), result]);
      }
    }
  }
  return index;
}

function scenarioResult(id: string, index: Map<string, TestResult[]>): ScenarioResult {
  const tests = index.get(id) ?? [];
  if (tests.length === 0) {
    return { id, status: 'missing', tests: [] };
  }
  const status = tests.every((test) => test.status === 'passed') ? 'passed' : 'failed';
  return { id, status, tests };
}

/** Maps every manifest entry to the results of the scenarios it requires. */
export function buildCapabilityEvidence(
  manifest: Manifest,
  index: Map<string, TestResult[]>,
): CapabilityEvidence[] {
  const entries: {
    kind: CapabilityEvidence['kind'];
    name: string;
    stability: CapabilityEvidence['stability'];
    requiredScenarios: readonly string[];
  }[] = [
    ...manifest.transports.map((entry) => ({ kind: 'transport' as const, ...entry })),
    ...manifest.capabilities.tools.map((entry) => ({ kind: 'tool' as const, ...entry })),
    ...manifest.capabilities.resources.map((entry) => ({ kind: 'resource' as const, ...entry })),
    ...manifest.capabilities.prompts.map((entry) => ({ kind: 'prompt' as const, ...entry })),
    ...manifest.adapters.map((entry) => ({ kind: 'adapter' as const, ...entry })),
  ];

  return entries.map(({ kind, name, stability, requiredScenarios }) => {
    const scenarios = requiredScenarios.map((id) => scenarioResult(id, index));
    const status: ResultStatus = scenarios.some((scenario) => scenario.status === 'failed')
      ? 'failed'
      : scenarios.some((scenario) => scenario.status === 'missing')
        ? 'missing'
        : 'passed';
    return { kind, name, stability, status, scenarios };
  });
}

export function summarizeScenarios(
  capabilities: readonly CapabilityEvidence[],
): Evidence['scenarios'] {
  const seen = new Map<string, ResultStatus>();
  for (const capability of capabilities) {
    for (const scenario of capability.scenarios) {
      seen.set(scenario.id, scenario.status);
    }
  }
  const statuses = [...seen.values()];
  return {
    required: statuses.length,
    passed: statuses.filter((status) => status === 'passed').length,
    failed: statuses.filter((status) => status === 'failed').length,
    missing: statuses.filter((status) => status === 'missing').length,
  };
}

/**
 * Serializes the document with its keys in a fixed order.
 *
 * The digest is only meaningful if the same content always produces the same
 * bytes, so key order cannot depend on how the object happened to be built.
 */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`;
  }
  // `undefined` has no JSON form; a key holding it was already dropped above.
  return value === undefined ? 'null' : JSON.stringify(value);
}

/** The digest covers the document with `integrity` and `$schema` removed. */
export function integrityDigest(evidence: Evidence): string {
  const rest: Record<string, unknown> = { ...evidence };
  delete rest.integrity;
  delete rest.$schema;
  return createHash('sha256').update(canonicalize(rest)).digest('hex');
}

export function sealEvidence(evidence: Evidence): Evidence {
  return { ...evidence, integrity: { algorithm: 'sha256', value: integrityDigest(evidence) } };
}

/**
 * Reads the conformance runs the official CLI recorded, per claimed version.
 *
 * The candidate directory carries the protocol version it was run against, so
 * a claimed version with no directory is recorded as `not-run` rather than
 * being absorbed into an overall "passed". Without that, an artifact listing
 * two supported versions beside one run reads as if both were exercised.
 */
export async function readConformance(
  conformanceRoot: string,
  claimedVersions: readonly string[],
): Promise<Evidence['protocol']['conformance']> {
  const runs: { candidate: string; scenario: string; status: 'passed' | 'failed' }[] = [];
  let candidates: string[];
  try {
    candidates = (await readdir(conformanceRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('candidate-'))
      .map((entry) => entry.name);
  } catch {
    candidates = [];
  }

  for (const candidate of candidates.sort()) {
    const candidateRoot = resolve(conformanceRoot, candidate);
    for (const run of (await readdir(candidateRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      let checks: { id?: string; status?: string }[];
      try {
        checks = JSON.parse(await readFile(resolve(candidateRoot, run, 'checks.json'), 'utf8')) as {
          id?: string;
          status?: string;
        }[];
      } catch {
        continue;
      }
      for (const check of checks) {
        runs.push({
          candidate,
          scenario: check.id ?? 'unknown',
          status: check.status === 'SUCCESS' ? 'passed' : 'failed',
        });
      }
    }
  }

  const coverage = await Promise.all(
    claimedVersions.map(async (version) => {
      const forVersion = runs.filter((run) => run.candidate === `candidate-${version}`);
      if (forVersion.length === 0) {
        // A revision the suite cannot measure records why, so the gap reads as a
        // stated limitation rather than as an absence someone forgot to explain.
        const reason = await readNotApplicable(resolve(conformanceRoot, `candidate-${version}`));
        return reason === null
          ? { version, status: 'not-run' as const, runs: 0 }
          : { version, status: 'not-applicable' as const, runs: 0, reason };
      }
      // The recorded outcome wins over the raw checks, because only it knows
      // which failures the reviewed baseline expected. Without a record, the
      // checks are all there is and every one of them must have passed.
      const recorded = await readRunResult(resolve(conformanceRoot, `candidate-${version}`));
      const status =
        recorded?.status ??
        (forVersion.every((run) => run.status === 'passed')
          ? ('passed' as const)
          : ('failed' as const));
      return {
        version,
        status,
        runs: forVersion.length,
        ...(recorded?.baselinedScenarios === undefined
          ? {}
          : { baselinedScenarios: recorded.baselinedScenarios }),
      };
    }),
  );

  return { status: conformanceStatus(coverage), coverage, runs };
}

/**
 * A version nobody exercised keeps the whole result out of `passed`.
 *
 * `partial` is the honest word for what this repository currently has: the
 * pinned official CLI offers no scenarios for the newer claimed version, which
 * is why BGA-011 stays `implemented`. See docs/CONFORMANCE.md.
 */
export function conformanceStatus(
  coverage: readonly { readonly status: 'passed' | 'failed' | 'not-run' | 'not-applicable' }[],
): ResultStatus | 'partial' {
  if (coverage.length === 0 || coverage.every((entry) => entry.status !== 'passed')) {
    return coverage.some((entry) => entry.status === 'failed') ? 'failed' : 'missing';
  }
  if (coverage.some((entry) => entry.status === 'failed')) {
    return 'failed';
  }
  // `not-applicable` keeps the overall word off `passed` exactly as `not-run`
  // does. A revision the official suite cannot measure is still a revision it
  // did not measure, whatever the reason, and the artifact says which.
  return coverage.every((entry) => entry.status === 'passed') ? 'passed' : 'partial';
}

/** Reads the outcome the runner recorded from the official CLI's exit code. */
async function readRunResult(
  candidateRoot: string,
): Promise<{ status: 'passed' | 'failed'; baselinedScenarios?: number } | null> {
  try {
    const recorded = JSON.parse(await readFile(resolve(candidateRoot, 'result.json'), 'utf8')) as {
      status?: string;
      baselinedScenarios?: number;
    };
    if (recorded.status !== 'passed' && recorded.status !== 'failed') {
      return null;
    }
    return {
      status: recorded.status,
      ...(typeof recorded.baselinedScenarios === 'number'
        ? { baselinedScenarios: recorded.baselinedScenarios }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Reads the marker a runner writes for a revision the suite cannot measure. */
async function readNotApplicable(candidateRoot: string): Promise<string | null> {
  try {
    const marker = JSON.parse(
      await readFile(resolve(candidateRoot, 'not-applicable.json'), 'utf8'),
    ) as { reason?: string };
    return marker.reason ?? 'No reason recorded.';
  } catch {
    return null;
  }
}
