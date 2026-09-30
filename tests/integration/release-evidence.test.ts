import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { sealEvidence, type Evidence } from '../../scripts/lib/evidence.js';
import {
  assertSchema,
  assetDigest,
  buildReleaseEvidence,
  EVIDENCE_ASSETS,
} from '../../scripts/lib/release-evidence.js';
import {
  buildReleaseCandidateManifest,
  type CapabilityManifest,
  type ReleaseInventory,
} from '../../scripts/lib/release.js';
import {
  reconcileRelease,
  validatePublicationPlan,
  type PublicationPlan,
  type RemoteRelease,
} from '../../scripts/publish-release-evidence.js';
import { verifyEvidenceWorkflow } from '../../scripts/verify-release-evidence.js';
const root = resolve(import.meta.dirname, '../..');
const load = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
async function synthetic() {
  const inventory = await load<ReleaseInventory>('config/release.json');
  const manifest = await load<CapabilityManifest>('config/capabilities.json');
  const all = [
    ...manifest.transports.map((entry) => ({ kind: 'transport' as const, entry })),
    ...manifest.capabilities.tools.map((entry) => ({ kind: 'tool' as const, entry })),
    ...manifest.capabilities.resources.map((entry) => ({ kind: 'resource' as const, entry })),
    ...manifest.capabilities.prompts.map((entry) => ({ kind: 'prompt' as const, entry })),
    ...manifest.adapters.map((entry) => ({ kind: 'adapter' as const, entry })),
  ];
  const evidence: Evidence = sealEvidence({
    schemaVersion: 1,
    generatedAt: '2026-09-30T00:00:00.000Z',
    source: { commit: 'a'.repeat(40), clean: true },
    package: {
      name: 'bga-mcp',
      version: '1.0.0-rc.1',
      lockDigest: `sha256:${'1'.repeat(64)}`,
      artifactDigest: `sha256:${'2'.repeat(64)}`,
      artifactRuns: [{ suite: 'synthetic-policy', digest: `sha256:${'2'.repeat(64)}` }],
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      packageManager: 'pnpm@11.15.1',
      ci: false,
    },
    protocol: {
      supportedVersions: ['2025-11-25'],
      transports: ['stdio'],
      conformance: {
        status: 'passed',
        coverage: [{ version: '2025-11-25', status: 'passed', runs: 1 }],
        runs: [],
      },
    },
    ci: [],
    capabilities: all.map(({ kind, entry }) => ({
      kind,
      name: entry.name,
      stability: entry.stability,
      status: 'passed',
      supportedLayouts: entry.supportedLayouts ?? [],
      environments: entry.environments ?? [],
      protocolVersions: entry.protocolVersions ?? [],
      ci: { id: entry.ciEvidence, conclusion: 'success', covers: 'ancestor' },
      scenarios: entry.requiredScenarios.map((id) => ({
        id,
        status: 'passed',
        tests: [
          {
            file: 'tests/e2e/synthetic-policy.test.ts',
            title: `[${id}] synthetic`,
            status: 'passed',
          },
        ],
      })),
    })),
    claims: [],
    scenarios: { required: 1, passed: 1, failed: 0, missing: 0 },
    tests: { files: 1, total: 1, passed: 1, failed: 0, skipped: 0 },
  });
  const candidate = buildReleaseCandidateManifest(
    inventory,
    manifest,
    evidence,
    'v1.0.0-rc.1',
    evidence.source.commit,
    'bga-mcp-1.0.0-rc.1.tgz',
    evidence.package.artifactDigest ?? '',
  );
  return {
    evidence,
    inventory,
    manifest,
    candidate,
    signerCommit: 'b'.repeat(40),
    evidenceSchema: await load<object>('config/evidence.schema.json'),
  };
}
describe('per-release evidence policy (synthetic offline inputs; no signature generation)', () => {
  it('[GATE-RELEASE-EVIDENCE] rejects unsafe permissions, triggers, action pins, dependency execution, plan substitution paths and missing public download verification', async () => {
    const workflow = await readFile(
      resolve(root, '.github/workflows/release-evidence.yml'),
      'utf8',
    );
    const publisher = await readFile(resolve(root, 'scripts/publish-release-evidence.ts'), 'utf8');
    expect(verifyEvidenceWorkflow(workflow, publisher).failures).toEqual([]);
    for (const mutate of [
      (s: string) => s.replace('workflow_dispatch:', 'push:'),
      (s: string) =>
        s.replaceAll("github.ref == 'refs/heads/main'", "github.ref != 'refs/heads/main'"),
      (s: string) =>
        s.replace('contents: read\n      actions: read', 'contents: write\n      actions: read'),
      (s: string) => s.replace('contents: write', 'contents: write\n      id-token: write'),
      (s: string) =>
        s.replace(
          'node --experimental-strip-types scripts/publish-release-evidence.ts',
          'pnpm install && node scripts/publish-release-evidence.ts',
        ),
      (s: string) =>
        s.replace(
          'EXPECTED_PLAN_DIGEST: ${{ needs.prepare.outputs.plan-digest }}',
          'EXPECTED_PLAN_DIGEST: untrusted',
        ),
      (s: string) => s.replace('pnpm release:evidence download', 'pnpm build'),
      (s: string) =>
        s.replace(/actions\/upload-artifact@[a-f0-9]{40}/u, 'actions/upload-artifact@v7'),
    ])
      expect(verifyEvidenceWorkflow(mutate(workflow), publisher).failed).toBe(true);
    expect(
      verifyEvidenceWorkflow(workflow, "import danger from 'external-dependency';").failed,
    ).toBe(true);
  });
  it('[INT-RELEASE-EVIDENCE] proves exact advertised/local coverage, explicit exclusions and stale labels, rejects omitted/duplicate/extra capabilities, wrong environments, missing scenarios, stale selected evidence and unsupported conformance', async () => {
    const input = await synthetic();
    const result = buildReleaseEvidence(input);
    expect(result.local.capabilities).toHaveLength(11);
    expect(result.excluded).toHaveLength(6);
    expect(result.liveStudio.status).toBe('not-run');
    expect(result.stale).toEqual([]);
    assertSchema(result, await load<object>('config/release-evidence.schema.json'));
    for (const mutate of [
      (e: MutableEvidence) => {
        e.capabilities.splice(0, 1);
      },
      (e: MutableEvidence) => {
        const c = e.capabilities[0];
        if (c) e.capabilities.push(c);
      },
      (e: MutableEvidence) => {
        const c = e.capabilities.find((c) => c.name === 'inspect_project');
        if (c) c.environments.push('studio');
      },
      (e: MutableEvidence) => {
        const c = e.capabilities.find((c) => c.name === 'inspect_project');
        if (c) c.scenarios.splice(0, 1);
      },
      (e: MutableEvidence) => {
        const c = e.capabilities.find((c) => c.name === 'inspect_project');
        if (c) c.ci.covers = 'stale';
      },
      (e: MutableEvidence) => {
        e.protocol.conformance.coverage.splice(0);
      },
      (e: MutableEvidence) => {
        e.source.commit = '0'.repeat(40);
      },
    ]) {
      const bad = structuredClone(input) as Omit<typeof input, 'evidence'> & {
        evidence: MutableEvidence;
      };
      mutate(bad.evidence);
      bad.evidence = sealEvidence(bad.evidence) as MutableEvidence;
      expect(() => buildReleaseEvidence(bad)).toThrow();
    }
    const staleExcluded = structuredClone(input) as Omit<typeof input, 'evidence'> & {
      evidence: MutableEvidence;
    };
    const excluded = staleExcluded.evidence.capabilities.find((c) => c.name === 'read_studio_logs');
    if (!excluded) throw new Error('Missing exclusion');
    excluded.ci.covers = 'stale';
    staleExcluded.evidence = sealEvidence(staleExcluded.evidence) as MutableEvidence;
    expect(buildReleaseEvidence(staleExcluded).stale).toEqual([
      { kind: 'tool', name: 'read_studio_logs' },
    ]);
  });
  it('[INT-RELEASE-EVIDENCE-PACKET] digest-binds the scanned handoff, forbids extra binary assets and substitution, resumes only matching drafts, refuses overwrite and requires complete published evidence', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'bga-evidence-packet-'));
    try {
      const packet = resolve(directory, 'packet');
      await mkdir(packet);
      const receipt = await load<{ candidate: { sourceTag: string; sourceCommit: string } }>(
        'docs/verification/release-candidate-v1.0.0-rc.1.json',
      );
      const plan: PublicationPlan = {
        tag: receipt.candidate.sourceTag,
        sourceCommit: receipt.candidate.sourceCommit,
        title: `${receipt.candidate.sourceTag} verification evidence (candidate)`,
        notes: 'Synthetic publication-plan policy test. Live Studio: not run.',
        assets: EVIDENCE_ASSETS.map((name) => ({ name, digest: assetDigest(`Synthetic ${name}`) })),
      };
      for (const a of plan.assets) await writeFile(resolve(packet, a.name), `Synthetic ${a.name}`);
      const bytes = JSON.stringify(plan);
      await writeFile(resolve(directory, 'plan.json'), bytes);
      expect(await validatePublicationPlan(directory, assetDigest(bytes))).toEqual(plan);
      await expect(
        validatePublicationPlan(directory, `sha256:${'0'.repeat(64)}`),
      ).rejects.toThrow();
      const remote: RemoteRelease = {
        id: 1,
        tag_name: plan.tag,
        name: plan.title,
        body: plan.notes,
        draft: true,
        prerelease: true,
        assets: [],
      };
      expect(reconcileRelease(remote, plan)).toHaveLength(12);
      expect(() => reconcileRelease({ ...remote, draft: false }, plan)).toThrow();
      remote.assets = plan.assets.map((a) => ({ ...a, state: 'uploaded' }));
      expect(reconcileRelease({ ...remote, draft: false }, plan)).toEqual([]);
      expect(() => reconcileRelease({ ...remote, name: 'Another release' }, plan)).toThrow();
      const conflicting = structuredClone(remote);
      const first = conflicting.assets[0];
      if (!first) throw new Error('Missing asset');
      first.digest = `sha256:${'0'.repeat(64)}`;
      expect(() => reconcileRelease(conflicting, plan)).toThrow();
      await writeFile(resolve(packet, 'verification-evidence.json'), 'changed');
      await expect(validatePublicationPlan(directory, assetDigest(bytes))).rejects.toThrow();
      await writeFile(
        resolve(packet, 'verification-evidence.json'),
        'Synthetic verification-evidence.json',
      );
      await writeFile(resolve(packet, 'candidate.tgz'), 'forbidden binary');
      await expect(validatePublicationPlan(directory, assetDigest(bytes))).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
type Mutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[P] extends object
      ? Mutable<T[P]>
      : T[P];
};
type MutableEvidence = Mutable<Evidence>;
