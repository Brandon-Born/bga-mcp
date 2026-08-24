import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { sealEvidence, type Evidence } from '../../scripts/lib/evidence.js';
import {
  type CandidateBundleInput,
  type CandidateSource,
  type VersionPolicySummary,
  verifyCandidateSource,
  verifyCandidateWorkflow,
  writeCandidateBundle,
} from '../../scripts/lib/release-candidate.js';
import {
  type CapabilityManifest,
  type ReleaseInventory,
  releaseDigest,
} from '../../scripts/lib/release.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');

async function loadText(path: string): Promise<string> {
  return await readFile(resolve(repositoryRoot, path), 'utf8');
}

function selectedEvidence(
  inventory: ReleaseInventory,
  manifest: CapabilityManifest,
): Evidence['capabilities'] {
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
  ];
  return entries.map(({ kind, entry }) => {
    if (entry === undefined) throw new Error('Candidate test could not resolve a selected entry');
    return {
      kind,
      name: entry.name,
      stability: entry.stability,
      status: 'passed' as const,
      supportedLayouts: entry.supportedLayouts ?? [],
      environments: entry.environments ?? [],
      protocolVersions: entry.protocolVersions ?? [],
      ci: { id: entry.ciEvidence, conclusion: 'success', covers: 'this-commit' as const },
      scenarios: entry.requiredScenarios.map((id) => ({
        id,
        status: 'passed' as const,
        tests: [
          { file: 'tests/e2e/seed.test.ts', title: `[${id}] seed`, status: 'passed' as const },
        ],
      })),
    };
  });
}

function evidenceFor(
  inventory: ReleaseInventory,
  manifest: CapabilityManifest,
  source: CandidateSource,
  artifactDigest: string,
): Evidence {
  const capabilities = selectedEvidence(inventory, manifest);
  const scenarioIds = new Set(
    capabilities.flatMap((entry) => entry.scenarios.map((entry) => entry.id)),
  );
  return sealEvidence({
    schemaVersion: 1,
    generatedAt: '2026-08-15T00:00:00.000Z',
    source: { commit: source.commit, clean: true },
    package: {
      name: source.packageName,
      version: source.packageVersion,
      lockDigest: source.lockDigest,
      artifactDigest,
      artifactRuns: [{ suite: 'candidate-seed', digest: artifactDigest }],
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      packageManager: 'pnpm@11.15.1',
      ci: true,
    },
    protocol: {
      supportedVersions: ['2025-11-25'],
      transports: ['stdio'],
      conformance: {
        status: 'passed',
        coverage: [{ version: '2025-11-25', status: 'passed', runs: 1 }],
        runs: [],
      },
    },
    ci: [],
    capabilities,
    claims: [],
    scenarios: {
      required: scenarioIds.size,
      passed: scenarioIds.size,
      failed: 0,
      missing: 0,
    },
    tests: { files: 1, total: 1, passed: 1, failed: 0, skipped: 0 },
  });
}

