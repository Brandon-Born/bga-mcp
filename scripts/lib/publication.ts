import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Builtins only: the OIDC job installs no repository dependencies and runs no package code.
export const PUBLICATION_REPOSITORY = 'Brandon-Born/bga-mcp';
export const PUBLICATION_WORKFLOW = '.github/workflows/release-publication.yml';
export const GITHUB_PUBLICATION_WORKFLOW = '.github/workflows/release-github.yml';
export const PUBLICATION_REGISTRY = 'https://registry.npmjs.org';
export const NPM_CLI = '12.2.0';
export const sha256 = (bytes: Buffer | string): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function object(input: unknown): Record<string, unknown> {
  assert(
    input !== null && typeof input === 'object' && !Array.isArray(input),
    'Malformed publication object',
  );
  return input as Record<string, unknown>;
}
export interface PublicationDecision {
  packageName: 'bga-mcp';
  registry: typeof PUBLICATION_REGISTRY;
  repository: typeof PUBLICATION_REPOSITORY;
  workflow: typeof PUBLICATION_WORKFLOW;
  environment: 'npm-publication';
  authorizedBy: 'Brandon-Born';
  authorizedAt: string;
  publisherSetupEvidence: string;
}
export interface GitHubPublicationDecision {
  channel: 'github-downloads';
  packageName: 'bga-mcp';
  repository: typeof PUBLICATION_REPOSITORY;
  workflow: typeof GITHUB_PUBLICATION_WORKFLOW;
  authorizedBy: 'Brandon-Born';
  authorizedAt: string;
  authorization: string;
  publisherSetupEvidence: string;
}
export type ChannelDecision = PublicationDecision | GitHubPublicationDecision;
export interface PublicationConfig {
  schemaVersion: 1;
  owner: 'BGA-415';
  decision: ChannelDecision | null;
  reviewReceipt: string;
  prerequisites: { installation: string; client: string; evidence: string; usefulness: string };
  npmCli: typeof NPM_CLI;
}
export interface PublicationPlan {
  schemaVersion: 1;
  preparedAt: string;
  publisherCommit: string;
  workflowRun: string;
  decision: ChannelDecision;
  candidate: {
    name: 'bga-mcp';
    version: string;
    tag: string;
    sourceCommit: string;
    artifactDigest: string;
  };
  approvalDigest: string;
  auditDigest: string;
  auditGeneratedAt: string;
  files: { name: string; digest: string }[];
}
const commit = /^[0-9a-f]{40}$/u;
const digest = /^sha256:[0-9a-f]{64}$/u;
export function readPublicationConfig(input: unknown): PublicationConfig {
  const config = object(input);
  assert.deepEqual(Object.keys(config).sort(), [
    'decision',
    'npmCli',
    'owner',
    'prerequisites',
    'reviewReceipt',
    'schemaVersion',
  ]);
  assert(config.schemaVersion === 1 && config.owner === 'BGA-415' && config.npmCli === NPM_CLI);
  assert(
    typeof config.reviewReceipt === 'string' &&
      /^docs\/verification\/[a-zA-Z0-9._-]+\.json$/u.test(config.reviewReceipt),
  );
  if (config.decision !== null) readDecision(config.decision);
  const prerequisites = object(config.prerequisites);
  assert.deepEqual(Object.keys(prerequisites).sort(), [
    'client',
    'evidence',
    'installation',
    'usefulness',
  ]);
  for (const path of Object.values(prerequisites))
    assert(typeof path === 'string' && /^docs\/verification\/[a-zA-Z0-9._-]+\.json$/u.test(path));
  return config as unknown as PublicationConfig;
}
export function readDecision(input: unknown): ChannelDecision {
  const decision = object(input);
  if (decision.channel === 'github-downloads') {
    assert.deepEqual(Object.keys(decision).sort(), [
      'authorization',
      'authorizedAt',
      'authorizedBy',
      'channel',
      'packageName',
      'publisherSetupEvidence',
      'repository',
      'workflow',
    ]);
    assert.equal(decision.packageName, 'bga-mcp');
    assert.equal(decision.repository, PUBLICATION_REPOSITORY);
    assert.equal(decision.workflow, GITHUB_PUBLICATION_WORKFLOW);
    assert.equal(decision.authorizedBy, 'Brandon-Born');
    assert(
      typeof decision.authorizedAt === 'string' &&
        Number.isFinite(Date.parse(decision.authorizedAt)),
    );
    for (const field of ['authorization', 'publisherSetupEvidence'])
      assert(typeof decision[field] === 'string' && decision[field].trim().length > 0);
    assert(
      /^docs\/verification\/[a-zA-Z0-9._-]+\.json$/u.test(String(decision.publisherSetupEvidence)),
    );
    return decision as unknown as GitHubPublicationDecision;
  }
  assert.deepEqual(Object.keys(decision).sort(), [
    'authorizedAt',
    'authorizedBy',
    'environment',
    'packageName',
    'publisherSetupEvidence',
    'registry',
    'repository',
    'workflow',
  ]);
  assert(decision.packageName === 'bga-mcp' && decision.registry === PUBLICATION_REGISTRY);
  assert(
    decision.repository === PUBLICATION_REPOSITORY && decision.workflow === PUBLICATION_WORKFLOW,
  );
  assert(decision.environment === 'npm-publication' && decision.authorizedBy === 'Brandon-Born');
  assert(
    typeof decision.authorizedAt === 'string' && Number.isFinite(Date.parse(decision.authorizedAt)),
  );
  assert(
    typeof decision.publisherSetupEvidence === 'string' &&
      decision.publisherSetupEvidence.trim().length > 0,
    'Publisher setup evidence is pending',
  );
  return decision as unknown as PublicationDecision;
}
export function requireFresh(stamp: string, now = new Date(), hours = 24): void {
  const age = now.getTime() - Date.parse(stamp);
  assert(
    Number.isFinite(age) && age >= 0 && age <= hours * 3_600_000,
    'Publication preflight expired or future-dated',
  );
}
export function readPublicationPlan(input: unknown, now = new Date()): PublicationPlan {
  const plan = object(input);
  assert.deepEqual(Object.keys(plan).sort(), [
    'approvalDigest',
    'auditDigest',
    'auditGeneratedAt',
    'candidate',
    'decision',
    'files',
    'preparedAt',
    'publisherCommit',
    'schemaVersion',
    'workflowRun',
  ]);
  assert(plan.schemaVersion === 1);
  readDecision(plan.decision);
  assert(typeof plan.preparedAt === 'string' && typeof plan.auditGeneratedAt === 'string');
  requireFresh(plan.preparedAt, now, 1);
  requireFresh(plan.auditGeneratedAt, now, 1);
  assert(typeof plan.publisherCommit === 'string' && commit.test(plan.publisherCommit));
  assert(typeof plan.workflowRun === 'string' && /^[1-9][0-9]*$/u.test(plan.workflowRun));
  const candidate = object(plan.candidate);
  assert.deepEqual(Object.keys(candidate).sort(), [
    'artifactDigest',
    'name',
    'sourceCommit',
    'tag',
    'version',
  ]);
  assert(candidate.name === 'bga-mcp');
  assert(
    typeof candidate.version === 'string' &&
      /^1\.0\.0(?:-rc\.[1-9][0-9]*)?$/u.test(candidate.version),
  );
  assert(candidate.tag === `v${candidate.version}`);
  assert(typeof candidate.sourceCommit === 'string' && commit.test(candidate.sourceCommit));
  for (const value of [candidate.artifactDigest, plan.approvalDigest, plan.auditDigest])
    assert(typeof value === 'string' && digest.test(value));
  const github = object(plan.decision).channel === 'github-downloads';
  assert(Array.isArray(plan.files) && plan.files.length === (github ? 12 : 11));
  const expected = [
    `bga-mcp-${candidate.version}.tgz`,
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
    ...(github ? ['GITHUB_DOWNLOADS.md'] : []),
  ].sort();
  assert.deepEqual(plan.files.map((file: unknown) => object(file).name).sort(), expected);
  for (const file of plan.files as unknown[]) {
    const entry = object(file);
    assert.deepEqual(Object.keys(entry).sort(), ['digest', 'name']);
    assert(typeof entry.digest === 'string' && digest.test(entry.digest));
  }
  return plan as unknown as PublicationPlan;
}
export function verifyPreparedFiles(
  plan: PublicationPlan,
  files: ReadonlyMap<string, Buffer>,
): void {
  assert.deepEqual([...files.keys()].sort(), plan.files.map((file) => file.name).sort());
  const bytes = (name: string): Buffer => {
    const value = files.get(name);
    assert(value);
    return value;
  };
  for (const file of plan.files)
    assert.equal(sha256(bytes(file.name)), file.digest, 'Prepared file differs from admitted plan');
  assert.equal(
    sha256(bytes(`bga-mcp-${plan.candidate.version}.tgz`)),
    plan.candidate.artifactDigest,
  );
  assert.equal(sha256(bytes('approval.json')), plan.approvalDigest);
  assert.equal(sha256(bytes('fresh-audit.json')), plan.auditDigest);
}
export function verifyRegistryArtifact(
  metadataInput: unknown,
  bytes: Buffer,
  plan: PublicationPlan,
): string {
  assert('registry' in plan.decision, 'GitHub selection cannot authorize registry publication');
  const metadata = object(metadataInput),
    dist = object(metadata.dist);
  assert.equal(metadata.name, plan.candidate.name);
  assert.equal(metadata.version, plan.candidate.version);
  const url = `${PUBLICATION_REGISTRY}/bga-mcp/-/bga-mcp-${plan.candidate.version}.tgz`;
  assert.equal(dist.tarball, url, 'Registry tarball URL differs from fixed public destination');
  assert.equal(
    sha256(bytes),
    plan.candidate.artifactDigest,
    'Registry bytes differ from signed candidate',
  );
  assert.equal(
    dist.integrity,
    `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    'Registry integrity differs',
  );
  assert(
    Array.isArray(dist.signatures) && dist.signatures.length > 0,
    'Registry signature is missing',
  );
  assert(object(dist.attestations).url !== undefined, 'Registry provenance is missing');
  return url;
}
/** Policy only on npm CLI's successfully verified bundles, never on an unauthenticated decoded payload. */
export function verifyNpmProvenance(
  input: unknown,
  bytes: Buffer,
  plan: PublicationPlan,
): Record<string, unknown> {
  assert('registry' in plan.decision);
  const result = object(input);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.missing, []);
  assert(Array.isArray(result.verified));
  const entry = result.verified
    .map(object)
    .find(
      (item) =>
        item.name === plan.candidate.name &&
        item.version === plan.candidate.version &&
        item.registry === PUBLICATION_REGISTRY,
    );
  assert(entry && Array.isArray(entry.attestationBundles), 'No verified package provenance');
  const bundle = entry.attestationBundles
    .map(object)
    .find((item) => item.predicateType === 'https://slsa.dev/provenance/v1');
  assert(bundle, 'No supported npm provenance format');
  const envelope = object(object(bundle.bundle).dsseEnvelope);
  assert(typeof envelope.payload === 'string');
  const statement = object(
    JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8')) as unknown,
  );
  assert.equal(statement._type, 'https://in-toto.io/Statement/v1');
  assert.equal(statement.predicateType, 'https://slsa.dev/provenance/v1');
  assert.deepEqual(statement.subject, [
    {
      name: `pkg:npm/bga-mcp@${plan.candidate.version}`,
      digest: { sha512: createHash('sha512').update(bytes).digest('hex') },
    },
  ]);
  const predicate = object(statement.predicate),
    definition = object(predicate.buildDefinition);
  assert.equal(
    definition.buildType,
    'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
  );
  assert.deepEqual(object(definition.externalParameters).workflow, {
    ref: 'refs/heads/main',
    repository: `https://github.com/${PUBLICATION_REPOSITORY}`,
    path: PUBLICATION_WORKFLOW,
  });
  assert.deepEqual(definition.resolvedDependencies, [
    {
      uri: `git+https://github.com/${PUBLICATION_REPOSITORY}@refs/heads/main`,
      digest: { gitCommit: plan.publisherCommit },
    },
  ]);
  const details = object(predicate.runDetails);
  assert.equal(object(details.builder).id, 'https://github.com/actions/runner/github-hosted');
  const invocation = object(details.metadata).invocationId;
  assert(
    typeof invocation === 'string' &&
      new RegExp(
        `^https://github.com/${PUBLICATION_REPOSITORY}/actions/runs/${plan.workflowRun}/attempts/[1-9][0-9]*$`,
        'u',
      ).test(invocation),
  );
  return object(bundle.bundle);
}

