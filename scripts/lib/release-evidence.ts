import assert from 'node:assert/strict';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { integrityDigest, type Evidence } from './evidence.js';
import {
  buildReleaseCandidateManifest,
  releaseDigest,
  type CapabilityManifest,
  type ReleaseCandidateManifest,
  type ReleaseInventory,
} from './release.js';
import { scanText } from './secret-scan.js';

export const EVIDENCE_ASSETS = [
  'SHA256SUMS',
  'release-candidate.json',
  'release-candidate.schema.json',
  'verification-evidence.json',
  'security-audit.json',
  'security-audit-policy.json',
  'sigstore-bundle.json',
  'capabilities.json',
  'release-inventory.json',
  'evidence.schema.json',
  'release-evidence.json',
  'release-evidence.schema.json',
].sort();
export const ORIGINAL_EVIDENCE_FILES = [
  'SHA256SUMS',
  'release-candidate.json',
  'release-candidate.schema.json',
  'verification-evidence.json',
  'security-audit.json',
  'security-audit-policy.json',
].sort();
export const RETENTION = {
  destination: 'GitHub release assets',
  duration: 'Lifetime of the release; no automatic expiry or replacement',
  history:
    'Preserve signed original observations. Publish later assessments separately; never rewrite old evidence.',
  recovery:
    'Tracked receipts and a maintainer-controlled local copy supplement hosted assets; verify digests and signatures after restoration.',
};

export function assertSchema(value: unknown, schema: object): void {
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  assert(validate(value), 'Release evidence does not match trusted schema');
}

