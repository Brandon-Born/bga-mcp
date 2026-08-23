import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { Ajv2020 } from 'ajv/dist/2020.js';

import type { Evidence } from './lib/evidence.js';
import {
  type CandidateSource,
  type VersionPolicySummary,
  verifyCandidateSource,
  writeCandidateBundle,
} from './lib/release-candidate.js';
import {
  type CapabilityManifest,
  type ReleaseInventory,
  type ReleasePackageIdentity,
  releaseDigest,
} from './lib/release.js';

const execute = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');
const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

async function command(
  executable: string,
  arguments_: readonly string[],
  cwd = repositoryRoot,
  timeout = 1_800_000,
): Promise<string> {
  const { stdout } = await execute(executable, arguments_, {
    cwd,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

async function loadText(path: string): Promise<string> {
  return await readFile(resolve(repositoryRoot, path), 'utf8');
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await loadText(path)) as T;
}

async function packedArtifact(directory: string, cwd: string): Promise<string> {
  await command(corepack, ['pnpm', 'pack', '--pack-destination', directory], cwd);
  const archives = (await readdir(directory)).filter((name) => name.endsWith('.tgz'));
  if (archives.length !== 1 || archives[0] === undefined) {
    throw new Error(`Expected one npm tarball in ${directory}, found ${String(archives.length)}`);
  }
  return resolve(directory, archives[0]);
}

/** Reads package identity from the tarball bytes that downstream jobs retain. */
async function packedPackageIdentity(artifact: string): Promise<ReleasePackageIdentity> {
  const packageJson = await command('tar', ['-xOf', artifact, 'package/package.json']);
  return JSON.parse(packageJson) as ReleasePackageIdentity;
}

async function candidateSource(tag: string): Promise<CandidateSource> {
  const packageMetadata = await loadJson<PackageMetadata>('package.json');
  const manifest = await loadJson<CapabilityManifest>('config/capabilities.json');
  const metadata = await loadText('src/metadata.ts');
  const lock = await readFile(resolve(repositoryRoot, 'pnpm-lock.yaml'));
  const commit = await command('git', ['rev-parse', 'HEAD']);
  const tagCommit = await command('git', ['rev-list', '-n', '1', tag]);
  return {
    tag,
    commit,
    tagCommit,
    clean: (await command('git', ['status', '--porcelain', '--untracked-files=all'])) === '',
    packageName: packageMetadata.name,
    packageVersion: packageMetadata.version,
    manifestVersion: manifest.server.version,
    metadataVersion: /SERVER_VERSION\s*=\s*'([^']+)'/u.exec(metadata)?.[1] ?? '',
    lockDigest: releaseDigest(lock),
  };
}

async function main(): Promise<void> {
  const tag = process.env.BGA_MCP_CANDIDATE_TAG;
  const output = process.env.BGA_MCP_CANDIDATE_OUTPUT;
  if (tag === undefined || output === undefined) {
    throw new Error(
      'Set BGA_MCP_CANDIDATE_TAG and BGA_MCP_CANDIDATE_OUTPUT; candidate creation has no implicit ref or destination.',
    );
  }
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[1-9][0-9]*$/u.test(tag)) {
    throw new Error(`Candidate tag ${tag} is not a versioned release-candidate tag`);
  }
  const outputDirectory = resolve(output);
  const outputRelative = relative(repositoryRoot, outputDirectory);
  if (
    outputRelative === '' ||
    (!outputRelative.startsWith(`..${sep}`) && outputRelative !== '..')
  ) {
    throw new Error(
      'Candidate output must be outside the source tree so retention cannot dirty it',
    );
  }

  const policy = await loadJson<VersionPolicySummary>('config/version-policy.json');
  const source = await candidateSource(tag);
  const sourceReport = verifyCandidateSource(source, policy);
  if (sourceReport.failed) {
    throw new Error(`Release candidate preflight failed:\n- ${sourceReport.failures.join('\n- ')}`);
  }

  // This is the only gate run whose evidence may enter the candidate. It packs
  // the installed artifact once for all packaged scenarios and records its
  // digest. The later pack must reproduce those exact bytes.
  await command(corepack, ['pnpm', 'check']);

  const scratch = await mkdtemp(join(tmpdir(), 'bga-mcp-release-candidate-'));
  const primaryRoot = resolve(scratch, 'candidate');
  const reconstructionRoot = resolve(scratch, 'reconstruction');
  const worktreeRoot = resolve(scratch, 'source');
  await Promise.all([
    mkdir(primaryRoot, { recursive: true }),
    mkdir(reconstructionRoot, { recursive: true }),
  ]);

  let worktreeAdded = false;
  try {
    const artifactPath = await packedArtifact(primaryRoot, repositoryRoot);
    await command('git', ['worktree', 'add', '--detach', worktreeRoot, tag]);
    worktreeAdded = true;
    await command(corepack, ['pnpm', 'install', '--offline', '--frozen-lockfile'], worktreeRoot);
    const reconstructionPath = await packedArtifact(reconstructionRoot, worktreeRoot);
    const [artifactPackage, reconstructionPackage] = await Promise.all([
      packedPackageIdentity(artifactPath),
      packedPackageIdentity(reconstructionPath),
    ]);

    const inventoryText = await loadText('config/release.json');
    const capabilityManifestText = await loadText('config/capabilities.json');
    const evidenceText = await loadText('.artifacts/verification-evidence.json');
    const schemaText = await loadText('config/release-candidate.schema.json');
    const evidence = JSON.parse(evidenceText) as Evidence;
    const bundle = await writeCandidateBundle({
      source,
      policy,
      inventory: JSON.parse(inventoryText) as ReleaseInventory,
      inventoryText,
      capabilityManifest: JSON.parse(capabilityManifestText) as CapabilityManifest,
      capabilityManifestText,
      evidence,
      evidenceText,
      schemaText,
      artifactPath,
      reconstructionPath,
      artifactPackage,
      reconstructionPackage,
      outputDirectory,
    });

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(JSON.parse(schemaText) as object);
    if (!validate(bundle.manifestDocument)) {
      await rm(bundle.directory, { recursive: true, force: true });
      throw new Error(
        `Candidate manifest does not match its schema: ${ajv.errorsText(validate.errors)}`,
      );
    }

    const digest = `sha256:${createHash('sha256')
      .update(await readFile(bundle.artifact))
      .digest('hex')}`;
    process.stdout.write(
      `Immutable release candidate created at ${bundle.directory}: ${source.packageName}@${source.packageVersion}, ${digest}. No artifact was published.\n`,
    );
  } finally {
    if (worktreeAdded) {
      await command('git', ['worktree', 'remove', '--force', worktreeRoot]).catch(() => '');
    }
    await rm(scratch, { recursive: true, force: true });
  }
}

await main();
