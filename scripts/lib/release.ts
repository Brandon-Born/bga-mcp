import { createHash } from 'node:crypto';

import { GateReport } from './gate.js';

export type ReleaseKind = 'tools' | 'resources' | 'prompts';

export interface ReleaseInventory {
  readonly $schema: './release.schema.json';
  readonly schemaVersion: 1;
  readonly id: 'first-local-only';
  readonly status: 'implemented' | 'verified';
  readonly environment: 'local';
  readonly entrypoint: 'dist/release-cli.js';
  readonly protocolVersions: readonly string[];
  readonly transports: readonly string[];
  readonly capabilities: Readonly<Record<ReleaseKind, readonly string[]>>;
  readonly adapters: readonly string[];
  readonly consumers: readonly string[];
  readonly requiredScenarios: readonly string[];
}

export interface ManifestEntry {
  readonly name: string;
  readonly stability: 'experimental' | 'implemented' | 'verified';
  readonly supportedLayouts?: readonly string[];
  readonly environments?: readonly string[];
  readonly protocolVersions?: readonly string[];
  readonly requiredScenarios: readonly string[];
  readonly liveStudioRequired?: boolean;
  readonly boundary: string;
  readonly ciEvidence: string;
}

export interface CapabilityManifest {
  readonly server: { readonly name: string; readonly version: string };
  readonly ciRuns: readonly { readonly id: string }[];
  readonly transports: readonly ManifestEntry[];
  readonly capabilities: Readonly<Record<ReleaseKind, readonly ManifestEntry[]>>;
  readonly adapters: readonly ManifestEntry[];
}

export interface ReleaseRuntime {
  readonly tools: readonly string[];
  readonly resources: readonly string[];
  readonly prompts: readonly string[];
}

export interface CandidateEvidence {
  readonly source: { readonly commit: string; readonly clean: boolean };
  readonly package: { readonly artifactDigest?: string };
  readonly capabilities: readonly {
    readonly kind: 'transport' | 'tool' | 'resource' | 'prompt' | 'adapter';
    readonly name: string;
    readonly stability: string;
    readonly status: string;
    readonly supportedLayouts: readonly string[];
    readonly environments: readonly string[];
    readonly protocolVersions: readonly string[];
    readonly scenarios: readonly { readonly id: string; readonly status: string }[];
  }[];
}

export interface CandidateDigests {
  readonly inventory: string;
  readonly capabilityManifest: string;
  readonly verificationEvidence: string;
  readonly artifact: string;
}

export interface ReleaseCandidateManifest {
  readonly schemaVersion: 1;
  readonly release: {
    readonly id: string;
    readonly environment: string;
    readonly entrypoint: string;
    readonly sourceCommit: string;
    readonly digests: CandidateDigests;
  };
  readonly server: CapabilityManifest['server'];
  readonly transports: readonly ManifestEntry[];
  readonly capabilities: Readonly<Record<ReleaseKind, readonly ManifestEntry[]>>;
  readonly adapters: readonly ManifestEntry[];
}

const REQUIRED_CONSUMERS = [
  'candidate-manifest',
  'mcp-discovery',
  'public-documentation',
  'security-review',
  'verification-evidence',
] as const;

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function kindLabel(kind: ReleaseKind): 'tool' | 'resource' | 'prompt' {
  return kind === 'tools' ? 'tool' : kind === 'resources' ? 'resource' : 'prompt';
}

function manifestEntry(entries: readonly ManifestEntry[], name: string): ManifestEntry | undefined {
  return entries.find((entry) => entry.name === name);
}

/** SHA-256 of exact bytes, used to bind a candidate to each source it consumed. */
export function releaseDigest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/**
 * Checks that the frozen selection contains only verified, local-only entries
 * and that every name resolves to the source manifest it derives from.
 */
