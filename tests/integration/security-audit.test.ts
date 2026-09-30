import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';

import {
  normalizeAudit,
  verifySecurityAudit,
  type SecurityAudit,
  type SecurityPolicy,
} from '../../scripts/lib/security-audit.js';
import { verifySecurityWiring } from '../../scripts/verify-security-audit.js';

const root = resolve(import.meta.dirname, '../..');
const now = new Date('2026-09-29T12:00:00Z');
const identity = {
  commit: '1'.repeat(40),
  lockDigest: `sha256:${'2'.repeat(64)}`,
  packageDigest: `sha256:${'3'.repeat(64)}`,
  workspaceDigest: `sha256:${'4'.repeat(64)}`,
  policyDigest: `sha256:${'5'.repeat(64)}`,
};
const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const policy: SecurityPolicy = { schemaVersion: 1, maxAgeHours: 24, exceptions: [] };
function clean(): SecurityAudit {
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    source: identity,
    registry: 'https://registry.npmjs.org',
    production: { counts, findings: [] },
    all: { counts, findings: [] },
  };
}

describe('release dependency security preflight', () => {
  it('[GATE-SECURITY-AUDIT] blocks direct and transitive tooling findings, expired exceptions, malformed input, and stale identity without network access', async () => {
    expect(verifySecurityAudit(clean(), policy, identity, now).failed).toBe(false);
    for (const module of ['direct-tool', 'transitive-tool']) {
      for (const severity of ['high', 'critical', 'moderate', 'low'] as const) {
        const audit = clean();
        audit.all.findings.push({ id: 'GHSA-aaaa-bbbb-cccc', module, severity });
        audit.all.counts = { ...counts, [severity]: 1 };
        expect(verifySecurityAudit(audit, policy, identity, now).failed).toBe(true);
      }
    }
    const audit = clean();
    audit.all.findings.push({
      id: 'GHSA-aaaa-bbbb-cccc',
      module: 'direct-tool',
      severity: 'moderate',
    });
    audit.all.counts = { ...counts, moderate: 1 };
    const excepted: SecurityPolicy = {
      ...policy,
      exceptions: [
        {
          id: 'GHSA-aaaa-bbbb-cccc',
          module: 'direct-tool',
          owner: 'maintainer',
          reason: 'Feature unreachable, proven by the compensating scenario',
          reviewedAt: '2026-09-28T00:00:00Z',
          expiresAt: '2026-09-30T00:00:00Z',
          compensatingScenario: 'GATE-SECURITY-AUDIT',
        },
      ],
    };
    expect(
      verifySecurityAudit(audit, excepted, identity, now, new Set(['GATE-SECURITY-AUDIT'])).failed,
    ).toBe(false);
    expect(verifySecurityAudit(audit, excepted, identity, now).failed).toBe(true);
    const expired = new Date('2026-09-30T00:00:00Z');
    expect(
      verifySecurityAudit(
        { ...audit, generatedAt: expired.toISOString() },
        excepted,
        identity,
        expired,
        new Set(['GATE-SECURITY-AUDIT']),
      ).failures,
    ).toContainEqual(expect.stringContaining('expired'));
    const firstFinding = audit.all.findings[0];
    if (firstFinding === undefined) throw new Error('Missing advisory control');
    firstFinding.severity = 'high';
    audit.all.counts = { ...counts, high: 1 };
    expect(
      verifySecurityAudit(audit, excepted, identity, now, new Set(['GATE-SECURITY-AUDIT'])).failed,
    ).toBe(true);
    for (const key of Object.keys(identity) as (keyof typeof identity)[]) {
      expect(
        verifySecurityAudit(clean(), policy, { ...identity, [key]: 'changed' }, now).failed,
      ).toBe(true);
    }
    expect(
      verifySecurityAudit(
        { ...clean(), generatedAt: '2026-09-27T00:00:00Z' },
        policy,
        identity,
        now,
      ).failed,
    ).toBe(true);
    expect(
      verifySecurityAudit(
        { ...clean(), generatedAt: '2026-09-30T00:00:00Z' },
        policy,
        identity,
        now,
      ).failed,
    ).toBe(true);
    expect(
      verifySecurityAudit({ error: 'registry unavailable' }, policy, identity, now).failed,
    ).toBe(true);
    expect(() => normalizeAudit({ error: 'registry unavailable' })).toThrow();
    expect(() =>
      normalizeAudit({
        error: 'registry unavailable',
        advisories: {},
        metadata: { vulnerabilities: counts },
      }),
    ).toThrow();
    const normalized = normalizeAudit({
      advisories: {
        seed: {
          module_name: 'direct-tool',
          severity: 'moderate',
          github_advisory_id: 'GHSA-aaaa-bbbb-cccc',
          title: 'PRIVATE CANARY',
          paths: ['PRIVATE CANARY'],
          url: 'PRIVATE CANARY',
        },
      },
      metadata: { vulnerabilities: { ...counts, moderate: 1 } },
    });
    expect(JSON.stringify(normalized)).not.toContain('PRIVATE CANARY');
    expect(() =>
      normalizeAudit({ advisories: {}, metadata: { vulnerabilities: { ...counts, high: 1 } } }),
    ).toThrow();
    expect((await verifySecurityWiring(root)).failures).toEqual([]);
    const temporary = await mkdtemp(join(tmpdir(), 'bga-security-wiring-'));
    try {
      await mkdir(resolve(temporary, 'scripts'), { recursive: true });
      await mkdir(resolve(temporary, '.github/workflows'), { recursive: true });
      for (const path of [
        'package.json',
        'scripts/create-release-candidate.ts',
        '.github/workflows/security-review.yml',
      ]) {
        await writeFile(resolve(temporary, path), await readFile(resolve(root, path)));
      }
      const path = resolve(temporary, 'scripts/create-release-candidate.ts');
      await writeFile(
        path,
        (await readFile(path, 'utf8')).replace(
          'await runSecurityAudit(repositoryRoot)',
          'undefined',
        ),
      );
      expect((await verifySecurityWiring(temporary)).failed).toBe(true);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('[INT-SECURITY-AUDIT-PREFLIGHT] runs the actual offline preflight command without a registry or lockfile mutation', async () => {
    const before = await readFile(resolve(root, 'pnpm-lock.yaml'));
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', resolve(root, 'scripts/verify-security-audit.ts')],
      { cwd: root, timeout: 30_000 },
    );
    expect(stdout).toContain('Offline security gate passed');
    expect(await readFile(resolve(root, 'pnpm-lock.yaml'))).toEqual(before);
  });
});
