import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import {
  claimsEvidence,
  conformanceStatus,
  integrityDigest,
  manifestEntries,
  sealEvidence,
  type CapabilityEvidence,
  type ClaimSource,
  type Evidence,
  type Manifest,
} from './lib/evidence.js';
import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';
import { scanText } from './lib/secret-scan.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const evidencePath = resolve(repositoryRoot, '.artifacts/verification-evidence.json');
const recordsRoot = resolve(repositoryRoot, 'docs/verification');

/** The marker a record carries when it describes a run that is over. */
const HISTORICAL = '> Historical evidence only.';
/** The block a record carries when it claims to describe the current run. */
const CURRENT_RUN = /```verification-record\n([\s\S]*?)```/u;

interface Sources {
  readonly manifest: Manifest;
  readonly claims: readonly { readonly kind: string; readonly id: string }[];
}

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
 * The rules are the ways this artifact could lie. It could be malformed, omit
 * a capability the server advertises, or be edited after the run it describes.
 * It could carry a secret. And — the reason this gate was rewritten — it could
 * be true in every part while adding up to a claim nothing supports: a
 * capability called verified on a protocol version no conformance run covers,
 * or with CI evidence for a different commit, or a claim whose scenarios never
 * ran, or a scenario proven against a different build of the package.
 */
