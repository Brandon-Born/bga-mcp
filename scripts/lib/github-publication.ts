import assert from 'node:assert/strict';
import {
  object,
  PUBLICATION_REPOSITORY,
  requireFresh,
  sha256,
  type PublicationPlan,
} from './publication.ts';

// Builtins only: imported by the isolated contents-write job.
export interface GitHubAsset {
  id: number;
  name: string;
  digest: string;
  state: string;
  browser_download_url: string;
}
export interface GitHubRelease {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}
export const publicAssetUrl = (tag: string, name: string): string =>
  `https://github.com/${PUBLICATION_REPOSITORY}/releases/download/${tag}/${name}`;
export function verifyGitHubAdmissionReview(
  reviewInput: unknown,
  approvalBytes: Buffer,
  plan: PublicationPlan,
): void {
  const review = object(reviewInput);
  assert.equal(review.status, 'approved', 'BGA-405 approval is held');
  assert.equal(
    sha256(approvalBytes),
    plan.approvalDigest,
    'Pinned approval differs from admitted approval',
  );
  assert(typeof review.reviewedAt === 'string');
  requireFresh(review.reviewedAt);
  assert.deepEqual(review.candidate, {
    tag: plan.candidate.tag,
    sourceCommit: plan.candidate.sourceCommit,
    artifactDigest: plan.candidate.artifactDigest,
  });
  const gates = object(review.releaseGates);
  for (const field of [
    'candidateDocumentationCurrent',
    'privateReportLifecycleVerified',
    'frameworkReviewCurrent',
  ])
    assert.equal(gates[field], true);
  assert(
    Array.isArray(review.risks) &&
      !review.risks.some((risk) => object(risk).disposition === 'held'),
  );
  assert.equal(object(review.signature).verified, true);
}
export function publicFiles(plan: PublicationPlan): { name: string; digest: string }[] {
  assert('channel' in plan.decision);
  return plan.files.filter((file) => !['approval.json', 'fresh-audit.json'].includes(file.name));
}
export function reconcileGitHubRelease(
  release: GitHubRelease,
  retained: unknown,
  plan: PublicationPlan,
): string[] {
  const record = object(retained),
    previous = object(record.release);
  assert.equal(record.owner, 'BGA-407');
  assert.equal(record.candidateTag, plan.candidate.tag);
  assert.equal(record.candidateSourceCommit, plan.candidate.sourceCommit);
  assert.equal(record.originalArtifactDigest, plan.candidate.artifactDigest);
  assert.equal(release.id, previous.id, 'Release identity changed');
  assert.equal(release.tag_name, plan.candidate.tag);
  assert.equal(release.draft, false, 'Use the already verified public metadata release');
  assert.equal(release.prerelease, plan.candidate.version.includes('-'));
  assert(Array.isArray(previous.assets));
  const pinned = previous.assets.map(object);
  const expected = new Map(publicFiles(plan).map((file) => [file.name, file.digest]));
  for (const asset of pinned) {
    assert(typeof asset.name === 'string' && typeof asset.digest === 'string');
    const shared = expected.get(asset.name);
    assert(
      shared === undefined || shared === asset.digest,
      'Original evidence conflicts with admitted bytes',
    );
    expected.set(asset.name, asset.digest);
  }
  const seen = new Set<string>();
  for (const asset of release.assets) {
    assert(!seen.has(asset.name), 'Duplicate release assets');
    seen.add(asset.name);
    assert.equal(asset.state, 'uploaded');
    assert.equal(asset.browser_download_url, publicAssetUrl(plan.candidate.tag, asset.name));
    assert(/^sha256:[0-9a-f]{64}$/u.test(asset.digest));
    const original = pinned.find((item) => item.name === asset.name);
    if (original) assert.equal(asset.id, original.id, 'Original metadata asset was replaced');
    const wanted = expected.get(asset.name);
    if (wanted !== undefined)
      assert.equal(asset.digest, wanted, 'Existing asset conflicts; never overwrite');
    else assert(/^github-consumer-[1-9][0-9]*\.json$/u.test(asset.name), 'Unexpected public asset');
  }
  // Missing original public metadata is an incident, not permission to reconstruct it.
  for (const asset of pinned)
    assert(seen.has(String(asset.name)), 'Original metadata asset is missing');
  return publicFiles(plan)
    .filter((file) => !seen.has(file.name))
    .map((file) => file.name);
}
export function verifyGitHubPublicBytes(
  release: GitHubRelease,
  retained: unknown,
  plan: PublicationPlan,
  files: ReadonlyMap<string, Buffer>,
): void {
  assert.deepEqual(
    reconcileGitHubRelease(release, retained, plan),
    [],
    'Public packet is incomplete',
  );
  assert.deepEqual(
    [...files.keys()].sort(),
    publicFiles(plan)
      .map((file) => file.name)
      .sort(),
  );
  for (const file of publicFiles(plan)) {
    const bytes = files.get(file.name);
    assert(bytes && bytes.length <= 16 * 1024 * 1024);
    assert.equal(sha256(bytes), file.digest, 'Public bytes differ from admitted bytes');
  }
}
export function verifyGitHubConsumerReceipt(
  input: unknown,
  plan: PublicationPlan,
  planDigest: string,
  now = new Date(),
): void {
  const receipt = object(input);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.owner, 'BGA-415');
  assert.equal(receipt.channel, 'github-downloads');
  assert.equal(receipt.status, 'verified');
  assert.deepEqual(receipt.candidate, plan.candidate);
  assert.equal(receipt.planDigest, planDigest);
  assert.equal(receipt.publisherCommit, plan.publisherCommit);
  assert.equal(receipt.workflowRun, plan.workflowRun);
  assert.equal(receipt.approvalDigest, plan.approvalDigest);
  assert.equal(receipt.auditDigest, plan.auditDigest);
  assert.equal(
    receipt.downloadUrl,
    publicAssetUrl(plan.candidate.tag, `bga-mcp-${plan.candidate.version}.tgz`),
  );
  assert(typeof receipt.verifiedAt === 'string');
  requireFresh(receipt.verifiedAt, now, 1);
  for (const field of [
    'publicBytesMatched',
    'signatureVerified',
    'provenanceVerified',
    'inventoryMatched',
    'firstUsePassed',
    'rootRefusalPassed',
    'projectUnchanged',
    'serverExited',
    'removed',
    'credentialFree',
  ])
    assert.equal(receipt[field], true, `Consumer did not prove ${field}`);
}
