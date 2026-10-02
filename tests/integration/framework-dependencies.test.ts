import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { Ajv2020 } from 'ajv/dist/2020.js';

import type { CompatibilityMatrix } from '../../scripts/lib/compatibility.js';
import {
  changedDependencies,
  frameworkDependencies,
  readDependencyFiles,
  refreshFrameworkProof,
  scopedFrameworkHolds,
  verifyDependencyMap,
  type DependencyFile,
  type DependencyMap,
  type FrameworkDependencies,
} from '../../scripts/lib/framework-dependencies.js';
import {
  frameworkSources,
  observeFrameworkPage,
  migrateFrameworkLedger,
  type FrameworkLedger,
} from '../../scripts/lib/framework-change.js';
import { collectDeclaredScenarios } from '../../scripts/lib/scenarios.js';

const root = resolve(import.meta.dirname, '../..');
const load = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const matrix = await load<CompatibilityMatrix>('config/compatibility.json');
const sources = frameworkSources(matrix, await load('config/rule-catalog.json'));
const map = await load<DependencyMap>('config/framework-dependencies.json');
const declarations = await collectDeclaredScenarios(resolve(root, 'tests'));
// The actual working-tree controls are separate. These mutation controls model a committed baseline.
const files = (await readDependencyFiles(root)).map((file) => ({ ...file, tracked: true }));
const identities = frameworkDependencies(sources, matrix, map, files, declarations);
const now = Date.parse('2026-10-02T12:00:00Z');
const stamp = new Date(now).toISOString();
const hash = `sha256:${'a'.repeat(64)}`;
const commit = 'b'.repeat(40);
const ciRun = 'https://github.com/Brandon-Born/bga-mcp/actions/runs/1';
const baseline: FrameworkLedger = {
  schemaVersion: 2,
  owner: 'Brandon-Born',
  monitoringDays: 7,
  emergencyResponseHours: 24,
  observations: sources.map((source) => {
    const dependencies = identities.get(source.url);
    if (dependencies === undefined) throw new Error('Missing real identity');
    return {
      url: source.url,
      digest: hash,
      observedAt: stamp,
      needsReview: false,
      review: {
        digest: hash,
        implementationDigest: dependencies.semanticDigest,
        evidenceDigest: hash,
        evidenceCommit: commit,
        ciRun,
        reviewer: 'synthetic scope control',
        reviewedAt: stamp,
        fixturePaths: ['tests/fixtures/projects/legacy'],
        scenarios: source.scenarios,
        dependencies,
        proof: {
          dependencyDigest: dependencies.proofDigest,
          evidenceDigest: hash,
          evidenceCommit: commit,
          ciRun,
          recordedAt: stamp,
        },
      },
    };
  }),
};
const mutate = (path: string): readonly DependencyFile[] =>
  files.map((file) =>
    file.path === path ? { ...file, text: `${file.text ?? ''}\n// scope mutation` } : file,
  );
const scope = (inputs: readonly DependencyFile[]) =>
  frameworkDependencies(sources, matrix, map, inputs, declarations);
const holds = (current: ReadonlyMap<string, FrameworkDependencies>, ledger = baseline) =>
  scopedFrameworkHolds(sources, ledger, current, now);

it('[GATE-FRAMEWORK-CHANGE] real mapping validates and has no unexplained committed inputs', () => {
  expect(verifyDependencyMap(map, sources).failures).toEqual([]);
  expect([...identities.values()].flatMap((identity) => identity.issues)).toEqual([]);
  expect(holds(identities)).toEqual([]);
  const duplicate = {
    ...map,
    groups: [...map.groups, map.groups[0]].filter((group) => group !== undefined),
  };
  expect(verifyDependencyMap(duplicate, sources).failed).toBe(true);
  expect(
    verifyDependencyMap(
      { ...map, groups: map.groups.filter((group) => group.role !== 'semantic') },
      sources,
    ).failed,
  ).toBe(true);
});

it.each([
  'src/project/php.ts',
  'src/policy.ts',
  'config/compatibility.json',
  'config/rule-catalog.json',
  'scripts/lib/framework-dependencies.ts',
  'docs/RULES.md',
])(
  '[INT-FRAMEWORK-CHANGE] changed shared interpretation dependency %s holds every affected source',
  (path) => {
    const current = scope(mutate(path));
    const affected = sources.filter((source) =>
      identities.get(source.url)?.semantic.some((entry) => entry.path === path),
    );
    expect(affected.length).toBe(sources.length);
    expect(holds(current).map((hold) => hold.url)).toEqual(affected.map((source) => source.url));
    expect(holds(current).every((hold) => hold.changedSemanticPaths.includes(path))).toBe(true);
  },
);

