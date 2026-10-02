import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GateReport } from './gate.js';
import {
  SecurityAuditSchema,
  SecurityPolicySchema,
  verifySecurityAudit,
} from './security-audit.js';
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const commit = z.string().regex(/^[0-9a-f]{40}$/u);
const scenario = z.string().regex(/^[A-Z][A-Z0-9-]+$/u);
export const SecurityReviewPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  owner: z.literal('BGA-405'),
  candidateReceipt: z.string(),
  signingReceipt: z.string(),
  reviewedCandidate: z.strictObject({
    tag: z.string(),
    sourceCommit: commit,
    artifactDigest: digest,
    signerCommit: commit,
    auditIdentity: SecurityAuditSchema.shape.source,
  }),
  requiredRiskIds: z.array(z.string().min(1)).nonempty(),
  suites: z.array(z.string().regex(/^tests\/e2e\/[a-z-]+\.test\.ts$/u)).nonempty(),
  requiredScenarios: z.array(scenario).nonempty(),
});
export const SecurityReviewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  owner: z.literal('BGA-405'),
  reviewedAt: z.iso.datetime(),
  status: z.enum(['held', 'approved']),
  candidate: z.strictObject({ tag: z.string(), sourceCommit: commit, artifactDigest: digest }),
  reviewer: z.strictObject({
    sourceCommit: commit,
    sourceClean: z.boolean(),
    harnessDigest: digest,
  }),
  signature: z.strictObject({
    verified: z.literal(true),
    signerCommit: commit,
    trustedRootDigest: digest,
  }),
  dependencyAudit: SecurityAuditSchema,
  dependencyPolicy: SecurityPolicySchema,
  tests: z.strictObject({
    artifactDigest: digest,
    resultDigest: digest,
    testsPassed: z.number().int().positive(),
    testsFailed: z.literal(0),
    requiredScenarios: z.array(scenario).nonempty(),
    passedScenarios: z.array(scenario).nonempty(),
  }),
  packageScan: z.strictObject({
    artifactDigest: digest,
    files: z.number().int().positive(),
    findings: z.literal(0),
  }),
  studio: z.literal('excluded; no live claim'),
  adapters: z.array(z.string()).max(0),
  risks: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        owner: z.string().min(1),
        disposition: z.enum(['held', 'accepted', 'excluded', 'resolved']),
        evidence: z.string().min(1),
      }),
    )
    .nonempty(),
  releaseGates: z.strictObject({
    candidateDocumentationCurrent: z.boolean(),
    privateReportLifecycleVerified: z.boolean(),
    frameworkReviewCurrent: z.boolean(),
  }),
  integrity: digest,
});
export type SecurityReview = z.infer<typeof SecurityReviewSchema>;
export type SecurityReviewPlan = z.infer<typeof SecurityReviewPlanSchema>;

export function reviewIntegrity(
  review: Omit<SecurityReview, 'integrity'> | SecurityReview,
): string {
  const { integrity: _ignored, ...document } = review as SecurityReview;
  void _ignored;
  return `sha256:${createHash('sha256').update(JSON.stringify(document)).digest('hex')}`;
}
export function verifyReviewRecord(input: unknown, plan: SecurityReviewPlan): GateReport {
  const report = new GateReport();
  const parsed = SecurityReviewSchema.safeParse(input);
  if (!parsed.success) {
    report.require(false, 'Security review record is malformed');
    return report;
  }
  const review = parsed.data;
  const expected = plan.reviewedCandidate;
  report.require(
    review.candidate.tag === expected.tag &&
      review.candidate.sourceCommit === expected.sourceCommit &&
      review.candidate.artifactDigest === expected.artifactDigest &&
      review.signature.signerCommit === expected.signerCommit,
    'Review differs from independently pinned candidate/signing identity',
  );
  report.require(
    JSON.stringify(review.dependencyAudit.source) === JSON.stringify(expected.auditIdentity),
    'Review dependency configuration differs from pinned original source',
  );
  for (const id of plan.requiredRiskIds)
    report.require(
      review.risks.some((risk) => risk.id === id),
      `Review omitted canonical risk ${id}`,
    );

  report.require(reviewIntegrity(review) === review.integrity, 'Review evidence integrity differs');
  report.require(
    review.tests.artifactDigest === review.candidate.artifactDigest &&
      review.packageScan.artifactDigest === review.candidate.artifactDigest,
    'Tests or scans used a different artifact',
  );
  report.require(
    review.dependencyAudit.source.commit === review.candidate.sourceCommit,
    'Audit used a different candidate source',
  );
  report.require(
    JSON.stringify(review.tests.requiredScenarios) === JSON.stringify(plan.requiredScenarios),
    'Review omitted the required security inventory',
  );
  for (const id of plan.requiredScenarios)
    report.require(review.tests.passedScenarios.includes(id), `Review lacks passing ${id}`);
  report.require(
    new Set(review.risks.map((risk) => risk.id)).size === review.risks.length,
    'Review contains duplicate risk decisions',
  );
  return report;
}
export function verifyReviewApproval(
  review: SecurityReview,
  plan: SecurityReviewPlan,
  now = new Date(),
): GateReport {
  const report = verifyReviewRecord(review, plan);
  const audit = verifySecurityAudit(
    review.dependencyAudit,
    review.dependencyPolicy,
    review.dependencyAudit.source,
    now,
    new Set(review.tests.passedScenarios),
  );
  for (const failure of audit.failures) report.require(false, failure);
  report.require(
    review.reviewer.sourceClean,
    'Reviewer implementation was not committed and clean',
  );
  report.require(
    now.getTime() >= Date.parse(review.reviewedAt) &&
      now.getTime() - Date.parse(review.reviewedAt) <= 86_400_000,
    'Review is stale or future-dated',
  );
  for (const [gate, passed] of Object.entries(review.releaseGates))
    report.require(passed, `Release gate is pending: ${gate}`);
  for (const risk of review.risks)
    report.require(
      risk.disposition !== 'held',
      `Open blocking risk ${risk.id} owned by ${risk.owner}`,
    );
  return report;
}
export function verifyReplayDigest(bytes: Buffer, expected: string): void {
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(expected) ||
    `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== expected
  )
    throw new Error('Retained security-review artifact differs from its authenticated digest');
}