function check(evidence: unknown, sources: Sources, validate: (value: unknown) => string[]) {
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
  const { manifest } = sources;
  const entries = manifestEntries(manifest);

  const key = (entry: { kind: string; name: string }): string => `${entry.kind}:${entry.name}`;
  const advertised = entries.map(key).sort();
  const recorded = document.capabilities.map(key).sort();
  report.require(
    JSON.stringify(advertised) === JSON.stringify(recorded),
    `Evidence does not cover every advertised capability (manifest: ${advertised.join(', ')}; evidence: ${recorded.join(', ')})`,
  );

  const manifestById = new Map(entries.map((entry) => [key(entry), entry]));
  const conformanceByVersion = new Map(
    document.protocol.conformance.coverage.map((entry) => [entry.version, entry.status]),
  );

  for (const capability of document.capabilities) {
    const source = manifestById.get(key(capability));
    const required = [...(source?.requiredScenarios ?? [])].sort();
    const present = capability.scenarios.map((scenario) => scenario.id).sort();
    report.require(
      JSON.stringify(required) === JSON.stringify(present),
      `${capability.name} evidence does not record every required scenario (manifest: ${required.join(', ')}; evidence: ${present.join(', ')})`,
    );
    for (const [field, actual, expected] of [
      ['supportedLayouts', capability.supportedLayouts, source?.supportedLayouts ?? []],
      ['environments', capability.environments, source?.environments ?? []],
      ['protocolVersions', capability.protocolVersions, source?.protocolVersions ?? []],
    ] as const) {
      const retained = [...actual].sort();
      const declared = [...expected].sort();
      report.require(
        JSON.stringify(retained) === JSON.stringify(declared),
        `${capability.name} evidence ${field} differ from the manifest (manifest: ${declared.join(', ') || 'none'}; evidence: ${retained.join(', ') || 'none'})`,
      );
    }
    report.require(
      capability.stability === source?.stability,
      `${capability.name} evidence stability ${capability.stability} differs from manifest stability ${source?.stability ?? 'missing'}`,
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

    if (capability.stability !== 'verified') {
      continue;
    }
    // Verified is a claim about every prerequisite, not only the scenarios.
    for (const version of capability.protocolVersions) {
      const status = conformanceByVersion.get(version) ?? 'not-run';
      report.require(
        status === 'passed',
        `${capability.name} is advertised as verified on protocol ${version}, whose official conformance is ${status}`,
      );
    }
    report.require(
      capability.ci.conclusion === 'success',
      `${capability.name} is advertised as verified but its CI evidence ${capability.ci.id} concluded ${capability.ci.conclusion}`,
    );
    // "The most recent passing evidence produced by CI": a run of this commit,
    // or of a commit this one is built on. A run that is not in this history
    // at all is evidence of some other line of work.
    report.require(
      capability.ci.covers === 'this-commit' || capability.ci.covers === 'ancestor',
      `${capability.name} is advertised as verified but its CI evidence ${capability.ci.id} ${describeCoverage(capability.ci.covers)}`,
    );
  }

  // Claims are retained results, not source-text inferences: every claim that
  // names scenarios appears here with what those scenarios actually did.
  const claimed = new Set(document.claims.map((claim) => `${claim.kind}:${claim.id}`));
  for (const source of sources.claims) {
    report.require(
      claimed.has(`${source.kind}:${source.id}`),
      `${source.kind} ${source.id} names scenarios but the evidence retains no result for it`,
    );
  }
  for (const claim of document.claims) {
    report.require(
      claim.status === 'passed',
      `${claim.kind} ${claim.id} is declared ${claim.declared} but its retained scenario results are ${claim.status}`,
    );
  }

  report.require(
    document.tests.failed === 0,
    `Evidence records ${String(document.tests.failed)} failed test(s), so it is not evidence of a passing run`,
  );

  // Every claimed version appears with its own result, and the overall word may
  // not be stronger than those results. Conformance itself is allowed to be
  // partial; what it may not do is stand behind a verified capability, which
  // the per-capability rule above enforces.
  const { conformance } = document.protocol;
  const covered = conformance.coverage.map((entry) => entry.version).sort();
  const claimedVersions = [...document.protocol.supportedVersions].sort();
  report.require(
    JSON.stringify(covered) === JSON.stringify(claimedVersions),
    `Conformance coverage does not account for every claimed protocol version (claimed: ${claimedVersions.join(', ')}; covered: ${covered.join(', ')})`,
  );
  report.require(conformance.status !== 'failed', 'Evidence records a failed conformance run');
  report.require(
    conformance.status === conformanceStatus(conformance.coverage),
    `Conformance is recorded as ${conformance.status}, but its per-version results say ${conformanceStatus(conformance.coverage)}`,
  );

  // A packaged scenario proves something about the artifact it installed.
  for (const run of document.package.artifactRuns ?? []) {
    report.require(
      run.digest === document.package.artifactDigest,
      `The ${run.suite} suite ran against ${run.digest}, which is not the artifact this evidence describes (${document.package.artifactDigest ?? 'none recorded'})`,
    );
  }
  const packaged = document.capabilities.some((capability) =>
    capability.scenarios.some((scenario) =>
      scenario.tests.some((test) => test.file.startsWith('tests/e2e/')),
    ),
  );
  report.require(
    !packaged || document.package.artifactDigest !== undefined,
    'Packaged scenarios ran but the evidence does not identify the artifact they exercised',
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

/**
 * Checks the human records against the run they describe.
 *
 * Each record says what it is. One marked historical describes a run that is
 * over and is left alone. A review records a decision about a boundary or an
 * artifact, and there is no run to check it against. A run record states the
 * counts it belongs to, and those are compared with what actually happened —
 * which is the only thing that stops a document that calls itself current from
 * drifting behind the repository it describes.
 */
export function checkRecords(
  records: readonly { readonly name: string; readonly text: string }[],
  document: Evidence,
  commands: ReadonlySet<string>,
): GateReport {
  const report = new GateReport();
  const actual = {
    capabilities: document.capabilities.length,
    scenarios: document.scenarios.required,
    claims: document.claims.length,
    tests: document.tests.total,
  };

  for (const record of records) {
    if (record.text.includes(HISTORICAL)) {
      continue;
    }
    const block = CURRENT_RUN.exec(record.text);
    if (block === null) {
      report.require(
        false,
        `${record.name} is neither marked historical nor carries a verification-record block, so nothing says what it describes or checks it`,
      );
      continue;
    }

    let stated: Record<string, unknown>;
    try {
      stated = JSON.parse(block[1] ?? '{}') as Record<string, unknown>;
    } catch {
      report.require(false, `${record.name} has an unreadable verification-record block`);
      continue;
    }

    if (stated.kind === 'review') {
      report.require(
        typeof stated.scope === 'string' && stated.scope.length > 0,
        `${record.name} declares itself a review but names no scope`,
      );
      continue;
    }

    report.require(
      stated.kind === 'run',
      `${record.name} declares kind ${JSON.stringify(stated.kind)}, which is neither run nor review`,
    );
    for (const [key, value] of Object.entries(actual)) {
      report.require(
        stated[key] === value,
        `${record.name} records ${key} as ${JSON.stringify(stated[key])}, but this run has ${JSON.stringify(value)}`,
      );
    }
    // A record that tells a reader to run a command the repository no longer
    // has is as stale as one with the wrong counts.
    for (const command of record.text.matchAll(/`pnpm ([a-z][\w:-]*)/gu)) {
      const name = command[1] ?? '';
      report.require(
        commands.has(name),
        `${record.name} names \`pnpm ${name}\`, which this repository does not define`,
      );
    }
  }

  return report;
}

/**
 * Says what is wrong with a CI reference, in the terms of what happened.
 *
 * A run whose commit this checkout does not hold and a run of a commit that
 * belongs to another line of work fail the same rule for opposite reasons, and
 * only one of them is fixed by looking at the code.
 */
function describeCoverage(covers: CapabilityEvidence['ci']['covers']): string {
  if (covers === 'stale') {
    return 'is a run of a commit outside this history';
  }
  if (covers === 'unknown') {
    return 'cannot be placed in this history — the checkout does not hold that commit, so fetch the history rather than trusting this';
  }
  return 'is not recorded in the manifest';
}

/** A minimal document that passes every rule, used to seed each failure from. */
function soundEvidence(manifest: Manifest): Evidence {
  return sealEvidence({
    schemaVersion: 1,
    generatedAt: '2026-08-07T00:00:00.000Z',
    source: { commit: '0'.repeat(40), clean: true },
    package: {
      name: 'bga-mcp',
      version: '0.0.0-seed',
      lockDigest: `sha256:${'0'.repeat(64)}`,
      artifactDigest: `sha256:${'1'.repeat(64)}`,
      artifactRuns: [{ suite: 'seed', digest: `sha256:${'1'.repeat(64)}` }],
    },
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
        coverage: [{ version: '2025-11-25', status: 'passed', runs: 1 }],
        runs: [
          { candidate: 'candidate-2025-11-25', scenario: 'server-initialize', status: 'passed' },
        ],
      },
    },
    ci: [
      {
        id: 'ci-1',
        workflow: 'CI',
        url: 'https://github.com/example/example/actions/runs/1',
        commit: '0'.repeat(40),
        completedAt: '2026-08-07T00:00:00Z',
        conclusion: 'success',
        jobs: ['ubuntu-latest / Node 22'],
      },
    ],
    capabilities: manifestEntries(manifest).map((entry) => ({
      kind: entry.kind,
      name: entry.name,
      stability: entry.stability,
      status: 'passed' as const,
      supportedLayouts: [...(entry.supportedLayouts ?? [])],
      environments: [...(entry.environments ?? [])],
      protocolVersions: [...(entry.protocolVersions ?? [])],
      ci: { id: 'ci-1', conclusion: 'success', covers: 'this-commit' as const },
      scenarios: entry.requiredScenarios.map((id) => ({
        id,
        status: 'passed' as const,
        tests: [
          { file: 'tests/e2e/seed.test.ts', title: `[${id}] seeded`, status: 'passed' as const },
        ],
      })),
    })),
    claims: [
      {
        kind: 'compatibility',
        id: 'CLAIM-SEED',
        declared: 'supported',
        status: 'passed',
        scenarios: [
          {
            id: 'E2E-SEED',
            status: 'passed',
            tests: [
              { file: 'tests/e2e/seed.test.ts', title: '[E2E-SEED] seeded', status: 'passed' },
            ],
          },
        ],
      },
    ],
    scenarios: { required: 0, passed: 0, failed: 0, missing: 0 },
    tests: { files: 1, total: 1, passed: 1, failed: 0, skipped: 0 },
  });
}

/** The claims that name scenarios, from the three sources that declare them. */
async function readClaimSources(): Promise<Sources['claims']> {
  const compatibility = await loadJson<{ claims: ClaimSource[] }>(
    resolve(repositoryRoot, 'config/compatibility.json'),
  );
  const rules = await loadJson<{ checks: ClaimSource[] }>(
    resolve(repositoryRoot, 'config/rule-catalog.json'),
  );
  const threatModel = await loadJson<{ mitigations: ClaimSource[] }>(
    resolve(repositoryRoot, 'config/threat-model.json'),
  );

  return [
    ...compatibility.claims.map((claim) => ({ kind: 'compatibility', ...claim })),
    ...rules.checks.map((check) => ({ kind: 'rule', ...check })),
    ...threatModel.mitigations.map((mitigation) => ({ kind: 'mitigation', ...mitigation })),
  ]
    .filter((entry) => claimsEvidence(entry))
    .map((entry) => ({ kind: entry.kind, id: entry.id }));
}

function proveGateDetectsSeededDefects(
  sources: Sources,
  validate: (value: unknown) => string[],
): void {
  const sound = soundEvidence(sources.manifest);
  const seeded: Sources = { manifest: sources.manifest, claims: [] };
  const verified = (evidence: Evidence): Evidence =>
    sealEvidence({
      ...evidence,
      capabilities: evidence.capabilities.map((capability, position) =>
        position === 0 ? { ...capability, stability: 'verified' as const } : capability,
      ),
    });

  expectSeededFailure('evidence schema', check({ ...sound, schemaVersion: 2 }, seeded, validate));
  expectSeededFailure(
    'evidence manifest coverage',
    check({ ...sound, capabilities: sound.capabilities.slice(1) }, seeded, validate),
  );
  const projectPosition = sound.capabilities.findIndex(
    (capability) => capability.supportedLayouts.length > 0,
  );
  if (projectPosition < 0) {
    throw new Error('The evidence gate needs a project capability to seed compatibility drift');
  }
  expectSeededFailure(
    'evidence supported-layout drift',
    check(
      sealEvidence({
        ...sound,
        capabilities: sound.capabilities.map((capability, position) =>
          position === projectPosition
            ? { ...capability, supportedLayouts: capability.supportedLayouts.slice(1) }
            : capability,
        ),
      }),
      seeded,
      validate,
    ),
  );
  const environmentPosition = sound.capabilities.findIndex(
    (capability) => capability.environments.length > 0,
  );
  if (environmentPosition < 0) {
    throw new Error('The evidence gate needs a capability environment to seed compatibility drift');
  }
  expectSeededFailure(
    'evidence environment drift',
    check(
      sealEvidence({
        ...sound,
        capabilities: sound.capabilities.map((capability, position) =>
          position === environmentPosition
            ? { ...capability, environments: ['remote'] }
            : capability,
        ),
      }),
      seeded,
      validate,
    ),
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
      seeded,
      validate,
    ),
  );
  expectSeededFailure(
    'evidence conformance overstatement',
    check(
      sealEvidence({
        ...sound,
        protocol: {
          ...sound.protocol,
          supportedVersions: ['2025-11-25', '2026-07-28'],
          conformance: {
            // The exact overstatement this rule exists to catch: a second
            // claimed version nobody exercised, still called `passed`.
            ...sound.protocol.conformance,
            status: 'passed',
            coverage: [
              { version: '2025-11-25', status: 'passed', runs: 1 },
              { version: '2026-07-28', status: 'not-run', runs: 0 },
            ],
          },
        },
      }),
      seeded,
      validate,
    ),
  );
  // A verified capability standing on conformance that does not cover the
  // version it claims. This is the compositional rule: every part below is
  // true, and the conclusion still is not.
  expectSeededFailure(
    'verified capability without applicable conformance',
    check(
      verified(
        sealEvidence({
          ...sound,
          protocol: {
            ...sound.protocol,
            supportedVersions: ['2025-11-25', '2026-07-28'],
            conformance: {
              ...sound.protocol.conformance,
              status: 'partial',
              coverage: [
                { version: '2025-11-25', status: 'passed', runs: 1 },
                {
                  version: '2026-07-28',
                  status: 'not-applicable',
                  runs: 0,
                  reason: 'the suite cannot measure it',
                },
              ],
            },
          },
          capabilities: sound.capabilities.map((capability) => ({
            ...capability,
            protocolVersions: ['2025-11-25', '2026-07-28'],
          })),
        }),
      ),
      seeded,
      validate,
    ),
  );
  expectSeededFailure(
    'verified capability with stale CI evidence',
    check(
      verified(
        sealEvidence({
          ...sound,
          capabilities: sound.capabilities.map((capability) => ({
            ...capability,
            ci: { ...capability.ci, covers: 'stale' as const },
          })),
        }),
      ),
      seeded,
      validate,
    ),
  );
  expectSeededFailure(
    'claim without a retained result',
    check(
      sound,
      { ...seeded, claims: [{ kind: 'compatibility', id: 'CLAIM-UNRETAINED' }] },
      validate,
    ),
  );
  expectSeededFailure(
    'claim whose scenarios did not run',
    check(
      sealEvidence({
        ...sound,
        claims: sound.claims.map((claim) => ({
          ...claim,
          status: 'missing' as const,
          scenarios: claim.scenarios.map((scenario) => ({
            ...scenario,
            status: 'missing' as const,
            tests: [],
          })),
        })),
      }),
      seeded,
      validate,
    ),
  );
  expectSeededFailure(
    'scenario proven against a different artifact',
    check(
      sealEvidence({
        ...sound,
        package: {
          ...sound.package,
          artifactRuns: [{ suite: 'seed', digest: `sha256:${'2'.repeat(64)}` }],
        },
      }),
      seeded,
      validate,
    ),
  );
  expectSeededFailure(
    'evidence tamper',
    check({ ...sound, generatedAt: '2026-01-01T00:00:00.000Z' }, seeded, validate),
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
      seeded,
      validate,
    ),
  );

  // A human record that says it is current, and is not.
  const commands = new Set(['check']);
  expectSeededFailure(
    'stale verification record',
    checkRecords(
      [
        {
          name: 'seeded-record.md',
          text: '```verification-record\n{"kind":"run","capabilities":1,"scenarios":1,"claims":1,"tests":1}\n```',
        },
      ],
      sound,
      commands,
    ),
  );
  expectSeededFailure(
    'unchecked verification record',
    checkRecords(
      [{ name: 'seeded-record.md', text: 'Recorded: today. Everything passed.' }],
      sound,
      commands,
    ),
  );
  expectSeededFailure(
    'review without a scope',
    checkRecords(
      [{ name: 'seeded-review.md', text: '```verification-record\n{"kind":"review"}\n```' }],
      sound,
      commands,
    ),
  );
  expectSeededFailure(
    'record naming a command that no longer exists',
    checkRecords(
      [
        {
          name: 'seeded-record.md',
          text: '```verification-record\n{"kind":"run","capabilities":0,"scenarios":0,"claims":1,"tests":1}\n```\nRun `pnpm verify:imaginary` to reproduce.',
        },
      ],
      sound,
      commands,
    ),
  );
}

