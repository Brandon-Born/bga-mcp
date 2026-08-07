import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { integrityDigest, sealEvidence, type Evidence, type Manifest } from './lib/evidence.js';
import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';
import { scanText } from './lib/secret-scan.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const evidencePath = resolve(repositoryRoot, '.artifacts/verification-evidence.json');

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function validator(schema: object): (value: unknown) => string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  return (value) =>
    validate(value)
      ? []
      : (validate.errors ?? []).map(
          (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
        );
}

/**
 * Checks one evidence document.
 *
 * The four rules are the four ways this artifact could lie: it could be
 * malformed, it could omit a capability the server advertises, it could have
 * been edited after the run it describes, or it could carry a secret into a
 * published artifact.
 */
function check(
  evidence: unknown,
  manifest: Manifest,
  validate: (value: unknown) => string[],
): GateReport {
  const report = new GateReport();

  for (const error of validate(evidence)) {
    report.require(false, `Evidence does not match its schema: ${error}`);
  }
  if (report.failed) {
    // Every rule below reads fields the schema guarantees, so a malformed
    // document is reported as malformed rather than as a pile of type errors.
    return report;
  }

  const document = evidence as Evidence;

  const advertised = [
    ...manifest.transports.map((entry) => entry.name),
    ...manifest.capabilities.tools.map((entry) => entry.name),
    ...manifest.capabilities.resources.map((entry) => entry.name),
    ...manifest.capabilities.prompts.map((entry) => entry.name),
    ...manifest.adapters.map((entry) => entry.name),
  ].sort();
  const recorded = document.capabilities.map((entry) => entry.name).sort();
  report.require(
    JSON.stringify(advertised) === JSON.stringify(recorded),
    `Evidence does not cover every advertised capability (manifest: ${advertised.join(', ')}; evidence: ${recorded.join(', ')})`,
  );

  const requiredById = new Map<string, readonly string[]>([
    ...manifest.transports.map(
      (entry) => [entry.name, entry.requiredScenarios] as [string, readonly string[]],
    ),
    ...manifest.capabilities.tools.map(
      (entry) => [entry.name, entry.requiredScenarios] as [string, readonly string[]],
    ),
    ...manifest.capabilities.resources.map(
      (entry) => [entry.name, entry.requiredScenarios] as [string, readonly string[]],
    ),
    ...manifest.capabilities.prompts.map(
      (entry) => [entry.name, entry.requiredScenarios] as [string, readonly string[]],
    ),
    ...manifest.adapters.map(
      (entry) => [entry.name, entry.requiredScenarios] as [string, readonly string[]],
    ),
  ]);

  for (const capability of document.capabilities) {
    const required = [...(requiredById.get(capability.name) ?? [])].sort();
    const present = capability.scenarios.map((scenario) => scenario.id).sort();
    report.require(
      JSON.stringify(required) === JSON.stringify(present),
      `${capability.name} evidence does not record every required scenario (manifest: ${required.join(', ')}; evidence: ${present.join(', ')})`,
    );
    for (const scenario of capability.scenarios) {
      report.require(
        scenario.status === 'passed',
        `${capability.name} scenario ${scenario.id} is ${scenario.status}, so the capability has no current evidence`,
      );
    }
    // A capability may not claim a stronger status than its scenarios support.
    report.require(
      !(capability.stability === 'verified' && capability.status !== 'passed'),
      `${capability.name} is advertised as verified but its evidence status is ${capability.status}`,
    );
  }

  report.require(
    document.tests.failed === 0,
    `Evidence records ${String(document.tests.failed)} failed test(s), so it is not evidence of a passing run`,
  );
  report.require(
    document.protocol.conformance.status === 'passed',
    `Evidence records conformance as ${document.protocol.conformance.status}`,
  );

  const digest = integrityDigest(document);
  report.require(
    document.integrity?.value === digest,
    `Evidence integrity digest does not match its content, so the artifact was changed after the run it describes (recorded ${document.integrity?.value ?? 'nothing'}, computed ${digest})`,
  );

  const findings = scanText(JSON.stringify(document, null, 2), 'verification-evidence.json');
  for (const finding of findings) {
    report.require(
      false,
      `Evidence carries a secret (${finding.rule}) at line ${String(finding.line)}: ${finding.preview}`,
    );
  }

  return report;
}

