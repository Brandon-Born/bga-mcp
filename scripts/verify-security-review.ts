import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  SecurityReviewPlanSchema,
  verifyReviewRecord,
  verifyReviewApproval,
  type SecurityReview,
} from './lib/security-review.js';
import { expectSeededFailure, reportOrExit } from './lib/gate.js';
const root = resolve(import.meta.dirname, '..');
const plan = SecurityReviewPlanSchema.parse(
  JSON.parse(await readFile(resolve(root, 'config/security-review.json'), 'utf8')),
);
const review = JSON.parse(
  await readFile(resolve(root, 'docs/verification/security-review-v1.0.0-rc.4-clean.json'), 'utf8'),
) as SecurityReview;
const record = verifyReviewRecord(review, plan);
const candidate = JSON.parse(await readFile(resolve(root, plan.candidateReceipt), 'utf8')) as {
  candidate: {
    sourceTag: string;
    sourceCommit: string;
    digests: { artifact: string };
    lockDigest: string;
  };
};
const signing = JSON.parse(await readFile(resolve(root, plan.signingReceipt), 'utf8')) as {
  signer: { commit: string };
};
record.require(
  plan.reviewedCandidate.tag === candidate.candidate.sourceTag &&
    plan.reviewedCandidate.sourceCommit === candidate.candidate.sourceCommit &&
    plan.reviewedCandidate.artifactDigest === candidate.candidate.digests.artifact &&
    plan.reviewedCandidate.signerCommit === signing.signer.commit &&
    plan.reviewedCandidate.auditIdentity.lockDigest === candidate.candidate.lockDigest,
  'Security review plan differs from trusted candidate/signing receipts',
);
const threat = JSON.parse(await readFile(resolve(root, 'config/threat-model.json'), 'utf8')) as {
  residualRisks: { id: string }[];
};
record.require(
  JSON.stringify([...plan.requiredRiskIds].sort()) ===
    JSON.stringify(threat.residualRisks.map((risk) => risk.id).sort()),
  'Security review plan omits a current canonical risk',
);

expectSeededFailure(
  'security review integrity',
  verifyReviewRecord({ ...review, integrity: `sha256:${'0'.repeat(64)}` }, plan),
);
expectSeededFailure(
  'unresolved release gate',
  verifyReviewApproval(
    { ...review, releaseGates: { ...review.releaseGates, privateReportLifecycleVerified: false } },
    plan,
    new Date(review.reviewedAt),
  ),
);
if (review.status === 'approved') {
  for (const failure of verifyReviewApproval(review, plan).failures) record.require(false, failure);
}
reportOrExit(
  'Release security review',
  record,
  `Retained original-candidate assessment is structurally valid (${review.status}); synthetic controls refuse tampering and incomplete approval. Historical report validity is not fresh publication approval.`,
);
