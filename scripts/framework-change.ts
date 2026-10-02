import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { htmlToText } from '../src/docs/excerpt.js';
import { createPolicyBoundary } from '../src/policy.js';
import type { CompatibilityMatrix } from './lib/compatibility.js';
import { integrityDigest, type Evidence } from './lib/evidence.js';
import {
  currentFrameworkDependencies,
  FRAMEWORK_INPUTS,
  refreshFrameworkProof,
  scopedFrameworkHolds,
  verifyDependencyMap,
  type DependencyMap,
} from './lib/framework-dependencies.js';
import {
  frameworkSources,
  migrateFrameworkLedger,
  observeFrameworkPage,
  verifyFrameworkPolicy,
  verifyFrameworkRetest,
  verifyFrameworkCi,
  type FrameworkLedger,
  type FrameworkTestEvidence,
} from './lib/framework-change.js';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const ledgerPath = resolve(root, 'config/framework-review.json');
const digest = (text: string | Buffer): string =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`;
const load = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const git = async (...args: string[]): Promise<string> =>
  (await execute('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();

export async function frameworkReleaseGuard(): Promise<void> {
  const { holds } = await frameworkState();
  if (holds.length > 0)
    throw new Error(
      `Framework release hold: ${JSON.stringify(holds)}. Observe and review each affected page, update original fixtures and retain passing exact-source tests before new guidance or packages.`,
    );
}
export async function frameworkState() {
  const ledger = await load<FrameworkLedger>('config/framework-review.json');
  const matrix = await load<CompatibilityMatrix>('config/compatibility.json');
  const sources = frameworkSources(matrix, await load('config/rule-catalog.json'));
  const map = await load<DependencyMap>('config/framework-dependencies.json');
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const [file, value] of [
    ['framework-review', ledger],
    ['framework-dependencies', map],
  ] as const) {
    const validate = ajv.compile(await load<object>(`config/${file}.schema.json`));
    if (!validate(value))
      throw new Error(
        `Framework policy invalid: ${file} schema: ${JSON.stringify(validate.errors)}`,
      );
  }
  const failures = [
    ...verifyFrameworkPolicy(ledger, sources).failures,
    ...verifyDependencyMap(map, sources).failures,
  ];
  if (failures.length > 0) throw new Error(`Framework policy invalid: ${failures.join('; ')}`);
  const identities = await currentFrameworkDependencies(root, sources, matrix, map);
  return {
    ledger,
    matrix,
    sources,
    identities,
    holds: scopedFrameworkHolds(sources, ledger, identities, Date.now()),
  };
}
export async function runFrameworkChange(args: readonly string[]): Promise<void> {
  const [mode, url, evidencePath, reviewer, ciRun] = args;
  if (mode === 'release') {
    await frameworkReleaseGuard();
    return;
  }
  const state = await frameworkState();
  let ledger = state.ledger;
  const { matrix, sources, identities } = state;
  if (mode === 'status') {
    process.stdout.write(
      `${JSON.stringify(
        {
          sources,
          holds: state.holds,
          provenance: sources.map((source) => {
            const review = ledger.observations.find((entry) => entry.url === source.url)?.review;
            return {
              url: source.url,
              currentSemanticDigest: identities.get(source.url)?.semanticDigest,
              currentProofDigest: identities.get(source.url)?.proofDigest,
              reviewedSemanticDigest: review?.dependencies?.semanticDigest ?? null,
              interpretationEvidenceCommit: review?.evidenceCommit ?? null,
              proofEvidenceCommit: review?.proof?.evidenceCommit ?? null,
              carryForward:
                !state.holds.some((hold) => hold.url === source.url) &&
                review?.dependencies?.semanticDigest === identities.get(source.url)?.semanticDigest,
              exactHeadEvidenceClaimed: false,
            };
          }),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (mode === 'migrate') {
    if (ledger.schemaVersion !== 1)
      throw new Error('Only an unmigrated version-1 ledger can migrate.');
    // Preserve historical broad reviews; they cannot certify a dependency map added later.
    await writeFile(
      resolve(root, 'docs/verification/framework-review-v1.json'),
      `${JSON.stringify(ledger, null, 2)}\n`,
      { flag: 'wx' },
    );
    ledger = migrateFrameworkLedger(ledger);
    await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    process.stdout.write(
      'Migrated explicitly; historical reviews archived and new scoped reviews required.\n',
    );
    return;
  }
  const source = sources.find((entry) => entry.url === url);
  if (source === undefined)
    throw new Error(
      'Choose one exact mapped official URL from framework:status; arbitrary URLs and bulk requests are refused.',
    );
  if (mode === 'observe') {
    const now = new Date().toISOString();
    let pageDigest: string | null = null;
    try {
      // One explicit page request; full text exists in memory only. No crawler or corpus.
      const boundary = await createPolicyBoundary({ networkEnabled: true });
      const page = await boundary.fetchDocumentation({
        sourceId: 'bga-studio-framework-reference',
        path: new URL(source.url).pathname.slice(1),
      });
      pageDigest = digest(htmlToText(page.body));
    } catch {
      process.stderr.write('Requested documentation unavailable; release hold retained.\n');
      process.exitCode = 1;
    }
    ledger = observeFrameworkPage(ledger, source.url, pageDigest, now);
  } else if (mode === 'review' || mode === 'retest') {
    const observation = ledger.observations.find((entry) => entry.url === source.url);
    if (
      observation?.digest === undefined ||
      observation.digest === null ||
      evidencePath === undefined ||
      reviewer?.trim() === '' ||
      reviewer === undefined
    )
      throw new Error(
        'Review requires an observed page, evidence path and named reviewer who read the official wording.',
      );
    const identity = identities.get(source.url);
    if (ledger.schemaVersion !== 2 || identity === undefined || identity.issues.length > 0)
      throw new Error(
        `Review needs explicit migration and resolved dependency mapping: ${JSON.stringify(identity?.issues ?? [])}`,
      );
    const prior = observation.review;
    if (
      mode === 'retest' &&
      (prior?.dependencies === undefined ||
        observation.needsReview ||
        prior.digest !== observation.digest ||
        prior.dependencies.semanticDigest !== identity.semanticDigest ||
        state.holds.some(
          (hold) =>
            hold.url === source.url &&
            hold.reasons.some(
              (reason) =>
                reason !==
                'Proving dependencies changed: current exact-source test evidence required',
            ),
        ))
    )
      throw new Error('Retest cannot replace a missing or changed interpretation review.');
    const evidenceText = await readFile(resolve(evidencePath), 'utf8');
    const parsed: unknown = JSON.parse(evidenceText);
    const validator = new Ajv2020({ allErrors: true, strict: false }).compile(
      await load<object>('config/evidence.schema.json'),
    );
    if (!validator(parsed))
      throw new Error('Retest evidence does not match the trusted evidence schema.');
    const complete = parsed as Evidence;
    if (
      complete.integrity?.value !== integrityDigest(complete) ||
      complete.protocol.conformance.status !== 'passed' ||
      !complete.environment.ci
    )
      throw new Error('Retest requires intact exact-source CI evidence and passing conformance.');
    const evidence: FrameworkTestEvidence = complete;
    const report = verifyFrameworkRetest(source, evidence, observation.observedAt);
    if (report.failed) throw new Error(report.failures.join('; '));
    if (ciRun === undefined || !/^[0-9]+$/u.test(ciRun))
      throw new Error('Review needs the exact successful CI run ID.');
    // Read only the named run in this repository; no reports or broad inbox.
    const run = JSON.parse(
      (
        await execute('gh', [
          'run',
          'view',
          ciRun,
          '--repo',
          'Brandon-Born/bga-mcp',
          '--json',
          'headSha,conclusion,status,workflowName',
        ])
      ).stdout,
    ) as Parameters<typeof verifyFrameworkCi>[0];
    const ciReport = verifyFrameworkCi(run, evidence.source.commit);
    if (ciReport.failed) throw new Error(ciReport.failures.join('; '));
    await git('merge-base', '--is-ancestor', evidence.source.commit, 'HEAD');
    const changed = (
      await git('diff', '--name-only', '-z', evidence.source.commit, '--', ...FRAMEWORK_INPUTS)
    )
      .split('\0')
      .filter(Boolean);
    const affected = new Set([...identity.semantic, ...identity.proof].map((entry) => entry.path));
    if (changed.some((path) => affected.has(path)))
      throw new Error(
        'Interpretation or proof dependencies differ from the passing evidence source.',
      );
    const fixturePaths = [
      ...new Set(
        matrix.claims
          .filter((claim) => source.claims.includes(claim.id))
          .flatMap((claim) => claim.fixtures ?? []),
      ),
    ].sort();
    if (fixturePaths.length === 0) throw new Error('Review has no original fixture coverage.');
    const review = {
      digest: observation.digest,
      implementationDigest: identity.semanticDigest,
      evidenceDigest: digest(evidenceText),
      evidenceCommit: evidence.source.commit,
      ciRun: `https://github.com/Brandon-Born/bga-mcp/actions/runs/${ciRun}`,
      reviewer,
      reviewedAt: new Date().toISOString(),
      fixturePaths,
      scenarios: source.scenarios,
      dependencies: identity,
      proof: {
        dependencyDigest: identity.proofDigest,
        evidenceDigest: digest(evidenceText),
        evidenceCommit: evidence.source.commit,
        ciRun: `https://github.com/Brandon-Born/bga-mcp/actions/runs/${ciRun}`,
        recordedAt: new Date().toISOString(),
      },
    };
    const admitted =
      mode === 'retest' && prior !== null
        ? refreshFrameworkProof(prior, identity, review.proof)
        : review;
    ledger = {
      ...ledger,
      observations: ledger.observations.map((entry) =>
        entry.url === url ? { ...entry, review: admitted, needsReview: false } : entry,
      ),
    };
  } else
    throw new Error(
      'Use status, migrate, observe URL, review/retest URL EVIDENCE REVIEWER CI_RUN, or release.',
    );
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(
    'Recorded process metadata only. Check framework:status for remaining release holds.\n',
  );
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename))
  await runFrameworkChange(process.argv.slice(2));