export function npmAttestationArguments(
  artifact: string,
  bundle: string,
  plan: PublicationPlan,
  roots: string,
): string[] {
  return [
    'attestation',
    'verify',
    artifact,
    '--bundle',
    bundle,
    '--digest-alg',
    'sha512',
    '--repo',
    PUBLICATION_REPOSITORY,
    '--predicate-type',
    'https://slsa.dev/provenance/v1',
    '--signer-workflow',
    `${PUBLICATION_REPOSITORY}/${PUBLICATION_WORKFLOW}`,
    '--cert-identity',
    `https://github.com/${PUBLICATION_REPOSITORY}/${PUBLICATION_WORKFLOW}@refs/heads/main`,
    '--source-ref',
    'refs/heads/main',
    '--source-digest',
    plan.publisherCommit,
    '--signer-digest',
    plan.publisherCommit,
    '--cert-oidc-issuer',
    'https://token.actions.githubusercontent.com',
    '--deny-self-hosted-runners',
    '--custom-trusted-root',
    roots,
    '--format',
    'json',
  ];
}

export function verifyConsumerReceipt(
  input: unknown,
  plan: PublicationPlan,
  planDigest: string,
  now = new Date(),
): void {
  assert('registry' in plan.decision);
  const consumer = object(input);
  assert.equal(consumer.schemaVersion, 1);
  assert.equal(consumer.owner, 'BGA-415');
  assert.equal(consumer.status, 'verified');
  assert.equal(consumer.planDigest, planDigest);
  assert.deepEqual(consumer.candidate, plan.candidate);
  assert.equal(consumer.publisherCommit, plan.publisherCommit);
  assert.equal(consumer.workflowRun, plan.workflowRun);
  assert.equal(consumer.registry, PUBLICATION_REGISTRY);
  assert.equal(consumer.approvalDigest, plan.approvalDigest);
  assert.equal(consumer.auditDigest, plan.auditDigest);
  assert(typeof consumer.verifiedAt === 'string');
  requireFresh(consumer.verifiedAt, now, 1);
  for (const field of [
    'provenanceVerified',
    'signatureVerified',
    'inventoryMatched',
    'firstUsePassed',
    'projectUnchanged',
    'removed',
    'credentialFree',
  ])
    assert.equal(consumer[field], true, `Consumer did not prove ${field}`);
}

