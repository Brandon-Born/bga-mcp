import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';
import { collectDeclaredScenarios } from './lib/scenarios.js';

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

function verify(requirements: Requirements, declared: Map<string, string[]>): GateReport {
  const report = new GateReport();
  for (const [scenario, owners] of requirements.required) {
    report.require(
      declared.has(scenario),
      `${scenario} is required by ${owners.join(', ')} but no test declares it`,
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
  declared: Map<string, string[]>,
): void {
  const missing: Requirements = {
    required: new Map([...requirements.required, ['E2E-NEVER-WRITTEN', ['seeded owner']]]),
    reserved: requirements.reserved,
  };
  expectSeededFailure('missing scenario', verify(missing, declared));

  const orphaned = new Map([...declared, ['E2E-ORPHANED-DECLARATION', ['seeded.test.ts']]]);
  expectSeededFailure('orphan scenario', verify(requirements, orphaned));
}

async function main(): Promise<void> {
  const requirements = collectRequirements(
    await loadJson<Manifest>('config/capabilities.json'),
    await loadJson<ThreatModel>('config/threat-model.json'),
    await loadJson<Compatibility>('config/compatibility.json'),
    await loadJson<RuleCatalog>('config/rule-catalog.json'),
  );
  const declared = await collectDeclaredScenarios(testsRoot);

  proveGateDetectsSeededDefects(requirements, declared);

  reportOrExit(
    'Scenario coverage',
    verify(requirements, declared),
    `Scenario coverage is complete and its gate detects seeded defects: ${String(requirements.required.size)} required scenarios are declared by executable tests, ${String(requirements.reserved.size)} are reserved for planned work.`,
  );
}

await main();
