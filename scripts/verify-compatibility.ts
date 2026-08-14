import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import {
  capabilityCompatibilityFailures,
  type CapabilityCompatibilityManifest,
  type CompatibilityDimension,
  type CompatibilityMatrix,
} from './lib/compatibility.js';
import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface Sources {
  readonly manifest: CapabilityCompatibilityManifest & {
    readonly transports: readonly {
      readonly name: string;
      readonly protocolVersions: readonly string[];
    }[];
  };
  readonly engines: string;
  readonly metadataSource: string;
  readonly workflow: string;
  readonly documentation: string;
  readonly schema: object;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

function equalSets(
  report: GateReport,
  actual: Iterable<string>,
  expected: Iterable<string>,
  message: string,
): void {
  const left = sorted(actual);
  const right = sorted(expected);
  report.require(
    JSON.stringify(left) === JSON.stringify(right),
    `${message} (matrix: ${left.join(', ') || 'none'}; source: ${right.join(', ') || 'none'})`,
  );
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function supportedValues(matrix: CompatibilityMatrix, dimension: CompatibilityDimension): string[] {
  return matrix.claims
    .filter((claim) => claim.dimension === dimension && claim.support === 'supported')
    .map((claim) => claim.value);
}

async function fixtureExists(fixture: string): Promise<boolean> {
  try {
    await access(resolve(repositoryRoot, fixture));
    return true;
  } catch {
    return false;
  }
}

async function verify(matrix: CompatibilityMatrix, sources: Sources): Promise<GateReport> {
  const report = new GateReport();
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(sources.schema);
  if (!validate(matrix)) {
    report.require(false, `Invalid compatibility matrix: ${ajv.errorsText(validate.errors)}`);
    return report;
  }

  const identifiers = new Set<string>();
  for (const claim of matrix.claims) {
    report.require(!identifiers.has(claim.id), `${claim.id} is declared more than once`);
    identifiers.add(claim.id);
    for (const fixture of claim.fixtures ?? []) {
      report.require(
        await fixtureExists(fixture),
        `${claim.id} references missing fixture ${fixture}`,
      );
    }
    report.require(
      sources.documentation.includes(claim.id),
      `${claim.id} is missing from docs/COMPATIBILITY.md`,
    );
  }
  for (const match of sources.documentation.matchAll(/\bCLAIM-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/gu)) {
    report.require(
      identifiers.has(match[0]),
      `docs/COMPATIBILITY.md references unknown ${match[0]}`,
    );
  }

  for (const failure of capabilityCompatibilityFailures(matrix, sources.manifest)) {
    report.require(false, failure);
  }

  // A runtime behavior claim may never exceed the published matrix.
  equalSets(
    report,
    supportedValues(matrix, 'protocol'),
    [...sources.metadataSource.matchAll(/'(\d{4}-\d{2}-\d{2})'/gu)].map((match) => match[1] ?? ''),
    'Supported protocol claims differ from SUPPORTED_PROTOCOL_VERSIONS in src/metadata.ts',
  );
  equalSets(
    report,
    supportedValues(matrix, 'protocol'),
    sources.manifest.transports.flatMap((transport) => transport.protocolVersions),
    'Supported protocol claims differ from the capability manifest',
  );
  equalSets(
    report,
    supportedValues(matrix, 'transport'),
    sources.manifest.transports.map((transport) => transport.name),
    'Supported transport claims differ from the capability manifest',
  );

  const workflowPlatforms = /os:\s*\[([^\]]+)\]/u.exec(sources.workflow)?.[1] ?? '';
  equalSets(
    report,
    supportedValues(matrix, 'platform'),
    workflowPlatforms.split(',').map((entry) => entry.trim()),
    'Supported platform claims differ from the CI matrix',
  );

  const workflowRuntimes = /node:\s*\[([^\]]+)\]/u.exec(sources.workflow)?.[1] ?? '';
  const supportedRuntimes = supportedValues(matrix, 'runtime');
  equalSets(
    report,
    supportedRuntimes,
    workflowRuntimes.split(',').map((entry) => entry.trim()),
    'Supported runtime claims differ from the CI matrix',
  );
  for (const runtime of supportedRuntimes) {
    report.require(
      sources.engines.includes(runtime),
      `Runtime ${runtime} is claimed but is not part of the engines range`,
    );
  }
  for (const claim of matrix.claims) {
    if (claim.dimension === 'runtime' && claim.support !== 'supported') {
      report.require(
        !workflowRuntimes.includes(claim.value),
        `Runtime ${claim.value} is not claimed as supported but CI exercises it`,
      );
    }
  }

  return report;
}

