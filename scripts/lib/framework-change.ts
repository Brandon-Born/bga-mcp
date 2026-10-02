import type { CompatibilityMatrix } from './compatibility.js';
import { GateReport } from './gate.js';

export interface FrameworkSource {
  readonly url: string;
  readonly claims: readonly string[];
  readonly scenarios: readonly string[];
}
export interface FrameworkReview {
  readonly digest: string;
  readonly implementationDigest: string;
  readonly evidenceDigest: string;
  readonly evidenceCommit: string;
  readonly ciRun: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly fixturePaths: readonly string[];
  readonly scenarios: readonly string[];
}
export interface FrameworkObservation {
  readonly url: string;
  readonly observedAt: string;
  readonly digest: string | null;
  readonly review: FrameworkReview | null;
  readonly needsReview: boolean;
}
export interface FrameworkLedger {
  readonly schemaVersion: number;
  readonly owner: string;
  readonly monitoringDays: number;
  readonly emergencyResponseHours: number;
  readonly observations: readonly FrameworkObservation[];
}
interface RuleSources {
  readonly checks: readonly {
    readonly tool?: string;
    readonly sources?: readonly { readonly kind: string; readonly url: string }[];
  }[];
}

const origin = 'https://en.doc.boardgamearena.com/';
export const FOUNDATIONAL_SOURCES = [
  `${origin}Studio_file_reference`,
  `${origin}BGA_Studio_Migration_Guide`,
  `${origin}Studio`,
] as const;

/** Review impact is a conservative process mapping, never a new BGA rule. */
export function frameworkSources(
  matrix: CompatibilityMatrix,
  catalog: RuleSources,
): readonly FrameworkSource[] {
  const claims = matrix.claims.filter(
    (claim) =>
      claim.support === 'supported' &&
      ['layout', 'file-generation', 'environment'].includes(claim.dimension),
  );
  const urls = new Set<string>(FOUNDATIONAL_SOURCES);
  for (const check of catalog.checks)
    for (const source of check.sources ?? [])
      if (source.kind === 'official-documentation') urls.add(source.url);
  return [...urls].sort().map((url) => {
    const tools = catalog.checks
      .filter((check) => check.sources?.some((source) => source.url === url))
      .map((check) => `tool:${check.tool ?? ''}`);
    const direct = claims.filter((claim) =>
      claim.capabilities?.some((capability) => tools.includes(capability.reference)),
    );
    const affected = FOUNDATIONAL_SOURCES.includes(url as (typeof FOUNDATIONAL_SOURCES)[number])
      ? claims
      : direct.length > 0
        ? direct
        : claims; // An unmapped official source holds all BGA claims, never none.
    return {
      url,
      claims: affected.map((claim) => claim.id).sort(),
      scenarios: [...new Set(affected.flatMap((claim) => claim.scenarios ?? []))].sort(),
    };
  });
}

export interface FrameworkHold {
  readonly url: string;
  readonly state: 'stale' | 'unreviewed' | 'unreachable' | 'expired';
  readonly claims: readonly string[];
  readonly scenarios: readonly string[];
}
const sha256 = /^sha256:[0-9a-f]{64}$/u;
export function frameworkHolds(
  sources: readonly FrameworkSource[],
  ledger: FrameworkLedger,
  implementationDigest: string,
  now: number,
): readonly FrameworkHold[] {
  return sources.flatMap((source): FrameworkHold[] => {
    const observation = ledger.observations.find((entry) => entry.url === source.url);
    let state: FrameworkHold['state'] | null = null;
    if (observation === undefined) state = 'unreviewed';
    else if (observation.digest === null) state = 'unreachable';
    else if (
      !Number.isFinite(Date.parse(observation.observedAt)) ||
      now < Date.parse(observation.observedAt) ||
      now - Date.parse(observation.observedAt) > ledger.monitoringDays * 86_400_000
    )
      state = 'expired';
    else if (observation.review === null) state = 'unreviewed';
    else {
      const review = observation.review;
      if (
        observation.needsReview ||
        review.digest !== observation.digest ||
        review.implementationDigest !== implementationDigest ||
        !sha256.test(review.digest) ||
        !sha256.test(review.evidenceDigest) ||
        !sha256.test(review.implementationDigest) ||
        !/^[0-9a-f]{40}$/u.test(review.evidenceCommit) ||
        !/^https:\/\/github\.com\/Brandon-Born\/bga-mcp\/actions\/runs\/[0-9]+$/u.test(
          review.ciRun,
        ) ||
        review.reviewer.trim() === '' ||
        !Number.isFinite(Date.parse(review.reviewedAt)) ||
        Date.parse(review.reviewedAt) > now ||
        review.fixturePaths.length === 0 ||
        review.fixturePaths.some((path) => !path.startsWith('tests/fixtures/projects/')) ||
        source.scenarios.some((scenario) => !review.scenarios.includes(scenario))
      )
        state = 'stale';
    }
    return state === null
      ? []
      : [{ url: source.url, state, claims: source.claims, scenarios: source.scenarios }];
  });
}