export function verifyPublicationPrerequisites(
  receipts: { installation: unknown; client: unknown; evidence: unknown; usefulness: unknown },
  candidate: { tag: string; sourceCommit: string; artifactDigest: string },
  guideDigest: string,
): void {
  const installation = object(receipts.installation);
  assert.equal(installation.candidateTag, candidate.tag);
  assert.equal(installation.candidateCommit, candidate.sourceCommit);
  assert.equal(installation.artifactDigest, candidate.artifactDigest);
  assert.equal(
    installation.guideDigest,
    guideDigest,
    'Installation guide changed since its candidate test',
  );
  for (const key of ['install', 'firstUse', 'removal']) assert.equal(installation[key], 'passed');
  assert.equal(installation.discovery, 'matched installed inventory');
  assert.equal(installation.projectUnchanged, true);
  assert.equal(installation.serverExited, true);
  const client = object(receipts.client);
  assert.equal(client.owner, 'BGA-401');
  assert.equal(client.candidateTag, candidate.tag);
  assert.equal(client.candidateCommit, candidate.sourceCommit);
  assert.equal(
    client.artifactDigest,
    candidate.artifactDigest,
    'Client smoke did not use this candidate',
  );
  assert.equal(client.discovery, 'matched installed inventory');
  assert.equal(client.removal, 'passed');
  for (const key of [
    'projectUnchanged',
    'userConfigurationUnchanged',
    'appServerExited',
    'serverProcessesExited',
    'schemaRefusal',
    'outsideRootRefusal',
    'excludedToolRefusal',
  ])
    assert.equal(client[key], true);
  const evidence = object(receipts.evidence);
  assert.equal(evidence.owner, 'BGA-407');
  assert.equal(evidence.candidateTag, candidate.tag);
  assert.equal(evidence.candidateSourceCommit, candidate.sourceCommit);
  assert.equal(
    evidence.originalArtifactDigest,
    candidate.artifactDigest,
    'Public evidence belongs to another candidate',
  );
  assert.equal(object(evidence.workflow).conclusion, 'success');
  const release = object(evidence.release);
  assert.equal(release.tag, candidate.tag);
  assert.equal(release.draft, false);
  assert.equal(
    release.url,
    `https://github.com/${PUBLICATION_REPOSITORY}/releases/tag/${candidate.tag}`,
  );
  const validation = object(evidence.independentPublicValidation);
  for (const key of [
    'trustedSchemas',
    'originalSignatureAndIdentity',
    'exactCapabilityAndEnvironmentCoverage',
  ])
    assert.equal(validation[key], 'passed');
  const usefulness = object(receipts.usefulness);
  assert.equal(usefulness.owner, 'BGA-424');
  assert.equal(usefulness.status, 'verified');
  const evaluated = object(usefulness.candidate);
  assert.equal(evaluated.tag, candidate.tag);
  assert.equal(evaluated.commit, candidate.sourceCommit);
  assert.equal(
    evaluated.artifactDigest,
    candidate.artifactDigest,
    'Usefulness evaluation belongs to another candidate',
  );
}
