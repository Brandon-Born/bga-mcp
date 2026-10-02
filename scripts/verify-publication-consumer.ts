import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  NPM_CLI,
  PUBLICATION_REGISTRY,
  readPublicationPlan,
  sha256,
  verifyNpmProvenance,
  verifyRegistryArtifact,
  verifyPreparedFiles,
  npmAttestationArguments,
  object,
} from './lib/publication.js';
import { verifySignedCandidate } from './release-signing.js';
import { SecurityReviewSchema } from './lib/security-review.js';
import { scanText } from './lib/secret-scan.js';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
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
  const packet = resolve(directory),
    bytes = await readFile(resolve(packet, 'plan.json'));
  assert.equal(sha256(bytes), expectedDigest);
  const plan = readPublicationPlan(JSON.parse(bytes.toString('utf8')));
  const admitted = new Map<string, Buffer>();
  for (const file of plan.files)
    admitted.set(file.name, await readFile(resolve(packet, file.name)));
  verifyPreparedFiles(plan, admitted);
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga415-consumer-'));
  // A fresh consumer receives no repository/registry tokens or inherited npm config/cache.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: scratch,
    USERPROFILE: scratch,
    SYSTEMROOT: process.env.SYSTEMROOT,
    NPM_CONFIG_USERCONFIG: resolve(scratch, 'absent-user-config'),
    NPM_CONFIG_GLOBALCONFIG: resolve(scratch, 'absent-global-config'),
    NPM_CONFIG_CACHE: resolve(scratch, 'cache'),
    NPM_CONFIG_REGISTRY: PUBLICATION_REGISTRY,
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
  };
  const command = async (name: string, args: string[], cwd = scratch) =>
    (await execute(name, args, { cwd, env, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })).stdout;
  try {
    assert.equal((await command('npm', ['--version'])).trim(), NPM_CLI);
    const metadata: unknown = JSON.parse(
      await command('npm', [
        'view',
        `bga-mcp@${plan.candidate.version}`,
        '--json',
        '--registry',
        PUBLICATION_REGISTRY,
      ]),
    );
    const tarball = resolve(scratch, `bga-mcp-${plan.candidate.version}.tgz`);
    const url = `${PUBLICATION_REGISTRY}/bga-mcp/-/bga-mcp-${plan.candidate.version}.tgz`;
    await command('curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--proto',
      '=https',
      '--max-time',
      '60',
      '--max-filesize',
      '16777216',
      '--output',
      tarball,
      url,
    ]);
    const publicBytes = await readFile(tarball);
    verifyRegistryArtifact(metadata, publicBytes, plan);
    // Authenticate public bytes using the original retention signature with independent refreshed roots.
    const roots = resolve(scratch, 'trusted-root.jsonl');
    await writeFile(roots, await command('gh', ['attestation', 'trusted-root']));
    const approval = SecurityReviewSchema.parse(
      JSON.parse(await readFile(resolve(packet, 'approval.json'), 'utf8')),
    );
    // The original signature packet has a strict nine-file allowlist. Admission metadata stays outside it.
    const signed = resolve(scratch, 'original-signature-packet');
    await mkdir(signed);
    for (const file of plan.files) {
      if (file.name === 'approval.json' || file.name === 'fresh-audit.json') continue;
      const original = admitted.get(file.name);
      assert(original);
      await writeFile(resolve(signed, file.name), original, { flag: 'wx' });
    }
    await verifySignedCandidate(signed, approval.signature.signerCommit, roots);
    const install = resolve(scratch, 'registry-install');
    await mkdir(install);
    await writeFile(
      resolve(install, 'package.json'),
      JSON.stringify({ name: 'independent-bga-public-consumer', private: true }),
    );
    await command(
      'npm',
      [
        'install',
        '--save-exact',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        `bga-mcp@${plan.candidate.version}`,
      ],
      install,
    );
    const lock = JSON.parse(await readFile(resolve(install, 'package-lock.json'), 'utf8')) as {
      packages: Partial<Record<string, { integrity?: string; resolved?: string }>>;
    };
    const expectedIntegrity = (metadata as { dist: { integrity: string } }).dist.integrity;
    const installed = lock.packages['node_modules/bga-mcp'];
    assert(installed);
    assert.equal(installed.integrity, expectedIntegrity);
    assert.equal(installed.resolved, url);
    // Only CLI-successful signature/provenance results enter the policy decoder.
    const audit = await command(
      'npm',
      ['audit', 'signatures', '--json', '--include-attestations'],
      install,
    );
    const verifiedBundle = verifyNpmProvenance(JSON.parse(audit) as unknown, publicBytes, plan);
    const npmBundle = resolve(scratch, 'npm-provenance.json');
    await writeFile(npmBundle, JSON.stringify(verifiedBundle));
    // npm verifies subject/signatures; GitHub CLI additionally constrains the certified actor identity.
    await command('gh', npmAttestationArguments(tarball, npmBundle, plan, roots));
    const guideResult = resolve(scratch, 'guide-result.json');
    await command(process.execPath, [
      '--import',
      import.meta.resolve('tsx'),
      resolve(root, 'scripts/test-publication-guide.ts'),
      tarball,
      root,
      guideResult,
    ]);
    const use = object(JSON.parse(await readFile(guideResult, 'utf8')) as unknown);
    assert.equal(use.artifactDigest, plan.candidate.artifactDigest);
    assert(use.projectUnchanged && use.removal === 'passed' && use.firstUse === 'passed');
    await command(
      'npm',
      ['uninstall', '--ignore-scripts', '--no-audit', '--no-fund', 'bga-mcp'],
      install,
    );
    assert(!(await readdir(resolve(install, 'node_modules'))).includes('bga-mcp'));
    await credentialFree(scratch);
    const receipt = {
      schemaVersion: 1,
      owner: 'BGA-415',
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      registry: PUBLICATION_REGISTRY,
      registryUrl: url,
      candidate: plan.candidate,
      publisherCommit: plan.publisherCommit,
      workflowRun: plan.workflowRun,
      planDigest: expectedDigest,
      approvalDigest: plan.approvalDigest,
      auditDigest: plan.auditDigest,
      provenanceVerified: true,
      signatureVerified: true,
      inventoryMatched: true,
      firstUsePassed: true,
      projectUnchanged: true,
      removed: true,
      credentialFree: true,
      scope:
        'Public immutable registry bytes match signed source candidate; npm provenance identifies the separate publisher workflow commit. No live Studio claim.',
    };
    const result = `${JSON.stringify(receipt, null, 2)}\n`;
    assert.equal(scanText(result, 'publication-consumer').length, 0);
    await writeFile(resolve(output), result, { flag: 'wx' });
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `consumer-digest=${sha256(result)}\n`);
    process.stdout.write(
      'Independent public consumer verified exact bytes, original signature, npm provenance, guide use and removal.\n',
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
      'Public consumer verification failed; stop promotion and preserve the published immutable version for investigation.\n',
    );
    process.exitCode = 1;
  }
}
