import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  buildCapabilityEvidence,
  indexScenarioResults,
  readConformance,
  sealEvidence,
  summarizeScenarios,
  type Evidence,
  type Manifest,
  type VitestReport,
} from './lib/evidence.js';
import { scanText } from './lib/secret-scan.js';

const run = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');
const resultsPath = resolve(repositoryRoot, '.artifacts/test-results.json');
const evidencePath = resolve(repositoryRoot, '.artifacts/verification-evidence.json');

async function git(...arguments_: string[]): Promise<string> {
  const { stdout } = await run('git', arguments_, { cwd: repositoryRoot });
  return stdout.trim();
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/**
 * Emits the verification evidence for the run that just happened.
 *
 * It records rather than re-runs: `pnpm check` produces the Vitest results and
 * the conformance output, and this reads them. Re-running the suites here would
 * mean the artifact described a different run from the one that gated the
 * change.
 */
async function main(): Promise<void> {
  let report: VitestReport;
  try {
    report = await loadJson<VitestReport>(resultsPath);
  } catch {
    process.stderr.write(
      `No test results at ${resultsPath}. Run \`pnpm test:coverage\` (or \`pnpm check\`) first; evidence records a run, it does not create one.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const manifest = await loadJson<Manifest>(resolve(repositoryRoot, 'config/capabilities.json'));
  const packageMetadata = await loadJson<{
    name: string;
    version: string;
    packageManager: string;
  }>(resolve(repositoryRoot, 'package.json'));
  const lock = await readFile(resolve(repositoryRoot, 'pnpm-lock.yaml'));

  const supportedVersions = [
    ...new Set(manifest.transports.flatMap((transport) => transport.protocolVersions)),
  ].sort();
  const index = indexScenarioResults(report, repositoryRoot);
  const capabilities = buildCapabilityEvidence(manifest, index);

  const evidence: Evidence = sealEvidence({
    $schema: '../config/evidence.schema.json',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      commit: await git('rev-parse', 'HEAD'),
      clean: (await git('status', '--porcelain')).length === 0,
    },
    package: {
      name: packageMetadata.name,
      version: packageMetadata.version,
      lockDigest: `sha256:${createHash('sha256').update(lock).digest('hex')}`,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      packageManager: packageMetadata.packageManager,
      ci: process.env.CI === 'true',
      ...(process.env.RUNNER_IMAGE === undefined ? {} : { runner: process.env.RUNNER_IMAGE }),
    },
    protocol: {
      supportedVersions,
      transports: manifest.transports.map((transport) => transport.name).sort(),
      conformance: await readConformance(
        resolve(repositoryRoot, 'conformance-results'),
        supportedVersions,
      ),
    },
    capabilities,
    scenarios: summarizeScenarios(capabilities),
    tests: {
      files: report.testResults?.length ?? 0,
      total: report.numTotalTests ?? 0,
      passed: report.numPassedTests ?? 0,
      failed: report.numFailedTests ?? 0,
      skipped: report.numPendingTests ?? 0,
    },
  });

  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

  // The artifact is published, so it is scanned before it is written rather
  // than after. A test title or file path is the plausible carrier here.
  const findings = scanText(serialized, '.artifacts/verification-evidence.json');
  if (findings.length > 0) {
    process.stderr.write(
      `Refusing to write evidence: ${String(findings.length)} secret finding(s).\n${findings
        .map((finding) => `- line ${String(finding.line)}: ${finding.rule} ${finding.preview}`)
        .join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(resolve(repositoryRoot, '.artifacts'), { recursive: true });
  await writeFile(evidencePath, serialized);

  const { scenarios, tests } = evidence;
  process.stdout.write(
    `Verification evidence written to .artifacts/verification-evidence.json: ` +
      `${String(capabilities.length)} capabilities, ${String(scenarios.required)} required scenarios ` +
      `(${String(scenarios.passed)} passed, ${String(scenarios.failed)} failed, ${String(scenarios.missing)} missing), ` +
      `${String(tests.passed)}/${String(tests.total)} tests passed, official conformance ${evidence.protocol.conformance.status} ` +
      `(${evidence.protocol.conformance.coverage
        .map((entry) => `${entry.version}: ${entry.status}`)
        .join(', ')}).\n`,
  );
}

await main();
