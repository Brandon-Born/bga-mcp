import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

import { runSecurityAudit } from './audit-security.js';
import { frameworkReleaseGuard } from './framework-change.js';
import { readSigningCandidate, verifySignedCandidate } from './release-signing.js';
import { scanText } from './lib/secret-scan.js';
import {
  SecurityReviewPlanSchema,
  SecurityReviewSchema,
  reviewIntegrity,
  verifyReviewApproval,
  verifyReviewRecord,
  type SecurityReview,
} from './lib/security-review.js';

const root = resolve(import.meta.dirname, '..');
const execute = promisify(execFile);
const hash = (bytes: string | Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const load = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const command = async (
  name: string,
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeout?: number;
  } = {},
): Promise<string> =>
  (
    await execute(name, args, {
      cwd: options.cwd ?? root,
      timeout: options.timeout ?? 120_000,
      maxBuffer: 32 * 1024 * 1024,
      ...(options.env === undefined ? {} : { env: options.env }),
    })
  ).stdout;

async function packageTextFiles(artifact: string): Promise<Map<string, string>> {
  const entries = (await command('tar', ['-tf', artifact]))
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'));
  if (entries.length === 0 || entries.length > 1000 || new Set(entries).size !== entries.length)
    throw new Error('Candidate package entry inventory is invalid');
  const files = new Map<string, string>();
  let total = 0;
  for (const entry of entries) {
    if (
      !/^package\/[a-zA-Z0-9_./-]+$/u.test(entry) ||
      entry.split('/').some((part) => part === '.' || part === '..')
    )
      throw new Error('Candidate archive has an unsafe path');
    const text = await command('tar', ['-xOf', artifact, entry]);
    total += Buffer.byteLength(text);
    if (
      text.includes('\0') ||
      Buffer.byteLength(text) > 2 * 1024 * 1024 ||
      total > 16 * 1024 * 1024
    )
      throw new Error('Candidate package contains unsupported binary or oversized data');
    if (scanText(text, entry).length > 0)
      throw new Error('Candidate package failed secret scanning');
    files.set(entry.slice('package/'.length), text);
  }
  return files;
}