export function observeFrameworkPage(
  ledger: FrameworkLedger,
  url: string,
  digest: string | null,
  observedAt: string,
): FrameworkLedger {
  const previous = ledger.observations.find((entry) => entry.url === url);
  return {
    ...ledger,
    observations: [
      ...ledger.observations.filter((entry) => entry.url !== url),
      {
        url,
        digest,
        observedAt,
        review: previous?.review ?? null,
        needsReview:
          previous === undefined ||
          previous.needsReview ||
          digest === null ||
          digest !== previous.digest,
      },
    ].sort((left, right) => left.url.localeCompare(right.url)),
  };
}

export interface FrameworkTestEvidence {
  readonly source: { readonly commit: string; readonly clean: boolean };
  readonly generatedAt: string;
  readonly scenarios: { readonly failed: number; readonly missing: number };
  readonly tests: { readonly failed: number; readonly passed: number };
  readonly claims: readonly {
    readonly scenarios: readonly { readonly id: string; readonly status: string }[];
  }[];
}
export function verifyFrameworkRetest(
  source: FrameworkSource,
  evidence: FrameworkTestEvidence,
  observedAt: string,
): GateReport {
  const report = new GateReport();
  report.require(
    evidence.source.clean && /^[0-9a-f]{40}$/u.test(evidence.source.commit),
    'Retest needs clean exact-source evidence',
  );
  report.require(
    evidence.scenarios.failed === 0 &&
      evidence.scenarios.missing === 0 &&
      evidence.tests.failed === 0 &&
      evidence.tests.passed > 0,
    'Retest evidence must pass its full gate',
  );
  report.require(
    Number.isFinite(Date.parse(evidence.generatedAt)) &&
      Date.parse(evidence.generatedAt) >= Date.parse(observedAt),
    'Retest must follow observation',
  );
  const results = evidence.claims.flatMap((claim) => claim.scenarios);
  for (const scenario of source.scenarios) {
    const matches = results.filter((result) => result.id === scenario);
    report.require(
      matches.length > 0 && matches.every((result) => result.status === 'passed'),
      `Missing or failing targeted scenario ${scenario}`,
    );
  }
  return report;
}
export function verifyFrameworkPolicy(
  ledger: FrameworkLedger,
  sources: readonly FrameworkSource[],
): GateReport {
  const report = new GateReport();
  report.require(
    ledger.schemaVersion === 1 && ledger.owner === 'Brandon-Born',
    'Framework process has no accountable owner',
  );
  report.require(
    Number.isInteger(ledger.monitoringDays) &&
      ledger.monitoringDays > 0 &&
      ledger.monitoringDays <= 7,
    'Monitoring cadence must be at most weekly',
  );
  report.require(
    ledger.emergencyResponseHours > 0 && ledger.emergencyResponseHours <= 24,
    'Emergency triage target must be within 24 hours',
  );
  report.require(
    new Set(ledger.observations.map((entry) => entry.url)).size === ledger.observations.length,
    'Duplicate observations',
  );
  for (const entry of ledger.observations) {
    report.require(
      sources.some((source) => source.url === entry.url),
      `Unmapped observed source ${entry.url}`,
    );
    report.require(entry.digest === null || sha256.test(entry.digest), 'Invalid page digest');
    report.require(Number.isFinite(Date.parse(entry.observedAt)), 'Invalid observation time');
    report.require(typeof entry.needsReview === 'boolean', 'Missing explicit review state');
  }
  for (const source of sources) {
    report.require(
      source.claims.length > 0 && source.scenarios.length > 0,
      `Unmapped impact or tests for ${source.url}`,
    );
    report.require(source.url.startsWith(origin), 'Framework process source is not official');
  }
  return report;
}

export function verifyFrameworkCi(
  run: {
    readonly headSha: string;
    readonly conclusion: string;
    readonly status: string;
    readonly workflowName: string;
  },
  evidenceCommit: string,
): GateReport {
  const report = new GateReport();
  report.require(
    run.headSha === evidenceCommit &&
      run.conclusion === 'success' &&
      run.status === 'completed' &&
      run.workflowName === 'CI',
    'Framework retest requires successful completed exact-source CI, not a partial or different workflow',
  );
  return report;
}