/** A minimal document that passes every rule, used to seed each failure from. */
function soundEvidence(manifest: Manifest): Evidence {
  return sealEvidence({
    schemaVersion: 1,
    generatedAt: '2026-08-07T00:00:00.000Z',
    source: { commit: '0'.repeat(40), clean: true },
    package: { name: 'bga-mcp', version: '0.0.0-seed', lockDigest: `sha256:${'0'.repeat(64)}` },
    environment: {
      node: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      packageManager: 'pnpm@11.15.1',
      ci: true,
    },
    protocol: {
      supportedVersions: ['2025-11-25'],
      transports: ['stdio'],
      conformance: {
        status: 'passed',
        runs: [
          { candidate: 'candidate-2025-11-25', scenario: 'server-initialize', status: 'passed' },
        ],
      },
    },
    capabilities: [
      ...manifest.transports.map((entry) => ({ kind: 'transport' as const, ...entry })),
      ...manifest.capabilities.tools.map((entry) => ({ kind: 'tool' as const, ...entry })),
      ...manifest.capabilities.resources.map((entry) => ({ kind: 'resource' as const, ...entry })),
      ...manifest.capabilities.prompts.map((entry) => ({ kind: 'prompt' as const, ...entry })),
      ...manifest.adapters.map((entry) => ({ kind: 'adapter' as const, ...entry })),
    ].map((entry) => ({
      kind: entry.kind,
      name: entry.name,
      stability: entry.stability,
      status: 'passed' as const,
      scenarios: entry.requiredScenarios.map((id) => ({
        id,
        status: 'passed' as const,
        tests: [
          { file: 'tests/e2e/seed.test.ts', title: `[${id}] seeded`, status: 'passed' as const },
        ],
      })),
    })),
    scenarios: { required: 0, passed: 0, failed: 0, missing: 0 },
    tests: { files: 1, total: 1, passed: 1, failed: 0, skipped: 0 },
  });
}

async function main(): Promise<void> {
  const schema = await loadJson<object>(resolve(repositoryRoot, 'config/evidence.schema.json'));
  const manifest = await loadJson<Manifest>(resolve(repositoryRoot, 'config/capabilities.json'));
  const validate = validator(schema);
  const sound = soundEvidence(manifest);

  // Each seeded defect is one of the four ways the artifact could lie.
  expectSeededFailure('evidence schema', check({ ...sound, schemaVersion: 2 }, manifest, validate));
  expectSeededFailure(
    'evidence manifest coverage',
    check({ ...sound, capabilities: sound.capabilities.slice(1) }, manifest, validate),
  );
  expectSeededFailure(
    'evidence scenario coverage',
    check(
      sealEvidence({
        ...sound,
        capabilities: sound.capabilities.map((capability, position) =>
          position === 0
            ? {
                ...capability,
                status: 'missing' as const,
                scenarios: capability.scenarios.map((scenario, index) =>
                  index === 0 ? { ...scenario, status: 'missing' as const, tests: [] } : scenario,
                ),
              }
            : capability,
        ),
      }),
      manifest,
      validate,
    ),
  );
  expectSeededFailure(
    'evidence tamper',
    check({ ...sound, generatedAt: '2026-01-01T00:00:00.000Z' }, manifest, validate),
  );
  expectSeededFailure(
    'evidence redaction',
    check(
      sealEvidence({
        ...sound,
        capabilities: sound.capabilities.map((capability, position) =>
          position === 0
            ? {
                ...capability,
                scenarios: capability.scenarios.map((scenario) => ({
                  ...scenario,
                  tests: scenario.tests.map((test) => ({
                    ...test,
                    // A seeded credential shaped like one a test title could leak.
                    // Split so the literal never appears whole in the source.
                    title: [test.title, ['AKIA', 'A1B2C3D4E5F6G7H8'].join('')].join(' '),
                  })),
                })),
              }
            : capability,
        ),
      }),
      manifest,
      validate,
    ),
  );

  // The gate proved it can fail; now it reports on the real artifact.
  let evidence: unknown;
  try {
    evidence = await loadJson<unknown>(evidencePath);
  } catch {
    process.stderr.write(
      `No evidence at ${evidencePath}. Run \`pnpm evidence\` after \`pnpm check\` produces the results it records.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const report = check(evidence, manifest, validate);
  if (report.failed) {
    reportOrExit('verification evidence', report, '');
    return;
  }

  // Only a document that passed every rule is described back, so the summary
  // cannot narrate fields a malformed artifact does not have.
  const document = evidence as Evidence;
  reportOrExit(
    'verification evidence',
    report,
    'Verification evidence is complete and its gate detects seeded defects: ' +
      `${String(document.capabilities.length)} capabilities and ${String(document.scenarios.required)} required scenarios recorded ` +
      `from commit ${document.source.commit.slice(0, 7)} on Node ${document.environment.node}.`,
  );
}

await main();