async function main(): Promise<void> {
  const source = process.env.BGA_MCP_SECURITY_SOURCE;
  const packet = process.env.BGA_MCP_SIGNED_CANDIDATE;
  const output = process.env.BGA_MCP_SECURITY_REVIEW_OUTPUT;
  if (source === undefined || packet === undefined || output === undefined)
    throw new Error(
      'Set exact candidate source, signed packet and new review output paths; no implicit candidate or publication.',
    );
  const sourceRoot = resolve(source),
    packetRoot = resolve(packet),
    outputRoot = resolve(output);
  const outputRelative = relative(packetRoot, outputRoot);
  if (outputRelative === '' || (outputRelative !== '..' && !outputRelative.startsWith(`..${sep}`)))
    throw new Error('Review output cannot alter the immutable packet');
  const plan = SecurityReviewPlanSchema.parse(await load('config/security-review.json'));
  const receipt = await load<unknown>(plan.candidateReceipt);
  const signing = await load<{ signer: { commit: string } }>(plan.signingReceipt);
  const candidate = await readSigningCandidate(packetRoot, receipt);
  const artifact = resolve(packetRoot, candidate.identity.artifactName);
  if (
    (await command('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot })).trim() !==
      candidate.identity.sourceCommit ||
    (await command('git', ['status', '--porcelain'], { cwd: sourceRoot })).trim() !== ''
  )
    throw new Error('Dependency assessment needs a clean exact candidate source checkout');
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga405-review-'));
  try {
    // Official GitHub CLI supports local bundles and independent trusted roots.
    const roots = await command('gh', ['attestation', 'trusted-root']);
    const rootFile = resolve(scratch, 'trusted-root.jsonl');
    await writeFile(rootFile, roots);
    await verifySignedCandidate(packetRoot, signing.signer.commit, rootFile);
    const fresh = await runSecurityAudit(sourceRoot);
    const originalAudit = await load<{ source: unknown }>(
      resolve(packetRoot, 'security-audit.json'),
    );
    if (JSON.stringify(fresh.audit.source) !== JSON.stringify(originalAudit.source))
      throw new Error(
        'Fresh dependency assessment differs from signed candidate source/configuration',
      );
    const files = await packageTextFiles(artifact);
    const metadata = JSON.parse(files.get('package.json') ?? 'null') as {
      bin?: { ['bga-mcp']?: string };
    } | null;
    if (metadata?.bin?.['bga-mcp'] !== 'dist/release-cli.js')
      throw new Error('Candidate public command selects a different profile');

    const rawResults = resolve(scratch, 'vitest-results.json');
    const pattern = `\\[(${plan.requiredScenarios.join('|')})\\]`;
    const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
    try {
      await command(
        corepack,
        [
          'pnpm',
          'exec',
          'vitest',
          'run',
          ...plan.suites,
          '--testNamePattern',
          pattern,
          '--reporter=json',
          `--outputFile=${rawResults}`,
        ],
        {
          timeout: 1_800_000,
          env: {
            ...process.env,
            BGA_MCP_SECURITY_REVIEW_ARTIFACT: artifact,
            BGA_MCP_SECURITY_REVIEW_DIGEST: candidate.identity.artifactDigest,
          },
        },
      );
    } catch {
      // No raw canary-bearing stdout/stderr enters public review evidence.
      throw new Error('Original candidate security scenarios failed; review is held.');
    }
    const results = JSON.parse(await readFile(rawResults, 'utf8')) as {
      numPassedTests: number;
      numFailedTests: number;
      testResults: { assertionResults: { status: string; fullName: string }[] }[];
    };
    if (results.numFailedTests !== 0 || results.numPassedTests === 0)
      throw new Error('Candidate security scenarios did not pass');
    const passedScenarios = [
      ...new Set(
        results.testResults.flatMap((suite) =>
          suite.assertionResults
            .filter((test) => test.status === 'passed')
            .flatMap((test) =>
              [...test.fullName.matchAll(/\[([A-Z][A-Z0-9-]+)\]/gu)].map((match) => match[1] ?? ''),
            ),
        ),
      ),
    ].sort();
    for (const id of plan.requiredScenarios)
      if (!passedScenarios.includes(id))
        throw new Error(`Required security scenario was not run: ${id}`);
    const records = resolve(root, '.artifacts/security-review-runs');
    for (const name of await readdir(records)) {
      const entry = await load<{ digest: string }>(resolve(records, name));
      if (entry.digest !== candidate.identity.artifactDigest)
        throw new Error('A security suite installed a different tarball');
    }
    const summary = `${JSON.stringify({ artifactDigest: candidate.identity.artifactDigest, testsPassed: results.numPassedTests, testsFailed: 0, passedScenarios }, null, 2)}\n`;
    const currentGuides = [
      'README.md',
      'AGENTS.md',
      'CONTRIBUTING.md',
      'SECURITY.md',
      'docs/INSTALL.md',
      'docs/VERSIONING.md',
    ];
    const staleGuides: string[] = [];
    for (const guide of currentGuides)
      if (files.get(guide) !== (await readFile(resolve(root, guide), 'utf8')))
        staleGuides.push(guide);
    let frameworkReviewCurrent = true;
    try {
      await frameworkReleaseGuard();
    } catch {
      frameworkReviewCurrent = false;
    }
    const channel = await load<{ lifecycle: unknown }>(
      'docs/verification/private-reporting-channel.json',
    );
    const reporting = await load<{ status: string }>('config/security-reporting.json');
    const threat = await load<{
      residualRisks: { id: string; acceptedBy: string; description: string }[];
    }>('config/threat-model.json');
    const risks: SecurityReview['risks'] = threat.residualRisks.map((risk) => ({
      id: risk.id,
      owner: risk.acceptedBy,
      disposition:
        risk.id.startsWith('RR-DOC-') || risk.id.startsWith('RR-STUDIO-') ? 'excluded' : 'accepted',
      evidence: `${risk.description} Existing canonical threat-model disposition; acceptance is not extended to a new capability.`,
    }));
    const releaseGates = {
      candidateDocumentationCurrent: staleGuides.length === 0,
      privateReportLifecycleVerified: reporting.status === 'verified' && channel.lifecycle !== null,
      frameworkReviewCurrent,
    };
    for (const [gate, passed] of Object.entries(releaseGates))
      if (!passed)
        risks.push({
          id: `BLOCK-${gate}`,
          owner: 'Brandon-Born',
          disposition: 'held',
          evidence:
            gate === 'candidateDocumentationCurrent'
              ? `New candidate required for current shipped guides: ${staleGuides.join(', ')}. BGA-411/BGA-406 own the changes; original signed bytes are preserved.`
              : gate === 'privateReportLifecycleVerified'
                ? 'BGA-406 non-maintainer benign-report lifecycle is not observed.'
                : 'BGA-408 fresh official-page review is pending; new publication remains held.',
        });
    const harness = createHash('sha256');
    for (const path of [
      'scripts/review-security.ts',
      'scripts/lib/security-review.ts',
      'tests/global-setup.ts',
      'tests/helpers/packaged.ts',
      'scripts/audit-security.ts',
      'scripts/lib/security-audit.ts',
      'scripts/release-signing.ts',
      'config/security-review.json',
      'config/threat-model.json',
      'vitest.config.ts',
      ...plan.suites,
    ])
      harness.update(path).update(await readFile(resolve(root, path)));
    const base: Omit<SecurityReview, 'integrity'> = {
      schemaVersion: 1,
      owner: 'BGA-405',
      reviewedAt: new Date().toISOString(),
      status: 'held',
      candidate: {
        tag: candidate.identity.sourceTag,
        sourceCommit: candidate.identity.sourceCommit,
        artifactDigest: candidate.identity.artifactDigest,
      },
      reviewer: {
        sourceCommit: (await command('git', ['rev-parse', 'HEAD'])).trim(),
        sourceClean: (await command('git', ['status', '--porcelain'])).trim() === '',
        harnessDigest: `sha256:${harness.digest('hex')}`,
      },
      signature: {
        verified: true,
        signerCommit: signing.signer.commit,
        trustedRootDigest: hash(roots),
      },
      dependencyAudit: fresh.audit,
      dependencyPolicy: fresh.policy,
      tests: {
        artifactDigest: candidate.identity.artifactDigest,
        resultDigest: hash(summary),
        testsPassed: results.numPassedTests,
        testsFailed: 0,
        requiredScenarios: plan.requiredScenarios,
        passedScenarios,
      },
      packageScan: {
        artifactDigest: candidate.identity.artifactDigest,
        files: files.size,
        findings: 0,
      },
      studio: 'excluded; no live claim',
      adapters: [],
      risks,
      releaseGates,
    };
    let review = SecurityReviewSchema.parse({ ...base, integrity: reviewIntegrity(base) });
    const structural = verifyReviewRecord(review, plan);
    if (structural.failed) throw new Error(structural.failures.join('; '));
    const approval = verifyReviewApproval(review, plan);
    if (process.argv.includes('--approve')) {
      if (approval.failed)
        throw new Error(`Security approval held: ${approval.failures.join('; ')}`);
      const approved = { ...review, status: 'approved' as const };
      review = { ...approved, integrity: reviewIntegrity(approved) };
    }
    const text = `${JSON.stringify(review, null, 2)}\n`;
    if (scanText(text, 'security-review.json').length > 0)
      throw new Error('Sanitized review metadata failed artifact safety');
    await mkdir(dirname(outputRoot), { recursive: true });
    await mkdir(outputRoot); // Preserve earlier assessments and original packets.
    await writeFile(resolve(outputRoot, 'assessment.json'), text);
    await writeFile(resolve(outputRoot, 'test-summary.json'), summary);
    await writeFile(resolve(outputRoot, 'fresh-security-audit.json'), fresh.text);
    process.stdout.write(
      `Exact signed-candidate security assessment retained: ${String(results.numPassedTests)} tests, ${String(plan.requiredScenarios.length)} required security scenarios, ${String(files.size)} scanned text files. Approval ${approval.failed ? 'held' : 'eligible for explicit approval'}; no package rebuilt or published.\n`,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
await main();
