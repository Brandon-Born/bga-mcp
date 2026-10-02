import { cp, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CompatibilityMatrix } from '../../scripts/lib/compatibility.js';
import {
  frameworkSources,
  observeFrameworkPage,
  verifyFrameworkRetest,
  type FrameworkLedger,
  type FrameworkTestEvidence,
} from '../../scripts/lib/framework-change.js';
import {
  frameworkDependencies,
  readDependencyFiles,
  scopedFrameworkHolds,
  type DependencyMap,
} from '../../scripts/lib/framework-dependencies.js';
import { collectDeclaredScenarios } from '../../scripts/lib/scenarios.js';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPublicPackagedServer,
} from '../helpers/packaged.js';

it('[E2E-FRAMEWORK-CHANGE-LIFECYCLE] detects drift, holds publication, updates an original fixture and restores only after packaged retest', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const matrix = JSON.parse(
    await readFile(resolve(root, 'config/compatibility.json'), 'utf8'),
  ) as CompatibilityMatrix;
  const sources = frameworkSources(
    matrix,
    JSON.parse(await readFile(resolve(root, 'config/rule-catalog.json'), 'utf8')) as Parameters<
      typeof frameworkSources
    >[1],
  );
  const source = sources.find((page) => page.url.endsWith('Studio_file_reference'));
  if (source === undefined) throw new Error('Missing impact source');
  const dependencies = frameworkDependencies(
    [source],
    matrix,
    JSON.parse(
      await readFile(resolve(root, 'config/framework-dependencies.json'), 'utf8'),
    ) as DependencyMap,
    (await readDependencyFiles(root)).map((file) => ({ ...file, tracked: true })),
    await collectDeclaredScenarios(resolve(root, 'tests')),
  );
  const identity = dependencies.get(source.url);
  if (identity === undefined || identity.issues.length > 0)
    throw new Error('Unmapped framework lifecycle proof');
  const server = await installPackagedServer('framework-change', {
    project: 'modern-generated-regression',
  });
  try {
    const variant = resolve(server.temporaryRoot, 'updated-fixture');
    await cp(server.projects.project, variant, { recursive: true });
    const stamp = '2026-10-02T00:00:00Z';
    const oldDigest = `sha256:${'a'.repeat(64)}`;
    const newDigest = `sha256:${'b'.repeat(64)}`;
    const codeDigest = identity.semanticDigest;
    // Synthetic future-change signal uses an already documented JSONC form;
    // this is process proof, not a claim that BGA changed on this date.
    const ledger: FrameworkLedger = {
      schemaVersion: 2,
      owner: 'Brandon-Born',
      monitoringDays: 7,
      emergencyResponseHours: 24,
      observations: [
        {
          url: source.url,
          observedAt: stamp,
          digest: oldDigest,
          review: {
            digest: oldDigest,
            implementationDigest: codeDigest,
            evidenceDigest: codeDigest,
            evidenceCommit: 'a'.repeat(40),
            ciRun: 'https://github.com/Brandon-Born/bga-mcp/actions/runs/1',
            reviewer: 'synthetic',
            reviewedAt: stamp,
            fixturePaths: ['tests/fixtures/projects/modern-generated-regression'],
            scenarios: source.scenarios,
            dependencies: identity,
            proof: {
              dependencyDigest: identity.proofDigest,
              evidenceDigest: codeDigest,
              evidenceCommit: 'a'.repeat(40),
              ciRun: 'https://github.com/Brandon-Born/bga-mcp/actions/runs/1',
              recordedAt: stamp,
            },
          },
          needsReview: false,
        },
      ],
    };
    const changed = observeFrameworkPage(ledger, source.url, newDigest, stamp);
    expect(
      scopedFrameworkHolds([source], changed, dependencies, Date.parse(stamp))[0],
    ).toMatchObject({
      state: 'stale',
      claims: source.claims,
      scenarios: source.scenarios,
    });
    // The stale regression assertion assumed a PHP statistics file. It fails
    // against the unchanged original fixture. Update it to the documented form.
    await expect(readFile(resolve(variant, 'stats.inc.php'), 'utf8')).rejects.toThrow();
    await rename(resolve(variant, 'stats.jsonc'), resolve(variant, 'stats.json'));
    const before = await digestDirectory(variant);
    await withPublicPackagedServer(server, ['--project-root', variant], async (client) => {
      const result = await callTool<{
        components: { id: string; present: boolean; files: string[] }[];
      }>(client, 'inspect_project', { projectRoot: variant });
      expect(result.isError).toBe(false);
      expect(
        result.structured?.components.find((entry) => entry.id === 'statistics'),
      ).toMatchObject({ present: true });
      await rename(resolve(variant, 'stats.json'), resolve(variant, 'stats.jsonc'));
      const updated = await callTool<{ components: { id: string; present: boolean }[] }>(
        client,
        'inspect_project',
        { projectRoot: variant },
      );
      expect(
        updated.structured?.components.find((entry) => entry.id === 'statistics')?.present,
      ).toBe(true);
    });
    // Passing the fixture alone does not clear the process hold.
    expect(scopedFrameworkHolds([source], changed, dependencies, Date.parse(stamp))).toHaveLength(
      1,
    );
    const retest: FrameworkTestEvidence = {
      source: { commit: 'a'.repeat(40), clean: true },
      generatedAt: stamp,
      scenarios: { failed: 0, missing: 0 },
      tests: { failed: 0, passed: 1 },
      claims: [{ scenarios: source.scenarios.map((id) => ({ id, status: 'passed' })) }],
    };
    expect(verifyFrameworkRetest(source, { ...retest, claims: [] }, stamp).failed).toBe(true);
    expect(verifyFrameworkRetest(source, retest, stamp).failed).toBe(false);
    const observation = changed.observations[0];
    if (observation?.review === null || observation === undefined)
      throw new Error('Missing review control');
    const restored = {
      ...changed,
      observations: [
        {
          ...observation,
          needsReview: false,
          review: { ...observation.review, digest: newDigest },
        },
      ],
    };
    expect(scopedFrameworkHolds([source], restored, dependencies, Date.parse(stamp))).toEqual([]);
    expect(await digestDirectory(variant)).not.toBe(before); // Only the fixture update changes files.
  } finally {
    await server.cleanup();
  }
}, 180_000);
