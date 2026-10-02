import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  frameworkReleaseGuard,
  runFrameworkChange,
  implementationDigest,
} from '../../scripts/framework-change.js';
import type { CompatibilityMatrix } from '../../scripts/lib/compatibility.js';
import {
  frameworkHolds,
  frameworkSources,
  observeFrameworkPage,
  verifyFrameworkPolicy,
  verifyFrameworkRetest,
  verifyFrameworkCi,
  type FrameworkLedger,
  type FrameworkTestEvidence,
} from '../../scripts/lib/framework-change.js';
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
const ledger = JSON.parse(
  await readFile(resolve(root, 'config/framework-review.json'), 'utf8'),
) as FrameworkLedger;
const page = sources.find((source) => source.url.endsWith('Studio_file_reference'));
if (page === undefined) throw new Error('Missing foundational page');
const now = Date.parse('2026-10-02T00:00:00Z');
const stamp = new Date(now).toISOString();
const hash = `sha256:${'a'.repeat(64)}`;
const implementation = `sha256:${'b'.repeat(64)}`;
const review = {
  digest: hash,
  implementationDigest: implementation,
  evidenceDigest: `sha256:${'c'.repeat(64)}`,
  evidenceCommit: 'd'.repeat(40),
  ciRun: 'https://github.com/Brandon-Born/bga-mcp/actions/runs/1',
  reviewer: 'synthetic control',
  reviewedAt: stamp,
  fixturePaths: ['tests/fixtures/projects/modern-generated-regression'],
  scenarios: page.scenarios,
};
const current: FrameworkLedger = {
  ...ledger,
  observations: [{ url: page.url, observedAt: stamp, digest: hash, review, needsReview: false }],
};

it('[GATE-FRAMEWORK-CHANGE] enforces ownership, cadence and exhaustive conservative impact mapping', () => {
  expect(verifyFrameworkPolicy(ledger, sources).failures).toEqual([]);
  expect(verifyFrameworkPolicy({ ...ledger, monitoringDays: 8 }, sources).failed).toBe(true);
  expect(verifyFrameworkPolicy({ ...ledger, owner: '' }, sources).failed).toBe(true);
  expect(verifyFrameworkPolicy(ledger, [{ ...page, claims: [] }]).failed).toBe(true);
  expect(page.claims).toContain('CLAIM-LAYOUT-HYBRID');
  expect(page.claims).not.toContain('CLAIM-RUNTIME-NODE-22');
  expect(sources.every((source) => source.claims.length > 0 && source.scenarios.length > 0)).toBe(
    true,
  );
});
it('[INT-FRAMEWORK-CHANGE] holds changed, unavailable, old and unmapped sources without downgrading support', () => {
  expect(frameworkHolds([page], current, implementation, now)).toEqual([]);
  const changed = observeFrameworkPage(current, page.url, `sha256:${'e'.repeat(64)}`, stamp);
  expect(frameworkHolds([page], changed, implementation, now)[0]?.state).toBe('stale');
  // Reverting text or rereading a recovered endpoint cannot silently clear a detected hold.
  const reverted = observeFrameworkPage(changed, page.url, hash, stamp);
  expect(frameworkHolds([page], reverted, implementation, now)[0]?.state).toBe('stale');
  const unreachable = observeFrameworkPage(current, page.url, null, stamp);
  expect(frameworkHolds([page], unreachable, implementation, now)[0]?.state).toBe('unreachable');
  expect(
    frameworkHolds(
      [page],
      observeFrameworkPage(unreachable, page.url, hash, stamp),
      implementation,
      now,
    )[0]?.state,
  ).toBe('stale');
  expect(frameworkHolds([page], current, implementation, now + 8 * 86_400_000)[0]?.state).toBe(
    'expired',
  );
  expect(
    frameworkHolds([page], { ...current, observations: [] }, implementation, now)[0]?.state,
  ).toBe('unreviewed');
  expect(frameworkHolds([page], current, hash, now)[0]?.state).toBe('stale');
  expect(matrix.claims.find((claim) => claim.id === 'CLAIM-LAYOUT-MODERN')?.support).toBe(
    'supported',
  );
});
it('[INT-FRAMEWORK-RETEST] requires post-observation, clean, passing targeted evidence before restoring claims', () => {
  const evidence: FrameworkTestEvidence = {
    source: { commit: 'd'.repeat(40), clean: true },
    generatedAt: stamp,
    scenarios: { failed: 0, missing: 0 },
    tests: { failed: 0, passed: 1 },
    claims: [{ scenarios: page.scenarios.map((id) => ({ id, status: 'passed' })) }],
  };
  expect(verifyFrameworkRetest(page, evidence, stamp).failures).toEqual([]);
  const ci = {
    headSha: evidence.source.commit,
    conclusion: 'success',
    status: 'completed',
    workflowName: 'CI',
  };
  expect(verifyFrameworkCi(ci, evidence.source.commit).failed).toBe(false);
  for (const run of [
    { ...ci, headSha: 'e'.repeat(40) },
    { ...ci, conclusion: 'failure' },
    { ...ci, status: 'in_progress' },
    { ...ci, workflowName: 'Other workflow' },
  ])
    expect(verifyFrameworkCi(run, evidence.source.commit).failed).toBe(true);

  for (const defective of [
    { ...evidence, source: { ...evidence.source, clean: false } },
    { ...evidence, generatedAt: '2026-10-01T00:00:00Z' },
    { ...evidence, claims: [] },
    { ...evidence, tests: { passed: 1, failed: 1 } },
    {
      ...evidence,
      claims: [{ scenarios: page.scenarios.map((id) => ({ id, status: 'failed' })) }],
    },
  ])
    expect(verifyFrameworkRetest(page, defective, stamp).failed).toBe(true);
  const changed = observeFrameworkPage(current, page.url, hash, stamp);
  const observation = changed.observations[0];
  if (observation === undefined) throw new Error('Missing control observation');
  expect(frameworkHolds([page], changed, implementation, now)).toEqual([]);
  expect(
    frameworkHolds(
      [page],
      {
        ...changed,
        observations: [{ ...observation, review: { ...review, scenarios: [] } }],
      },
      implementation,
      now,
    )[0]?.state,
  ).toBe('stale');
});

it('[GATE-FRAMEWORK-CHANGE] actual admission refuses missing baseline and arbitrary URLs before any network or write', async () => {
  const holds = frameworkHolds(sources, ledger, await implementationDigest(), Date.now());
  if (holds.length > 0)
    await expect(frameworkReleaseGuard()).rejects.toThrow('Framework release hold');
  else await expect(frameworkReleaseGuard()).resolves.toBeUndefined();
  await expect(runFrameworkChange(['observe', 'https://example.invalid/'])).rejects.toThrow(
    'exact mapped official URL',
  );
  await expect(runFrameworkChange(['review', page.url])).rejects.toThrow('observed page');
});
