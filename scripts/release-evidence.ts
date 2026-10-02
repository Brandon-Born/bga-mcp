import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  appendFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { type Evidence } from './lib/evidence.js';
import {
  assertSchema,
  assetDigest,
  buildReleaseEvidence,
  EVIDENCE_ASSETS,
  ORIGINAL_EVIDENCE_FILES,
} from './lib/release-evidence.js';
import {
  type CapabilityManifest,
  type ReleaseCandidateManifest,
  type ReleaseInventory,
} from './lib/release.js';
import { scanText } from './lib/secret-scan.js';
import {
  attestationArguments,
  candidateFiles,
  checkVerifiedStatement,
  retentionPredicate,
  signingIdentity,
  SIGNING_REPOSITORY,
  verifySignedCandidate,
} from './release-signing.js';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
const candidateReceipt = await json<unknown>(
  resolve(root, 'docs/verification/release-candidate-v1.0.0-rc.6.json'),
);
const identity = signingIdentity(candidateReceipt);
const signingReceipt = await json<{
  signer: { commit: string };
  workflow: { artifactId: number; archiveDigest: string };
  attestation: { bundleDigest: string };
}>(resolve(root, 'docs/verification/release-signing-v1.0.0-rc.6.json'));
const sourceFile = async (path: string): Promise<Buffer> =>
  (
    await execute('git', ['show', `${identity.sourceCommit}:${path}`], {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 8 * 1024 * 1024,
    })
  ).stdout;

