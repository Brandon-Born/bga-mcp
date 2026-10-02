import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TestProject } from 'vitest/node';

import { runCommand } from './helpers/process.js';
import { verifyReplayDigest } from '../scripts/lib/security-review.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

declare module 'vitest' {
  interface ProvidedContext {
    /** Absolute path of the packed artifact every end-to-end suite installs. */
    readonly packedArtifact: string;
    /** Its SHA-256, so a suite can prove it installed this build and no other. */
    readonly packedArtifactDigest: string;
    readonly packedArtifactRecords: string;
  }
}

/**
 * Packs the artifact once for the whole run.
 *
 * Packing runs `prepack`, which writes `dist/`. Several suites packing at the
 * same time raced on that directory and failed intermittently, so the pack
 * happens here, before any worker starts, and every suite installs the result.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const retained = process.env.BGA_MCP_SECURITY_REVIEW_ARTIFACT;
  const expected = process.env.BGA_MCP_SECURITY_REVIEW_DIGEST;
  if ((retained === undefined) !== (expected === undefined))
    throw new Error('Retained review selection requires both artifact and authenticated digest');
  const packRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-pack-'));
  let artifact: string;
  if (retained !== undefined && expected !== undefined) {
    artifact = resolve(retained);
    verifyReplayDigest(await readFile(artifact), expected);
  } else {
    const pack = await runCommand(
      corepackCommand,
      ['pnpm', 'pack', '--pack-destination', packRoot],
      { cwd: repositoryRoot, timeoutMs: 180_000 },
    );
    if (pack.exitCode !== 0)
      throw new Error(`Packing the artifact failed: ${pack.stderr}\n${pack.stdout}`);
    const archive = (await readdir(packRoot)).find((file) => file.endsWith('.tgz'));
    if (archive === undefined) throw new Error('Package manager produced no tarball');
    artifact = resolve(packRoot, archive);
  }

  const digest = `sha256:${createHash('sha256')
    .update(await readFile(artifact))
    .digest('hex')}`;

  // The digest is written where the evidence emitter can find it, so the
  // artifact records which build the packaged scenarios were proven against
  // rather than leaving that to be assumed. Each suite then writes its own
  // file beside it: suites run in parallel workers, so one shared file would
  // lose whichever record lost the race.
  await mkdir(resolve(repositoryRoot, '.artifacts'), { recursive: true });
  const recordDirectory = resolve(
    repositoryRoot,
    retained === undefined ? '.artifacts/packaged-runs' : '.artifacts/security-review-runs',
  );
  await rm(recordDirectory, { recursive: true, force: true });
  await mkdir(recordDirectory, { recursive: true });
  await writeFile(
    resolve(
      repositoryRoot,
      retained === undefined
        ? '.artifacts/packaged-artifact.json'
        : '.artifacts/security-review-artifact.json',
    ),
    `${JSON.stringify({ digest, packedAt: new Date().toISOString(), mode: retained === undefined ? 'checkout' : 'authenticated-original' })}\n`,
  );
  project.provide('packedArtifactRecords', recordDirectory);

  project.provide('packedArtifact', artifact);
  project.provide('packedArtifactDigest', digest);
  return async () => {
    await rm(packRoot, { recursive: true, force: true });
  };
}
