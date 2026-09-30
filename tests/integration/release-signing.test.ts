import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { canonicalize } from '../../scripts/lib/evidence.js';
import {
  attestationArguments,
  checkVerifiedStatement,
  readSigningCandidate,
  SIGNING_PREDICATE,
  signingIdentity,
  verifySigningArchive,
} from '../../scripts/release-signing.js';
import { verifySigningWorkflow } from '../../scripts/verify-release-signing.js';

const root = resolve(import.meta.dirname, '../..');
const digest = (content: Buffer | string): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`;

describe('isolated retained-candidate signing', () => {
  it('[GATE-RELEASE-SIGNING] rejects identity in builds, signer rebuilds, automatic/untrusted triggers, secrets, publication, unpinned actions and missing consumer verification', async () => {
    const workflow = await readFile(resolve(root, '.github/workflows/release-signing.yml'), 'utf8');
    const helper = await readFile(resolve(root, 'scripts/release-signing.ts'), 'utf8');
    expect(verifySigningWorkflow(workflow, helper).failures).toEqual([]);
    for (const mutate of [
      (text: string) =>
        text.replace('      actions: read', '      actions: read\n      id-token: write'),
      (text: string) =>
        text.replace(
          'node --experimental-strip-types scripts/release-signing.ts predicate',
          'pnpm build\n          node --experimental-strip-types scripts/release-signing.ts predicate',
        ),
      (text: string) => text.replace('  workflow_dispatch:', '  pull_request:'),
      (text: string) =>
        text.replaceAll("github.ref == 'refs/heads/main'", "github.ref != 'refs/heads/main'"),
      (text: string) =>
        text.replace('attestations: write', 'attestations: write\n      packages: write'),
      (text: string) => text + '\n# NPM_TOKEN ${{ secrets.NPM_TOKEN }}\n',
      (text: string) =>
        text.replace(
          'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6',
          'actions/attest@v4',
        ),
      (text: string) => text.replace('pnpm verify:signed-release', 'pnpm build'),
      (text: string) => text.replace('push-to-registry: false', 'push-to-registry: true'),
    ])
      expect(verifySigningWorkflow(mutate(workflow), helper).failed).toBe(true);
    expect(
      verifySigningWorkflow(workflow, "import attacker from 'untrusted-package';").failed,
    ).toBe(true);
  });

  it('[INT-RELEASE-SIGNING] preserves original bytes and rejects rewritten checksums, stale sources, wrong archive/provenance/subjects and unsafe identity arguments without claiming to generate signatures', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'bga-signing-test-'));
    try {
      const receipt = JSON.parse(
        await readFile(
          resolve(root, 'docs/verification/release-candidate-v1.0.0-rc.1.json'),
          'utf8',
        ),
      ) as {
        candidate: {
          sourceCommit: string;
          lockDigest: string;
          artifactName: string;
          digests: Record<string, string>;
        };
        workflow: { archiveDigest: string };
      };
      const original = Buffer.from(
        'Original synthetic candidate bytes for retention-policy testing',
      );
      const archive = Buffer.from('Original synthetic archive bytes');
      receipt.workflow.archiveDigest = digest(archive);
      const artifact = receipt.candidate.artifactName;
      const policy = JSON.stringify({ schemaVersion: 1, maxAgeHours: 24, exceptions: [] });
      const audit = JSON.stringify({
        source: {
          commit: receipt.candidate.sourceCommit,
          lockDigest: receipt.candidate.lockDigest,
          policyDigest: digest(policy),
        },
      });
      const body = {
        source: { commit: receipt.candidate.sourceCommit, clean: true },
        package: { artifactDigest: digest(original), lockDigest: receipt.candidate.lockDigest },
        tests: { failed: 0, skipped: 0 },
        scenarios: { failed: 0, missing: 0 },
        nested: { $schema: 'Nested keys must remain covered by integrity' },
      };
      const evidence = JSON.stringify({
        ...body,
        integrity: {
          algorithm: 'sha256',
          value: createHash('sha256').update(canonicalize(body)).digest('hex'),
        },
      });
      receipt.candidate.digests.artifact = digest(original);
      receipt.candidate.digests.verificationEvidence = digest(evidence);
      receipt.candidate.digests.securityAudit = digest(audit);
      const files: Record<string, Buffer | string> = {
        [artifact]: original,
        'release-candidate.json': JSON.stringify({ release: receipt.candidate }),
        'release-candidate.schema.json': '{}',
        'verification-evidence.json': evidence,
        'security-audit.json': audit,
        'security-audit-policy.json': policy,
      };
      const checksumText = (): string =>
        Object.entries(files)
          .map(([name, content]) => `${digest(content).slice(7)}  ${name}`)
          .sort()
          .join('\n') + '\n';
      for (const [name, content] of Object.entries(files))
        await writeFile(resolve(directory, name), content);
      await writeFile(resolve(directory, 'SHA256SUMS'), checksumText());
      verifySigningArchive(archive, receipt);
      expect(() => verifySigningArchive(Buffer.from('substitute'), receipt)).toThrow();
      const before = await readFile(resolve(directory, artifact));
      const loaded = await readSigningCandidate(directory, receipt);
      expect(await readFile(resolve(directory, artifact))).toEqual(before);
      expect(loaded.identity.sourceCommit).toBe(receipt.candidate.sourceCommit);
      const verified = [
        {
          verificationResult: {
            statement: {
              predicateType: SIGNING_PREDICATE,
              predicate: loaded.predicate,
              subject: [...loaded.subjects].reverse(),
            },
          },
        },
      ];
      checkVerifiedStatement(verified, loaded);
      expect(() => checkVerifiedStatement([], loaded)).toThrow();
      const wrongPredicate = structuredClone(verified);
      const predicate = wrongPredicate[0]?.verificationResult.statement.predicate;
      if (predicate === undefined) throw new Error('Missing predicate control');
      predicate.source.commit = '0'.repeat(40);
      expect(() => checkVerifiedStatement(wrongPredicate, loaded)).toThrow();
      const wrongSubjects = structuredClone(verified);
      const firstSubject = wrongSubjects[0]?.verificationResult.statement.subject[0];
      if (firstSubject === undefined) throw new Error('Missing subject control');
      firstSubject.digest.sha256 = '0'.repeat(64);
      expect(() => checkVerifiedStatement(wrongSubjects, loaded)).toThrow();
      const arguments_ = attestationArguments(
        '/artifact',
        '/bundle',
        'a'.repeat(40),
        '/independently-trusted-root',
      );
      for (const required of [
        '--source-digest',
        '--signer-digest',
        '--source-ref',
        '--signer-workflow',
        '--deny-self-hosted-runners',
        '--cert-oidc-issuer',
        '--custom-trusted-root',
      ])
        expect(arguments_).toContain(required);
      expect(() => attestationArguments('/artifact', '/bundle', 'untrusted shell input')).toThrow();
      const wrongReceipt = structuredClone(receipt);
      wrongReceipt.candidate.sourceCommit = '0'.repeat(40);
      expect(() => signingIdentity(wrongReceipt)).toThrow();
      await writeFile(
        resolve(directory, artifact),
        Buffer.concat([original, Buffer.from('changed')]),
      );
      await expect(readSigningCandidate(directory, receipt)).rejects.toThrow();
      files[artifact] = await readFile(resolve(directory, artifact));
      await writeFile(resolve(directory, 'SHA256SUMS'), checksumText());
      await expect(readSigningCandidate(directory, receipt)).rejects.toThrow();
      await writeFile(resolve(directory, artifact), original);
      files[artifact] = original;
      await writeFile(resolve(directory, 'SHA256SUMS'), checksumText());
      await writeFile(resolve(directory, 'unexpected-payload'), 'Not a signing input');
      await expect(readSigningCandidate(directory, receipt)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
