import { createHash } from 'node:crypto';

import { GateReport } from './gate.js';

export type ContractStatus = 'candidate' | 'published';
export type ChangeLevel = 'patch' | 'minor' | 'major';

export interface VersionPolicy {
  readonly package: {
    readonly scheme: 'semver-2.0.0';
    readonly developmentVersion: '0.0.0-development';
    readonly firstStableVersion: string;
    readonly prereleaseIdentifier: 'rc';
    readonly prereleaseDistTag: 'next';
    readonly stableDistTag: 'latest';
    readonly previousMajorSecurityFixDays: number;
  };
  readonly contract: {
    readonly current: string;
    readonly removalsRequireDeprecation: true;
    readonly minimumDeprecationMinorReleases: number;
    readonly minimumDeprecationDays: number;
  };
}

export interface ContractDeprecation {
  readonly reference: string;
  readonly announcedIn: string;
  readonly removeNotBeforeVersion: string;
  readonly removeNotBeforeDate: string;
  readonly replacement: string;
}

export interface ContractManifestFields {
  readonly stability: 'experimental' | 'implemented' | 'verified';
  readonly supportedLayouts: readonly string[];
  readonly environments: readonly string[];
  readonly protocolVersions: readonly string[];
  readonly liveStudioRequired: boolean;
  readonly boundary: string;
}

export interface ContractTool {
  readonly name: string;
  readonly metadataDigest: string;
  readonly inputSchemaDigest: string;
  readonly outputSchemaDigest: string;
  readonly manifest: ContractManifestFields;
}

export interface ContractResource {
  readonly uri: string;
  readonly descriptorDigest: string;
  readonly manifest: ContractManifestFields;
}

export interface ContractSchema {
  readonly path: string;
  readonly compatibility: 'package-major' | 'schema-version';
  readonly contractVersion: number | null;
  readonly digest: string;
}

export interface PublicContractSnapshot {
  readonly $schema: '../public-contract.schema.json';
  readonly schemaVersion: 1;
  readonly contractVersion: number;
  readonly packageVersion: string;
  readonly status: ContractStatus;
  readonly releasedAt?: string;
  readonly policyDigest: string;
  readonly release: {
    readonly id: string;
    readonly serverName: string;
    readonly entrypoint: string;
    readonly bin: Readonly<Record<string, string>>;
    readonly exports: Readonly<Record<string, unknown>>;
    readonly typesDigest: string;
    readonly protocolVersions: readonly string[];
    readonly transports: readonly string[];
  };
  readonly tools: readonly ContractTool[];
  readonly resources: readonly ContractResource[];
  readonly resourceTemplates: readonly string[];
  readonly prompts: readonly string[];
  readonly schemas: readonly ContractSchema[];
  readonly compatibility: readonly {
    readonly id: string;
    readonly dimension: string;
    readonly value: string;
    readonly support: 'supported' | 'unsupported' | 'unknown';
  }[];
  readonly deprecations: readonly ContractDeprecation[];
}

export interface ToolDescriptor {
  readonly name: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly inputSchema: object;
  readonly outputSchema?: object | undefined;
  readonly annotations?: object | undefined;
}

export interface ResourceDescriptor {
  readonly name: string;
  readonly title?: string | undefined;
  readonly uri: string;
  readonly description?: string | undefined;
  readonly mimeType?: string | undefined;
}

export interface ContractSources {
  readonly version: Pick<
    PublicContractSnapshot,
    'contractVersion' | 'packageVersion' | 'status'
  > & {
    readonly releasedAt?: string;
  };
  readonly policy: Readonly<Record<string, unknown>>;
  readonly inventory: {
    readonly id: string;
    readonly entrypoint: string;
    readonly protocolVersions: readonly string[];
    readonly transports: readonly string[];
    readonly capabilities: {
      readonly tools: readonly string[];
      readonly resources: readonly string[];
      readonly prompts: readonly string[];
    };
  };
  readonly manifest: {
    readonly capabilities: Readonly<
      Record<
        'tools' | 'resources' | 'prompts',
        readonly ({ readonly name: string } & ContractManifestFields)[]
      >
    >;
  };
  readonly compatibility: {
    readonly claims: PublicContractSnapshot['compatibility'];
  };
  readonly packageMetadata: {
    readonly name: string;
    readonly bin: Readonly<Record<string, string>>;
    readonly exports: Readonly<Record<string, unknown>>;
  };
  readonly typeDeclarations: readonly { readonly path: string; readonly text: string }[];
  readonly tools: readonly ToolDescriptor[];
  readonly resources: readonly ResourceDescriptor[];
  readonly resourceTemplates: readonly string[];
  readonly prompts: readonly string[];
  readonly schemas: readonly {
    readonly path: string;
    readonly compatibility: ContractSchema['compatibility'];
    readonly contractVersion: number | null;
    readonly value: object;
  }[];
  readonly deprecations?: readonly ContractDeprecation[];
}