export function verifyReleaseInventory(
  inventory: ReleaseInventory,
  manifest: CapabilityManifest,
  runtime?: ReleaseRuntime,
): GateReport {
  const report = new GateReport();
  report.require(
    sameMembers(inventory.consumers, REQUIRED_CONSUMERS),
    `Release consumers differ from the required inventory consumers (${REQUIRED_CONSUMERS.join(', ')})`,
  );
  report.require(
    sameMembers(inventory.protocolVersions, ['2025-11-25']),
    'The first release must claim only protocol 2025-11-25',
  );

  const ciRuns = new Set(manifest.ciRuns.map((run) => run.id));
  const releaseScenarioOwners = new Set<string>();
  for (const transportName of inventory.transports) {
    const transport = manifestEntry(manifest.transports, transportName);
    report.require(
      transport !== undefined,
      `Release transport ${transportName} is absent from the manifest`,
    );
    report.require(
      transport?.stability === 'verified',
      `Release transport ${transportName} is ${transport?.stability ?? 'missing'}, not verified`,
    );
    report.require(
      sameMembers(transport?.protocolVersions ?? [], inventory.protocolVersions),
      `Release transport ${transportName} protocol versions differ from the inventory`,
    );
    report.require(
      transport !== undefined && ciRuns.has(transport.ciEvidence),
      `Release transport ${transportName} has no resolvable CI evidence`,
    );
    for (const scenario of transport?.requiredScenarios ?? []) releaseScenarioOwners.add(scenario);
  }
  for (const scenario of inventory.requiredScenarios) {
    report.require(
      releaseScenarioOwners.has(scenario),
      `Release scenario ${scenario} is not required by a selected transport`,
    );
  }

  for (const kind of ['tools', 'resources', 'prompts'] as const) {
    for (const name of inventory.capabilities[kind]) {
      const entry = manifestEntry(manifest.capabilities[kind], name);
      const label = `${kindLabel(kind)} ${name}`;
      report.require(entry !== undefined, `Release ${label} is absent from the manifest`);
      report.require(
        entry?.stability === 'verified',
        `Release ${label} is ${entry?.stability ?? 'missing'}, not verified`,
      );
      report.require(
        sameMembers(entry?.environments ?? [], [inventory.environment]),
        `Release ${label} is not local-only`,
      );
      report.require(
        entry?.boundary === 'TB-LOCAL-FILESYSTEM',
        `Release ${label} crosses ${entry?.boundary ?? 'an unknown boundary'}`,
      );
      report.require(
        entry?.liveStudioRequired === false,
        `Release ${label} requires a live Studio environment`,
      );
      report.require(
        sameMembers(entry?.protocolVersions ?? [], inventory.protocolVersions),
        `Release ${label} protocol versions differ from the inventory`,
      );
      report.require(
        entry !== undefined && ciRuns.has(entry.ciEvidence),
        `Release ${label} has no resolvable CI evidence`,
      );
    }

    if (runtime !== undefined) {
      report.require(
        sameMembers(runtime[kind], inventory.capabilities[kind]),
        `Release ${kind} discovery differs from the frozen inventory (inventory: ${inventory.capabilities[kind].join(', ') || 'none'}; runtime: ${runtime[kind].join(', ') || 'none'})`,
      );
    }
  }

  for (const adapterName of inventory.adapters) {
    const adapter = manifestEntry(manifest.adapters, adapterName);
    report.require(
      adapter !== undefined,
      `Release adapter ${adapterName} is absent from the manifest`,
    );
    report.require(
      adapter?.stability === 'verified',
      `Release adapter ${adapterName} is ${adapter?.stability ?? 'missing'}, not verified`,
    );
  }

  return report;
}

function selectedEntries(
  inventory: ReleaseInventory,
  manifest: CapabilityManifest,
): Pick<ReleaseCandidateManifest, 'transports' | 'capabilities' | 'adapters'> {
  return {
    transports: inventory.transports.map((name) => {
      const entry = manifestEntry(manifest.transports, name);
      if (entry === undefined) throw new Error(`Release transport ${name} is missing`);
      return entry;
    }),
    capabilities: {
      tools: inventory.capabilities.tools.map((name) => {
        const entry = manifestEntry(manifest.capabilities.tools, name);
        if (entry === undefined) throw new Error(`Release tool ${name} is missing`);
        return entry;
      }),
      resources: inventory.capabilities.resources.map((name) => {
        const entry = manifestEntry(manifest.capabilities.resources, name);
        if (entry === undefined) throw new Error(`Release resource ${name} is missing`);
        return entry;
      }),
      prompts: inventory.capabilities.prompts.map((name) => {
        const entry = manifestEntry(manifest.capabilities.prompts, name);
        if (entry === undefined) throw new Error(`Release prompt ${name} is missing`);
        return entry;
      }),
    },
    adapters: inventory.adapters.map((name) => {
      const entry = manifestEntry(manifest.adapters, name);
      if (entry === undefined) throw new Error(`Release adapter ${name} is missing`);
      return entry;
    }),
  };
}

