import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';
import {
  type PublicContractSnapshot,
  type VersionPolicy,
  verifyContractEvolution,
  verifyPublicContract,
} from './lib/version-policy.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface PackageMetadata {
  readonly version: string;
  readonly files: readonly string[];
}

interface CapabilityManifest {
  readonly server: { readonly version: string };
}

interface PolicyDocument extends VersionPolicy {
  readonly sources: readonly { readonly id: string; readonly url: string }[];
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function validateDocument(schema: object, value: unknown, label: string): GateReport {
  const report = new GateReport();
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  report.require(
    validate(value),
    `${label} does not match its schema: ${ajv.errorsText(validate.errors)}`,
  );
  return report;
}

function verifyRepository(
  policy: PolicyDocument,
  contracts: readonly PublicContractSnapshot[],
  packageMetadata: PackageMetadata,
  manifest: CapabilityManifest,
  metadataSource: string,
  documentation: string,
): GateReport {
  const report = verifyContractEvolution(policy, contracts);
  const current = contracts.at(-1);
  report.require(
    current !== undefined && policy.contract.current.endsWith(`/${current.packageVersion}.json`),
    `Policy current contract does not identify ${current?.packageVersion ?? 'the retained contract'}`,
  );
  report.require(
    contracts[0]?.packageVersion === policy.package.firstStableVersion,
    'The first retained contract does not match the declared first stable version',
  );
  report.require(
    manifest.server.version === packageMetadata.version,
    `config/capabilities.json version ${manifest.server.version} differs from package.json`,
  );
  const escapedContractVersion = (current?.packageVersion ?? '').replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
  const candidatePattern = new RegExp(
    `^${escapedContractVersion}-${policy.package.prereleaseIdentifier}\\.[1-9]\\d*$`,
    'u',
  );
  report.require(
    current?.status === 'published'
      ? packageMetadata.version === current.packageVersion
      : packageMetadata.version === policy.package.developmentVersion ||
          candidatePattern.test(packageMetadata.version),
    `${packageMetadata.version} is not allowed for the ${current?.status ?? 'missing'} current contract`,
  );
  const metadataVersion = /SERVER_VERSION\s*=\s*'([^']+)'/u.exec(metadataSource)?.[1];
  report.require(
    metadataVersion === packageMetadata.version,
    `src/metadata.ts version ${metadataVersion ?? 'missing'} differs from package.json`,
  );
  for (const required of [
    'config/version-policy.json',
    'config/version-policy.schema.json',
    'config/public-contract.schema.json',
    'config/contracts',
    'docs/VERSIONING.md',
  ]) {
    report.require(
      packageMetadata.files.includes(required),
      `${required} is absent from the package`,
    );
  }
  for (const source of policy.sources) {
    report.require(
      documentation.includes(source.id) && documentation.includes(source.url),
      `docs/VERSIONING.md does not attribute ${source.id} to ${source.url}`,
    );
  }
  return report;
}

async function main(): Promise<void> {
  const policySchema = await loadJson<object>('config/version-policy.schema.json');
  const contractSchema = await loadJson<object>('config/public-contract.schema.json');
  const policy = await loadJson<PolicyDocument>('config/version-policy.json');
  const packageMetadata = await loadJson<PackageMetadata>('package.json');
  const manifest = await loadJson<CapabilityManifest>('config/capabilities.json');
  const metadataSource = await readFile(resolve(repositoryRoot, 'src/metadata.ts'), 'utf8');
  const documentation = await readFile(resolve(repositoryRoot, 'docs/VERSIONING.md'), 'utf8');
  const contractFiles = (await readdir(resolve(repositoryRoot, 'config/contracts')))
    .filter((file) => /^\d+\.\d+\.\d+\.json$/u.test(file))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const contracts = await Promise.all(
    contractFiles.map(
      async (file) => await loadJson<PublicContractSnapshot>(`config/contracts/${file}`),
    ),
  );

  const report = new GateReport();
  report.failures.push(...validateDocument(policySchema, policy, 'Version policy').failures);
  for (const [index, contract] of contracts.entries()) {
    report.failures.push(
      ...validateDocument(
        contractSchema,
        contract,
        `Public contract ${basename(contractFiles[index] ?? 'unknown')}`,
      ).failures,
    );
  }
  report.failures.push(
    ...verifyRepository(policy, contracts, packageMetadata, manifest, metadataSource, documentation)
      .failures,
  );

  const current = contracts.at(-1);
  if (current !== undefined) {
    const silentlyChanged = structuredClone(current);
    const firstTool = silentlyChanged.tools[0] as { inputSchemaDigest: string } | undefined;
    if (firstTool !== undefined) firstTool.inputSchemaDigest = `sha256:${'0'.repeat(64)}`;
    expectSeededFailure(
      'silent public contract drift',
      verifyPublicContract(current, silentlyChanged),
    );
  }
  expectSeededFailure('missing contract history', verifyContractEvolution(policy, []));

  reportOrExit(
    'Version policy',
    report,
    `Version policy is consistent and its gate detects seeded defects: ${String(contracts.length)} retained contract(s), ${String(current?.tools.length ?? 0)} tools, ${String(current?.resources.length ?? 0)} resources, and ${String(current?.schemas.length ?? 0)} public schemas are governed.`,
  );
}

await main();
