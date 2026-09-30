import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expectSeededFailure, reportOrExit, GateReport } from './lib/gate.js';
import {
  normalizeAudit,
  SecurityPolicySchema,
  verifySecurityAudit,
  type SecurityAudit,
} from './lib/security-audit.js';

export async function verifySecurityWiring(root: string): Promise<GateReport> {
  const [packageText, builder, workflow] = await Promise.all([
    readFile(resolve(root, 'package.json'), 'utf8'),
    readFile(resolve(root, 'scripts/create-release-candidate.ts'), 'utf8'),
    readFile(resolve(root, '.github/workflows/security-review.yml'), 'utf8'),
  ]);
  const packageMetadata = JSON.parse(packageText) as { scripts: Record<string, string> };
  const report = new GateReport();
  report.require(
    packageMetadata.scripts['audit:security'] === 'tsx scripts/audit-security.ts',
    'Live security command is missing',
  );
  report.require(
    packageMetadata.scripts.check?.includes('pnpm verify:security-audit') === true &&
      !packageMetadata.scripts.check.includes('pnpm audit:security'),
    'Commit gate must verify security offline',
  );
  report.require(
    builder.includes('await runSecurityAudit(repositoryRoot)') &&
      builder.indexOf('await runSecurityAudit(repositoryRoot)') <
        builder.indexOf('await packedArtifact('),
    'Candidate builder does not require live security preflight before retaining bytes',
  );
  report.require(
    /schedule:\s*\n\s*- cron:/u.test(workflow) &&
      workflow.includes('workflow_dispatch:') &&
      workflow.includes('pnpm audit:security') &&
      workflow.includes('pnpm check'),
    'Scheduled security review is missing',
  );
  report.require(
    /permissions:\s*\n\s{2}contents: read/u.test(workflow) &&
      !/\b(?:id-token|packages): write|\b(?:npm|pnpm) publish\b/u.test(workflow),
    'Security review grants publication permissions',
  );
  report.require(
    workflow.includes('if: always()') &&
      workflow.includes('pnpm verify:safety-gates') &&
      /actions\/upload-artifact@[0-9a-f]{40}/u.test(workflow),
    'Security reports are not safely retained on failure',
  );
  return report;
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const policy = SecurityPolicySchema.parse(
    JSON.parse(await readFile(resolve(root, 'config/security-audit-policy.json'), 'utf8')),
  );
  const now = new Date('2026-09-29T12:00:00Z');
  const empty = normalizeAudit({
    advisories: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
  });
  const source = {
    commit: '1'.repeat(40),
    lockDigest: `sha256:${'2'.repeat(64)}`,
    packageDigest: `sha256:${'3'.repeat(64)}`,
    workspaceDigest: `sha256:${'4'.repeat(64)}`,
    policyDigest: `sha256:${'5'.repeat(64)}`,
  };
  const clean: SecurityAudit = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    registry: 'https://registry.npmjs.org',
    source,
    production: empty,
    all: empty,
  };
  if (verifySecurityAudit(clean, { ...policy, exceptions: [] }, source, now).failed)
    throw new Error('Security gate rejected clean control');
  for (const severity of ['high', 'critical', 'moderate', 'low'] as const) {
    const finding = { id: 'GHSA-aaaa-bbbb-cccc', module: 'test-dependency', severity };
    expectSeededFailure(
      `${severity} toolchain advisory`,
      verifySecurityAudit(
        { ...clean, all: { counts: { ...empty.counts, [severity]: 1 }, findings: [finding] } },
        { ...policy, exceptions: [] },
        source,
        now,
      ),
    );
  }
  expectSeededFailure(
    'stale advisory report',
    verifySecurityAudit({ ...clean, generatedAt: '2026-09-27T12:00:00Z' }, policy, source, now),
  );
  expectSeededFailure(
    'different candidate lock',
    verifySecurityAudit(clean, policy, { ...source, lockDigest: `sha256:${'9'.repeat(64)}` }, now),
  );
  reportOrExit(
    'Security audit',
    await verifySecurityWiring(root),
    'Offline security gate passed; seeded toolchain findings, stale reports and candidate drift are refused. Live registry checks remain explicit release preflights.',
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename))
  await main();