async function trustRoots(directory: string): Promise<string> {
  const { stdout } = await execute('gh', ['attestation', 'trusted-root'], {
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const path = resolve(directory, 'independent-roots.jsonl');
  await writeFile(path, stdout);
  return path;
}

export async function validateEvidencePacket(
  directory: string,
  verifySignature = true,
): Promise<ReturnType<typeof buildReleaseEvidence>> {
  assert.deepEqual(
    (await readdir(directory)).sort(),
    EVIDENCE_ASSETS,
    'Evidence assets differ from allowlist',
  );
  const files = new Map<string, Buffer>();
  for (const name of EVIDENCE_ASSETS) {
    const file = resolve(directory, name);
    const stat = await lstat(file);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16 * 1024 * 1024);
    const bytes = await readFile(file);
    assert.equal(scanText(bytes.toString('utf8'), name).length, 0);
    files.set(name, bytes);
  }
  const bytes = (name: string): Buffer => {
    const value = files.get(name);
    assert(value);
    return value;
  };
  const parse = (name: string): unknown => JSON.parse(bytes(name).toString('utf8')) as unknown;
  assert.equal(assetDigest(bytes('sigstore-bundle.json')), signingReceipt.attestation.bundleDigest);
  assert.equal(
    assetDigest(bytes('verification-evidence.json')),
    identity.materials.verificationEvidence,
  );
  assert.equal(assetDigest(bytes('capabilities.json')), identity.materials.capabilityManifest);
  assert.equal(assetDigest(bytes('release-inventory.json')), identity.materials.inventory);
  const evidenceSchema = await sourceFile('config/evidence.schema.json');
  assert.deepEqual(
    bytes('evidence.schema.json'),
    evidenceSchema,
    'Packet schema is not the trusted source schema',
  );
  assert.deepEqual(
    bytes('release-candidate.schema.json'),
    await sourceFile('config/release-candidate.schema.json'),
  );
  const summarySchema = await readFile(resolve(root, 'config/release-evidence.schema.json'));
  assert.deepEqual(bytes('release-evidence.schema.json'), summarySchema);
  const candidate = parse('release-candidate.json') as ReleaseCandidateManifest;
  assert.deepEqual(candidate.release, identity.candidate);
  assertSchema(
    candidate,
    JSON.parse(bytes('release-candidate.schema.json').toString('utf8')) as object,
  );
  const sums = bytes('SHA256SUMS').toString('utf8').trim().split('\n');
  assert.equal(sums.length, 6);
  const covered = new Set<string>();
  for (const line of sums) {
    const match = /^([0-9a-f]{64}) {2}([a-zA-Z0-9._-]+)$/u.exec(line);
    assert(match?.[1] && match[2] && !covered.has(match[2]));
    covered.add(match[2]);
    assert.equal(
      `sha256:${match[1]}`,
      match[2] === identity.artifactName ? identity.artifactDigest : assetDigest(bytes(match[2])),
    );
  }
  const expected = buildReleaseEvidence({
    evidence: parse('verification-evidence.json') as Evidence,
    manifest: parse('capabilities.json') as CapabilityManifest,
    inventory: parse('release-inventory.json') as ReleaseInventory,
    candidate,
    signerCommit: signingReceipt.signer.commit,
    evidenceSchema: JSON.parse(evidenceSchema.toString('utf8')) as object,
  });
  const summary = parse('release-evidence.json');
  assertSchema(summary, JSON.parse(summarySchema.toString('utf8')) as object);
  assert.deepEqual(summary, expected, 'Summary overstates or omits signed observations');
  if (verifySignature) {
    const scratch = await mkdtemp(resolve(tmpdir(), 'bga-evidence-crypto-'));
    try {
      const trustedRoot = await trustRoots(scratch);
      const { stdout } = await execute(
        'gh',
        attestationArguments(
          resolve(directory, 'verification-evidence.json'),
          resolve(directory, 'sigstore-bundle.json'),
          signingReceipt.signer.commit,
          trustedRoot,
        ),
        { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      );
      checkVerifiedStatement(JSON.parse(stdout) as unknown, {
        predicate: retentionPredicate(candidateReceipt),
        subjects: candidateFiles(candidateReceipt).map((name) => ({
          name,
          digest: {
            sha256: (name === identity.artifactName
              ? identity.artifactDigest
              : assetDigest(bytes(name))
            ).slice(7),
          },
        })),
      });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
  return expected;
}

async function prepare(directory: string): Promise<void> {
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga-evidence-prepare-'));
  try {
    const { stdout: archive } = await execute(
      'gh',
      [
        'api',
        `repos/${SIGNING_REPOSITORY}/actions/artifacts/${String(signingReceipt.workflow.artifactId)}/zip`,
      ],
      { encoding: 'buffer', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(assetDigest(archive), signingReceipt.workflow.archiveDigest);
    const zip = resolve(scratch, 'signed.zip');
    await writeFile(zip, archive);
    const listing = await execute('unzip', ['-Z1', zip]);
    assert.deepEqual(
      listing.stdout.trim().split('\n').sort(),
      [
        ...candidateFiles(candidateReceipt),
        'sigstore-bundle.json',
        'release-provenance.json',
      ].sort(),
    );
    const signed = resolve(scratch, 'signed');
    await mkdir(signed);
    await execute('unzip', ['-q', zip, '-d', signed]);
    await verifySignedCandidate(signed, signingReceipt.signer.commit, await trustRoots(scratch));
    await mkdir(directory);
    const packet = resolve(directory, 'packet');
    await mkdir(packet);
    for (const name of [...ORIGINAL_EVIDENCE_FILES, 'sigstore-bundle.json'])
      await cp(resolve(signed, name), resolve(packet, name), { errorOnExist: true, force: false });
    for (const [name, source] of [
      ['capabilities.json', 'capabilities.json'],
      ['release-inventory.json', 'release.json'],
    ] as const) {
      const { stdout } = await execute(
        'tar',
        ['-xOf', resolve(signed, identity.artifactName), `package/config/${source}`],
        { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      );
      await writeFile(resolve(packet, name), stdout);
    }
    await writeFile(
      resolve(packet, 'evidence.schema.json'),
      await sourceFile('config/evidence.schema.json'),
    );
    await cp(
      resolve(root, 'config/release-evidence.schema.json'),
      resolve(packet, 'release-evidence.schema.json'),
    );
    const summary = buildReleaseEvidence({
      evidence: await json<Evidence>(resolve(packet, 'verification-evidence.json')),
      manifest: await json<CapabilityManifest>(resolve(packet, 'capabilities.json')),
      inventory: await json<ReleaseInventory>(resolve(packet, 'release-inventory.json')),
      candidate: await json<ReleaseCandidateManifest>(resolve(packet, 'release-candidate.json')),
      signerCommit: signingReceipt.signer.commit,
      evidenceSchema: await json<object>(resolve(packet, 'evidence.schema.json')),
    });
    await writeFile(
      resolve(packet, 'release-evidence.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    await validateEvidencePacket(packet);
    const notes = `Verification evidence for ${identity.sourceTag}\n\nThis prerelease record distributes candidate verification metadata only. The npm package has not been published or approved for release.\n\nOriginal source: ${identity.sourceCommit}\nOriginal package SHA-256: ${identity.artifactDigest}\nSigning workflow source: ${signingReceipt.signer.commit}\n\nThe signed original observations cover seven local tools, three resources and stdio. Six other repository capabilities are explicitly excluded. Live Studio: not run. Later signing/distribution does not renew dated security observations.\n\nRetain these assets for the lifetime of this release. Verify using the trusted repository scripts/release-evidence.ts download command; the derived summary is recomputed from signed evidence and digest-bound original inventory/manifest. BGA-400/401/405/415 retain installation, client breadth, security approval and package publication ownership.\n`;
    const plan = {
      tag: identity.sourceTag,
      sourceCommit: identity.sourceCommit,
      title: `${identity.sourceTag} verification evidence (candidate)`,
      notes,
      assets: await Promise.all(
        EVIDENCE_ASSETS.map(async (name) => ({
          name,
          digest: assetDigest(await readFile(resolve(packet, name))),
        })),
      ),
    };
    const planBytes = `${JSON.stringify(plan, null, 2)}\n`;
    await writeFile(resolve(directory, 'plan.json'), planBytes);
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `plan-digest=${assetDigest(planBytes)}\n`);
    process.stdout.write(
      'Original signed evidence prepared and scanned; no package rebuilt or published.\n',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
async function download(directory: string): Promise<void> {
  await mkdir(directory);
  for (const name of EVIDENCE_ASSETS) {
    // Explicit public URL; no token, cookies, private project data or packet-controlled host.
    await execute(
      'curl',
      [
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        '--max-redirs',
        '5',
        '--max-time',
        '60',
        '--max-filesize',
        '16777216',
        '--output',
        resolve(directory, name),
        `https://github.com/${SIGNING_REPOSITORY}/releases/download/${identity.sourceTag}/${name}`,
      ],
      { timeout: 70_000, maxBuffer: 1_000_000 },
    );
  }
  const result = await validateEvidencePacket(directory);
  process.stdout.write(
    `Published evidence schema, signature and exact ${String(result.local.capabilities.length)}-entry local coverage verified. Live Studio is not run.\n`,
  );
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const [mode, path] = process.argv.slice(2);
    assert(path);
    if (mode === 'prepare') await prepare(resolve(path));
    else if (mode === 'download') await download(resolve(path));
    else if (mode === 'verify') {
      await validateEvidencePacket(resolve(path));
      process.stdout.write('Evidence packet schema, signature and exact coverage verified.\n');
    } else throw new Error('Unknown evidence mode');
  } catch {
    process.stderr.write(
      'Release evidence validation failed; evidence publication/acceptance is blocked.\n',
    );
    process.exitCode = 1;
  }
}