describe('release candidate pipeline', () => {
  it('[GATE-RELEASE-CANDIDATE] rejects automatic or publishing workflows and ineligible source identities', async () => {
    const workflow = await loadText('.github/workflows/release-candidate.yml');
    expect(verifyCandidateWorkflow(workflow).failures).toEqual([]);
    expect(verifyCandidateWorkflow(`${workflow}\npush:\n  branches: [main]\n`).failed).toBe(true);
    expect(
      verifyCandidateWorkflow(workflow.replace('contents: read', 'id-token: write')).failed,
    ).toBe(true);
    expect(verifyCandidateWorkflow(`${workflow}\n# npm publish\n`).failed).toBe(true);

    const policy = JSON.parse(await loadText('config/version-policy.json')) as VersionPolicySummary;
    const source: CandidateSource = {
      tag: 'v1.0.0-rc.1',
      commit: '1'.repeat(40),
      tagCommit: '1'.repeat(40),
      clean: true,
      packageName: 'bga-mcp',
      packageVersion: '1.0.0-rc.1',
      manifestVersion: '1.0.0-rc.1',
      metadataVersion: '1.0.0-rc.1',
      lockDigest: `sha256:${'2'.repeat(64)}`,
    };
    expect(verifyCandidateSource(source, policy).failures).toEqual([]);
    expect(verifyCandidateSource({ ...source, clean: false }, policy).failed).toBe(true);
    expect(verifyCandidateSource({ ...source, tagCommit: '0'.repeat(40) }, policy).failed).toBe(
      true,
    );
    expect(verifyCandidateSource({ ...source, packageVersion: '1.0.0' }, policy).failed).toBe(true);
  });

  it('[INT-RELEASE-CANDIDATE-DRY-RUN] retains the original reproducible bytes and refuses drift or overwrite', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-candidate-test-'));
    try {
      const policy = JSON.parse(
        await loadText('config/version-policy.json'),
      ) as VersionPolicySummary;
      const inventoryText = await loadText('config/release.json');
      const inventory = JSON.parse(inventoryText) as ReleaseInventory;
      const manifestSource = JSON.parse(
        await loadText('config/capabilities.json'),
      ) as CapabilityManifest;
      const capabilityManifest: CapabilityManifest = {
        ...manifestSource,
        server: { ...manifestSource.server, version: '1.0.0-rc.1' },
      };
      const capabilityManifestText = `${JSON.stringify(capabilityManifest, null, 2)}\n`;
      const source: CandidateSource = {
        tag: 'v1.0.0-rc.1',
        commit: '1'.repeat(40),
        tagCommit: '1'.repeat(40),
        clean: true,
        packageName: 'bga-mcp',
        packageVersion: '1.0.0-rc.1',
        manifestVersion: '1.0.0-rc.1',
        metadataVersion: '1.0.0-rc.1',
        lockDigest: `sha256:${'2'.repeat(64)}`,
      };
      const artifactPath = resolve(temporaryRoot, 'bga-mcp-1.0.0-rc.1.tgz');
      const reconstructionPath = resolve(temporaryRoot, 'reconstructed.tgz');
      const artifact = Buffer.from('deterministic candidate bytes\n');
      await Promise.all([
        writeFile(artifactPath, artifact),
        writeFile(reconstructionPath, artifact),
      ]);
      const artifactDigest = releaseDigest(artifact);
      const evidence = evidenceFor(inventory, capabilityManifest, source, artifactDigest);
      const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`;
      const base: CandidateBundleInput = {
        source,
        policy,
        inventory,
        inventoryText,
        capabilityManifest,
        capabilityManifestText,
        evidence,
        evidenceText,
        schemaText: await loadText('config/release-candidate.schema.json'),
        artifactPath,
        reconstructionPath,
        artifactPackage: { name: 'bga-mcp', bin: { 'bga-mcp': inventory.entrypoint } },
        reconstructionPackage: { name: 'bga-mcp', bin: { 'bga-mcp': inventory.entrypoint } },
        outputDirectory: resolve(temporaryRoot, 'output'),
      };

      const bundle = await writeCandidateBundle(base);
      expect(await readFile(bundle.artifact)).toEqual(artifact);
      expect(bundle.manifestDocument.release).toMatchObject({
        sourceTag: source.tag,
        sourceCommit: source.commit,
        packageVersion: source.packageVersion,
        artifactName: 'bga-mcp-1.0.0-rc.1.tgz',
        lockDigest: source.lockDigest,
        digests: { artifact: artifactDigest },
      });
      const schema = JSON.parse(base.schemaText) as object;
      expect(new Ajv2020({ strict: true }).compile(schema)(bundle.manifestDocument)).toBe(true);
      const checksumLines = (await readFile(bundle.checksums, 'utf8')).trim().split('\n');
      expect(checksumLines).toHaveLength(4);
      expect(checksumLines).toContain(
        `${createHash('sha256').update(artifact).digest('hex')}  bga-mcp-1.0.0-rc.1.tgz`,
      );

      await expect(writeCandidateBundle(base)).rejects.toThrow(/replace immutable candidate/iu);
      await expect(
        writeCandidateBundle({
          ...base,
          artifactPackage: { name: 'bga-mcp', bin: { 'bga-mcp': 'dist/cli.js' } },
          outputDirectory: resolve(temporaryRoot, 'wrong-public-command'),
        }),
      ).rejects.toThrow(/public executable/iu);
      await writeFile(reconstructionPath, 'changed reconstruction\n');
      await expect(
        writeCandidateBundle({ ...base, outputDirectory: resolve(temporaryRoot, 'drift') }),
      ).rejects.toThrow(/not reproducible/iu);
      await writeFile(reconstructionPath, artifact);
      const failedEvidence = sealEvidence({
        ...evidence,
        tests: { ...evidence.tests, failed: 1 },
      });
      await expect(
        writeCandidateBundle({
          ...base,
          evidence: failedEvidence,
          evidenceText: `${JSON.stringify(failedEvidence, null, 2)}\n`,
          outputDirectory: resolve(temporaryRoot, 'failed'),
        }),
      ).rejects.toThrow(/failed tests/iu);
      const firstCapability = evidence.capabilities[0];
      if (firstCapability === undefined) throw new Error('Candidate seed has no capability');
      const missingScenarioEvidence = sealEvidence({
        ...evidence,
        capabilities: [
          {
            ...firstCapability,
            scenarios: firstCapability.scenarios.slice(1),
          },
          ...evidence.capabilities.slice(1),
        ],
      });
      await expect(
        writeCandidateBundle({
          ...base,
          evidence: missingScenarioEvidence,
          evidenceText: `${JSON.stringify(missingScenarioEvidence, null, 2)}\n`,
          outputDirectory: resolve(temporaryRoot, 'missing-scenario'),
        }),
      ).rejects.toThrow(/scenarios differ/iu);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
