import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  object,
  readPublicationConfig,
  readPublicationPlan,
  sha256,
  verifyPreparedFiles,
  verifyRegistryArtifact,
  verifyNpmProvenance,
  verifyConsumerReceipt,
  npmAttestationArguments,
  verifyPublicationPrerequisites,
  type PublicationPlan,
  type PublicationDecision,
} from '../../scripts/lib/publication.js';
import { verifyPublicationWorkflow } from '../../scripts/lib/publication-workflow.js';
import { publicationHolds } from '../../scripts/prepare-publication.js';
import { runCommand } from '../helpers/process.js';
const root = resolve(import.meta.dirname, '../..'),
  stamp = '2026-10-02T00:00:00.000Z';
const bytes = Buffer.from('Original harmless synthetic archive; no real signature claim');
const decision: PublicationDecision = {
  packageName: 'bga-mcp',
  registry: 'https://registry.npmjs.org',
  repository: 'Brandon-Born/bga-mcp',
  workflow: '.github/workflows/release-publication.yml',
  environment: 'npm-publication',
  authorizedBy: 'Brandon-Born',
  authorizedAt: stamp,
  publisherSetupEvidence: 'Synthetic verifier control only; no live setup proof',
};
const files = new Map(
  [
    'bga-mcp-1.0.0-rc.3.tgz',
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
  ].map((name) => [name, bytes]),
);
function control(): PublicationPlan {
  return {
    schemaVersion: 1,
    preparedAt: stamp,
    publisherCommit: 'a'.repeat(40),
    workflowRun: '123',
    decision,
    candidate: {
      name: 'bga-mcp',
      version: '1.0.0-rc.3',
      tag: 'v1.0.0-rc.3',
      sourceCommit: 'b'.repeat(40),
      artifactDigest: sha256(bytes),
    },
    approvalDigest: sha256(bytes),
    auditDigest: sha256(bytes),
    auditGeneratedAt: stamp,
    files: [...files].map(([name, value]) => ({ name, digest: sha256(value) })),
  };
}
it('[GATE-PUBLICATION] refuses automatic triggers, credential fallback, excessive permissions, rebuilds and promotion without consumer success', async () => {
  const source = await readFile(resolve(root, '.github/workflows/release-publication.yml'), 'utf8');
  expect(verifyPublicationWorkflow(source).failures).toEqual([]);
  for (const changed of [
    source.replace('workflow_dispatch:', 'pull_request:'),
    source.replace('default: dry-run', 'default: publish'),
    source.replace('actions: read', 'id-token: write'),
    source.replaceAll(" && inputs.mode == 'publish'", ''),
    source.replace('needs: [prepare, verify]', 'needs: prepare'),
    source.replace('EXPECTED_CONSUMER_DIGEST:', 'IGNORED_CONSUMER_DIGEST:'),
    source.replace('persist-credentials: false', 'persist-credentials: true'),
    source.replace('npm@12.2.0', 'npm@latest'),
    source.replace('pnpm release:prepare', 'npm pack'),
    `${source}\n# NPM_TOKEN`,
  ])
    expect(verifyPublicationWorkflow(changed).failed).toBe(true);
});
it('[INT-PUBLICATION-BOUNDARIES] keeps missing decisions and real external release holds explicit without publishing', async () => {
  const config = {
    schemaVersion: 1,
    owner: 'BGA-415',
    decision: null,
    reviewReceipt: 'docs/verification/held.json',
    npmCli: '12.2.0',
    prerequisites: {
      installation: 'docs/verification/install.json',
      client: 'docs/verification/client.json',
      evidence: 'docs/verification/evidence.json',
      usefulness: 'docs/verification/usefulness.json',
    },
  };
  expect(readPublicationConfig(config).decision).toBeNull();
  for (const changed of [
    { ...config, decision: { ...decision, registry: 'https://attacker.invalid' } },
    { ...config, decision: { ...decision, packageName: 'another-name' } },
    { ...config, decision: { ...decision, publisherSetupEvidence: '' } },
    { ...config, npmCli: 'latest' },
  ])
    expect(() => readPublicationConfig(changed)).toThrow();
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
});
it('[INT-PUBLICATION-BOUNDARIES] refuses substituted, missing or expired prepared files before a registry write', () => {
  const plan = control();
  expect(() => readPublicationPlan(plan, new Date(stamp))).not.toThrow();
  expect(() => verifyPreparedFiles(plan, files)).not.toThrow();
  expect(() => readPublicationPlan(plan, new Date('2026-10-02T02:00:00Z'))).toThrow();
  expect(() =>
    readPublicationPlan({ ...plan, auditGeneratedAt: '2026-10-03T00:00:00Z' }, new Date(stamp)),
  ).toThrow();
  expect(() =>
    readPublicationPlan({ ...plan, files: plan.files.slice(1) }, new Date(stamp)),
  ).toThrow();
  const changed = new Map(files);
  changed.set('bga-mcp-1.0.0-rc.3.tgz', Buffer.from('changed'));
  expect(() => verifyPreparedFiles(plan, changed)).toThrow();
});
it('[INT-PUBLICATION-BOUNDARIES] refuses wrong public version, URL, bytes, integrity or absent provenance', () => {
  const plan = control();
  const dist = {
    tarball: 'https://registry.npmjs.org/bga-mcp/-/bga-mcp-1.0.0-rc.3.tgz',
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    signatures: [{ keyid: 'synthetic', sig: 'synthetic' }],
    attestations: { url: 'synthetic' },
  };
  const metadata = { name: 'bga-mcp', version: '1.0.0-rc.3', dist };
  expect(() => verifyRegistryArtifact(metadata, bytes, plan)).not.toThrow();
  for (const changed of [
    { ...metadata, version: '1.0.0' },
    { ...metadata, dist: { ...dist, tarball: 'https://attacker.invalid/package.tgz' } },
    { ...metadata, dist: { ...dist, integrity: 'different' } },
    { ...metadata, dist: { ...dist, signatures: [] } },
    { ...metadata, dist: { ...dist, attestations: null } },
  ])
    expect(() => verifyRegistryArtifact(changed, bytes, plan)).toThrow();
  expect(() => verifyRegistryArtifact(metadata, Buffer.from('repacked'), plan)).toThrow();
});
it('[INT-PUBLICATION-BOUNDARIES] binds CLI-verified provenance to hosted main publisher, run and exact archive rather than misattributing source', () => {
  const plan = control();
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    predicateType: 'https://slsa.dev/provenance/v1',
    subject: [
      {
        name: 'pkg:npm/bga-mcp@1.0.0-rc.3',
        digest: { sha512: createHash('sha512').update(bytes).digest('hex') },
      },
    ],
    predicate: {
      buildDefinition: {
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: {
          workflow: {
            ref: 'refs/heads/main',
            repository: 'https://github.com/Brandon-Born/bga-mcp',
            path: '.github/workflows/release-publication.yml',
          },
        },
        resolvedDependencies: [
          {
            uri: 'git+https://github.com/Brandon-Born/bga-mcp@refs/heads/main',
            digest: { gitCommit: plan.publisherCommit },
          },
        ],
      },
      runDetails: {
        builder: { id: 'https://github.com/actions/runner/github-hosted' },
        metadata: {
          invocationId: 'https://github.com/Brandon-Born/bga-mcp/actions/runs/123/attempts/1',
        },
      },
    },
  };
  const audit = (value: unknown) => ({
    invalid: [],
    missing: [],
    verified: [
      {
        name: 'bga-mcp',
        version: '1.0.0-rc.3',
        registry: 'https://registry.npmjs.org',
        attestationBundles: [
          {
            predicateType: 'https://slsa.dev/provenance/v1',
            bundle: {
              dsseEnvelope: { payload: Buffer.from(JSON.stringify(value)).toString('base64') },
            },
          },
        ],
      },
    ],
  });
  // Synthetic decoder controls are not cryptographic evidence. The real runner requires npm CLI success first.
  expect(() => verifyNpmProvenance(audit(statement), bytes, plan)).not.toThrow();
  expect(() =>
    verifyNpmProvenance({ ...audit(statement), missing: ['bga-mcp'] }, bytes, plan),
  ).toThrow();
  expect(() =>
    verifyNpmProvenance({ invalid: [], missing: [], verified: [] }, bytes, plan),
  ).toThrow();
  expect(() =>
    verifyNpmProvenance(audit(statement), bytes, {
      ...plan,
      publisherCommit: plan.candidate.sourceCommit,
    }),
  ).toThrow();
  expect(() => verifyNpmProvenance(audit(statement), Buffer.from('different'), plan)).toThrow();
  const wrong = JSON.parse(
    JSON.stringify(statement).replace('refs/heads/main', 'refs/heads/fork'),
  ) as unknown;
  expect(() => verifyNpmProvenance(audit(wrong), bytes, plan)).toThrow();
});
it('[INT-PUBLICATION-BOUNDARIES] refuses local publication and failed-consumer promotion before any npm invocation', async () => {
  for (const mode of ['publish', 'promote']) {
    const result = await runCommand(
      process.execPath,
      [
        '--experimental-strip-types',
        resolve(root, 'scripts/publish-release.ts'),
        mode,
        '/absent-packet',
        'sha256:' + '0'.repeat(64),
      ],
      { cwd: root, env: { PATH: process.env.PATH }, timeoutMs: 10_000 },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('stop promotion');
  }
});

it('[INT-PUBLICATION-BOUNDARIES] stops promotion on incomplete, stale or differently bound consumer evidence', () => {
  const plan = control(),
    planDigest = sha256('synthetic plan');
  const receipt = {
    schemaVersion: 1,
    owner: 'BGA-415',
    status: 'verified',
    verifiedAt: stamp,
    planDigest,
    candidate: plan.candidate,
    publisherCommit: plan.publisherCommit,
    workflowRun: plan.workflowRun,
    registry: decision.registry,
    approvalDigest: plan.approvalDigest,
    auditDigest: plan.auditDigest,
    provenanceVerified: true,
    signatureVerified: true,
    inventoryMatched: true,
    firstUsePassed: true,
    projectUnchanged: true,
    removed: true,
    credentialFree: true,
  };
  expect(() => verifyConsumerReceipt(receipt, plan, planDigest, new Date(stamp))).not.toThrow();
  for (const field of [
    'provenanceVerified',
    'signatureVerified',
    'inventoryMatched',
    'firstUsePassed',
    'projectUnchanged',
    'removed',
    'credentialFree',
  ])
    expect(() =>
      verifyConsumerReceipt({ ...receipt, [field]: false }, plan, planDigest, new Date(stamp)),
    ).toThrow();
  expect(() =>
    verifyConsumerReceipt(receipt, plan, sha256('other plan'), new Date(stamp)),
  ).toThrow();
  expect(() =>
    verifyConsumerReceipt(receipt, plan, planDigest, new Date('2026-10-02T02:00:00Z')),
  ).toThrow();
  const args = npmAttestationArguments('/artifact', '/bundle', plan, '/roots');
  expect(args[args.indexOf('--digest-alg') + 1]).toBe('sha512');
  expect(args[args.indexOf('--source-digest') + 1]).toBe(plan.publisherCommit);
  expect(args[args.indexOf('--signer-digest') + 1]).toBe(plan.publisherCommit);
  expect(args[args.indexOf('--cert-identity') + 1]).toBe(
    'https://github.com/Brandon-Born/bga-mcp/.github/workflows/release-publication.yml@refs/heads/main',
  );
  expect(args).toContain('--deny-self-hosted-runners');
});

it('[INT-PUBLICATION-BOUNDARIES] requires candidate-specific install, client, public evidence and usefulness receipts', async () => {
  const config = readPublicationConfig(
    JSON.parse(await readFile(resolve(root, 'config/publication.json'), 'utf8')),
  );
  const read = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(resolve(root, path), 'utf8')) as unknown;
  const receipts = {
    installation: await read(config.prerequisites.installation),
    client: await read(config.prerequisites.client),
    evidence: await read(config.prerequisites.evidence),
    usefulness: await read(config.prerequisites.usefulness),
  };
  const review = object(await read(config.reviewReceipt));
  const reviewed = object(review.candidate) as {
    tag: string;
    sourceCommit: string;
    artifactDigest: string;
  };
  const currentGuideDigest = sha256(await readFile(resolve(root, 'docs/INSTALL.md')));
  // Real retained receipts are checked unchanged. Identity rewrites below are synthetic controls only.
  expect(() =>
    verifyPublicationPrerequisites(receipts, reviewed, currentGuideDigest),
  ).not.toThrow();
  for (const [key, path] of [
    ['installation', 'install-guide-v1.0.0-rc.4-signed.json'],
    ['client', 'codex-client-v1.0.0-rc.4-clean.json'],
    ['evidence', 'release-evidence-v1.0.0-rc.4.json'],
    ['usefulness', 'agent-evaluation-v1.0.0-rc.4.json'],
  ] as const) {
    const historical = await read(`docs/verification/${path}`);
    expect(() =>
      verifyPublicationPrerequisites(
        { ...receipts, [key]: historical },
        reviewed,
        currentGuideDigest,
      ),
    ).toThrow();
  }
  const plan = control(),
    expected = plan.candidate;
  // Independently bound receipts are required; this synthetic admission control grants no live release status.
  const installed = object(receipts.installation),
    client = object(receipts.client),
    evidence = object(receipts.evidence),
    usefulness = object(receipts.usefulness);
  const guideDigest = sha256('synthetic guide');
  const admitted = {
    installation: {
      ...installed,
      candidateTag: expected.tag,
      candidateCommit: expected.sourceCommit,
      artifactDigest: expected.artifactDigest,
      guideDigest,
    },
    client: {
      ...client,
      candidateTag: expected.tag,
      candidateCommit: expected.sourceCommit,
      artifactDigest: expected.artifactDigest,
    },
    evidence: {
      ...evidence,
      candidateTag: expected.tag,
      candidateSourceCommit: expected.sourceCommit,
      originalArtifactDigest: expected.artifactDigest,
      release: {
        ...object(evidence.release),
        tag: expected.tag,
        url: `https://github.com/Brandon-Born/bga-mcp/releases/tag/${expected.tag}`,
      },
    },
    usefulness: {
      ...usefulness,
      candidate: {
        ...object(usefulness.candidate),
        tag: expected.tag,
        commit: expected.sourceCommit,
        artifactDigest: expected.artifactDigest,
      },
    },
  };
  expect(() => verifyPublicationPrerequisites(admitted, expected, guideDigest)).not.toThrow();
  expect(() =>
    verifyPublicationPrerequisites(
      { ...admitted, installation: { ...admitted.installation, removal: 'failed' } },
      expected,
      guideDigest,
    ),
  ).toThrow();
  expect(() =>
    verifyPublicationPrerequisites(
      { ...admitted, client: { ...admitted.client, artifactDigest: sha256('other') } },
      expected,
      guideDigest,
    ),
  ).toThrow();
  expect(() =>
    verifyPublicationPrerequisites(
      { ...admitted, evidence: { ...admitted.evidence, originalArtifactDigest: sha256('other') } },
      expected,
      guideDigest,
    ),
  ).toThrow();
  expect(() =>
    verifyPublicationPrerequisites(
      { ...admitted, usefulness: { ...admitted.usefulness, status: 'implemented' } },
      expected,
      guideDigest,
    ),
  ).toThrow();
});
