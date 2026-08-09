import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';
import { collectDeclarations, type ScenarioDeclaration } from './lib/scenarios.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const testsRoot = resolve(repositoryRoot, 'tests');

interface Manifest {
  readonly transports: readonly {
    readonly name: string;
    readonly requiredScenarios: readonly string[];
  }[];
  readonly capabilities: Record<
    'tools' | 'resources' | 'prompts',
    readonly { readonly name: string; readonly requiredScenarios: readonly string[] }[]
  >;
  readonly adapters: readonly {
    readonly name: string;
    readonly requiredScenarios: readonly string[];
  }[];
}

interface ThreatModel {
  readonly mitigations: readonly {
    readonly id: string;
    readonly status: 'planned' | 'implemented' | 'verified';
    readonly scenarios?: readonly string[];
  }[];
}

interface RuleCatalog {
  readonly checks: readonly { readonly id: string; readonly scenarios?: readonly string[] }[];
}

interface Compatibility {
  readonly claims: readonly { readonly id: string; readonly scenarios?: readonly string[] }[];
}

interface Requirements {
  /** Scenarios that must already exist as executable tests, mapped to their owners. */
  readonly required: Map<string, string[]>;
  /** Scenarios reserved by planned work. They may not exist yet. */
  readonly reserved: Set<string>;
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function collectRequirements(
  manifest: Manifest,
  model: ThreatModel,
  compatibility: Compatibility,
  catalog: RuleCatalog,
): Requirements {
  const required = new Map<string, string[]>();
  const reserved = new Set<string>();

  const add = (owner: string, scenarios: readonly string[]): void => {
    for (const scenario of scenarios) {
      required.set(scenario, [...(required.get(scenario) ?? []), owner]);
    }
  };

  for (const transport of manifest.transports) {
    add(`transport ${transport.name}`, transport.requiredScenarios);
  }
  for (const kind of ['tools', 'resources', 'prompts'] as const) {
    for (const capability of manifest.capabilities[kind]) {
      add(`${kind} ${capability.name}`, capability.requiredScenarios);
    }
  }
  for (const adapter of manifest.adapters) {
    add(`adapter ${adapter.name}`, adapter.requiredScenarios);
  }
  for (const mitigation of model.mitigations) {
    if (mitigation.status === 'planned') {
      for (const scenario of mitigation.scenarios ?? []) {
        reserved.add(scenario);
      }
      continue;
    }
    add(`mitigation ${mitigation.id}`, mitigation.scenarios ?? []);
  }
  for (const claim of compatibility.claims) {
    add(`compatibility claim ${claim.id}`, claim.scenarios ?? []);
  }
  for (const check of catalog.checks) {
    add(`rule catalog check ${check.id}`, check.scenarios ?? []);
  }

  return { required, reserved };
}

/** Groups the declarations that can actually run, by identifier. */
function runnable(declarations: readonly ScenarioDeclaration[]): Map<string, string[]> {
  const declared = new Map<string, string[]>();
  for (const declaration of declarations) {
    if (declaration.runnable) {
      declared.set(declaration.id, [...(declared.get(declaration.id) ?? []), declaration.file]);
    }
  }
  return declared;
}

function verify(
  requirements: Requirements,
  declarations: readonly ScenarioDeclaration[],
): GateReport {
  const report = new GateReport();
  const declared = runnable(declarations);

  for (const [scenario, owners] of requirements.required) {
    // An identifier that appears only in a skipped test, or only in data, is
    // not evidence. Saying which of the two it is turns the failure into a fix.
    const inert = declarations.find(
      (declaration) => declaration.id === scenario && !declaration.runnable,
    );
    report.require(
      declared.has(scenario),
      inert === undefined
        ? `${scenario} is required by ${owners.join(', ')} but no runnable test declares it`
        : `${scenario} is required by ${owners.join(', ')} but ${inert.file} ${inert.reason ?? 'cannot run it'}, so it proves nothing`,
    );
    report.require(
      !requirements.reserved.has(scenario),
      `${scenario} is both required and reserved for planned work`,
    );
  }

  for (const [scenario, files] of declared) {
    report.require(
      requirements.required.has(scenario),
      `${scenario} is declared in ${files.join(', ')} but no manifest, threat-model, or compatibility entry requires it`,
    );
  }
  return report;
}

function proveGateDetectsSeededDefects(
  requirements: Requirements,
  declarations: readonly ScenarioDeclaration[],
): void {
  const missing: Requirements = {
    required: new Map([...requirements.required, ['E2E-NEVER-WRITTEN', ['seeded owner']]]),
    reserved: requirements.reserved,
  };
  expectSeededFailure('missing scenario', verify(missing, declarations));

  const orphaned: ScenarioDeclaration[] = [
    ...declarations,
    { id: 'E2E-ORPHANED-DECLARATION', file: 'seeded.test.ts', runnable: true },
  ];
  expectSeededFailure('orphan scenario', verify(requirements, orphaned));

  // A required scenario whose only declaration cannot run must fail as loudly
  // as one with no declaration at all.
  const skipped: Requirements = {
    required: new Map([...requirements.required, ['E2E-SEEDED-SKIPPED', ['seeded owner']]]),
    reserved: requirements.reserved,
  };
  expectSeededFailure(
    'skipped declaration',
    verify(skipped, [
      ...declarations,
      {
        id: 'E2E-SEEDED-SKIPPED',
        file: 'seeded.test.ts',
        runnable: false,
        reason: 'declared inside it.skip',
      },
    ]),
  );
}

/**
 * Proves the reader only counts a declaration that is a runnable assertion.
 *
 * The identifier is just characters: before this gate, the same characters in
 * fixture data satisfied the existence check while nothing was asserted. Both
 * failing shapes are written to a temporary tree and read back.
 */
async function proveReaderRejectsNonAssertions(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'bga-mcp-scenarios-'));
  try {
    await writeFile(
      join(root, 'data.ts'),
      [
        "export const rows = ['[E2E-SEEDED-DATA-ONLY] looks like a declaration'];",
        "// it('[E2E-SEEDED-COMMENTED] commented out', () => {});",
        'const label = `[E2E-SEEDED-TEMPLATE-DATA] in a template`;',
      ].join('\n'),
    );
    await writeFile(
      join(root, 'skipped.test.ts'),
      [
        "it.skip('[E2E-SEEDED-SKIPPED-CASE] never runs', () => {});",
        "it.todo('[E2E-SEEDED-TODO-CASE] not written yet');",
        "describe.skip('suite', () => { it('[E2E-SEEDED-IN-SKIPPED-SUITE] cannot run', () => {}); });",
        "it('[E2E-SEEDED-RUNNABLE] runs', () => {});",
      ].join('\n'),
    );

    const declarations = await collectDeclarations(root);
    const byId = new Map(declarations.map((entry) => [entry.id, entry]));
    const report = new GateReport();

    for (const id of ['E2E-SEEDED-DATA-ONLY', 'E2E-SEEDED-COMMENTED', 'E2E-SEEDED-TEMPLATE-DATA']) {
      report.require(!byId.has(id), `${id} is not a test call, but the reader counted it`);
    }
    for (const id of [
      'E2E-SEEDED-SKIPPED-CASE',
      'E2E-SEEDED-TODO-CASE',
      'E2E-SEEDED-IN-SKIPPED-SUITE',
    ]) {
      report.require(
        byId.get(id)?.runnable === false,
        `${id} cannot run, but the reader treated it as evidence`,
      );
    }
    report.require(
      byId.get('E2E-SEEDED-RUNNABLE')?.runnable === true,
      'A runnable declaration was not recognized, so the reader rejects real evidence',
    );

    if (report.failed) {
      reportOrExit('Scenario declaration reader', report, '');
      process.exit(1);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const requirements = collectRequirements(
    await loadJson<Manifest>('config/capabilities.json'),
    await loadJson<ThreatModel>('config/threat-model.json'),
    await loadJson<Compatibility>('config/compatibility.json'),
    await loadJson<RuleCatalog>('config/rule-catalog.json'),
  );
  const declarations = await collectDeclarations(testsRoot);

  await proveReaderRejectsNonAssertions();
  proveGateDetectsSeededDefects(requirements, declarations);

  const inert = declarations.filter((declaration) => !declaration.runnable).length;
  reportOrExit(
    'Scenario coverage',
    verify(requirements, declarations),
    `Scenario coverage is complete and its gate detects seeded defects: ${String(requirements.required.size)} required scenarios are declared by runnable test assertions, ${String(requirements.reserved.size)} are reserved for planned work, and ${String(inert)} declaration(s) that cannot run were refused as evidence.`,
  );
}

await main();
