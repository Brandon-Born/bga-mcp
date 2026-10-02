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
  frameworkHolds,
  frameworkSources,
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
const implementationPaths = [
  'src',
  'scripts',
  'tests',
  'config',
  'package.json',
  'pnpm-lock.yaml',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.build.json',
  'eslint.config.js',
  '.github/workflows/ci.yml',
];
const digest = (text: string | Buffer): string =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`;
const load = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const git = async (...args: string[]): Promise<string> =>
  (await execute('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();

/** Digest current implementations, tests, fixtures and their manifests, excluding the review ledger itself. */
export async function implementationDigest(): Promise<string> {
  const files = (await git('ls-files', '-z', ...implementationPaths))
    .split('\0')
    .filter((file) => file !== '' && file !== 'config/framework-review.json')
    .sort();
  const hash = createHash('sha256');
  for (const file of files)
    hash
      .update(file)
      .update('\0')
      .update(await readFile(resolve(root, file)))
      .update('\0');
  return `sha256:${hash.digest('hex')}`;
}
export async function frameworkReleaseGuard(): Promise<void> {
  const ledger = await load<FrameworkLedger>('config/framework-review.json');
  const sources = frameworkSources(
    await load<CompatibilityMatrix>('config/compatibility.json'),
    await load('config/rule-catalog.json'),
  );
  const policy = verifyFrameworkPolicy(ledger, sources);
  if (policy.failed) throw new Error(`Framework policy invalid: ${policy.failures.join('; ')}`);
  const holds = frameworkHolds(sources, ledger, await implementationDigest(), Date.now());
  if (holds.length > 0)
    throw new Error(
      `Framework release hold: ${JSON.stringify(holds)}. Observe and review each affected page, update original fixtures and retain passing exact-source tests before new guidance or packages.`,
    );
}
export async function runFrameworkChange(args: readonly string[]): Promise<void> {
  const [mode, url, evidencePath, reviewer, ciRun] = args;
  if (mode === 'release') {
    await frameworkReleaseGuard();
    return;
  }
  let ledger = await load<FrameworkLedger>('config/framework-review.json');
  const matrix = await load<CompatibilityMatrix>('config/compatibility.json');
  const sources = frameworkSources(matrix, await load('config/rule-catalog.json'));
  const policy = verifyFrameworkPolicy(ledger, sources);
  if (policy.failed) throw new Error(policy.failures.join('; '));
  if (mode === 'status') {
    process.stdout.write(
      `${JSON.stringify({ sources, holds: frameworkHolds(sources, ledger, await implementationDigest(), Date.now()) }, null, 2)}\n`,
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
  } else if (mode === 'review') {
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
    const paths = [...implementationPaths, ':!config/framework-review.json'];
    if (
      (await git('diff', evidence.source.commit, '--', ...paths)) !== '' ||
      (await git('ls-files', '--others', '--exclude-standard', '--', ...implementationPaths)) !== ''
    )
      throw new Error('Implementation or fixtures differ from the passing evidence source.');
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
      implementationDigest: await implementationDigest(),
      evidenceDigest: digest(evidenceText),
      evidenceCommit: evidence.source.commit,
      ciRun: `https://github.com/Brandon-Born/bga-mcp/actions/runs/${ciRun}`,
      reviewer,
      reviewedAt: new Date().toISOString(),
      fixturePaths,
      scenarios: source.scenarios,
    };
    ledger = {
      ...ledger,
      observations: ledger.observations.map((entry) =>
        entry.url === url ? { ...entry, review, needsReview: false } : entry,
      ),
    };
  } else
    throw new Error('Use status, observe URL, review URL EVIDENCE REVIEWER CI_RUN, or release.');
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(
    'Recorded process metadata only. Check framework:status for remaining release holds.\n',
  );
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename))
  await runFrameworkChange(process.argv.slice(2));
