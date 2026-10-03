import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  GITHUB_PUBLICATION_WORKFLOW,
  PUBLICATION_REPOSITORY,
  object,
  readPublicationConfig,
  readPublicationPlan,
  sha256,
  verifyPreparedFiles,
  type PublicationPlan,
} from './lib/publication.ts';
import {
  publicAssetUrl,
  reconcileGitHubRelease,
  verifyGitHubAdmissionReview,
  verifyGitHubConsumerReceipt,
  type GitHubRelease,
} from './lib/github-publication.ts';

// Builtins only. No repository dependencies, package execution, OIDC or npm token in this writer.
const execute = promisify(execFile),
  root = resolve(import.meta.dirname, '..');
export async function validateGitHubPrepared(directory: string, expectedDigest: string) {
  assert(/^sha256:[0-9a-f]{64}$/u.test(expectedDigest));
  const bytes = await readFile(resolve(directory, 'plan.json'));
  assert.equal(sha256(bytes), expectedDigest, 'Cross-job plan was substituted');
  const plan = readPublicationPlan(JSON.parse(bytes.toString('utf8')));
  const config = readPublicationConfig(
    JSON.parse(await readFile(resolve(root, 'config/publication.json'), 'utf8')),
  );
  assert(config.decision && 'channel' in config.decision);
  assert.deepEqual(plan.decision, config.decision);
  const approvalBytes = await readFile(resolve(root, config.reviewReceipt));
  const review = object(JSON.parse(approvalBytes.toString('utf8')));
  verifyGitHubAdmissionReview(review, approvalBytes, plan);
  const candidate = object(review.candidate);
  for (const key of ['sourceCommit', 'artifactDigest', 'tag'])
    assert.equal(plan.candidate[key as keyof typeof plan.candidate], candidate[key]);
  assert.deepEqual(
    (await readdir(directory)).sort(),
    [...plan.files.map((file) => file.name), 'plan.json'].sort(),
  );
  const files = new Map<string, Buffer>();
  for (const file of plan.files) {
    const path = resolve(directory, file.name),
      info = await lstat(path);
    assert(info.isFile() && !info.isSymbolicLink() && info.size <= 16 * 1024 * 1024);
    files.set(file.name, await readFile(path));
  }
  verifyPreparedFiles(plan, files);
  assert.deepEqual(
    files.get('GITHUB_DOWNLOADS.md'),
    await readFile(resolve(root, 'docs/verification/GITHUB_DOWNLOADS.md')),
  );
  const evidence: unknown = JSON.parse(
    await readFile(resolve(root, config.prerequisites.evidence), 'utf8'),
  );
  return { plan, evidence };
}
async function remote(plan: PublicationPlan): Promise<GitHubRelease> {
  const { stdout } = await execute(
    'gh',
    ['api', `repos/${PUBLICATION_REPOSITORY}/releases`, '--paginate', '--slurp'],
    { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const matches = (JSON.parse(stdout) as GitHubRelease[][])
    .flat()
    .filter((release) => release.tag_name === plan.candidate.tag);
  assert.equal(matches.length, 1, 'Missing or ambiguous existing release; never create duplicates');
  const release = matches[0];
  assert(release);
  return release;
}
async function main(): Promise<void> {
  const [mode, directory, expectedDigest, consumerDigest] = process.argv.slice(2);
  assert((mode === 'publish' || mode === 'retain') && directory && expectedDigest);
  assert.equal(process.env.GITHUB_REPOSITORY, PUBLICATION_REPOSITORY);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.equal(
    process.env.GITHUB_WORKFLOW_REF,
    `${PUBLICATION_REPOSITORY}/${GITHUB_PUBLICATION_WORKFLOW}@refs/heads/main`,
  );
  assert.equal(process.env.BGA_MCP_PUBLICATION_MODE, 'publish');
  assert(process.env.GH_TOKEN);
  assert(
    !process.env.NODE_AUTH_TOKEN &&
      !process.env.NPM_TOKEN &&
      !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  );
  const { plan, evidence } = await validateGitHubPrepared(resolve(directory), expectedDigest);
  assert.equal(plan.publisherCommit, process.env.GITHUB_SHA);
  assert.equal(plan.workflowRun, process.env.GITHUB_RUN_ID);
  const { stdout } = await execute('gh', [
    'api',
    `repos/${PUBLICATION_REPOSITORY}/commits/${plan.candidate.tag}`,
  ]);
  assert.equal(object(JSON.parse(stdout)).sha, plan.candidate.sourceCommit);
  const release = await remote(plan),
    missing = reconcileGitHubRelease(release, evidence, plan);
  if (mode === 'publish') {
    for (const name of missing) {
      // No --clobber, deletion, draft creation, release editing or source reconstruction.
      await execute(
        'gh',
        [
          'release',
          'upload',
          plan.candidate.tag,
          resolve(directory, name),
          '--repo',
          PUBLICATION_REPOSITORY,
        ],
        { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
      );
    }
    assert.deepEqual(reconcileGitHubRelease(await remote(plan), evidence, plan), []);
    process.stdout.write(
      'Original package attached without overwriting evidence; public consumer verification remains required.\n',
    );
  } else {
    assert.deepEqual(missing, []);
    const receiptPath = process.env.BGA_MCP_CONSUMER_RECEIPT;
    assert(receiptPath && consumerDigest);
    const bytes = await readFile(receiptPath);
    assert.equal(sha256(bytes), consumerDigest, 'Consumer receipt was substituted');
    verifyGitHubConsumerReceipt(JSON.parse(bytes.toString('utf8')), plan, expectedDigest);
    const name = `github-consumer-${plan.workflowRun}.json`,
      existing = release.assets.find((asset) => asset.name === name);
    if (existing)
      assert.equal(existing.digest, consumerDigest, 'Existing receipt conflicts; never overwrite');
    else {
      // The verifier writes precisely this allowlisted filename; do not upload an arbitrary basename.
      assert.equal(resolve(receiptPath), resolve(receiptPath, '..', name));
      await execute(
        'gh',
        ['release', 'upload', plan.candidate.tag, receiptPath, '--repo', PUBLICATION_REPOSITORY],
        { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
      );
    }
    const updated = await remote(plan);
    reconcileGitHubRelease(updated, evidence, plan);
    const observed = updated.assets.find((asset) => asset.name === name);
    assert(
      observed?.digest === consumerDigest &&
        observed.browser_download_url === publicAssetUrl(plan.candidate.tag, name),
    );
    process.stdout.write(
      'Successful independent consumer receipt retained for the public release lifetime; prerelease status preserved.\n',
    );
  }
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    await main();
  } catch {
    process.stderr.write(
      'GitHub publication failed; preserve original assets, stop endorsement, inspect the exact release and follow recovery.\n',
    );
    process.exitCode = 1;
  }
}