it('[INT-FRAMEWORK-CHANGE] relevant fixture holds exactly its mapped claims and conservative consumers', () => {
  const path = 'tests/fixtures/projects/comment-contract-controls/modules/php/Game.php';
  const current = scope(mutate(path));
  const affected = sources.filter((source) =>
    identities.get(source.url)?.semantic.some((entry) => entry.path === path),
  );
  expect(affected.length).toBeGreaterThan(0);
  expect(holds(current).map((hold) => hold.url)).toEqual(affected.map((source) => source.url));
});

it.each(['config/publication.json', 'docs/verification/bga415-dry-run.json'])(
  '[INT-FRAMEWORK-CHANGE] unrelated release bookkeeping %s retains interpretation and proof identities',
  (path) => {
    const current = scope(mutate(path));
    expect(current).toEqual(identities);
    expect(holds(current)).toEqual([]);
    expect(baseline.observations[0]?.review?.evidenceCommit).toBe(commit);
  },
);

it('[INT-FRAMEWORK-RETEST] a changed proving test requires proof, preserving original interpretation provenance', () => {
  const path = 'tests/e2e/validate-action-contracts.test.ts';
  const current = scope(mutate(path));
  const affected = holds(current);
  const filesystemProof = scope(mutate('tests/e2e/cancellation.test.ts'));
  expect(holds(filesystemProof)).toHaveLength(sources.length);
  expect(
    holds(filesystemProof).every(
      (hold) =>
        hold.changedSemanticPaths.length === 0 &&
        hold.changedProofPaths.includes('tests/e2e/cancellation.test.ts'),
    ),
  ).toBe(true);
  expect(affected.length).toBeGreaterThan(0);
  expect(
    affected.every(
      (hold) => hold.changedSemanticPaths.length === 0 && hold.changedProofPaths.includes(path),
    ),
  ).toBe(true);
  const refreshed = {
    ...baseline,
    observations: baseline.observations.map((entry) => {
      const identity = current.get(entry.url);
      if (identity === undefined || entry.review === null) throw new Error('Missing control');
      return {
        ...entry,
        review: refreshFrameworkProof(entry.review, identity, {
          ...entry.review.proof,
          dependencyDigest: identity.proofDigest,
          evidenceDigest: hash,
          evidenceCommit: 'c'.repeat(40),
          ciRun,
          recordedAt: stamp,
        }),
      };
    }),
  };
  expect(holds(current, refreshed)).toEqual([]);
  expect(
    refreshed.observations.every(
      (entry) => entry.review.evidenceCommit === commit && entry.review.reviewedAt === stamp,
    ),
  ).toBe(true);
  expect(refreshed.observations[0]?.review.proof?.evidenceCommit).toBe('c'.repeat(40));
  const changedReader = scope(mutate('src/project/php.ts'));
  const first = baseline.observations[0]?.review;
  const identity = changedReader.get(sources[0]?.url ?? '');
  if (first?.proof === undefined || identity === undefined) throw new Error('Missing control');
  const originalProof = first.proof;
  const originalIdentity = identities.get(sources[0]?.url ?? '');
  if (originalIdentity === undefined || first.dependencies === undefined)
    throw new Error('Missing control');
  const originalDependencies = first.dependencies;
  expect(() =>
    refreshFrameworkProof(
      { ...first, dependencies: { ...originalDependencies, semantic: [] } },
      originalIdentity,
      originalProof,
    ),
  ).toThrow('cannot replace');
  expect(() =>
    refreshFrameworkProof(first, identity, {
      ...originalProof,
      dependencyDigest: identity.proofDigest,
    }),
  ).toThrow('cannot replace');
});

it.each(['new', 'untracked', 'rename', 'delete', 'symlink', 'ambiguous-import'])(
  '[INT-FRAMEWORK-CHANGE] %s inputs cannot escape dependency admission',
  (kind) => {
    const path = 'src/project/php.ts';
    let inputs: readonly DependencyFile[];
    if (kind === 'new')
      inputs = [
        ...files,
        {
          path: 'src/project/unmapped.ts',
          text: 'export const newReader = true;',
          tracked: false,
          regular: true,
        },
      ];
    else if (kind === 'rename')
      inputs = files.map((file) =>
        file.path === path ? { ...file, path: 'src/project/renamed.ts' } : file,
      );
    else if (kind === 'delete') inputs = files.filter((file) => file.path !== path);
    else
      inputs = files.map((file) =>
        file.path !== path
          ? file
          : kind === 'untracked'
            ? { ...file, tracked: false }
            : kind === 'symlink'
              ? { ...file, regular: false, text: null }
              : { ...file, text: `${file.text ?? ''}\nimport(variable);` },
      );
    expect(holds(scope(inputs)).length).toBe(sources.length);
    expect(holds(scope(inputs)).every((hold) => hold.reasons.length > 0)).toBe(true);
  },
);

