import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface Claim {
  readonly id: string;
  readonly dimension:
    'layout' | 'file-generation' | 'runtime' | 'platform' | 'protocol' | 'transport' | 'client';
  readonly value: string;
  readonly support: 'supported' | 'unsupported' | 'unknown';
  readonly notes: string;
  readonly fixtures?: readonly string[];
  readonly scenarios?: readonly string[];
}

interface Matrix {
  readonly claims: readonly Claim[];
}

interface Sources {
  readonly manifest: {
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

function supportedValues(matrix: Matrix, dimension: Claim['dimension']): string[] {
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

async function verify(matrix: Matrix, sources: Sources): Promise<GateReport> {
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
async function proveGateDetectsSeededDefects(matrix: Matrix, sources: Sources): Promise<void> {
  const withMissingFixture = structuredClone(matrix) as unknown as {
    claims: { id: string; fixtures?: string[] }[];
  };
  const fixtureClaim = withMissingFixture.claims.find((claim) => claim.fixtures !== undefined);
  fixtureClaim?.fixtures?.push('tests/fixtures/projects/does-not-exist');
  expectSeededFailure(
    'compatibility fixture',
    await verify(withMissingFixture as unknown as Matrix, sources),
  );

  const undocumented = structuredClone(matrix) as unknown as { claims: { id: string }[] };
  const first = undocumented.claims[0];
  if (first !== undefined) {
    first.id = 'CLAIM-UNDOCUMENTED';
  }
  expectSeededFailure(
    'compatibility documentation',
    await verify(undocumented as unknown as Matrix, sources),
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
    await verify(overclaimed as unknown as Matrix, sources),
  );
}

async function main(): Promise<void> {
  const matrix = await loadJson<Matrix>('config/compatibility.json');
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
