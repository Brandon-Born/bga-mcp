import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { formatFindings, scanDirectory, scanText } from './lib/secret-scan.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

/** Directories CI retains as artifacts. They must never carry a credential. */
const ARTIFACT_DIRECTORIES = ['coverage', 'conformance-results', '.artifacts'];

/**
 * A seeded secret is written outside the repository, so a failing scan can
 * never cause the sensitive fixture itself to be uploaded as an artifact.
 */
const SEEDED_SECRET = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function proveScannerDetectsSeededSecret(): Promise<void> {
  const seedRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-secret-seed-'));
  try {
    await mkdir(resolve(seedRoot, 'artifact'), { recursive: true });
    await writeFile(resolve(seedRoot, 'artifact/evidence.json'), `{"key":"${SEEDED_SECRET}"}\n`);
    const findings = await scanDirectory(seedRoot);
    if (findings.length === 0) {
      throw new Error('The secret scanner did not detect its seeded credential');
    }
    const report = formatFindings(findings);
    if (report.includes(SEEDED_SECRET)) {
      throw new Error('The secret scanner report revealed the complete seeded credential');
    }
    const logFinding = scanText(`bga-mcp error: token=${SEEDED_SECRET}`, 'stderr.log');
    if (logFinding.length === 0) {
      throw new Error('The secret scanner did not detect a credential in log output');
    }
  } finally {
    await rm(seedRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await proveScannerDetectsSeededSecret();

  const sourceFindings = await scanDirectory(repositoryRoot, { repositoryRoot });
  const artifactFindings = [];
  for (const directory of ARTIFACT_DIRECTORIES) {
    const path = resolve(repositoryRoot, directory);
    if (await exists(path)) {
      artifactFindings.push(...(await scanDirectory(path, { repositoryRoot })));
    }
  }

  const findings = [...sourceFindings, ...artifactFindings];
  if (findings.length > 0) {
    process.stderr.write(
      `Secret and artifact safety gate failed:\n${formatFindings(findings)}\nRotate the credential, remove it from history, and re-run the gate.\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    'Secret and artifact safety gates passed: the scanner detected its seeded credential without revealing it, and repository and retained artifact content are clean.\n',
  );
}

await main();