/** JSON Schemas shipped as part of the stable package contract. */
export const SHIPPED_SCHEMA_CONTRACTS = [
  {
    path: 'config/capabilities.schema.json',
    compatibility: 'package-major',
    contractVersion: null,
  },
  {
    path: 'config/compatibility.schema.json',
    compatibility: 'package-major',
    contractVersion: null,
  },
  { path: 'config/diagnostics.schema.json', compatibility: 'schema-version', contractVersion: 1 },
  {
    path: 'config/doc-evaluation.schema.json',
    compatibility: 'package-major',
    contractVersion: null,
  },
  { path: 'config/doc-sources.schema.json', compatibility: 'package-major', contractVersion: null },
  {
    path: 'config/public-contract.schema.json',
    compatibility: 'package-major',
    contractVersion: null,
  },
  { path: 'config/release.schema.json', compatibility: 'package-major', contractVersion: null },
  {
    path: 'config/rule-catalog.schema.json',
    compatibility: 'package-major',
    contractVersion: null,
  },
  {
    path: 'config/version-policy.schema.json',
    compatibility: 'package-major',
    contractVersion: null,
  },
] as const satisfies readonly Omit<ContractSchema, 'digest'>[];

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

interface ContractDelta {
  readonly level: ChangeLevel;
  readonly removals: readonly string[];
  readonly invalid: readonly string[];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonical(entry));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

/** A stable digest of JSON-compatible public contract data. */
export function contractDigest(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')}`;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function normalizeDeclaration(text: string): string {
  return text
    .replace(/\r\n?/gu, '\n')
    .replace(
      /export declare const SERVER_VERSION = "[^"]+";/gu,
      'export declare const SERVER_VERSION = "<package-version>";',
    );
}

function normalizedPolicy(policy: Readonly<Record<string, unknown>>): object {
  const cloned = structuredClone(policy);
  const contract = cloned.contract;
  if (contract !== null && typeof contract === 'object' && !Array.isArray(contract)) {
    return {
      ...cloned,
      contract: { ...contract, current: '<current-contract>' },
    };
  }
  return cloned;
}

function requireSameNames(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
): void {
  if (!same(sorted(expected), sorted(actual))) {
    throw new Error(
      `Release ${label} discovery differs from its inventory ` +
        `(inventory: ${sorted(expected).join(', ') || 'none'}; discovery: ${sorted(actual).join(', ') || 'none'})`,
    );
  }
}

function manifestFields(
  entries: readonly ({ readonly name: string } & ContractManifestFields)[],
  name: string,
): ContractManifestFields {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined)
    throw new Error(`Release capability ${name} is absent from the manifest`);
  return {
    stability: entry.stability,
    supportedLayouts: sorted(entry.supportedLayouts),
    environments: sorted(entry.environments),
    protocolVersions: sorted(entry.protocolVersions),
    liveStudioRequired: entry.liveStudioRequired,
    boundary: entry.boundary,
  };
}