async function main(): Promise<void> {
  const schema = await loadJson<object>(resolve(repositoryRoot, 'config/evidence.schema.json'));
  const sources: Sources = {
    manifest: await loadJson<Manifest>(resolve(repositoryRoot, 'config/capabilities.json')),
    claims: await readClaimSources(),
  };
  const validate = validator(schema);

  proveGateDetectsSeededDefects(sources, validate);

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

  const report = check(evidence, sources, validate);
  if (report.failed) {
    reportOrExit('verification evidence', report, '');
    return;
  }

  const document = evidence as Evidence;
  const records = await Promise.all(
    (await readdir(recordsRoot))
      .filter((name) => name.endsWith('.md'))
      .map(async (name) => ({ name, text: await readFile(resolve(recordsRoot, name), 'utf8') })),
  );
  const packageMetadata = await loadJson<{ scripts: Record<string, string> }>(
    resolve(repositoryRoot, 'package.json'),
  );
  const recordReport = checkRecords(
    records,
    document,
    new Set(Object.keys(packageMetadata.scripts)),
  );
  for (const failure of recordReport.failures) {
    report.require(false, failure);
  }

  const current = records.filter((record) => !record.text.includes(HISTORICAL));
  const runRecords = current.filter((record) => record.text.includes('"kind": "run"')).length;
  reportOrExit(
    'verification evidence',
    report,
    'Verification evidence is complete and its gate detects seeded defects: ' +
      `${String(document.capabilities.length)} capabilities, ${String(document.claims.length)} retained claims, and ${String(document.scenarios.required)} required scenarios recorded ` +
      `from commit ${document.source.commit.slice(0, 7)} on Node ${document.environment.node} against package ${document.package.artifactDigest?.slice(0, 14) ?? 'unpacked'}, ` +
      `official conformance ${document.protocol.conformance.status} ` +
      `(${document.protocol.conformance.coverage
        .map((entry) => `${entry.version}: ${entry.status}`)
        .join(', ')}), ` +
      `${String(runRecords)} run record(s) checked against this run and ${String(current.length - runRecords)} review(s) scoped.`,
  );
}

await main();
