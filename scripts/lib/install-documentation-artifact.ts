import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runCommand } from '../../tests/helpers/process.js';

export async function installDocumentationArtifact(
  repositoryRoot: string,
  originalArtifact?: string,
) {
  const root = await mkdtemp(join(tmpdir(), 'bga-mcp-doc-evaluation-'));
  const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  try {
    let artifact = originalArtifact;
    if (artifact === undefined) {
      const pack = await runCommand(corepack, ['pnpm', 'pack', '--pack-destination', root], {
        cwd: repositoryRoot,
        timeoutMs: 180_000,
      });
      if (pack.exitCode !== 0) throw new Error('documentation evaluation package build failed');
      const archives = (await readdir(root)).filter((file) => file.endsWith('.tgz'));
      if (archives.length !== 1) throw new Error('expected one evaluation artifact');
      artifact = resolve(root, archives[0] ?? '');
    }
    const digest = `sha256:${createHash('sha256')
      .update(await readFile(artifact))
      .digest('hex')}`;
    const installRoot = resolve(root, 'install');
    await mkdir(installRoot);
    await writeFile(
      resolve(installRoot, 'package.json'),
      JSON.stringify({ name: 'bga-mcp-doc-evaluation', private: true }),
    );
    const installed = await runCommand(
      corepack,
      ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, resolve(artifact)],
      { timeoutMs: 180_000 },
    );
    if (installed.exitCode !== 0)
      throw new Error('documentation evaluation artifact installation failed');
    return {
      cli: resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js'),
      digest,
      cleanup: () => rm(root, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