export function buildReleaseEvidence(input: {
  evidence: Evidence;
  manifest: CapabilityManifest;
  inventory: ReleaseInventory;
  candidate: ReleaseCandidateManifest;
  signerCommit: string;
  evidenceSchema: object;
}) {
  const { evidence, manifest, inventory, candidate } = input;
  assertSchema(evidence, input.evidenceSchema);
  assert.equal(evidence.integrity?.value, integrityDigest(evidence));
  assert.equal(evidence.source.commit, candidate.release.sourceCommit);
  assert(evidence.source.clean && evidence.tests.failed === 0 && evidence.tests.skipped === 0);
  assert(evidence.scenarios.failed === 0 && evidence.scenarios.missing === 0);
  assert.equal(evidence.protocol.conformance.status, 'passed');
  assert.deepEqual(
    [...evidence.protocol.supportedVersions].sort(),
    [...inventory.protocolVersions].sort(),
  );
  assert.deepEqual([...evidence.protocol.transports].sort(), [...inventory.transports].sort());
  for (const version of inventory.protocolVersions)
    assert(
      evidence.protocol.conformance.coverage.some(
        (c) => c.version === version && c.status === 'passed',
      ),
    );
  assert((evidence.package.artifactRuns ?? []).length > 0);
  assert(
    evidence.package.artifactRuns?.every(
      (run) => run.digest === candidate.release.digests.artifact,
    ),
  );
  const rebuilt = buildReleaseCandidateManifest(
    inventory,
    manifest,
    evidence,
    candidate.release.sourceTag,
    candidate.release.sourceCommit,
    candidate.release.artifactName,
    candidate.release.digests.artifact,
    candidate.release.digests,
  );
  assert.deepEqual(rebuilt, candidate, 'Candidate selection differs from digest-bound sources');
  const all = [
    ...manifest.transports.map((entry) => ({ kind: 'transport', entry })),
    ...manifest.capabilities.tools.map((entry) => ({ kind: 'tool', entry })),
    ...manifest.capabilities.resources.map((entry) => ({ kind: 'resource', entry })),
    ...manifest.capabilities.prompts.map((entry) => ({ kind: 'prompt', entry })),
    ...manifest.adapters.map((entry) => ({ kind: 'adapter', entry })),
  ];
  const key = (kind: string, name: string): string => `${kind}:${name}`;
  assert.deepEqual(
    evidence.capabilities.map((c) => key(c.kind, c.name)).sort(),
    all.map((c) => key(c.kind, c.entry.name)).sort(),
    'Missing, duplicate or invented capability',
  );
  const selected = new Set([
    ...inventory.transports.map((name) => key('transport', name)),
    ...inventory.capabilities.tools.map((name) => key('tool', name)),
    ...inventory.capabilities.resources.map((name) => key('resource', name)),
    ...inventory.capabilities.prompts.map((name) => key('prompt', name)),
    ...inventory.adapters.map((name) => key('adapter', name)),
  ]);
  const coverage = evidence.capabilities.map((c) => {
    const source = all.find((a) => key(a.kind, a.entry.name) === key(c.kind, c.name))?.entry;
    assert(source);
    for (const field of ['supportedLayouts', 'environments', 'protocolVersions'] as const)
      assert.deepEqual([...c[field]].sort(), [...(source[field] ?? [])].sort());
    assert.equal(c.stability, source.stability);
    assert.deepEqual(c.scenarios.map((s) => s.id).sort(), [...source.requiredScenarios].sort());
    const stale =
      c.ci.conclusion !== 'success' ||
      !['this-commit', 'ancestor'].includes(c.ci.covers) ||
      c.status !== 'passed' ||
      c.scenarios.some(
        (s) =>
          s.status !== 'passed' ||
          s.tests.length === 0 ||
          s.tests.some((t) => t.status !== 'passed'),
      );
    const advertised = selected.has(key(c.kind, c.name));
    if (advertised) {
      assert(
        !stale && c.stability === 'verified',
        'Advertised capability has stale or failing evidence',
      );
      assert(
        !source.liveStudioRequired &&
          source.boundary !== 'TB-STUDIO' &&
          source.boundary !== 'TB-STUDIO-READ',
        'Live Studio claim in local release',
      );
      assert(c.environments.every((e) => e === 'local'));
      assert(
        c.scenarios.some((s) => s.tests.some((t) => t.file.startsWith('tests/e2e/'))),
        'Advertised capability lacks packaged evidence',
      );
    }
    return {
      kind: c.kind,
      name: c.name,
      advertised,
      recordedStability: c.stability,
      recordedStatus: c.status,
      stale,
      environments: c.environments,
      supportedLayouts: c.supportedLayouts,
      protocolVersions: c.protocolVersions,
      ci: c.ci,
      scenarios: c.scenarios.map((s) => ({ id: s.id, status: s.status })),
      exclusion: advertised
        ? null
        : 'Excluded from the frozen local release inventory; repository fixture results are not public support or live Studio evidence.',
    };
  });
  const result = {
    schemaVersion: 1,
    kind: 'release-verification-evidence',
    observedAt: evidence.generatedAt,
    release: candidate.release,
    signerCommit: input.signerCommit,
    local: {
      status: 'passed',
      environment: evidence.environment,
      capabilities: coverage.filter((c) => c.advertised),
    },
    liveStudio: {
      status: 'not-run',
      capabilities: [],
      reason:
        'No live Studio claim is included. Local and scripted-source fixture results do not establish live Studio compatibility.',
    },
    excluded: coverage.filter((c) => !c.advertised),
    stale: coverage.filter((c) => c.stale).map((c) => ({ kind: c.kind, name: c.name })),
    conformance: evidence.protocol.conformance,
    authenticity: {
      signedEvidence: 'verification-evidence.json',
      bundle: 'sigstore-bundle.json',
      summary:
        'Derived view; recompute from signed evidence and digest-bound original inventory/manifest before acceptance.',
    },
    retention: RETENTION,
    limitations: [
      'This is candidate evidence, not package publication or release security approval.',
      'Observations belong to the original source/artifact and date; signing and distribution do not renew them.',
      'Client breadth and developer productivity retain BGA-401 and BGA-424 ownership.',
    ],
  };
  assert.equal(scanText(JSON.stringify(result), 'release-evidence.json').length, 0);
  return result;
}
export const assetDigest = (bytes: Buffer | string): string => releaseDigest(bytes);
