import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  object,
  readPublicationConfig,
  readPublicationPlan,
  sha256,
  verifyPreparedFiles,
  PUBLICATION_REPOSITORY,
} from './lib/publication.js';
import {
  publicFiles,
  publicAssetUrl,
  verifyGitHubConsumerReceipt,
  verifyGitHubPublicBytes,
  type GitHubRelease,
} from './lib/github-publication.js';
import { verifySignedCandidate } from './release-signing.js';
import { SecurityReviewSchema } from './lib/security-review.js';
import { scanText } from './lib/secret-scan.js';
const execute = promisify(execFile),
  root = resolve(import.meta.dirname, '..');
export async function prepareGitHubConsumerEnvironment(
  directory: string,
): Promise<NodeJS.ProcessEnv> {
  const metadata = object(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')));
  assert(
    typeof metadata.packageManager === 'string' &&
      /^pnpm@\d+\.\d+\.\d+$/u.test(metadata.packageManager),
  );
  // Corepack selects the current workspace's packageManager before pnpm reads --dir.
  // https://github.com/nodejs/corepack#when-authoring-packages
  // Supply the guide's pinned tooling prerequisite inside the fresh consumer workspace.
  await writeFile(
    resolve(directory, 'package.json'),
    JSON.stringify({ private: true, packageManager: metadata.packageManager }),
    { flag: 'wx' },
  );
  return {
    PATH: process.env.PATH,
    HOME: directory,
    USERPROFILE: directory,
    SYSTEMROOT: process.env.SYSTEMROOT,
    NPM_CONFIG_USERCONFIG: resolve(directory, 'absent-user-config'),
    NPM_CONFIG_GLOBALCONFIG: resolve(directory, 'absent-global-config'),
    NPM_CONFIG_CACHE: resolve(directory, 'cache'),
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
  };
}
async function credentialFree(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(
      !['.npmrc', '.netrc', '.env', 'credentials.json'].includes(entry.name),
      'Consumer credential artifact found',
    );
    if (entry.isDirectory()) await credentialFree(resolve(directory, entry.name));
  }
}
async function main(): Promise<void> {
  const [directory, expectedDigest, output] = process.argv.slice(2);
  assert(directory && expectedDigest && output);
  assert(
    !process.env.GH_TOKEN &&
      !process.env.GITHUB_TOKEN &&
      !process.env.NODE_AUTH_TOKEN &&
      !process.env.NPM_TOKEN,
  );
  const bytes = await readFile(resolve(directory, 'plan.json'));
  assert.equal(sha256(bytes), expectedDigest);
  const plan = readPublicationPlan(JSON.parse(bytes.toString('utf8')));
  assert('channel' in plan.decision);
  const config = readPublicationConfig(
    JSON.parse(await readFile(resolve(root, 'config/publication.json'), 'utf8')),
  );
  assert.deepEqual(plan.decision, config.decision);
  const evidence: unknown = JSON.parse(
    await readFile(resolve(root, config.prerequisites.evidence), 'utf8'),
  );
  const admitted = new Map<string, Buffer>();
  for (const file of plan.files)
    admitted.set(file.name, await readFile(resolve(directory, file.name)));
  verifyPreparedFiles(plan, admitted);
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga415-github-consumer-'));
  const env = await prepareGitHubConsumerEnvironment(scratch);
  const command = async (name: string, args: string[]) =>
    (await execute(name, args, { cwd: scratch, env, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }))
      .stdout;
  const download = async (url: string, file: string) => {
    await command('curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--proto',
      '=https',
      '--proto-redir',
      '=https',
      '--max-time',
      '60',
      '--max-filesize',
      '16777216',
      '--output',
      file,
      url,
    ]);
    return readFile(file);
  };
  try {
    const release: GitHubRelease = JSON.parse(
      (
        await download(
          `https://api.github.com/repos/${PUBLICATION_REPOSITORY}/releases/tags/${plan.candidate.tag}`,
          resolve(scratch, 'public-release.json'),
        )
      ).toString('utf8'),
    ) as GitHubRelease;
    const downloaded = new Map<string, Buffer>();
    const signed = resolve(scratch, 'signed-packet');
    await mkdir(signed);
    for (const file of publicFiles(plan)) {
      const path =
        file.name === 'GITHUB_DOWNLOADS.md'
          ? resolve(scratch, file.name)
          : resolve(signed, file.name);
      downloaded.set(
        file.name,
        await download(publicAssetUrl(plan.candidate.tag, file.name), path),
      );
    }
    verifyGitHubPublicBytes(release, evidence, plan, downloaded);
    // Verify downloaded subjects, not copies from the authenticated Actions handoff.
    const roots = resolve(scratch, 'independent-roots.jsonl');
    await writeFile(roots, await command('gh', ['attestation', 'trusted-root']));
    const approvalBytes = admitted.get('approval.json');
    assert(approvalBytes);
    const approval = SecurityReviewSchema.parse(JSON.parse(approvalBytes.toString('utf8')));
    await verifySignedCandidate(signed, approval.signature.signerCommit, roots);
    const guideOutput = resolve(scratch, 'guide-result.json');
    await command(process.execPath, [
      '--import',
      import.meta.resolve('tsx'),
      resolve(root, 'scripts/test-publication-guide.ts'),
      resolve(signed, `bga-mcp-${plan.candidate.version}.tgz`),
      root,
      guideOutput,
    ]);
    const use = object(JSON.parse(await readFile(guideOutput, 'utf8')));
    assert.equal(use.artifactDigest, plan.candidate.artifactDigest);
    assert.equal(use.discovery, 'matched installed inventory');
    assert.equal(use.firstUse, 'passed');
    assert.equal(use.removal, 'passed');
    assert.equal(use.projectUnchanged, true);
    assert.equal(use.serverExited, true);
    assert.equal(use.unconfiguredRoot, 'refused');
    await credentialFree(scratch);
    const receipt = {
      schemaVersion: 1,
      owner: 'BGA-415',
      channel: 'github-downloads',
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      candidate: plan.candidate,
      publisherCommit: plan.publisherCommit,
      workflowRun: plan.workflowRun,
      planDigest: expectedDigest,
      approvalDigest: plan.approvalDigest,
      auditDigest: plan.auditDigest,
      downloadUrl: publicAssetUrl(plan.candidate.tag, `bga-mcp-${plan.candidate.version}.tgz`),
      publicBytesMatched: true,
      signatureVerified: true,
      provenanceVerified: true,
      inventoryMatched: true,
      firstUsePassed: true,
      rootRefusalPassed: true,
      projectUnchanged: true,
      serverExited: true,
      removed: true,
      credentialFree: true,
      scope:
        'Token-free public GitHub bytes; original certified signer/source and retention provenance, installed guide lifecycle. Prerelease only; no npm publisher or Studio claim.',
    };
    verifyGitHubConsumerReceipt(receipt, plan, expectedDigest);
    const result = `${JSON.stringify(receipt, null, 2)}\n`;
    assert.equal(scanText(result, 'github-consumer').length, 0);
    await writeFile(resolve(output), result, { flag: 'wx' });
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `consumer-digest=${sha256(result)}\n`);
    process.stdout.write(
      'Independent public GitHub consumer verified original signed bytes, discovery, first use, refusal and removal.\n',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    await main();
  } catch {
    process.stderr.write(
      'Public GitHub consumer failed; stop endorsement and preserve exact release assets for investigation.\n',
    );
    process.exitCode = 1;
  }
}
