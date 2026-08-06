import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TestProject } from 'vitest/node';

import { runCommand } from './helpers/process.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

declare module 'vitest' {
  interface ProvidedContext {
    /** Absolute path of the packed artifact every end-to-end suite installs. */
    readonly packedArtifact: string;
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
  const packRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-pack-'));
  const pack = await runCommand(corepackCommand, ['pnpm', 'pack', '--pack-destination', packRoot], {
    cwd: repositoryRoot,
    timeoutMs: 180_000,
  });
  if (pack.exitCode !== 0) {
    throw new Error(`Packing the artifact failed: ${pack.stderr}\n${pack.stdout}`);
  }

  const archive = (await readdir(packRoot)).find((file) => file.endsWith('.tgz'));
  if (archive === undefined) {
    throw new Error('Package manager produced no tarball');
  }

  project.provide('packedArtifact', resolve(packRoot, archive));
  return async () => {
    await rm(packRoot, { recursive: true, force: true });
  };
}
