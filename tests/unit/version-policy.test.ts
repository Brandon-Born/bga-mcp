import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  classifyContractChange,
  type PublicContractSnapshot,
  type VersionPolicy,
  verifyContractEvolution,
  verifyPublicContract,
} from '../../scripts/lib/version-policy.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function published(
  source: PublicContractSnapshot,
  packageVersion: string,
  contractVersion: number,
  releasedAt: string,
): PublicContractSnapshot {
  return {
    ...structuredClone(source),
    packageVersion,
    contractVersion,
    status: 'published',
    releasedAt,
  };
}

describe('version policy', () => {
  it('[GATE-VERSION-POLICY] rejects silent schema drift and enforces minor, major, and deprecation boundaries', async () => {
    const policy = await loadJson<VersionPolicy>('config/version-policy.json');
    const baseline = await loadJson<PublicContractSnapshot>('config/contracts/1.0.0.json');
    expect(verifyPublicContract(baseline, structuredClone(baseline)).failures).toEqual([]);

    const changedSchema = structuredClone(baseline);
    (changedSchema.tools[0] as { inputSchemaDigest: string }).inputSchemaDigest =
      `sha256:${'1'.repeat(64)}`;
    expect(verifyPublicContract(baseline, changedSchema).failed).toBe(true);
    expect(classifyContractChange(baseline, changedSchema).level).toBe('major');

    const changedPolicy = structuredClone(baseline);
    (changedPolicy as { policyDigest: string }).policyDigest = `sha256:${'3'.repeat(64)}`;
    expect(classifyContractChange(baseline, changedPolicy).level).toBe('major');

    const changedVersionedSchema = structuredClone(baseline);
    const diagnostic = changedVersionedSchema.schemas.find(
      (schema) => schema.path === 'config/diagnostics.schema.json',
    ) as { digest: string };
    diagnostic.digest = `sha256:${'2'.repeat(64)}`;
    expect(classifyContractChange(baseline, changedVersionedSchema).invalid).toContainEqual(
      expect.stringContaining('schema contract version'),
    );

    const changedSchemaVersion = structuredClone(baseline);
    const versionedDiagnostic = changedSchemaVersion.schemas.find(
      (schema) => schema.path === 'config/diagnostics.schema.json',
    ) as { contractVersion: number };
    versionedDiagnostic.contractVersion += 1;
    expect(classifyContractChange(baseline, changedSchemaVersion).level).toBe('major');

    const v1 = published(baseline, '1.0.0', 1, '2026-01-01');
    const additiveBase = published(v1, '1.0.1', 2, '2026-01-02');
    const seedTool = additiveBase.tools[0];
    if (seedTool === undefined) throw new Error('The retained contract has no tool to seed');
    const additive: PublicContractSnapshot = {
      ...additiveBase,
      tools: [
        ...additiveBase.tools,
        {
          ...structuredClone(seedTool),
          name: 'new_tool',
        },
      ],
    };
    expect(verifyContractEvolution(policy, [v1, additive]).failures).toContainEqual(
      expect.stringContaining('requires minor'),
    );
    const additiveMinor = { ...additive, packageVersion: '1.1.0' };
    expect(verifyContractEvolution(policy, [v1, additiveMinor]).failures).toEqual([]);

    const expandedBase = structuredClone(v1);
    const toolToExpand = expandedBase.tools[0];
    if (toolToExpand === undefined) throw new Error('The retained contract has no tool to expand');
    const expanded: PublicContractSnapshot = {
      ...expandedBase,
      tools: [
        {
          ...toolToExpand,
          manifest: {
            ...toolToExpand.manifest,
            supportedLayouts: [
              ...toolToExpand.manifest.supportedLayouts,
              'future-documented-layout',
            ],
          },
        },
        ...expandedBase.tools.slice(1),
      ],
      compatibility: [
        ...expandedBase.compatibility,
        {
          id: 'CLAIM-LAYOUT-FUTURE',
          dimension: 'layout',
          value: 'future-documented-layout',
          support: 'supported',
        },
      ],
    };
    expect(classifyContractChange(v1, expanded).level).toBe('minor');

    const clarifiedCompatibility = structuredClone(v1);
    const unknownClaim = clarifiedCompatibility.compatibility.find(
      (claim) => claim.support !== 'supported',
    );
    if (unknownClaim === undefined) throw new Error('The retained contract has no open claim');
    (unknownClaim as { value: string }).value = `${unknownClaim.value}-clarified`;
    expect(classifyContractChange(v1, clarifiedCompatibility).level).toBe('minor');

    const deprecatedBase = published(v1, '1.1.0', 2, '2026-01-02');
    const deprecated: PublicContractSnapshot = {
      ...deprecatedBase,
      deprecations: [
        {
          reference: `tool:${deprecatedBase.tools[0]?.name ?? 'missing'}`,
          announcedIn: '1.1.0',
          removeNotBeforeVersion: '2.0.0',
          removeNotBeforeDate: '2026-04-02',
          replacement: 'Use the retained replacement tool.',
        },
      ],
    };
    const removedBase = published(deprecated, '2.0.0', 3, '2026-04-02');
    const removed: PublicContractSnapshot = {
      ...removedBase,
      tools: removedBase.tools.slice(1),
      deprecations: [],
    };
    expect(verifyContractEvolution(policy, [v1, deprecated, removed]).failures).toEqual([]);

    const tooSoon = { ...removed, releasedAt: '2026-02-01' };
    expect(verifyContractEvolution(policy, [v1, deprecated, tooSoon]).failures).toContainEqual(
      expect.stringContaining('removed before 2026-04-02'),
    );
    const undeclaredBase = published(v1, '2.0.0', 2, '2026-04-02');
    const undeclared: PublicContractSnapshot = {
      ...undeclaredBase,
      tools: undeclaredBase.tools.slice(1),
    };
    expect(verifyContractEvolution(policy, [v1, undeclared]).failures).toContainEqual(
      expect.stringContaining('without a deprecation'),
    );
  });
});
