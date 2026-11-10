import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { htmlToText } from '../src/docs/excerpt.js';
import { createPolicyBoundary, PolicyBoundary } from '../src/policy.js';
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
  migrateFrameworkSources,
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
const sourceArchivePath = resolve(root, 'docs/verification/framework-review-v2.json');
const digest = (text: string | Buffer): string =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`;
const load = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const git = async (...args: string[]): Promise<string> =>
  (await execute('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();

export async function frameworkReleaseGuard(): Promise<void> {
  const { ledger, holds } = await frameworkState();
  if (ledger.schemaVersion !== 3)
    throw new Error('Framework release hold: run the explicit framework source migration.');
  if (holds.length > 0)
    throw new Error(
      `Framework release hold: ${JSON.stringify(holds)}. Observe and review each affected page, update original fixtures and retain passing exact-source tests before new guidance or packages.`,
    );
}
export async function verifyFrameworkArchive(ledger: FrameworkLedger): Promise<void> {
  if (
    ledger.schemaVersion === 3 &&
    digest(await readFile(sourceArchivePath)) !== ledger.migrationArchiveDigest
  )
    throw new Error('Framework source archive does not match the migration binding.');
}

async function saveLedger(
  original: Buffer,
  ledger: FrameworkLedger,
  archivePath?: string,
): Promise<void> {
  const artifacts = resolve(root, '.artifacts');
  await mkdir(artifacts, { recursive: true });
  const lockPath = resolve(artifacts, 'framework-review.lock');
  const lock = await open(lockPath, 'wx');
  let temporary: string | undefined;
  try {
    if (!(await readFile(ledgerPath)).equals(original))
      throw new Error(
        'Framework ledger changed during the operation. Read current status and retry.',
      );
    temporary = await mkdtemp(resolve(artifacts, 'framework-review-'));
    if (archivePath !== undefined) {
      const originalFile = resolve(temporary, 'original.json');
      await writeFile(originalFile, original);
      try {
        // Link the completed file exclusively. A stopped migration can reuse
        // its identical archive, while a different archive is left intact.
        await link(originalFile, archivePath);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
          !(await readFile(archivePath)).equals(original)
        )
          throw error;
      }
    }
    const updated = resolve(temporary, 'updated.json');
    await writeFile(updated, `${JSON.stringify(ledger, null, 2)}\n`);
    await rename(updated, ledgerPath);
  } finally {
    await lock.close();
    await rm(lockPath);
    if (temporary !== undefined) await rm(temporary, { recursive: true, force: true });
  }
}

async function requireHostedEvidence(
  ciRun: string,
  complete: Evidence,
  supplied: Buffer,
): Promise<void> {
  const platform = new Map([
    ['linux', 'ubuntu'],
    ['darwin', 'macos'],
    ['win32', 'windows'],
  ]).get(complete.environment.platform);
  const node = /^v(22|24)\.\d+\.\d+$/u.exec(complete.environment.node)?.[1];
  if (platform === undefined || node === undefined)
    throw new Error('Framework evidence must name a supported CI matrix job.');
  const directory = await mkdtemp(resolve(tmpdir(), 'bga-framework-evidence-'));
  try {
    await execute(
      'gh',
      [
        'run',
        'download',
        ciRun,
        '--repo',
        'Brandon-Born/bga-mcp',
        '--name',
        `verification-${platform}-latest-node-${node}`,
        '--dir',
        directory,
      ],
      { timeout: 60_000 },
    );
    if (
      !(await readFile(resolve(directory, '.artifacts/verification-evidence.json'))).equals(
        supplied,
      )
    )
      throw new Error('Different artifact bytes');
  } catch {
    throw new Error(
      'Framework evidence does not match the retained artifact from the named CI job.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function frameworkConfiguration() {
  const ledgerBytes = await readFile(ledgerPath);
  const ledger = JSON.parse(ledgerBytes.toString('utf8')) as FrameworkLedger;
  const matrix = await load<CompatibilityMatrix>('config/compatibility.json');
  const catalog = await load<Parameters<typeof frameworkSources>[1]>('config/rule-catalog.json');
  const sources = frameworkSources(matrix, catalog, ledger.schemaVersion === 3);
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
  await verifyFrameworkArchive(ledger);
  return { ledger, ledgerBytes, matrix, catalog, sources, map };
}
export async function frameworkState() {
  const { ledger, ledgerBytes, matrix, sources, map } = await frameworkConfiguration();
  const identities = await currentFrameworkDependencies(root, sources, matrix, map);
  return {
    ledger,
    ledgerBytes,
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
  if (mode === 'migrate-sources') {
    const { ledger, ledgerBytes, matrix, catalog } = await frameworkConfiguration();
    const migrated = migrateFrameworkSources(ledger, digest(ledgerBytes));
    const report = verifyFrameworkPolicy(migrated, frameworkSources(matrix, catalog));
    if (report.failed) throw new Error(report.failures.join('; '));
    await saveLedger(ledgerBytes, migrated, sourceArchivePath);
    process.stdout.write(
      'Archived the version-2 ledger. Record current observations and reviews.\n',
    );
    return;
  }
  if (mode === 'observe' || mode === 'review' || mode === 'retest') {
    // Invalid commands cannot observe or admit anything. Validate the same
    // policy and mandatory inputs before walking every repository dependency;
    // valid operations still obtain a fresh full state below.
    const configuration = await frameworkConfiguration();
    if (!configuration.sources.some((source) => source.url === url))
      throw new Error(
        'Choose one exact mapped official URL from framework:status; arbitrary URLs and bulk requests are refused.',
      );
    if (mode !== 'observe' && configuration.ledger.schemaVersion !== 3)
      throw new Error('Run the explicit framework source migration before recording a review.');
    const observation = configuration.ledger.observations.find((entry) => entry.url === url);
    if (
      mode !== 'observe' &&
      (observation?.digest === undefined ||
        observation.digest === null ||
        evidencePath === undefined ||
        reviewer === undefined ||
        reviewer.trim() === '')
    )
      throw new Error(
        'Review requires an observed page, evidence path and named reviewer who read the official wording.',
      );
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
    ledger = migrateFrameworkLedger(ledger);
    await saveLedger(
      state.ledgerBytes,
      ledger,
      resolve(root, 'docs/verification/framework-review-v1.json'),
    );
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
      const body =
        source.replaces === undefined
          ? await observeWikiPage(source.url)
          : await PolicyBoundary.fetchMaintainerFrameworkPage(source.url);
      const text = htmlToText(body);
      if (text.trim() === '') throw new Error('Empty documentation observation');
      pageDigest = digest(text);
    } catch {
      process.stderr.write('Requested documentation unavailable; release hold retained.\n');
      process.exitCode = 1;
    }
    ledger = observeFrameworkPage(ledger, source.url, pageDigest, now);
  } else if (mode === 'review' || mode === 'retest') {
    if (source.interpretationHold !== undefined) throw new Error(source.interpretationHold);
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
    if (ledger.schemaVersion !== 3 || identity === undefined || identity.issues.length > 0)
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
    const evidenceBytes = await readFile(resolve(evidencePath));
    const parsed: unknown = JSON.parse(evidenceBytes.toString('utf8'));
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
          'headSha,conclusion,status,workflowName,startedAt',
        ])
      ).stdout,
    ) as Parameters<typeof verifyFrameworkCi>[0];
    const ciReport = verifyFrameworkCi(run, evidence.source.commit, observation.observedAt);
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
    await requireHostedEvidence(ciRun, complete, evidenceBytes);
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
      evidenceDigest: digest(evidenceBytes),
      evidenceCommit: evidence.source.commit,
      ciRun: `https://github.com/Brandon-Born/bga-mcp/actions/runs/${ciRun}`,
      reviewer,
      reviewedAt: new Date().toISOString(),
      fixturePaths,
      scenarios: source.scenarios,
      dependencies: identity,
      proof: {
        dependencyDigest: identity.proofDigest,
        evidenceDigest: digest(evidenceBytes),
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
      'Use status, migrate, migrate-sources, observe URL, review/retest URL EVIDENCE REVIEWER CI_RUN, or release.',
    );
  await saveLedger(state.ledgerBytes, ledger);
  process.stdout.write(
    'Recorded process metadata only. Check framework:status for remaining release holds.\n',
  );
}
async function observeWikiPage(url: string): Promise<string> {
  const boundary = await createPolicyBoundary({ networkEnabled: true });
  const page = await boundary.runWithTimeout('framework wiki observation', (signal) =>
    boundary.fetchDocumentation(
      { sourceId: 'bga-studio-framework-reference', path: new URL(url).pathname.slice(1) },
      { signal },
    ),
  );
  if (page.url !== url || page.status !== 200)
    throw new Error('Wiki observation requires the selected page.');
  return page.body;
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename))
  await runFrameworkChange(process.argv.slice(2));
