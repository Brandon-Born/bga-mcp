import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';

import {
  buildPublicContractSnapshot,
  type ContractSources,
  type PublicContractSnapshot,
  SHIPPED_SCHEMA_CONTRACTS,
  type VersionPolicy,
  verifyPublicContract,
} from '../../scripts/lib/version-policy.js';
import { connectStdio } from '../helpers/mcp.js';
import { installPackagedServer } from '../helpers/packaged.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const projectRoot = resolve(repositoryRoot, 'tests/fixtures/projects/legacy');

interface PackagedApi {
  readonly DIAGNOSTIC_CONTRACT_VERSION: number;
  readonly ERROR_CONTRACT_VERSION: number;
  readonly getPublicErrorJsonSchema: () => object;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function readTypeDeclarations(
  packageRoot: string,
  directory = resolve(packageRoot, 'dist'),
): Promise<{ path: string; text: string }[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const declarations = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return await readTypeDeclarations(packageRoot, path);
      if (!entry.name.endsWith('.d.ts')) return [];
      return [
        {
          path: relative(packageRoot, path).split(sep).join('/'),
          text: await readFile(path, 'utf8'),
        },
      ];
    }),
  );
  return declarations.flat().sort((left, right) => left.path.localeCompare(right.path));
}

describe('installed public contract', () => {
  it('[E2E-CONTRACT-COMPATIBILITY] retains the first stable contract through real discovery, calls, resources, exports, and shipped schemas', async () => {
    const installed = await installPackagedServer('version-policy', {});
    const packageRoot = installed.packageRoot;

    try {
      const policy = await readJson<VersionPolicy>(
        resolve(packageRoot, 'config/version-policy.json'),
      );
      const baseline = await readJson<PublicContractSnapshot>(
        resolve(packageRoot, policy.contract.current),
      );
      const packageMetadata = await readJson<
        ContractSources['packageMetadata'] & { version: string }
      >(resolve(packageRoot, 'package.json'));
      const inventory = await readJson<ContractSources['inventory']>(
        resolve(packageRoot, 'config/release.json'),
      );
      const manifest = await readJson<ContractSources['manifest']>(
        resolve(packageRoot, 'config/capabilities.json'),
      );
      const compatibility = await readJson<{ claims: readonly Record<string, unknown>[] }>(
        resolve(packageRoot, 'config/compatibility.json'),
      );
      const policySchema = await readJson<object>(
        resolve(packageRoot, 'config/version-policy.schema.json'),
      );
      const contractSchema = await readJson<object>(
        resolve(packageRoot, 'config/public-contract.schema.json'),
      );
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      expect(ajv.compile(policySchema)(policy)).toBe(true);
      expect(ajv.compile(contractSchema)(baseline)).toBe(true);
      const escapedVersion = baseline.packageVersion.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      const candidateVersion = new RegExp(
        `^${escapedVersion}-${policy.package.prereleaseIdentifier}\\.[1-9]\\d*$`,
        'u',
      );
      expect(
        baseline.status === 'published'
          ? packageMetadata.version === baseline.packageVersion
          : packageMetadata.version === policy.package.developmentVersion ||
              candidateVersion.test(packageMetadata.version),
      ).toBe(true);

      const packageApi = (await import(
        pathToFileURL(resolve(packageRoot, 'dist/index.js')).href
      )) as PackagedApi;
      const schemaSources: ContractSources['schemas'][number][] = await Promise.all(
        SHIPPED_SCHEMA_CONTRACTS.map(async (schema) => ({
          ...schema,
          value: await readJson<object>(resolve(packageRoot, schema.path)),
        })),
      );
      schemaSources.push({
        path: 'runtime:public-error',
        compatibility: 'schema-version',
        contractVersion: packageApi.ERROR_CONTRACT_VERSION,
        value: packageApi.getPublicErrorJsonSchema(),
      });
      expect(packageApi.DIAGNOSTIC_CONTRACT_VERSION).toBe(1);

      const connection = await connectStdio(
        installed.publicCommand.command,
        [...installed.publicCommand.arguments, '--project-root', projectRoot],
        { protocolVersion: '2025-11-25' },
      );
      const processId = connection.transport.pid;
      try {
        const tools = (await connection.client.listTools()).tools;
        const resources = (await connection.client.listResources()).resources;
        const resourceTemplates = (
          await connection.client.listResourceTemplates()
        ).resourceTemplates.map((entry) => entry.uriTemplate);
        const prompts = (await connection.client.listPrompts()).prompts.map((entry) => entry.name);
        const observed = buildPublicContractSnapshot({
          version: {
            contractVersion: baseline.contractVersion,
            packageVersion: baseline.packageVersion,
            status: baseline.status,
          },
          policy: policy as unknown as Readonly<Record<string, unknown>>,
          inventory,
          manifest,
          compatibility: {
            claims: compatibility.claims.map((claim) => ({
              id: String(claim.id),
              dimension: String(claim.dimension),
              value: String(claim.value),
              support: claim.support as 'supported' | 'unsupported' | 'unknown',
            })),
          },
          packageMetadata,
          typeDeclarations: await readTypeDeclarations(packageRoot),
          tools,
          resources,
          resourceTemplates,
          prompts,
          schemas: schemaSources,
        });
        expect(verifyPublicContract(baseline, observed).failures).toEqual([]);

        for (const name of inventory.capabilities.tools) {
          const result = await connection.client.callTool({ name, arguments: {} });
          expect(result.isError, `${name} returned an error`).not.toBe(true);
          expect(result.structuredContent, `${name} returned no structured result`).toMatchObject({
            schemaVersion: 1,
          });
        }
        for (const uri of inventory.capabilities.resources) {
          const result = await connection.client.readResource({ uri });
          expect(result.contents, `${uri} returned no content`).toHaveLength(1);
          expect(result.contents[0]).toMatchObject({ uri, mimeType: 'application/json' });
        }
      } finally {
        await connection.client.close();
        if (processId !== null) await waitForProcessExit(processId);
      }
      expect(connection.stderr()).toBe('');
    } finally {
      await installed.cleanup();
    }
  });
});