it('[INT-FRAMEWORK-CHANGE] import reach overrides an unrelated label and missing scenario declarations hold', () => {
  const inputs = files.map((file) =>
    file.path === 'src/project/php.ts'
      ? { ...file, text: `${file.text ?? ''}\nimport '../../config/publication.json';` }
      : file,
  );
  const current = scope(inputs);
  expect(
    [...current.values()].every((identity) =>
      identity.semantic.some((entry) => entry.path === 'config/publication.json'),
    ),
  ).toBe(true);
  const missing = frameworkDependencies(sources, matrix, map, files, new Map());
  expect(holds(missing).length).toBe(sources.length);
  const changedGenerated = files.map((file) =>
    file.path === 'tests/e2e/packaged-server.test.ts'
      ? {
          ...file,
          text:
            file.text?.replace(
              "pathToFileURL(resolve(packageRoot, 'dist/index.js')).href",
              'unknownGeneratedImport',
            ) ?? null,
        }
      : file,
  );
  expect(holds(scope(changedGenerated))).toHaveLength(sources.length);
  expect(
    [...scope(changedGenerated).values()].every((identity) =>
      identity.issues.some((issue) =>
        issue.includes('Ambiguous module dependency: tests/e2e/packaged-server.test.ts'),
      ),
    ),
  ).toBe(true);
  const noGeneratedReview = frameworkDependencies(
    sources,
    matrix,
    { ...map, generatedImports: [] },
    files,
    declarations,
  );
  expect(holds(noGeneratedReview)).toHaveLength(sources.length);
});

it('[GATE-FRAMEWORK-CHANGE] schema, snapshot integrity, legacy migration and live source freshness remain required', async () => {
  const validator = new Ajv2020({ strict: false }).compile(
    await load<object>('config/framework-review.schema.json'),
  );
  expect(validator(baseline)).toBe(true);
  const withoutScope = {
    ...baseline,
    observations: baseline.observations.map((entry) => ({
      ...entry,
      review: {
        digest: hash,
        implementationDigest: hash,
        evidenceDigest: hash,
        evidenceCommit: commit,
        ciRun,
        reviewer: 'old',
        reviewedAt: stamp,
        fixturePaths: ['tests/fixtures/projects/legacy'],
        scenarios: [],
      },
    })),
  };
  expect(validator(withoutScope)).toBe(false);
  expect(holds(identities, { ...baseline, schemaVersion: 1 }).length).toBe(sources.length);
  const migrated = migrateFrameworkLedger({ ...baseline, schemaVersion: 1 });
  expect(migrated.observations.every((entry) => entry.review === null && entry.needsReview)).toBe(
    true,
  );
  expect(holds(identities, migrated).length).toBe(sources.length);
  expect(() => migrateFrameworkLedger(migrated)).toThrow('unmigrated');
  const altered = {
    ...baseline,
    observations: baseline.observations.map((entry) => {
      if (entry.review?.dependencies === undefined) throw new Error('Missing control');
      return {
        ...entry,
        review: { ...entry.review, dependencies: { ...entry.review.dependencies, semantic: [] } },
      };
    }),
  };
  expect(holds(identities, altered).length).toBe(sources.length);
  const source = sources[0];
  if (source === undefined) throw new Error('No source');
  expect(
    holds(
      identities,
      observeFrameworkPage(baseline, source.url, `sha256:${'d'.repeat(64)}`, stamp),
    )[0]?.state,
  ).toBe('stale');
  expect(holds(identities, observeFrameworkPage(baseline, source.url, null, stamp))[0]?.state).toBe(
    'unreachable',
  );
  expect(
    scopedFrameworkHolds(sources, baseline, identities, now + 8 * 86_400_000).every(
      (hold) => hold.state === 'expired',
    ),
  ).toBe(true);
  expect(
    changedDependencies([], identities.get(source.url)?.semantic ?? []).length,
  ).toBeGreaterThan(0);
});

it('[INT-FRAMEWORK-CHANGE] real inventory catches ignored/untracked files and tracked deletion in an isolated repository', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'bga-dependency-inventory-'));
  const execute = promisify(execFile);
  try {
    await execute('git', ['init', '--quiet'], { cwd: directory });
    await mkdir(resolve(directory, 'src'), { recursive: true });
    await writeFile(resolve(directory, '.gitignore'), 'src/ignored.ts\n');
    await writeFile(resolve(directory, 'src/removed.ts'), 'old');
    await execute('git', ['add', '.gitignore', 'src/removed.ts'], { cwd: directory });
    await rm(resolve(directory, 'src/removed.ts'));
    await writeFile(resolve(directory, 'src/new.ts'), 'new');
    await writeFile(resolve(directory, 'src/ignored.ts'), 'ignored');
    const inventory = await readDependencyFiles(directory);
    expect(inventory.find((file) => file.path === 'src/removed.ts')).toMatchObject({
      tracked: true,
      text: null,
    });
    for (const path of ['src/new.ts', 'src/ignored.ts'])
      expect(inventory.find((file) => file.path === path)).toMatchObject({ tracked: false });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
