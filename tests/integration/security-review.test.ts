import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  SecurityReviewPlanSchema,
  SecurityReviewSchema,
  reviewIntegrity,
  verifyReviewRecord,
  verifyReviewApproval,
  verifyReplayDigest,
  type SecurityReview,
} from '../../scripts/lib/security-review.js';
const root = resolve(import.meta.dirname, '../..');
const plan = SecurityReviewPlanSchema.parse(
  JSON.parse(await readFile(resolve(root, 'config/security-review.json'), 'utf8')),
);
const stamp = '2026-10-02T00:00:00.000Z';
const hash = plan.reviewedCandidate.artifactDigest;
const source = plan.reviewedCandidate.sourceCommit;
const empty = { counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, findings: [] };
function control(): SecurityReview {
  // Synthetic approval control is a verifier test, never a live review decision.
  const base: Omit<SecurityReview, 'integrity'> = {
    schemaVersion: 1,
    owner: 'BGA-405',
    reviewedAt: stamp,
    status: 'held',
    candidate: { tag: plan.reviewedCandidate.tag, sourceCommit: source, artifactDigest: hash },
    reviewer: { sourceCommit: source, sourceClean: true, harnessDigest: hash },
    signature: {
      verified: true,
      signerCommit: plan.reviewedCandidate.signerCommit,
      trustedRootDigest: hash,
    },
    dependencyAudit: {
      schemaVersion: 1,
      generatedAt: stamp,
      registry: 'https://registry.npmjs.org',
      source: plan.reviewedCandidate.auditIdentity,
      production: empty,
      all: empty,
    },
    dependencyPolicy: { schemaVersion: 1, maxAgeHours: 24, exceptions: [] },
    tests: {
      artifactDigest: hash,
      resultDigest: hash,
      testsPassed: 1,
      testsFailed: 0,
      requiredScenarios: plan.requiredScenarios,
      passedScenarios: plan.requiredScenarios,
    },
    packageScan: { artifactDigest: hash, files: 1, findings: 0 },
    studio: 'excluded; no live claim',
    adapters: [],
    risks: plan.requiredRiskIds.map((id) => ({
      id,
      owner: 'synthetic',
      disposition: 'accepted' as const,
      evidence: 'Verifier control only',
    })),
    releaseGates: {
      candidateDocumentationCurrent: true,
      privateReportLifecycleVerified: true,
      frameworkReviewCurrent: true,
    },
  };
  return SecurityReviewSchema.parse({ ...base, integrity: reviewIntegrity(base) });
}
function sealed(review: SecurityReview): SecurityReview {
  return { ...review, integrity: reviewIntegrity(review) };
}
it('[GATE-SECURITY-REVIEW] refuses changed, omitted or differently bound evidence despite rewritten integrity fields', () => {
  const review = control();
  expect(verifyReviewRecord(review, plan).failures).toEqual([]);
  const substituted = {
    ...review,
    candidate: { ...review.candidate, artifactDigest: `sha256:${'e'.repeat(64)}` },
    tests: { ...review.tests, artifactDigest: `sha256:${'e'.repeat(64)}` },
    packageScan: { ...review.packageScan, artifactDigest: `sha256:${'e'.repeat(64)}` },
  };
  expect(verifyReviewRecord(sealed(substituted), plan).failed).toBe(true);
  expect(verifyReviewRecord({ ...review, reviewedAt: 'invalid' }, plan).failed).toBe(true);
  for (const changed of [
    { ...review, candidate: { ...review.candidate, tag: 'v1.0.0-rc.3' } },
    { ...review, tests: { ...review.tests, artifactDigest: `sha256:${'c'.repeat(64)}` } },
    {
      ...review,
      packageScan: { ...review.packageScan, artifactDigest: `sha256:${'c'.repeat(64)}` },
    },
    { ...review, tests: { ...review.tests, requiredScenarios: [] } },
    { ...review, tests: { ...review.tests, passedScenarios: [] } },
    {
      ...review,
      dependencyAudit: {
        ...review.dependencyAudit,
        source: { ...review.dependencyAudit.source, commit: 'c'.repeat(40) },
      },
    },
  ])
    expect(verifyReviewRecord(sealed(changed), plan).failed).toBe(true);
  expect(
    verifyReviewRecord({ ...review, candidate: { ...review.candidate, tag: 'changed' } }, plan)
      .failed,
  ).toBe(true);
});
it('[INT-SECURITY-REVIEW-APPROVAL] refuses open risks, stale audits, uncommitted reviewer code and incomplete external gates', () => {
  const review = control();
  const now = new Date(stamp);
  expect(verifyReviewApproval(review, plan, now).failures).toEqual([]);
  expect(verifyReviewApproval(review, plan, new Date('2026-10-04T00:00:00Z')).failed).toBe(true);
  expect(
    verifyReviewApproval(
      sealed({ ...review, reviewer: { ...review.reviewer, sourceClean: false } }),
      plan,
      now,
    ).failed,
  ).toBe(true);
  expect(
    verifyReviewApproval(
      sealed({
        ...review,
        risks: [
          { id: 'open', owner: 'owner', disposition: 'held', evidence: 'Unresolved blocker' },
        ],
      }),
      plan,
      now,
    ).failed,
  ).toBe(true);
  for (const key of Object.keys(review.releaseGates) as (keyof SecurityReview['releaseGates'])[])
    expect(
      verifyReviewApproval(
        sealed({ ...review, releaseGates: { ...review.releaseGates, [key]: false } }),
        plan,
        now,
      ).failed,
    ).toBe(true);
  const finding = {
    id: 'GHSA-aaaa-bbbb-cccc',
    module: 'synthetic-package',
    severity: 'high' as const,
  };
  const vulnerable = {
    ...review,
    dependencyAudit: {
      ...review.dependencyAudit,
      all: { counts: { ...empty.counts, high: 1 }, findings: [finding] },
    },
  };
  expect(verifyReviewApproval(sealed(vulnerable), plan, now).failed).toBe(true);
});
it('[INT-SECURITY-REVIEW-ARTIFACT] refuses byte tampering before retained artifact installation', () => {
  const bytes = Buffer.from('synthetic harmless original archive bytes');
  const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  expect(() => verifyReplayDigest(bytes, expected)).not.toThrow();
  expect(() =>
    verifyReplayDigest(Buffer.concat([bytes, Buffer.from('changed')]), expected),
  ).toThrow('authenticated digest');
  expect(() => verifyReplayDigest(bytes, 'not-a-digest')).toThrow('authenticated digest');
});
