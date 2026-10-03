import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  readPublicationConfig,
  readPublicationPlan,
  sha256,
  verifyRegistryArtifact,
  type PublicationPlan,
} from '../../scripts/lib/publication.js';
import {
  publicFiles,
  publicAssetUrl,
  reconcileGitHubRelease,
  verifyGitHubPublicBytes,
  verifyGitHubConsumerReceipt,
  verifyGitHubAdmissionReview,
  type GitHubRelease,
} from '../../scripts/lib/github-publication.js';
import { verifyGitHubPublicationWorkflow } from '../../scripts/lib/publication-workflow.js';
import { publicationHolds } from '../../scripts/prepare-publication.js';
import { runCommand } from '../helpers/process.js';
const root = resolve(import.meta.dirname, '../..');
const stamp = new Date().toISOString();
const bytes = Buffer.from(
  'Original harmless synthetic archive; no real signature or publication proof',
);
async function control() {
  const config = readPublicationConfig(
    JSON.parse(await readFile(resolve(root, 'config/publication.json'), 'utf8')),
  );
  if (!config.decision || !('channel' in config.decision))
    throw new Error('GitHub channel must be selected');
  const candidate = {
    name: 'bga-mcp' as const,
    version: '1.0.0-rc.6',
    tag: 'v1.0.0-rc.6',
    sourceCommit: 'b'.repeat(40),
    artifactDigest: sha256(bytes),
  };
  const files = new Map(
    [
      'bga-mcp-1.0.0-rc.6.tgz',
      'release-candidate.json',
      'release-candidate.schema.json',
      'verification-evidence.json',
      'security-audit.json',
      'security-audit-policy.json',
      'SHA256SUMS',
      'sigstore-bundle.json',
      'release-provenance.json',
      'approval.json',
      'fresh-audit.json',
      'GITHUB_DOWNLOADS.md',
    ].map((name) => [name, bytes]),
  );
  const plan: PublicationPlan = {
    schemaVersion: 1,
    preparedAt: stamp,
    publisherCommit: 'a'.repeat(40),
    workflowRun: '123',
    decision: config.decision,
    candidate,
    approvalDigest: sha256(bytes),
    auditDigest: sha256(bytes),
    auditGeneratedAt: stamp,
    files: [...files].map(([name, value]) => ({ name, digest: sha256(value) })),
  };
  const pinned = publicFiles(plan)
    .slice(1, 8)
    .map((file, index) => ({ ...file, id: 100 + index }));
  const retained = {
    owner: 'BGA-407',
    candidateTag: candidate.tag,
    candidateSourceCommit: candidate.sourceCommit,
    originalArtifactDigest: candidate.artifactDigest,
    release: { id: 11, assets: pinned },
  };
  const release: GitHubRelease = {
    id: 11,
    tag_name: candidate.tag,
    draft: false,
    prerelease: true,
    assets: pinned.map((file) => ({
      ...file,
      state: 'uploaded',
      browser_download_url: publicAssetUrl(candidate.tag, file.name),
    })),
  };
  return { plan, files, retained, release };
}
it('[GATE-PUBLICATION] GitHub publication refuses automatic writes, dry-run credentials, broad permissions, dependency execution and success retention before verification', async () => {
  // Actual hosted/public observations are separate from the synthetic refusal controls below.
  const observed = JSON.parse(
    await readFile(resolve(root, 'docs/verification/github-download-decision.json'), 'utf8'),
  ) as {
    publicationApproved: boolean;
    publication: {
      status: string;
      admissionPlanJson: string;
      planDigest: string;
      approvalReceipt: string;
      metadataReceipt: string;
      workflow: { conclusion: string; jobs: { conclusion: string }[] };
      hostedConsumer: { verifiedAt: string };
      consumerAsset: { id: number; name: string; digest: string };
      releaseSnapshot: GitHubRelease;
      publicReceiptBytesMatched: boolean;
    };
  };
  expect(observed.publicationApproved).toBe(true);
  const actual = observed.publication;
  expect(actual.status).toBe('verified');
  expect(actual.workflow.conclusion).toBe('success');
  expect(actual.workflow.jobs).toHaveLength(4);
  expect(actual.workflow.jobs.every((job) => job.conclusion === 'success')).toBe(true);
  expect(sha256(actual.admissionPlanJson)).toBe(actual.planDigest);
  const actualPlan = readPublicationPlan(JSON.parse(actual.admissionPlanJson));
  expect(() =>
    verifyGitHubConsumerReceipt(
      actual.hostedConsumer,
      actualPlan,
      actual.planDigest,
      new Date(actual.hostedConsumer.verifiedAt),
    ),
  ).not.toThrow();
  expect(sha256(`${JSON.stringify(actual.hostedConsumer, null, 2)}\n`)).toBe(
    actual.consumerAsset.digest,
  );
  expect(sha256(await readFile(resolve(root, actual.approvalReceipt)))).toBe(
    actualPlan.approvalDigest,
  );
  expect(actual.publicReceiptBytesMatched).toBe(true);
  expect(
    actual.releaseSnapshot.assets.find((asset) => asset.id === actual.consumerAsset.id),
  ).toMatchObject(actual.consumerAsset);
  const metadata: unknown = JSON.parse(
    await readFile(resolve(root, actual.metadataReceipt), 'utf8'),
  );
  expect(reconcileGitHubRelease(actual.releaseSnapshot, metadata, actualPlan)).toEqual([]);
  const source = await readFile(resolve(root, '.github/workflows/release-github.yml'), 'utf8');
  expect(verifyGitHubPublicationWorkflow(source).failures).toEqual([]);
  for (const changed of [
    source.replace('workflow_dispatch:', 'pull_request:'),
    source.replace('default: dry-run', 'default: publish'),
    source.replace('contents: read', 'contents: write'),
    source.replaceAll(" && inputs.mode == 'publish'", ''),
    source.replace('needs: [prepare, verify]', 'needs: prepare'),
    source.replace('EXPECTED_CONSUMER_DIGEST:', 'IGNORED_CONSUMER_DIGEST:'),
    source.replace('persist-credentials: false', 'persist-credentials: true'),
    source.replace(
      'scripts/publish-github-release.ts publish',
      'scripts/publish-github-release.ts publish\n        # pnpm install',
    ),
    `${source}\n# --clobber`,
    `${source}\n# NPM_TOKEN`,
    source.replace('contents: write', 'contents: read'),
  ])
    expect(verifyGitHubPublicationWorkflow(changed).failed).toBe(true);
});
it('[INT-PUBLICATION-BOUNDARIES] selects GitHub without overriding the real reporting/security status or allowing the npm path', async () => {
  const { plan } = await control();
  expect(() => readPublicationPlan(plan)).not.toThrow();
  expect(() => verifyRegistryArtifact({}, bytes, plan)).toThrow();
  const holds = await publicationHolds();
  // The real lifecycle advances; channel selection never overrides either owned status.
  const selected = readPublicationConfig(
    JSON.parse(await readFile(resolve(root, 'config/publication.json'), 'utf8')),
  );
  const review = JSON.parse(await readFile(resolve(root, selected.reviewReceipt), 'utf8')) as {
    status: string;
  };
  const reporting = JSON.parse(
    await readFile(resolve(root, 'config/security-reporting.json'), 'utf8'),
  ) as { status: string };
  expect(holds.includes('BGA-405 approval is held')).toBe(review.status !== 'approved');
  expect(holds.includes('BGA-406 is not verified')).toBe(reporting.status !== 'verified');
  expect(holds).not.toContain(
    'Package/registry/trusted-publisher decision and setup evidence are pending',
  );
});
it('[INT-PUBLICATION-BOUNDARIES] reconciles only missing new assets while refusing altered original evidence, wrong releases and conflicts', async () => {
  const { plan, retained, release } = await control();
  expect(reconcileGitHubRelease(release, retained, plan)).toEqual([
    'bga-mcp-1.0.0-rc.6.tgz',
    'release-provenance.json',
    'GITHUB_DOWNLOADS.md',
  ]);
  const first = release.assets[0];
  if (!first) throw new Error('Synthetic release needs its original metadata');
  for (const changed of [
    { ...release, id: 12 },
    { ...release, tag_name: 'v1.0.0' },
    { ...release, draft: true },
    { ...release, prerelease: false },
    { ...release, assets: release.assets.slice(1) },
    { ...release, assets: release.assets.map((asset, i) => (i ? asset : { ...asset, id: 999 })) },
    {
      ...release,
      assets: release.assets.map((asset, i) =>
        i ? asset : { ...asset, digest: sha256('changed') },
      ),
    },
    { ...release, assets: [...release.assets, first] },
  ])
    expect(() => reconcileGitHubRelease(changed, retained, plan)).toThrow();
  const conflict = {
    id: 999,
    name: 'bga-mcp-1.0.0-rc.6.tgz',
    digest: sha256('different'),
    state: 'uploaded',
    browser_download_url: publicAssetUrl(plan.candidate.tag, 'bga-mcp-1.0.0-rc.6.tgz'),
  };
  expect(() =>
    reconcileGitHubRelease({ ...release, assets: [...release.assets, conflict] }, retained, plan),
  ).toThrow();
});
it('[INT-PUBLICATION-BOUNDARIES] authenticates downloaded public bytes and refuses missing, substituted or redirected assets', async () => {
  const { plan, retained, release, files } = await control();
  const completed = {
    ...release,
    assets: publicFiles(plan).map((file, i) => ({
      ...file,
      id: release.assets.find((asset) => asset.name === file.name)?.id ?? 200 + i,
      state: 'uploaded',
      browser_download_url: publicAssetUrl(plan.candidate.tag, file.name),
    })),
  };
  const downloaded = new Map(publicFiles(plan).map((file) => [file.name, bytes]));
  expect(() => verifyGitHubPublicBytes(completed, retained, plan, downloaded)).not.toThrow();
  const changed = new Map(downloaded);
  changed.set('bga-mcp-1.0.0-rc.6.tgz', Buffer.from('substituted'));
  expect(() => verifyGitHubPublicBytes(completed, retained, plan, changed)).toThrow();
  downloaded.delete('sigstore-bundle.json');
  expect(() => verifyGitHubPublicBytes(completed, retained, plan, downloaded)).toThrow();
  expect(() =>
    verifyGitHubPublicBytes(
      {
        ...completed,
        assets: completed.assets.map((asset) => ({
          ...asset,
          browser_download_url: 'https://attacker.invalid/archive',
        })),
      },
      retained,
      plan,
      files,
    ),
  ).toThrow();
});
it('[INT-PUBLICATION-BOUNDARIES] refuses held approvals even in a digest-matching synthetic handoff', async () => {
  const { plan } = await control();
  const review = {
    status: 'approved',
    reviewedAt: stamp,
    candidate: {
      tag: plan.candidate.tag,
      sourceCommit: plan.candidate.sourceCommit,
      artifactDigest: plan.candidate.artifactDigest,
    },
    releaseGates: {
      candidateDocumentationCurrent: true,
      privateReportLifecycleVerified: true,
      frameworkReviewCurrent: true,
    },
    risks: [{ disposition: 'accepted' }],
    signature: { verified: true },
  };
  const approvedBytes = Buffer.from(JSON.stringify(review)),
    admitted = { ...plan, approvalDigest: sha256(approvedBytes) };
  expect(() => verifyGitHubAdmissionReview(review, approvedBytes, admitted)).not.toThrow();
  for (const changed of [
    { ...review, status: 'held' },
    { ...review, risks: [{ disposition: 'held' }] },
    { ...review, releaseGates: { ...review.releaseGates, privateReportLifecycleVerified: false } },
    { ...review, reviewedAt: '2020-01-01T00:00:00Z' },
  ])
    expect(() => verifyGitHubAdmissionReview(changed, approvedBytes, admitted)).toThrow();
  expect(() => verifyGitHubAdmissionReview(review, bytes, admitted)).toThrow();
});
it('[INT-PUBLICATION-BOUNDARIES] refuses failed, stale, foreign-run or differently bound GitHub consumer results', async () => {
  const { plan } = await control(),
    planDigest = sha256('plan');
  const receipt = {
    schemaVersion: 1,
    owner: 'BGA-415',
    channel: 'github-downloads',
    status: 'verified',
    verifiedAt: stamp,
    candidate: plan.candidate,
    planDigest,
    publisherCommit: plan.publisherCommit,
    workflowRun: plan.workflowRun,
    approvalDigest: plan.approvalDigest,
    auditDigest: plan.auditDigest,
    downloadUrl: publicAssetUrl(plan.candidate.tag, 'bga-mcp-1.0.0-rc.6.tgz'),
    publicBytesMatched: true,
    signatureVerified: true,
    provenanceVerified: true,
    inventoryMatched: true,
    firstUsePassed: true,
    rootRefusalPassed: true,
    projectUnchanged: true,
    serverExited: true,
    removed: true,
    credentialFree: true,
  };
  expect(() => verifyGitHubConsumerReceipt(receipt, plan, planDigest)).not.toThrow();
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
    expect(() =>
      verifyGitHubConsumerReceipt({ ...receipt, [field]: false }, plan, planDigest),
    ).toThrow();
  expect(() =>
    verifyGitHubConsumerReceipt({ ...receipt, workflowRun: '999' }, plan, planDigest),
  ).toThrow();
  expect(() => verifyGitHubConsumerReceipt(receipt, plan, sha256('other'))).toThrow();
  expect(() =>
    verifyGitHubConsumerReceipt(receipt, plan, planDigest, new Date(Date.parse(stamp) + 7_200_000)),
  ).toThrow();
});
it('[INT-PUBLICATION-BOUNDARIES] refuses local GitHub writes and token-bearing consumers before remote invocation', async () => {
  for (const mode of ['publish', 'retain']) {
    const result = await runCommand(
      process.execPath,
      [
        '--experimental-strip-types',
        resolve(root, 'scripts/publish-github-release.ts'),
        mode,
        '/absent-packet',
        sha256('absent'),
      ],
      { cwd: root, env: { PATH: process.env.PATH }, timeoutMs: 10_000 },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('stop endorsement');
  }
  const consumer = await runCommand(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      resolve(root, 'scripts/verify-github-consumer.ts'),
      '/absent-packet',
      sha256('absent'),
      '/absent-output',
    ],
    {
      cwd: root,
      env: { PATH: process.env.PATH, GH_TOKEN: 'synthetic-control-not-a-credential' },
      timeoutMs: 10_000,
    },
  );
  expect(consumer.exitCode).toBe(1);
  expect(consumer.stderr).toContain('stop endorsement');
});
