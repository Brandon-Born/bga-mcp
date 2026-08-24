import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildReleaseCandidateManifest,
  type CandidateEvidence,
  type CapabilityManifest,
  type ReleaseInventory,
  type ReleasePackageIdentity,
  verifyReleaseInventory,
} from '../../scripts/lib/release.js';
import { parseReleaseInventory, releaseIncludes } from '../../src/release.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function candidateEvidence(
  inventory: ReleaseInventory,
  manifest: CapabilityManifest,
  commit: string,
  artifactDigest: string,
): CandidateEvidence {
  const selected = [
    ...inventory.transports.map((name) => ({
      kind: 'transport' as const,
      entry: manifest.transports.find((entry) => entry.name === name),
    })),
    ...(['tools', 'resources', 'prompts'] as const).flatMap((collection) =>
      inventory.capabilities[collection].map((name) => ({
        kind:
          collection === 'tools'
            ? ('tool' as const)
            : collection === 'resources'
              ? ('resource' as const)
              : ('prompt' as const),
        entry: manifest.capabilities[collection].find((entry) => entry.name === name),
      })),
    ),
  ];
  return {
    source: { commit, clean: true },
    package: {
      name: 'bga-mcp',
      version: '1.0.0-rc.1',
      lockDigest: `sha256:${'3'.repeat(64)}`,
      artifactDigest,
    },
    capabilities: selected.map(({ kind, entry }) => {
      if (entry === undefined) throw new Error('Seeded evidence entry is missing');
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

describe('release inventory gate', () => {
  it('[GATE-RELEASE-INVENTORY] rejects excluded entries, runtime drift, and evidence from another commit or artifact', async () => {
    const raw = await loadJson<unknown>('config/release.json');
    const inventory: ReleaseInventory = parseReleaseInventory(raw);
    const manifest = await loadJson<CapabilityManifest>('config/capabilities.json');
    const packageIdentity = await loadJson<ReleasePackageIdentity>('package.json');
    expect(
      verifyReleaseInventory(inventory, manifest, undefined, packageIdentity).failures,
    ).toEqual([]);
    expect(
      verifyReleaseInventory(inventory, manifest, undefined, {
        ...packageIdentity,
        bin: { ...packageIdentity.bin, 'bga-mcp': 'dist/cli.js' },
      }).failures,
    ).toContainEqual(expect.stringContaining('does not select'));
    expect(releaseIncludes(inventory, 'tools', 'inspect_project')).toBe(true);
    expect(releaseIncludes(inventory, 'tools', 'search_bga_docs')).toBe(false);
    expect(releaseIncludes(undefined, 'tools', 'search_bga_docs')).toBe(true);

    const exposed: ReleaseInventory = {
      ...inventory,
      capabilities: {
        ...inventory.capabilities,
        tools: [...inventory.capabilities.tools, 'read_studio_logs'],
      },
    };
    expect(verifyReleaseInventory(exposed, manifest).failures).toContainEqual(
      expect.stringContaining('not verified'),
    );

    expect(
      verifyReleaseInventory(inventory, manifest, {
        tools: inventory.capabilities.tools.filter((name) => name !== 'inspect_project'),
        resources: inventory.capabilities.resources,
        prompts: inventory.capabilities.prompts,
      }).failures,
    ).toContainEqual(expect.stringContaining('discovery differs'));

    const commit = '1'.repeat(40);
    const artifact = `sha256:${'2'.repeat(64)}`;
    const candidateInventory = { ...inventory, status: 'verified' as const };
    const evidence = candidateEvidence(candidateInventory, manifest, commit, artifact);
    const candidate = buildReleaseCandidateManifest(
      candidateInventory,
      manifest,
      evidence,
      'v1.0.0-rc.1',
      commit,
      'bga-mcp-1.0.0-rc.1.tgz',
      artifact,
    );
    expect(candidate).toMatchObject({
      release: {
        id: 'first-local-only',
        sourceCommit: commit,
        digests: { artifact },
      },
      capabilities: {
        tools: candidateInventory.capabilities.tools.map((name) => ({ name })),
        resources: candidateInventory.capabilities.resources.map((name) => ({ name })),
        prompts: [],
      },
      adapters: [],
    });
    for (const digest of Object.values(candidate.release.digests)) {
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    }

    for (const defective of [
      { ...evidence, source: { commit: '0'.repeat(40), clean: true } },
      {
        ...evidence,
        package: { ...evidence.package, artifactDigest: `sha256:${'9'.repeat(64)}` },
      },
    ]) {
      expect(() =>
        buildReleaseCandidateManifest(
          candidateInventory,
          manifest,
          defective,
          'v1.0.0-rc.1',
          commit,
          'bga-mcp-1.0.0-rc.1.tgz',
          artifact,
        ),
      ).toThrow(/ineligible/iu);
    }
  });
});
