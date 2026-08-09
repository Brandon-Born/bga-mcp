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

export interface CiEvidence {
  /** The manifest's identifier for the run. */
  readonly id: string;
  readonly workflow: string;
  readonly url: string;
  readonly commit: string;
  readonly completedAt: string;
  readonly conclusion: 'success' | 'failure';
  readonly jobs: readonly string[];
}

export interface CapabilityEvidence {
  readonly kind: 'transport' | 'tool' | 'resource' | 'prompt' | 'adapter';
  readonly name: string;
  readonly stability: 'experimental' | 'implemented' | 'verified';
  readonly status: ResultStatus;
  /** Protocol versions the entry claims. An adapter claims none. */
  readonly protocolVersions: readonly string[];
  /**
   * The CI evidence the manifest points at, and whether it covers this commit.
   *
   * A run of an older commit is real evidence of that commit, and none of this
   * one, so it is recorded as `stale` rather than accepted or discarded.
   */
  readonly ci: {
    readonly id: string;
    readonly conclusion: string;
    readonly covers: 'this-commit' | 'stale' | 'unknown';
  };
  readonly scenarios: readonly ScenarioResult[];
}

/** A compatibility claim, catalogued rule, or threat-model mitigation. */
export interface ClaimEvidence {
  readonly kind: 'compatibility' | 'rule' | 'mitigation';
  readonly id: string;
  /** The word the source document uses for it: supported, verified, and so on. */
  readonly declared: string;
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
    /** Digest of the packed tarball the end-to-end suites installed. */
    readonly artifactDigest?: string;
    /** Every packaged suite and the artifact digest it actually installed. */
    readonly artifactRuns?: readonly { readonly suite: string; readonly digest: string }[];
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
  /** The CI runs the manifest entries point at. */
  readonly ci: readonly CiEvidence[];
  readonly capabilities: readonly CapabilityEvidence[];
  /** Retained results for every claim that names scenarios, not source text. */
  readonly claims: readonly ClaimEvidence[];
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

interface ManifestEntry {
  readonly name: string;
  readonly stability: 'experimental' | 'implemented' | 'verified';
  readonly protocolVersions?: readonly string[];
  readonly requiredScenarios: readonly string[];
  /** Identifier of the CI run in `ciRuns` that last passed for this entry. */
  readonly ciEvidence: string;
}

export interface Manifest {
  readonly ciRuns: readonly CiEvidence[];
  readonly transports: readonly ManifestEntry[];
  readonly capabilities: Record<'tools' | 'resources' | 'prompts', readonly ManifestEntry[]>;
  readonly adapters: readonly ManifestEntry[];
}

/** The other three sources of claims that name scenarios. */
export interface ClaimSources {
  readonly compatibility: { readonly claims: readonly ClaimSource[] };
  readonly rules: { readonly checks: readonly ClaimSource[] };
  readonly threatModel: { readonly mitigations: readonly ClaimSource[] };
}

export interface ClaimSource {
  readonly id: string;
  readonly support?: string;
  readonly status?: string;
  readonly automatable?: boolean;
  readonly scenarios?: readonly string[];
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

/** Identifiers a title declares, which must be at its very start. */
const DECLARED_IDENTIFIERS = /^((?:\[[A-Z0-9]+(?:-[A-Z0-9]+)+\])+)/u;
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
 * A declaration is a prefix, not a mention: the identifiers have to open the
 * test's own title, so a test that merely names a scenario in passing does not
 * become evidence for it. A scenario with no test in the index did not run,
 * which the evidence records as `missing` rather than silently omitting it —
 * an absent result is the case this artifact exists to make visible.
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
      // `fullName` is "suite > case", so the declaration sits at the start of
      // the last segment.
      const own = (assertion.title ?? title.split(' > ').at(-1) ?? '').trim();
      for (const match of (DECLARED_IDENTIFIERS.exec(own)?.[1] ?? '').matchAll(IDENTIFIER)) {
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

/**
 * The result of one scenario.
 *
 * A scenario whose tests were all skipped is `missing`, not `failed` and
 * certainly not `passed`: skipping is how a test stops being evidence, and the
 * artifact should read the same as if it had never been written.
 */
function scenarioResult(id: string, index: Map<string, TestResult[]>): ScenarioResult {
  const tests = index.get(id) ?? [];
  if (tests.length === 0 || tests.every((test) => test.status === 'skipped')) {
    return { id, status: 'missing', tests };
  }
  const status = tests.every((test) => test.status === 'passed') ? 'passed' : 'failed';
  return { id, status, tests };
}

function rollUp(scenarios: readonly ScenarioResult[]): ResultStatus {
  if (scenarios.some((scenario) => scenario.status === 'failed')) {
    return 'failed';
  }
  return scenarios.some((scenario) => scenario.status === 'missing') ? 'missing' : 'passed';
}

/** Every manifest entry, with the kind it was declared under. */
export function manifestEntries(
  manifest: Manifest,
): (ManifestEntry & { kind: CapabilityEvidence['kind'] })[] {
  return [
    ...manifest.transports.map((entry) => ({ kind: 'transport' as const, ...entry })),
    ...manifest.capabilities.tools.map((entry) => ({ kind: 'tool' as const, ...entry })),
    ...manifest.capabilities.resources.map((entry) => ({ kind: 'resource' as const, ...entry })),
    ...manifest.capabilities.prompts.map((entry) => ({ kind: 'prompt' as const, ...entry })),
    ...manifest.adapters.map((entry) => ({ kind: 'adapter' as const, ...entry })),
  ];
}

/**
 * Maps every manifest entry to the results of the scenarios it requires, the
 * protocol versions it claims, and the CI run it points at.
 *
 * The CI reference is resolved rather than copied: an entry naming a run that
 * the manifest does not record, or a run of a different commit, has to be
 * visible in the artifact for the gate to act on it.
 */
export function buildCapabilityEvidence(
  manifest: Manifest,
  index: Map<string, TestResult[]>,
  commit: string,
): CapabilityEvidence[] {
  const runs = new Map(manifest.ciRuns.map((run) => [run.id, run]));

  return manifestEntries(manifest).map((entry) => {
    const scenarios = entry.requiredScenarios.map((id) => scenarioResult(id, index));
    const run = runs.get(entry.ciEvidence);
    return {
      kind: entry.kind,
      name: entry.name,
      stability: entry.stability,
      status: rollUp(scenarios),
      protocolVersions: [...(entry.protocolVersions ?? [])],
      ci: {
        id: entry.ciEvidence,
        conclusion: run?.conclusion ?? 'unknown',
        covers:
          run === undefined
            ? 'unknown'
            : run.commit === commit
              ? 'this-commit'
              : ('stale' as const),
      },
      scenarios,
    };
  });
}

/**
 * Whether an entry claims its scenarios as evidence or merely reserves them.
 *
 * Planned work names the identifiers it intends to use. Those are reservations,
 * not claims, and the scenario gate already refuses to let a reservation be
 * required by anything.
 */
export function claimsEvidence(entry: ClaimSource): boolean {
  return entry.status !== 'planned' && (entry.scenarios ?? []).length > 0;
}

/**
 * Retains the result of every claim that names scenarios.
 *
 * Compatibility claims, catalogued rules, and threat-model mitigations all
 * point at scenario identifiers. Their gates check that the identifier exists;
 * only this records what the identified test actually did, so a claim can no
 * longer rest on a name that matched something in a source file.
 */
export function buildClaimEvidence(
  sources: ClaimSources,
  index: Map<string, TestResult[]>,
): ClaimEvidence[] {
  const claims: ClaimEvidence[] = [];
  const collect = (kind: ClaimEvidence['kind'], entries: readonly ClaimSource[]): void => {
    for (const entry of entries.filter(claimsEvidence)) {
      const ids = entry.scenarios ?? [];
      if (ids.length === 0) {
        continue;
      }
      const scenarios = ids.map((id) => scenarioResult(id, index));
      claims.push({
        kind,
        id: entry.id,
        declared:
          entry.support ?? entry.status ?? (entry.automatable === true ? 'automated' : 'declared'),
        status: rollUp(scenarios),
        scenarios,
      });
    }
  };

  collect('compatibility', sources.compatibility.claims);
  collect('rule', sources.rules.checks);
  collect('mitigation', sources.threatModel.mitigations);
  return claims;
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
