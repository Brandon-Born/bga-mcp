import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  SecurityReviewPlanSchema,
  SecurityReviewSchema,
  reviewIntegrity,
  verifyReviewRecord,
  verifyReviewApproval,
  verifyPendingUnsignedReview,
  verifyReplayDigest,
  type SecurityReview,
} from '../../scripts/lib/security-review.js';
const root = resolve(import.meta.dirname, '../..');
const plan = SecurityReviewPlanSchema.parse(
  JSON.parse(
    await readFile(
      resolve(root, 'docs/verification/security-review-plan-v1.0.0-rc.8-rejected.json'),
      'utf8',
    ),
  ),
);
// A synthetic complete signed-plan control explicitly has no pending unsigned target.
const { publicationHold: _hold, pendingUnsignedCandidate: _pending, ...unblockedPlan } = plan;
void _hold;
void _pending;
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
it('[GATE-SECURITY-REVIEW] refuses changed, omitted or differently bound evidence despite rewritten integrity fields', async () => {
  const selection = JSON.parse(
    await readFile(resolve(root, 'config/publication.json'), 'utf8'),
  ) as { reviewReceipt: string };
  const actual = SecurityReviewSchema.parse(
    JSON.parse(
      await readFile(resolve(root, 'docs/verification/security-review-v1.0.0-rc.8.json'), 'utf8'),
    ),
  );
  expect(verifyReviewRecord(actual, plan).failures).toEqual([]);
  if (actual.status === 'approved')
    expect(verifyReviewApproval(actual, plan, new Date(actual.reviewedAt)).failures).toEqual([]);
  // A new assessment can precede its public evidence. The historical publication
  // selection must still fail approval against a differently pinned candidate.
  const selectedApproval = SecurityReviewSchema.parse(
    JSON.parse(await readFile(resolve(root, selection.reviewReceipt), 'utf8')),
  );
  const currentPlan = SecurityReviewPlanSchema.parse(
    JSON.parse(await readFile(resolve(root, 'config/security-review.json'), 'utf8')),
  );
  expect(verifyReviewRecord(selectedApproval, currentPlan).failures).toEqual([]);
  expect(verifyReviewRecord(actual, currentPlan).failed).toBe(true);
  const selectedResult = verifyReviewApproval(
    selectedApproval,
    plan,
    new Date(selectedApproval.reviewedAt),
  );
  if (selectedApproval.candidate.artifactDigest === plan.reviewedCandidate.artifactDigest)
    expect(selectedResult.failures).toEqual([]);
  else expect(selectedResult.failed).toBe(true);
  const review = control();
  expect(verifyReviewRecord(review, plan).failures).toEqual([]);
  const historical = JSON.parse(
    await readFile(
      resolve(root, 'docs/verification/security-review-v1.0.0-rc.4-clean.json'),
      'utf8',
    ),
  ) as unknown;
  expect(verifyReviewRecord(historical, plan).failed).toBe(true);
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
    { ...review, candidate: { ...review.candidate, tag: 'v1.0.0-rc.4' } },
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
  expect(verifyReviewApproval(review, unblockedPlan, now).failures).toEqual([]);
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
  // A retained, fresh failed audit is evidence of a hold, never an approval.
  // Remove unrelated historical plan holds so this proves the advisory gate itself.
  for (const status of ['held', 'approved'] as const) {
    const assessment = sealed({ ...vulnerable, status });
    expect(verifyReviewRecord(assessment, unblockedPlan).failures).toEqual([]);
    expect(verifyReviewApproval(assessment, unblockedPlan, now).failures).toContainEqual(
      expect.stringContaining('GHSA-aaaa-bbbb-cccc'),
    );
  }
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

it('[INT-SECURITY-REVIEW-APPROVAL] rejects the actual rc.8 approval at its original valid time after independent findings', async () => {
  const approved = SecurityReviewSchema.parse(
    JSON.parse(
      await readFile(
        resolve(root, 'docs/verification/security-review-v1.0.0-rc.8-clean.json'),
        'utf8',
      ),
    ),
  );
  const now = new Date(approved.reviewedAt);
  expect(verifyReviewApproval(approved, unblockedPlan, now).failures).toEqual([]);
  expect(verifyReviewApproval(approved, plan, now).failures).toEqual([
    expect.stringContaining('Unsigned replacement v1.0.0-rc.10 still needs authentic signing'),
    expect.stringContaining('Candidate publication blocked: SEC-RC8-01 and SEC-RC8-02'),
  ]);
});

it('[GATE-SECURITY-REVIEW] binds every pending unsigned identity and refuses signature/publication/model overclaims', async () => {
  const pending = plan.pendingUnsignedCandidate;
  if (pending === undefined) throw new Error('Missing pending unsigned target');
  const candidate = JSON.parse(
    await readFile(resolve(root, pending.candidateReceipt), 'utf8'),
  ) as unknown;
  const unsigned = JSON.parse(
    await readFile(resolve(root, pending.unsignedReviewReceipt), 'utf8'),
  ) as Record<string, unknown>;
  expect(verifyPendingUnsignedReview(plan, candidate, unsigned).failures).toEqual([]);
  expect(
    verifyPendingUnsignedReview(plan, candidate, {
      ...unsigned,
      modelAttribution: {
        taskSelectedModel: 'task-requested label only',
        runtimeModel: null,
        runtimeModelVerified: false,
        evidence: 'Synthetic task selection is not a runtime identity claim',
      },
    }).failures,
  ).toEqual([]);
  for (const [key, value] of Object.entries({
    tag: 'v1.0.0-rc.8',
    sourceCommit: '0'.repeat(40),
    artifactDigest: `sha256:${'0'.repeat(64)}`,
    archiveDigest: `sha256:${'0'.repeat(64)}`,
    manifestDigest: `sha256:${'0'.repeat(64)}`,
    producerRun: 1,
    producerAttempt: 2,
    artifactId: 1,
  })) {
    const changed = { ...plan, pendingUnsignedCandidate: { ...pending, [key]: value } };
    expect(verifyPendingUnsignedReview(changed, candidate, unsigned).failed).toBe(true);
    const changedReview = {
      ...unsigned,
      candidate: { ...(unsigned.candidate as object), [key]: value },
    };
    expect(verifyPendingUnsignedReview(plan, candidate, changedReview).failed).toBe(true);
  }
  const wrongCi = structuredClone(candidate) as { ci: { commit: string } };
  wrongCi.ci.commit = '0'.repeat(40);
  expect(verifyPendingUnsignedReview(plan, wrongCi, unsigned).failed).toBe(true);
  expect(verifyPendingUnsignedReview(plan, null, unsigned).failed).toBe(true);
  for (const changed of [
    { ...unsigned, signatureVerified: true },
    { ...unsigned, publicationApproved: true },
    { ...unsigned, decision: 'publication approved' },
    {
      ...unsigned,
      modelAttribution: {
        taskSelectedModel: 'requested label only',
        runtimeModel: 'unverified claimed identity',
        runtimeModelVerified: false,
        evidence: 'synthetic',
      },
    },
  ])
    expect(verifyPendingUnsignedReview(plan, candidate, changed).failed).toBe(true);
});

it('[INT-SECURITY-REVIEW-APPROVAL] keeps unsigned replacement held even if the historical publication hold is removed', async () => {
  const { publicationHold: _historicalHold, ...pendingPlan } = plan;
  void _historicalHold;
  const result = verifyReviewApproval(control(), pendingPlan, new Date(stamp));
  expect(result.failures).toEqual([
    expect.stringContaining('Unsigned replacement v1.0.0-rc.10 still needs authentic signing'),
  ]);
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga-pending-review-'));
  try {
    // Exercise the real runner with the retained pending plan in an isolated
    // checkout shape; current signed selection must not erase this refusal.
    await cp(resolve(root, 'scripts'), resolve(scratch, 'scripts'), { recursive: true });
    await cp(resolve(root, 'src'), resolve(scratch, 'src'), { recursive: true });
    await mkdir(resolve(scratch, 'config'));
    await writeFile(resolve(scratch, 'config/security-review.json'), JSON.stringify(plan));
    await symlink(resolve(root, 'node_modules'), resolve(scratch, 'node_modules'), 'junction');
    await writeFile(resolve(scratch, 'package.json'), JSON.stringify({ type: 'module' }));
    await expect(
      promisify(execFile)(
        process.execPath,
        [
          resolve(root, 'node_modules/tsx/dist/cli.mjs'),
          resolve(scratch, 'scripts/review-security.ts'),
        ],
        {
          env: {
            ...process.env,
            BGA_MCP_SECURITY_SOURCE: root,
            BGA_MCP_SIGNED_CANDIDATE: resolve(scratch, 'absent-packet'),
            BGA_MCP_SECURITY_REVIEW_OUTPUT: resolve(scratch, 'output'),
          },
        },
      ),
    ).rejects.toThrow('v1.0.0-rc.10 is awaiting authentic signing evidence');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
