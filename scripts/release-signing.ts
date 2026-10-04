import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

// Builtins only: the identity-bearing job does not install dependencies or execute the candidate.
// https://github.com/actions/attest documents a custom predicate and short-lived Sigstore certificate.
export const SIGNING_REPOSITORY = 'Brandon-Born/bga-mcp';
export const SIGNING_WORKFLOW = `${SIGNING_REPOSITORY}/.github/workflows/release-signing.yml`;
export const SIGNING_PREDICATE = `https://github.com/${SIGNING_REPOSITORY}/predicates/release-candidate/v1`;
const repositoryRoot = resolve(import.meta.dirname, '..');
const receiptPath = resolve(repositoryRoot, 'docs/verification/release-candidate-v1.0.0-rc.7.json');
const execute = promisify(execFile);
const digest = (bytes: Buffer | string): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function object(value: unknown): Record<string, unknown> {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Invalid signing object',
  );
  return value as Record<string, unknown>;
}
function text(value: unknown, pattern: RegExp): string {
  assert(typeof value === 'string' && pattern.test(value), 'Invalid signing identity');
  return value;
}
const sha = (value: unknown): string => text(value, /^sha256:[0-9a-f]{64}$/u);
const commit = (value: unknown): string => text(value, /^[0-9a-f]{40}$/u);
function integer(value: unknown): number {
  assert(
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    'Invalid run identity',
  );
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
export function signingIdentity(receiptInput: unknown) {
  const receipt = object(receiptInput);
  const candidate = object(receipt.candidate);
  const workflow = object(receipt.workflow);
  const ci = object(receipt.ci);
  const version = text(candidate.packageVersion, /^1\.0\.0-rc\.[1-9][0-9]*$/u);
  assert.equal(candidate.sourceTag, `v${version}`);
  assert.equal(candidate.packageName, 'bga-mcp');
  assert.equal(candidate.entrypoint, 'dist/release-cli.js');
  assert.equal(candidate.environment, 'local');
  assert.equal(candidate.id, 'first-local-only');
  assert.equal(candidate.artifactName, `bga-mcp-${version}.tgz`);
  const sourceCommit = commit(candidate.sourceCommit);
  const producerUrl = text(
    workflow.url,
    /^https:\/\/github\.com\/Brandon-Born\/bga-mcp\/actions\/runs\/[1-9][0-9]*$/u,
  );
  const ciUrl = text(
    ci.url,
    /^https:\/\/github\.com\/Brandon-Born\/bga-mcp\/actions\/runs\/[1-9][0-9]*$/u,
  );
  assert.equal(ci.commit, sourceCommit);
  assert.equal(ci.conclusion, 'success');
  assert.equal(workflow.conclusion, 'success');
  const materials = object(candidate.digests);
  for (const name of [
    'artifact',
    'inventory',
    'capabilityManifest',
    'verificationEvidence',
    'securityAudit',
  ])
    sha(materials[name]);
  return {
    candidate,
    artifactName: `bga-mcp-${version}.tgz`,
    sourceCommit,
    sourceTag: `v${version}`,
    producerUrl,
    producerRun: integer(Number(producerUrl.split('/').at(-1))),
    ciUrl,
    ciRun: integer(Number(ciUrl.split('/').at(-1))),
    artifactId: integer(workflow.artifactId),
    archiveDigest: sha(workflow.archiveDigest),
    artifactDigest: sha(materials.artifact),
    lockDigest: sha(candidate.lockDigest),
    materials,
  };
}
export function verifySigningArchive(bytes: Buffer, receipt: unknown): void {
  assert.equal(
    digest(bytes),
    signingIdentity(receipt).archiveDigest,
    'Original archive differs from reviewed receipt',
  );
}
export function candidateFiles(receipt: unknown): string[] {
  return [
    signingIdentity(receipt).artifactName,
    'release-candidate.json',
    'release-candidate.schema.json',
    'verification-evidence.json',
    'security-audit.json',
    'security-audit-policy.json',
    'SHA256SUMS',
  ].sort();
}

export async function readSigningCandidate(directory: string, receipt: unknown) {
  const identity = signingIdentity(receipt);
  const names = candidateFiles(receipt);
  const present = (await readdir(directory)).sort();
  assert(
    present.every((name) =>
      [...names, 'sigstore-bundle.json', 'release-provenance.json'].includes(name),
    ),
    'Unexpected signing input',
  );
  const files: Record<string, Buffer> = {};
  for (const name of names) {
    const path = resolve(directory, name);
    const stat = await lstat(path);
    assert(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16 * 1024 * 1024,
      'Unsafe signing input',
    );
    files[name] = await readFile(path);
  }
  const bytes = (name: string): Buffer => {
    const value = files[name];
    assert(value);
    return value;
  };
  const json = (name: string): Record<string, unknown> =>
    object(JSON.parse(bytes(name).toString('utf8')) as unknown);
  const sums = bytes('SHA256SUMS').toString('utf8').trim().split('\n');
  assert.equal(sums.length, 6);
  const seen = new Set<string>();
  for (const line of sums) {
    const match = /^([0-9a-f]{64}) {2}([a-zA-Z0-9._-]+)$/u.exec(line);
    assert(match?.[1] && match[2]);
    assert(names.includes(match[2]) && match[2] !== 'SHA256SUMS' && !seen.has(match[2]));
    seen.add(match[2]);
    assert.equal(digest(bytes(match[2])), `sha256:${match[1]}`);
  }
  const manifest = json('release-candidate.json');
  assert(
    isDeepStrictEqual(manifest.release, identity.candidate),
    'Candidate identity differs from reviewed receipt',
  );
  assert.equal(digest(bytes(identity.artifactName)), identity.artifactDigest);
  assert.equal(
    digest(bytes('verification-evidence.json')),
    identity.materials.verificationEvidence,
  );
  assert.equal(digest(bytes('security-audit.json')), identity.materials.securityAudit);
  const evidence = json('verification-evidence.json');
  assert.equal(object(evidence.source).commit, identity.sourceCommit);
  assert.equal(object(evidence.source).clean, true);
  assert.equal(object(evidence.package).artifactDigest, identity.artifactDigest);
  assert.equal(object(evidence.package).lockDigest, identity.lockDigest);
  const unsignedEvidence = { ...evidence };
  delete unsignedEvidence.integrity;
  delete unsignedEvidence.$schema;
  assert.equal(
    object(evidence.integrity).value,
    createHash('sha256').update(canonical(unsignedEvidence)).digest('hex'),
  );
  assert.equal(object(evidence.tests).failed, 0);
  assert.equal(object(evidence.tests).skipped, 0);
  assert.equal(object(evidence.scenarios).failed, 0);
  assert.equal(object(evidence.scenarios).missing, 0);
  const audit = json('security-audit.json');
  assert.equal(object(audit.source).commit, identity.sourceCommit);
  assert.equal(object(audit.source).lockDigest, identity.lockDigest);
  assert.equal(object(audit.source).policyDigest, digest(bytes('security-audit-policy.json')));
  return {
    identity,
    subjects: names.map((name) => ({ name, digest: { sha256: digest(bytes(name)).slice(7) } })),
    predicate: retentionPredicate(receipt),
  };
}

export function retentionPredicate(receipt: unknown) {
  const identity = signingIdentity(receipt);
  return {
    schemaVersion: 1,
    repository: SIGNING_REPOSITORY,
    source: { commit: identity.sourceCommit, tag: identity.sourceTag },
    producer: { workflow: '.github/workflows/release-candidate.yml', run: identity.producerUrl },
    sourceCi: identity.ciUrl,
    retainedArchive: { artifactId: identity.artifactId, digest: identity.archiveDigest },
    candidate: identity.candidate,
    assertion:
      'The reviewed BGA-403 candidate bytes were retained and checked without rebuilding. This is a retention attestation, not a claim that the signing workflow built them or approved publication.',
  };
}

export function attestationArguments(
  artifact: string,
  bundle: string,
  signerCommit: string,
  trustedRoot?: string,
): string[] {
  commit(signerCommit);
  return [
    'attestation',
    'verify',
    artifact,
    '--repo',
    SIGNING_REPOSITORY,
    '--bundle',
    bundle,
    '--predicate-type',
    SIGNING_PREDICATE,
    '--signer-workflow',
    SIGNING_WORKFLOW,
    '--source-ref',
    'refs/heads/main',
    '--source-digest',
    signerCommit,
    '--signer-digest',
    signerCommit,
    '--deny-self-hosted-runners',
    '--cert-oidc-issuer',
    'https://token.actions.githubusercontent.com',
    '--format',
    'json',
    ...(trustedRoot === undefined ? [] : ['--custom-trusted-root', trustedRoot]),
  ];
}
export function checkVerifiedStatement(
  input: unknown,
  expected: Pick<Awaited<ReturnType<typeof readSigningCandidate>>, 'subjects' | 'predicate'>,
): void {
  assert(Array.isArray(input) && input.length > 0, 'No cryptographically verified attestation');
  assert(
    input.some((entry: unknown) => {
      const result = object(object(entry).verificationResult);
      const statement = object(result.statement);
      if (
        statement.predicateType !== SIGNING_PREDICATE ||
        !isDeepStrictEqual(statement.predicate, expected.predicate)
      )
        return false;
      if (!Array.isArray(statement.subject)) return false;
      const subjects = statement.subject
        .map((subject: unknown) => {
          const item = object(subject);
          return { name: item.name, digest: item.digest };
        })
        .sort((a, b) =>
          String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0,
        );
      return isDeepStrictEqual(subjects, expected.subjects);
    }),
    'Verified attestation has the wrong subjects or provenance',
  );
}

async function ghJson(path: string): Promise<Record<string, unknown>> {
  const { stdout } = await execute('gh', ['api', path], {
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return object(JSON.parse(stdout) as unknown);
}
async function extractArchive(archive: string, directory: string, receipt: unknown): Promise<void> {
  const info = await lstat(archive);
  assert(info.isFile() && !info.isSymbolicLink() && info.size <= 16 * 1024 * 1024);
  verifySigningArchive(await readFile(archive), receipt);
  const { stdout } = await execute('unzip', ['-Z1', archive], {
    timeout: 30_000,
    maxBuffer: 1_000_000,
  });
  assert(
    isDeepStrictEqual(stdout.trim().split('\n').sort(), candidateFiles(receipt)),
    'Archive entries differ',
  );
  await mkdir(directory); // Refuse an existing destination; never overwrite candidate bytes.
  await execute('unzip', ['-q', archive, '-d', directory], {
    timeout: 30_000,
    maxBuffer: 1_000_000,
  });
  await readSigningCandidate(directory, receipt);
}
async function prepare(output: string, receipt: unknown): Promise<void> {
  const identity = signingIdentity(receipt);
  const prefix = `repos/${SIGNING_REPOSITORY}`;
  const run = await ghJson(`${prefix}/actions/runs/${String(identity.producerRun)}`);
  const ci = await ghJson(`${prefix}/actions/runs/${String(identity.ciRun)}`);
  const artifact = await ghJson(`${prefix}/actions/artifacts/${String(identity.artifactId)}`);
  const workflow = await ghJson(`${prefix}/actions/workflows/${String(integer(run.workflow_id))}`);
  const tag = await ghJson(`${prefix}/commits/${identity.sourceTag}`);
  assert.equal(run.head_sha, identity.sourceCommit);
  assert.equal(ci.head_sha, identity.sourceCommit);
  for (const result of [run, ci]) {
    assert.equal(result.conclusion, 'success');
    assert.equal(result.status, 'completed');
    assert.equal(object(result.repository).full_name, SIGNING_REPOSITORY);
  }
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(workflow.path, '.github/workflows/release-candidate.yml');
  assert.equal(tag.sha, identity.sourceCommit);
  assert.equal(artifact.expired, false);
  assert.equal(artifact.digest, identity.archiveDigest);
  assert.equal(object(artifact.workflow_run).id, identity.producerRun);
  const { stdout } = await execute(
    'gh',
    ['api', `${prefix}/actions/artifacts/${String(identity.artifactId)}/zip`],
    { encoding: 'buffer', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
  );
  verifySigningArchive(stdout, receipt);
  await mkdir(output);
  const archive = resolve(output, 'candidate.zip');
  await writeFile(archive, stdout);
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga-signing-preflight-'));
  try {
    await extractArchive(archive, resolve(scratch, 'candidate'), receipt);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
export async function verifySignedCandidate(
  directory: string,
  signerCommit: string,
  trustedRoot?: string,
): Promise<void> {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as unknown;
  const expected = await readSigningCandidate(directory, receipt);
  const { stdout } = await execute(
    'gh',
    attestationArguments(
      resolve(directory, expected.identity.artifactName),
      resolve(directory, 'sigstore-bundle.json'),
      signerCommit,
      trustedRoot,
    ),
    { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
  );
  checkVerifiedStatement(JSON.parse(stdout) as unknown, expected);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const [mode, path, argument] = process.argv.slice(2);
    assert(path);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as unknown;
    if (mode === 'prepare') await prepare(resolve(path), receipt);
    else if (mode === 'predicate') {
      assert(argument);
      const prepared = await readSigningCandidate(resolve(path), receipt);
      await writeFile(resolve(argument), `${JSON.stringify(prepared.predicate, null, 2)}\n`, {
        flag: 'wx',
      });
    } else if (mode === 'extract') {
      assert(argument);
      await extractArchive(resolve(path), resolve(argument), receipt);
    } else if (mode === 'verify') {
      assert(argument);
      await verifySignedCandidate(resolve(path), argument, process.argv[5]);
    } else throw new Error('Unknown signing mode');
    process.stdout.write('Release signing check passed. No candidate was rebuilt or published.\n');
  } catch {
    process.stderr.write('Release signing check failed; candidate approval is blocked.\n');
    process.exitCode = 1;
  }
}