/** Builds the contract actually exposed by the installed release profile. */
export function buildPublicContractSnapshot(sources: ContractSources): PublicContractSnapshot {
  requireSameNames(
    'tools',
    sources.inventory.capabilities.tools,
    sources.tools.map((tool) => tool.name),
  );
  requireSameNames(
    'resources',
    sources.inventory.capabilities.resources,
    sources.resources.map((resource) => resource.uri),
  );
  requireSameNames('prompts', sources.inventory.capabilities.prompts, sources.prompts);
  const toolNames = new Set(sources.inventory.capabilities.tools);
  const resourceUris = new Set(sources.inventory.capabilities.resources);
  const tools = sources.tools
    .filter((tool) => toolNames.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      metadataDigest: contractDigest({
        title: tool.title,
        description: tool.description,
        annotations: tool.annotations,
      }),
      inputSchemaDigest: contractDigest(tool.inputSchema),
      outputSchemaDigest: contractDigest(tool.outputSchema ?? null),
      manifest: manifestFields(sources.manifest.capabilities.tools, tool.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const resources = sources.resources
    .filter((resource) => resourceUris.has(resource.uri))
    .map((resource) => ({
      uri: resource.uri,
      descriptorDigest: contractDigest(resource),
      manifest: manifestFields(sources.manifest.capabilities.resources, resource.uri),
    }))
    .sort((left, right) => left.uri.localeCompare(right.uri));

  return {
    $schema: '../public-contract.schema.json',
    schemaVersion: 1,
    ...sources.version,
    policyDigest: contractDigest(normalizedPolicy(sources.policy)),
    release: {
      id: sources.inventory.id,
      serverName: sources.packageMetadata.name,
      entrypoint: sources.inventory.entrypoint,
      bin: sources.packageMetadata.bin,
      exports: sources.packageMetadata.exports,
      typesDigest: contractDigest(
        [...sources.typeDeclarations]
          .sort((left, right) => left.path.localeCompare(right.path))
          .map((entry) => ({ path: entry.path, text: normalizeDeclaration(entry.text) })),
      ),
      protocolVersions: sorted(sources.inventory.protocolVersions),
      transports: sorted(sources.inventory.transports),
    },
    tools,
    resources,
    resourceTemplates: sorted(sources.resourceTemplates),
    prompts: sorted(sources.prompts),
    schemas: sources.schemas
      .map((schema) => ({
        path: schema.path,
        compatibility: schema.compatibility,
        contractVersion: schema.contractVersion,
        digest: contractDigest(schema.value),
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    compatibility: [...sources.compatibility.claims].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    deprecations: [...(sources.deprecations ?? [])].sort((left, right) =>
      left.reference.localeCompare(right.reference),
    ),
  };
}

/** Exact equality is what prevents a checked-in public schema from drifting silently. */
export function verifyPublicContract(
  expected: PublicContractSnapshot,
  observed: PublicContractSnapshot,
): GateReport {
  const report = new GateReport();
  report.require(
    JSON.stringify(canonical(observed)) === JSON.stringify(canonical(expected)),
    'Installed release discovery or a shipped public contract differs from the retained contract snapshot',
  );
  return report;
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value);
  if (match === null) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function levelRank(level: ChangeLevel): number {
  return level === 'major' ? 3 : level === 'minor' ? 2 : 1;
}

function raise(current: ChangeLevel, next: ChangeLevel): ChangeLevel {
  return levelRank(next) > levelRank(current) ? next : current;
}

function keyed<T>(values: readonly T[], key: (value: T) => string): Map<string, T> {
  return new Map(values.map((value) => [key(value), value]));
}

function duplicateKeys<T>(values: readonly T[], key: (value: T) => string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const identifier = key(value);
    if (seen.has(identifier)) duplicates.add(identifier);
    seen.add(identifier);
  }
  return [...duplicates].sort();
}

function same(value: unknown, other: unknown): boolean {
  return JSON.stringify(canonical(value)) === JSON.stringify(canonical(other));
}

function classifyManifestFields(
  before: ContractManifestFields,
  after: ContractManifestFields,
): ChangeLevel {
  if (
    before.stability !== after.stability ||
    before.liveStudioRequired !== after.liveStudioRequired ||
    before.boundary !== after.boundary
  ) {
    return 'major';
  }
  let level: ChangeLevel = 'patch';
  for (const field of ['supportedLayouts', 'environments', 'protocolVersions'] as const) {
    const previous = new Set(before[field]);
    const current = new Set(after[field]);
    if ([...previous].some((value) => !current.has(value))) return 'major';
    if ([...current].some((value) => !previous.has(value))) level = 'minor';
  }
  return level;
}

function removedAndAdded<T>(
  before: readonly T[],
  after: readonly T[],
  key: (value: T) => string,
): { before: Map<string, T>; after: Map<string, T>; removed: string[]; added: string[] } {
  const previous = keyed(before, key);
  const current = keyed(after, key);
  return {
    before: previous,
    after: current,
    removed: [...previous.keys()].filter((entry) => !current.has(entry)),
    added: [...current.keys()].filter((entry) => !previous.has(entry)),
  };
}

/** Classifies the minimum SemVer boundary needed by two retained contracts. */
export function classifyContractChange(
  previous: PublicContractSnapshot,
  current: PublicContractSnapshot,
): ContractDelta {
  let level: ChangeLevel = 'patch';
  const removals: string[] = [];
  const invalid: string[] = [];

  if (previous.policyDigest !== current.policyDigest) level = 'major';

  if (!same(previous.release, current.release)) {
    const stableIdentity = ['id', 'serverName', 'entrypoint', 'bin', 'exports'] as const;
    if (stableIdentity.some((field) => !same(previous.release[field], current.release[field]))) {
      level = 'major';
    }
    if (previous.release.typesDigest !== current.release.typesDigest) level = 'major';
    for (const dimension of ['protocolVersions', 'transports'] as const) {
      const before = new Set(previous.release[dimension]);
      const after = new Set(current.release[dimension]);
      if ([...before].some((value) => !after.has(value))) {
        level = 'major';
        removals.push(
          ...[...before]
            .filter((value) => !after.has(value))
            .map(
              (value) => `${dimension === 'protocolVersions' ? 'protocol' : 'transport'}:${value}`,
            ),
        );
      } else if ([...after].some((value) => !before.has(value))) {
        level = raise(level, 'minor');
      }
    }
  }

  const toolDelta = removedAndAdded(previous.tools, current.tools, (entry) => entry.name);
  if (toolDelta.removed.length > 0) {
    level = 'major';
    removals.push(...toolDelta.removed.map((name) => `tool:${name}`));
  }
  if (toolDelta.added.length > 0) level = raise(level, 'minor');
  for (const [name, before] of toolDelta.before) {
    const after = toolDelta.after.get(name);
    if (after === undefined) continue;
    if (
      before.inputSchemaDigest !== after.inputSchemaDigest ||
      before.outputSchemaDigest !== after.outputSchemaDigest
    ) {
      level = 'major';
    } else {
      level = raise(level, classifyManifestFields(before.manifest, after.manifest));
    }
    if (before.metadataDigest !== after.metadataDigest) {
      level = raise(level, 'minor');
    }
  }

  const resourceDelta = removedAndAdded(
    previous.resources,
    current.resources,
    (entry) => entry.uri,
  );
  if (resourceDelta.removed.length > 0) {
    level = 'major';
    removals.push(...resourceDelta.removed.map((uri) => `resource:${uri}`));
  }
  if (resourceDelta.added.length > 0) level = raise(level, 'minor');
  for (const [uri, before] of resourceDelta.before) {
    const after = resourceDelta.after.get(uri);
    if (after === undefined) continue;
    level = raise(level, classifyManifestFields(before.manifest, after.manifest));
    if (before.descriptorDigest !== after.descriptorDigest) level = raise(level, 'minor');
  }

  for (const [label, before, after] of [
    ['resource-template', previous.resourceTemplates, current.resourceTemplates],
    ['prompt', previous.prompts, current.prompts],
  ] as const) {
    const old = new Set(before);
    const next = new Set(after);
    const gone = [...old].filter((value) => !next.has(value));
    if (gone.length > 0) {
      level = 'major';
      removals.push(...gone.map((value) => `${label}:${value}`));
    }
    if ([...next].some((value) => !old.has(value))) level = raise(level, 'minor');
  }

  const schemaDelta = removedAndAdded(previous.schemas, current.schemas, (entry) => entry.path);
  if (schemaDelta.removed.length > 0) {
    level = 'major';
    removals.push(...schemaDelta.removed.map((path) => `schema:${path}`));
  }
  if (schemaDelta.added.length > 0) level = raise(level, 'minor');
  for (const [path, before] of schemaDelta.before) {
    const after = schemaDelta.after.get(path);
    if (after === undefined) continue;
    if (
      before.compatibility !== after.compatibility ||
      before.contractVersion !== after.contractVersion
    ) {
      level = 'major';
    }
    if (before.digest === after.digest) continue;
    if (
      before.compatibility === 'schema-version' &&
      before.contractVersion === after.contractVersion
    ) {
      invalid.push(`${path} changed without a schema contract version change`);
    }
    level = 'major';
  }

  const claimDelta = removedAndAdded(
    previous.compatibility,
    current.compatibility,
    (entry) => entry.id,
  );
  for (const id of claimDelta.removed) {
    const before = claimDelta.before.get(id);
    if (before?.support === 'supported') {
      level = 'major';
      removals.push(`compatibility:${id}`);
    } else {
      level = raise(level, 'minor');
    }
  }
  if (claimDelta.added.length > 0) level = raise(level, 'minor');
  for (const [id, before] of claimDelta.before) {
    const after = claimDelta.after.get(id);
    if (after !== undefined && !same(before, after)) {
      if (before.support === 'supported') {
        level = 'major';
        removals.push(`compatibility:${id}`);
      } else {
        level = raise(level, 'minor');
      }
    }
  }

  const deprecationDelta = removedAndAdded(
    previous.deprecations,
    current.deprecations,
    (entry) => entry.reference,
  );
  if (deprecationDelta.added.length > 0) level = raise(level, 'minor');
  for (const reference of deprecationDelta.removed) {
    if (!removals.includes(reference)) {
      invalid.push(`${reference} deprecation was withdrawn while the public surface remains`);
    }
  }
  for (const [reference, before] of deprecationDelta.before) {
    const after = deprecationDelta.after.get(reference);
    if (after === undefined || same(before, after)) continue;
    level = raise(level, 'minor');
    if (before.announcedIn !== after.announcedIn) {
      invalid.push(`${reference} changed its deprecation announcement version`);
    }
    const beforeVersion = parseVersion(before.removeNotBeforeVersion);
    const afterVersion = parseVersion(after.removeNotBeforeVersion);
    if (
      beforeVersion !== null &&
      afterVersion !== null &&
      compareVersions(afterVersion, beforeVersion) < 0
    ) {
      invalid.push(`${reference} moved its earliest removal version earlier`);
    }
    const beforeDate = dateAtUtc(before.removeNotBeforeDate);
    const afterDate = dateAtUtc(after.removeNotBeforeDate);
    if (beforeDate !== null && afterDate !== null && afterDate < beforeDate) {
      invalid.push(`${reference} moved its earliest removal date earlier`);
    }
  }

  return { level, removals: [...new Set(removals)].sort(), invalid };
}

function dateAtUtc(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function publicReferences(contract: PublicContractSnapshot): Set<string> {
  return new Set([
    ...contract.tools.map((entry) => `tool:${entry.name}`),
    ...contract.resources.map((entry) => `resource:${entry.uri}`),
    ...contract.resourceTemplates.map((entry) => `resource-template:${entry}`),
    ...contract.prompts.map((entry) => `prompt:${entry}`),
    ...contract.schemas.map((entry) => `schema:${entry.path}`),
    ...contract.release.protocolVersions.map((entry) => `protocol:${entry}`),
    ...contract.release.transports.map((entry) => `transport:${entry}`),
    ...contract.compatibility.map((entry) => `compatibility:${entry.id}`),
  ]);
}

/** Enforces monotonic contracts, SemVer boundaries, and announced removal windows. */
export function verifyContractEvolution(
  policy: VersionPolicy,
  contracts: readonly PublicContractSnapshot[],
): GateReport {
  const report = new GateReport();
  report.require(contracts.length > 0, 'At least one retained public contract is required');

  for (let index = 0; index < contracts.length; index += 1) {
    const contract = contracts[index];
    if (contract === undefined) continue;
    const parsed = parseVersion(contract.packageVersion);
    report.require(parsed !== null, `${contract.packageVersion} is not a stable SemVer version`);
    report.require(
      contract.contractVersion === index + 1,
      `Contract ${contract.packageVersion} has contractVersion ${String(contract.contractVersion)}, expected ${String(index + 1)}`,
    );
    report.require(
      contract.status === 'candidate'
        ? index === contracts.length - 1
        : contract.releasedAt !== undefined,
      `${contract.packageVersion} has an invalid ${contract.status} lifecycle position`,
    );

    for (const [label, duplicates] of [
      ['tool', duplicateKeys(contract.tools, (entry) => entry.name)],
      ['resource', duplicateKeys(contract.resources, (entry) => entry.uri)],
      ['schema', duplicateKeys(contract.schemas, (entry) => entry.path)],
      ['compatibility claim', duplicateKeys(contract.compatibility, (entry) => entry.id)],
      ['deprecation', duplicateKeys(contract.deprecations, (entry) => entry.reference)],
      ['protocol', duplicateKeys(contract.release.protocolVersions, (entry) => entry)],
      ['transport', duplicateKeys(contract.release.transports, (entry) => entry)],
      ['resource template', duplicateKeys(contract.resourceTemplates, (entry) => entry)],
      ['prompt', duplicateKeys(contract.prompts, (entry) => entry)],
    ] as const) {
      report.require(
        duplicates.length === 0,
        `${contract.packageVersion} repeats ${label} ${duplicates.join(', ')}`,
      );
    }

    const references = publicReferences(contract);
    for (const deprecation of contract.deprecations) {
      report.require(
        references.has(deprecation.reference),
        `${deprecation.reference} deprecates a surface absent from ${contract.packageVersion}`,
      );
      const announced = parseVersion(deprecation.announcedIn);
      const removal = parseVersion(deprecation.removeNotBeforeVersion);
      const release = parseVersion(contract.packageVersion);
      report.require(
        announced !== null && release !== null && compareVersions(announced, release) <= 0,
        `${deprecation.reference} is deprecated before its announcing contract exists`,
      );
      report.require(
        announced !== null && removal !== null && removal.major > announced.major,
        `${deprecation.reference} removal is not reserved for a later major version`,
      );
      const previous = contracts[index - 1];
      const firstAnnouncement =
        previous?.deprecations.every((entry) => entry.reference !== deprecation.reference) ?? true;
      if (firstAnnouncement) {
        report.require(
          deprecation.announcedIn === contract.packageVersion,
          `${deprecation.reference} does not identify the contract that first announces it`,
        );
        const before = previous === undefined ? null : parseVersion(previous.packageVersion);
        report.require(
          before !== null &&
            release !== null &&
            before.major === release.major &&
            release.minor - before.minor >= policy.contract.minimumDeprecationMinorReleases,
          `${deprecation.reference} was not announced in the required minor release`,
        );
        const releasedAt =
          contract.releasedAt === undefined ? null : dateAtUtc(contract.releasedAt);
        const removeAt = dateAtUtc(deprecation.removeNotBeforeDate);
        if (releasedAt !== null && removeAt !== null) {
          const days = (removeAt - releasedAt) / 86_400_000;
          report.require(
            days >= policy.contract.minimumDeprecationDays,
            `${deprecation.reference} deprecation window is ${String(days)} days, below policy`,
          );
        }
      }
    }
  }

  for (let index = 1; index < contracts.length; index += 1) {
    const previous = contracts[index - 1];
    const current = contracts[index];
    if (previous === undefined || current === undefined) continue;
    const before = parseVersion(previous.packageVersion);
    const after = parseVersion(current.packageVersion);
    if (before === null || after === null) continue;
    report.require(
      compareVersions(before, after) < 0,
      `${current.packageVersion} does not follow ${previous.packageVersion}`,
    );

    const delta = classifyContractChange(previous, current);
    for (const invalid of delta.invalid) report.require(false, invalid);
    const actualLevel: ChangeLevel =
      after.major > before.major ? 'major' : after.minor > before.minor ? 'minor' : 'patch';
    report.require(
      levelRank(actualLevel) >= levelRank(delta.level),
      `${previous.packageVersion} to ${current.packageVersion} is ${actualLevel}, but its public contract requires ${delta.level}`,
    );

    for (const removal of delta.removals) {
      const declaration = previous.deprecations.find((entry) => entry.reference === removal);
      report.require(
        declaration !== undefined,
        `${removal} was removed without a deprecation in ${previous.packageVersion}`,
      );
      if (declaration === undefined) continue;
      const minimumVersion = parseVersion(declaration.removeNotBeforeVersion);
      report.require(
        minimumVersion !== null && compareVersions(after, minimumVersion) >= 0,
        `${removal} was removed before ${declaration.removeNotBeforeVersion}`,
      );
      const releaseDate = current.releasedAt === undefined ? null : dateAtUtc(current.releasedAt);
      const minimumDate = dateAtUtc(declaration.removeNotBeforeDate);
      report.require(
        releaseDate !== null && minimumDate !== null && releaseDate >= minimumDate,
        `${removal} was removed before ${declaration.removeNotBeforeDate}`,
      );
    }
  }

  return report;
}