function evidenceKey(kind: string, name: string): string {
  return `${kind}:${name}`;
}

/**
 * Derives the candidate manifest only from an eligible frozen inventory and
 * evidence produced by that candidate commit and artifact.
 */
export function buildReleaseCandidateManifest(
  inventory: ReleaseInventory,
  manifest: CapabilityManifest,
  evidence: CandidateEvidence,
  candidateCommit: string,
  candidateArtifactDigest: string,
): ReleaseCandidateManifest {
  const digests: CandidateDigests = {
    inventory: releaseDigest(JSON.stringify(inventory)),
    capabilityManifest: releaseDigest(JSON.stringify(manifest)),
    verificationEvidence: releaseDigest(JSON.stringify(evidence)),
    artifact: candidateArtifactDigest,
  };
  const report = verifyReleaseInventory(inventory, manifest);
  report.require(inventory.status === 'verified', 'The release inventory is not verified');
  report.require(evidence.source.clean, 'Candidate evidence was produced from a dirty tree');
  report.require(
    evidence.source.commit === candidateCommit,
    `Candidate evidence belongs to ${evidence.source.commit}, not ${candidateCommit}`,
  );
  report.require(
    evidence.package.artifactDigest === digests.artifact,
    'Candidate evidence names a different packaged artifact digest',
  );

  const indexedEvidence = new Map(
    evidence.capabilities.map((entry) => [evidenceKey(entry.kind, entry.name), entry]),
  );
  const selected = selectedEntries(inventory, manifest);
  for (const [kind, entries] of [
    ['transport', selected.transports],
    ['tool', selected.capabilities.tools],
    ['resource', selected.capabilities.resources],
    ['prompt', selected.capabilities.prompts],
    ['adapter', selected.adapters],
  ] as const) {
    for (const entry of entries) {
      const retained = indexedEvidence.get(evidenceKey(kind, entry.name));
      report.require(retained !== undefined, `Candidate evidence omits ${kind} ${entry.name}`);
      report.require(
        retained?.stability === 'verified' && retained.status === 'passed',
        `Candidate evidence does not prove ${kind} ${entry.name}`,
      );
      report.require(
        sameMembers(
          retained?.scenarios
            .filter((scenario) => scenario.status === 'passed')
            .map((scenario) => scenario.id) ?? [],
          entry.requiredScenarios,
        ),
        `Candidate evidence scenarios differ for ${kind} ${entry.name}`,
      );
      report.require(
        sameMembers(retained?.supportedLayouts ?? [], entry.supportedLayouts ?? []),
        `Candidate evidence layouts differ for ${kind} ${entry.name}`,
      );
      report.require(
        sameMembers(retained?.environments ?? [], entry.environments ?? []),
        `Candidate evidence environments differ for ${kind} ${entry.name}`,
      );
      report.require(
        sameMembers(retained?.protocolVersions ?? [], entry.protocolVersions ?? []),
        `Candidate evidence protocol versions differ for ${kind} ${entry.name}`,
      );
    }
  }

  if (report.failed) {
    throw new Error(`Release candidate is ineligible:\n- ${report.failures.join('\n- ')}`);
  }

  return {
    schemaVersion: 1,
    release: {
      id: inventory.id,
      environment: inventory.environment,
      entrypoint: inventory.entrypoint,
      sourceCommit: candidateCommit,
      digests,
    },
    server: manifest.server,
    ...selected,
  };
}
