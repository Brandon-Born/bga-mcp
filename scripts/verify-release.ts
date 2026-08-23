import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { expectSeededFailure, reportOrExit } from './lib/gate.js';
import {
  buildReleaseCandidateManifest,
  type CandidateEvidence,
  type CapabilityManifest,
  type ReleaseInventory,
  verifyReleaseInventory,
} from './lib/release.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function soundEvidence(
  inventory: ReleaseInventory,
  manifest: CapabilityManifest,
  commit: string,
  artifactDigest: string,
): CandidateEvidence {
  const entries = [
    ...inventory.transports.map((name) => ({
      kind: 'transport' as const,
      entry: manifest.transports.find((candidate) => candidate.name === name),
    })),
    ...(['tools', 'resources', 'prompts'] as const).flatMap((collection) =>
      inventory.capabilities[collection].map((name) => ({
        kind:
          collection === 'tools'
            ? ('tool' as const)
            : collection === 'resources'
              ? ('resource' as const)
              : ('prompt' as const),
        entry: manifest.capabilities[collection].find((candidate) => candidate.name === name),
      })),
    ),
    ...inventory.adapters.map((name) => ({
      kind: 'adapter' as const,
      entry: manifest.adapters.find((candidate) => candidate.name === name),
    })),
  ];
  return {
    source: { commit, clean: true },
    package: {
      name: 'bga-mcp',
      version: '1.0.0-rc.1',
      lockDigest: `sha256:${'3'.repeat(64)}`,
      artifactDigest,
    },
    capabilities: entries.map(({ kind, entry }) => {
      if (entry === undefined) throw new Error('The sound evidence seed cannot resolve an entry');
      return {
        kind,
        name: entry.name,
        stability: entry.stability,
        status: 'passed',
        supportedLayouts: entry.supportedLayouts ?? [],
        environments: entry.environments ?? [],
        protocolVersions: entry.protocolVersions ?? [],
        scenarios: entry.requiredScenarios.map((id) => ({ id, status: 'passed' })),
      };
    }),
  };
}

function proveSeededFailures(inventory: ReleaseInventory, manifest: CapabilityManifest): void {
  const withExcludedTool: ReleaseInventory = {
    ...inventory,
    capabilities: {
      ...inventory.capabilities,
      tools: [...inventory.capabilities.tools, 'check_setup'],
    },
  };
  expectSeededFailure('excluded capability', verifyReleaseInventory(withExcludedTool, manifest));

  expectSeededFailure(
    'runtime exposure',
    verifyReleaseInventory(inventory, manifest, {
      tools: [...inventory.capabilities.tools, 'search_bga_docs'],
      resources: inventory.capabilities.resources,
      prompts: inventory.capabilities.prompts,
    }),
  );

  expectSeededFailure(
    'runtime omission',
    verifyReleaseInventory(inventory, manifest, {
      tools: inventory.capabilities.tools.filter((name) => name !== 'inspect_project'),
      resources: inventory.capabilities.resources,
      prompts: inventory.capabilities.prompts,
    }),
  );

  const candidateInventory = { ...inventory, status: 'verified' as const };
  const commit = '1'.repeat(40);
  const artifact = `sha256:${'2'.repeat(64)}`;
  const evidence = soundEvidence(candidateInventory, manifest, commit, artifact);
  buildReleaseCandidateManifest(
    candidateInventory,
    manifest,
    evidence,
    'v1.0.0-rc.1',
    commit,
    'bga-mcp-1.0.0-rc.1.tgz',
    artifact,
  );

  for (const [name, defective] of [
    ['stale evidence', { ...evidence, source: { commit: '0'.repeat(40), clean: true } }],
    [
      'different artifact evidence',
      {
        ...evidence,
        package: { ...evidence.package, artifactDigest: `sha256:${'9'.repeat(64)}` },
      },
    ],
  ] as const) {
    let rejected = false;
    try {
      buildReleaseCandidateManifest(
        candidateInventory,
        manifest,
        defective,
        'v1.0.0-rc.1',
        commit,
        'bga-mcp-1.0.0-rc.1.tgz',
        artifact,
      );
    } catch (error) {
      rejected = /ineligible/iu.test(String(error));
    }
    if (!rejected) {
      throw new Error(`The ${name} gate did not reject the defective candidate evidence`);
    }
  }
}

async function main(): Promise<void> {
  const schema = await loadJson<object>('config/release.schema.json');
  const inventory = await loadJson<ReleaseInventory>('config/release.json');
  const manifest = await loadJson<CapabilityManifest>('config/capabilities.json');
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(inventory)) {
    throw new Error(`Invalid release inventory: ${ajv.errorsText(validate.errors)}`);
  }

  proveSeededFailures(inventory, manifest);
  reportOrExit(
    'Release inventory',
    verifyReleaseInventory(inventory, manifest),
    `Release inventory is consistent and its gate detects excluded, omitted, stale-evidence, and wrong-artifact defects: ${String(inventory.capabilities.tools.length)} tools, ${String(inventory.capabilities.resources.length)} resources, and ${String(inventory.capabilities.prompts.length)} prompts are frozen for ${inventory.id}.`,
  );
}

await main();
