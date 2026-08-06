import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const seedRoot = resolve(repositoryRoot, '.artifacts/quality-gate-seeds');
const executableSuffix = process.platform === 'win32' ? '.cmd' : '';

function tool(name: string): string {
  return resolve(repositoryRoot, `node_modules/.bin/${name}${executableSuffix}`);
}

function expectFailure(name: string, command: string, arguments_: string[]): void {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status === 0) {
    throw new Error(`${name} gate did not detect its seeded failure`);
  }
}

async function main(): Promise<void> {
  await rm(seedRoot, { recursive: true, force: true });
  await mkdir(seedRoot, { recursive: true });
  try {
    const formatSeed = resolve(seedRoot, 'format.ts');
    const prettierIgnoreSeed = resolve(seedRoot, 'empty-prettier-ignore');
    const typeSeed = resolve(seedRoot, 'type.ts');
    const testSeed = resolve(seedRoot, 'failure.test.ts');
    await writeFile(formatSeed, 'const badlyFormatted={first:1,second:2}\n');
    await writeFile(prettierIgnoreSeed, '');
    await writeFile(typeSeed, 'const value: string = 42;\nvoid value;\n');
    await writeFile(
      testSeed,
      "import { expect, test } from 'vitest';\ntest('seeded failure', () => expect(true).toBe(false));\n",
    );

    expectFailure('formatting', tool('prettier'), [
      '--ignore-path',
      prettierIgnoreSeed,
      '--check',
      formatSeed,
    ]);
    expectFailure('typing', tool('tsc'), [
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2023',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      typeSeed,
    ]);
    expectFailure('test', tool('vitest'), ['run', '--config', 'scripts/seeded-vitest.config.ts']);
    process.stdout.write('Seeded formatting, typing, and test failures were detected.\n');
  } finally {
    await rm(seedRoot, { recursive: true, force: true });
  }
}

await main();
