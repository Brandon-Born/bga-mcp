import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  NPM_CLI,
  PUBLICATION_REPOSITORY,
  PUBLICATION_REGISTRY,
  PUBLICATION_WORKFLOW,
  readPublicationConfig,
  readPublicationPlan,
  sha256,
  verifyPreparedFiles,
  verifyConsumerReceipt,
} from './lib/publication.ts';
// npm accepts a prebuilt tarball. No pack, build, dependency installation or lifecycle script runs here.
const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
async function main(): Promise<void> {
  const [mode, directory, expectedDigest, consumerDigest] = process.argv.slice(2);
  assert((mode === 'publish' || mode === 'promote') && directory && expectedDigest);
  assert.equal(process.env.GITHUB_REPOSITORY, PUBLICATION_REPOSITORY);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.equal(
    process.env.GITHUB_WORKFLOW_REF,
    `${PUBLICATION_REPOSITORY}/${PUBLICATION_WORKFLOW}@refs/heads/main`,
  );
  assert.equal(process.env.BGA_MCP_PUBLICATION_MODE, 'publish');
  assert(process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
  assert(!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN, 'Token fallback is forbidden');
  const config = readPublicationConfig(
    JSON.parse(await readFile(resolve(root, 'config/publication.json'), 'utf8')),
  );
  assert(config.decision);
  assert('registry' in config.decision, 'npm publication is not the selected channel');
  const packet = resolve(directory),
    planBytes = await readFile(resolve(packet, 'plan.json'));
  assert.equal(sha256(planBytes), expectedDigest, 'Cross-job plan differs from admitted output');
  const plan = readPublicationPlan(JSON.parse(planBytes.toString('utf8')));
  assert.deepEqual(plan.decision, config.decision);
  assert.equal(plan.publisherCommit, process.env.GITHUB_SHA);
  assert.equal(plan.workflowRun, process.env.GITHUB_RUN_ID);
  assert.deepEqual(
    (await readdir(packet)).sort(),
    [...plan.files.map((file) => file.name), 'plan.json'].sort(),
  );
  const files = new Map<string, Buffer>();
  for (const file of plan.files) {
    const path = resolve(packet, file.name),
      stat = await lstat(path);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16 * 1024 * 1024);
    files.set(file.name, await readFile(path));
  }
  verifyPreparedFiles(plan, files);
  assert.equal((await execute('npm', ['--version'])).stdout.trim(), NPM_CLI);
  const common = [
    '--registry',
    PUBLICATION_REGISTRY,
    '--userconfig',
    resolve(packet, 'absent-user-config'),
    '--globalconfig',
    resolve(packet, 'absent-global-config'),
    '--ignore-scripts',
  ];
  const env = { ...process.env, NPM_CONFIG_PROVENANCE: 'true' };
  if (mode === 'publish') {
    // Version collisions, including retries after ambiguous success, fail. Never overwrite or unpublish.
    await execute(
      'npm',
      [
        'publish',
        resolve(packet, `bga-mcp-${plan.candidate.version}.tgz`),
        '--access',
        'public',
        '--tag',
        'candidate',
        '--provenance',
        ...common,
      ],
      { cwd: packet, env, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );
    process.stdout.write(
      'Exact admitted tarball published under candidate tag; promotion awaits independent consumer verification.\n',
    );
  } else {
    assert(consumerDigest && process.env.BGA_MCP_CONSUMER_RECEIPT);
    const bytes = await readFile(process.env.BGA_MCP_CONSUMER_RECEIPT);
    assert.equal(
      sha256(bytes),
      consumerDigest,
      'Consumer receipt differs from successful verifier output',
    );
    verifyConsumerReceipt(JSON.parse(bytes.toString('utf8')) as unknown, plan, expectedDigest);
    const target = plan.candidate.version.includes('-') ? 'next' : 'latest';
    await execute(
      'npm',
      ['dist-tag', 'add', `bga-mcp@${plan.candidate.version}`, target, ...common],
      { cwd: packet, env, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );
    process.stdout.write(`Independent consumer passed; promoted immutable version to ${target}.\n`);
  }
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    await main();
  } catch {
    process.stderr.write(
      'Publication/promotion failed; preserve the immutable version and evidence, stop promotion, and follow RELEASE_PUBLICATION.md recovery.\n',
    );
    process.exitCode = 1;
  }
}