/** Seeds a missing fixture, an undocumented claim, and a claim beyond runtime behavior. */
async function proveGateDetectsSeededDefects(
  matrix: CompatibilityMatrix,
  sources: Sources,
): Promise<void> {
  const withMissingFixture = structuredClone(matrix) as unknown as {
    claims: { id: string; fixtures?: string[] }[];
  };
  const fixtureClaim = withMissingFixture.claims.find((claim) => claim.fixtures !== undefined);
  fixtureClaim?.fixtures?.push('tests/fixtures/projects/does-not-exist');
  expectSeededFailure(
    'compatibility fixture',
    await verify(withMissingFixture as unknown as CompatibilityMatrix, sources),
  );

  const undocumented = structuredClone(matrix) as unknown as { claims: { id: string }[] };
  const first = undocumented.claims[0];
  if (first !== undefined) {
    first.id = 'CLAIM-UNDOCUMENTED';
  }
  expectSeededFailure(
    'compatibility documentation',
    await verify(undocumented as unknown as CompatibilityMatrix, sources),
  );

  const overclaimed = structuredClone(matrix) as unknown as {
    claims: {
      id: string;
      dimension: string;
      value: string;
      support: string;
      notes: string;
      scenarios?: string[];
    }[];
  };
  overclaimed.claims.push({
    id: 'CLAIM-PROTOCOL-FUTURE',
    dimension: 'protocol',
    value: '2099-01-01',
    support: 'supported',
    notes: 'Seeded claim beyond what the server advertises.',
    scenarios: ['GATE-COMPATIBILITY-MATRIX'],
  });
  expectSeededFailure(
    'compatibility runtime claim',
    await verify(overclaimed as unknown as CompatibilityMatrix, sources),
  );

  const withUnknownCapability = structuredClone(matrix) as unknown as {
    claims: { capabilities?: { reference: string; scenarios: string[] }[] }[];
  };
  const applicableClaim = withUnknownCapability.claims.find(
    (claim) => claim.capabilities !== undefined,
  );
  const mappedScenario = applicableClaim?.capabilities?.[0]?.scenarios[0];
  if (mappedScenario === undefined) {
    throw new Error('The seeded compatibility check needs a mapped capability scenario');
  }
  applicableClaim?.capabilities?.push({
    reference: 'tool:not_in_the_manifest',
    scenarios: [mappedScenario],
  });
  expectSeededFailure(
    'compatibility capability reference',
    await verify(withUnknownCapability as unknown as CompatibilityMatrix, sources),
  );

  const withMissingMappedScenario = structuredClone(sources.manifest) as {
    capabilities: Record<
      'tools' | 'resources' | 'prompts',
      {
        name: string;
        supportedLayouts: string[];
        environments: string[];
        protocolVersions: string[];
        requiredScenarios: string[];
      }[]
    >;
  } & Sources['manifest'];
  const mappedReference = applicableClaim?.capabilities?.[0]?.reference;
  if (mappedReference === undefined) {
    throw new Error('The seeded compatibility check needs a mapped capability');
  }
  const separator = mappedReference.indexOf(':');
  const kind = mappedReference.slice(0, separator);
  const name = mappedReference.slice(separator + 1);
  const collection =
    kind === 'tool'
      ? withMissingMappedScenario.capabilities.tools
      : kind === 'resource'
        ? withMissingMappedScenario.capabilities.resources
        : withMissingMappedScenario.capabilities.prompts;
  const mappedCapability = collection.find((capability) => capability.name === name);
  if (mappedCapability === undefined) {
    throw new Error(`The seeded compatibility check cannot resolve ${mappedReference}`);
  }
  mappedCapability.requiredScenarios = mappedCapability.requiredScenarios.filter(
    (scenario) => scenario !== mappedScenario,
  );
  expectSeededFailure(
    'compatibility mapped scenario',
    await verify(matrix, { ...sources, manifest: withMissingMappedScenario }),
  );

  const seedManifest = (
    mutate: (capability: {
      supportedLayouts: string[];
      environments: string[];
      protocolVersions: string[];
    }) => void,
  ): Sources => {
    const manifest = structuredClone(sources.manifest) as {
      capabilities: Record<
        'tools' | 'resources' | 'prompts',
        {
          supportedLayouts: string[];
          environments: string[];
          protocolVersions: string[];
        }[]
      >;
    } & Sources['manifest'];
    const capability = [...manifest.capabilities.tools, ...manifest.capabilities.resources].find(
      (entry) => entry.supportedLayouts.length > 0,
    );
    if (capability === undefined) {
      throw new Error('The seeded compatibility check needs a project capability');
    }
    mutate(capability);
    return { ...sources, manifest };
  };

  expectSeededFailure(
    'capability supported-layout omission',
    await verify(
      matrix,
      seedManifest((capability) => {
        capability.supportedLayouts = capability.supportedLayouts.filter(
          (layout) => layout !== 'modern-modules',
        );
      }),
    ),
  );
  expectSeededFailure(
    'capability supported-layout overclaim',
    await verify(
      matrix,
      seedManifest((capability) => {
        capability.supportedLayouts.push('unrecognized');
      }),
    ),
  );
  expectSeededFailure(
    'capability environment mismatch',
    await verify(
      matrix,
      seedManifest((capability) => {
        capability.environments = ['remote'];
      }),
    ),
  );
  expectSeededFailure(
    'capability protocol mismatch',
    await verify(
      matrix,
      seedManifest((capability) => {
        capability.protocolVersions = ['2026-07-28'];
      }),
    ),
  );

  const coordinatedMatrix = structuredClone(matrix) as unknown as {
    claims: {
      dimension: string;
      value: string;
      capabilities?: { reference: string; scenarios: string[] }[];
    }[];
  };
  const coordinatedSources = structuredClone(sources.manifest) as {
    capabilities: Record<
      'tools' | 'resources' | 'prompts',
      {
        name: string;
        supportedLayouts: string[];
        requiredScenarios: string[];
      }[]
    >;
  } & Sources['manifest'];
  const layoutClaim = coordinatedMatrix.claims.find(
    (claim) => claim.dimension === 'layout' && claim.capabilities !== undefined,
  );
  const layoutCapabilities = layoutClaim?.capabilities;
  const removedMapping = layoutCapabilities?.find((mapping) => {
    const separator = mapping.reference.indexOf(':');
    const kind = mapping.reference.slice(0, separator);
    const name = mapping.reference.slice(separator + 1);
    const capabilities =
      kind === 'tool'
        ? coordinatedSources.capabilities.tools
        : kind === 'resource'
          ? coordinatedSources.capabilities.resources
          : coordinatedSources.capabilities.prompts;
    return capabilities.some(
      (capability) =>
        capability.name === name &&
        mapping.scenarios.some((scenario) => capability.requiredScenarios.includes(scenario)),
    );
  });
  if (
    layoutClaim === undefined ||
    layoutCapabilities === undefined ||
    removedMapping === undefined
  ) {
    throw new Error('The coordinated-omission seed needs a mapped layout capability');
  }
  layoutClaim.capabilities = layoutCapabilities.filter(
    (mapping) => mapping.reference !== removedMapping.reference,
  );
  const removedSeparator = removedMapping.reference.indexOf(':');
  const removedKind = removedMapping.reference.slice(0, removedSeparator);
  const removedName = removedMapping.reference.slice(removedSeparator + 1);
  const removedCollection =
    removedKind === 'tool'
      ? coordinatedSources.capabilities.tools
      : removedKind === 'resource'
        ? coordinatedSources.capabilities.resources
        : coordinatedSources.capabilities.prompts;
  const coordinatedCapability = removedCollection.find(
    (capability) => capability.name === removedName,
  );
  if (coordinatedCapability === undefined) {
    throw new Error('The coordinated-omission seed cannot resolve its capability');
  }
  coordinatedCapability.supportedLayouts = coordinatedCapability.supportedLayouts.filter(
    (layout) => layout !== layoutClaim.value,
  );
  expectSeededFailure(
    'coordinated capability omission',
    await verify(coordinatedMatrix as unknown as CompatibilityMatrix, {
      ...sources,
      manifest: coordinatedSources,
    }),
  );
}

async function main(): Promise<void> {
  const matrix = await loadJson<CompatibilityMatrix>('config/compatibility.json');
  const packageMetadata = await loadJson<{ engines: { node: string } }>('package.json');
  const sources: Sources = {
    schema: await loadJson<object>('config/compatibility.schema.json'),
    manifest: await loadJson<Sources['manifest']>('config/capabilities.json'),
    engines: packageMetadata.engines.node,
    metadataSource: await readFile(resolve(repositoryRoot, 'src/metadata.ts'), 'utf8'),
    workflow: await readFile(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8'),
    documentation: await readFile(resolve(repositoryRoot, 'docs/COMPATIBILITY.md'), 'utf8'),
  };

  await proveGateDetectsSeededDefects(matrix, sources);

  reportOrExit(
    'Compatibility',
    await verify(matrix, sources),
    `Compatibility matrix is consistent and its gate detects seeded defects: ${String(matrix.claims.length)} claims, ${String(matrix.claims.filter((claim) => claim.support === 'supported').length)} supported.`,
  );
}

await main();
