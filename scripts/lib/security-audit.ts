import { z } from 'zod';

import { GateReport } from './gate.js';

const severity = z.enum(['info', 'low', 'moderate', 'high', 'critical']);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const moduleName = z
  .string()
  .max(214)
  .regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u);
const advisoryId = z.string().regex(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/u);
const counts = z.strictObject({
  info: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  moderate: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
});
const finding = z.strictObject({ id: advisoryId, module: moduleName, severity });
const scope = z.strictObject({ counts, findings: z.array(finding).max(10_000) });

export const SecurityPolicySchema = z.strictObject({
  schemaVersion: z.literal(1),
  maxAgeHours: z.number().positive().max(24),
  exceptions: z.array(
    z.strictObject({
      id: advisoryId,
      module: moduleName,
      owner: z.string().min(1).max(100),
      reason: z.string().min(1).max(1000),
      reviewedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      compensatingScenario: z.string().regex(/^[A-Z][A-Z0-9-]+$/u),
    }),
  ),
});

export const SecurityAuditSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  registry: z.literal('https://registry.npmjs.org'),
  source: z.strictObject({
    commit: z.string().regex(/^[0-9a-f]{40}$/u),
    lockDigest: digest,
    packageDigest: digest,
    workspaceDigest: digest,
    policyDigest: digest,
  }),
  production: scope,
  all: scope,
});

export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;
export type SecurityAudit = z.infer<typeof SecurityAuditSchema>;
export type AuditIdentity = SecurityAudit['source'];

/**
 * pnpm documents --json and separate --prod audits at https://pnpm.io/cli/audit.
 * Registry failures must not become clean reports. Retain only checked package,
 * GHSA and severity fields, never registry messages, paths, titles or stderr.
 */
export function normalizeAudit(raw: unknown): SecurityAudit['all'] {
  const parsed = z
    .object({
      error: z.never().optional(),
      advisories: z.record(
        z.string(),
        z.object({
          module_name: moduleName,
          severity,
          github_advisory_id: advisoryId.optional(),
          url: z.string().optional(),
        }),
      ),
      metadata: z.object({ vulnerabilities: counts }),
    })
    .parse(raw);
  const findings = Object.values(parsed.advisories)
    .map((entry) => {
      const id = advisoryId.parse(
        entry.github_advisory_id ??
          /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/u.exec(entry.url ?? '')?.[1],
      );
      return { id, module: entry.module_name, severity: entry.severity };
    })
    .sort((a, b) => `${a.id}:${a.module}`.localeCompare(`${b.id}:${b.module}`));
  const actual = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const entry of findings) actual[entry.severity]++;
  if (JSON.stringify(actual) !== JSON.stringify(parsed.metadata.vulnerabilities)) {
    throw new Error('Audit counts do not match retained findings');
  }
  if (new Set(findings.map((entry) => `${entry.id}:${entry.module}`)).size !== findings.length) {
    throw new Error('Audit contains duplicate advisory/package identities');
  }
  return { counts: actual, findings };
}

/** Offline disposition check; live collection belongs only to the explicit release command. */
export function verifySecurityAudit(
  input: unknown,
  policyInput: unknown,
  identity: AuditIdentity,
  now = new Date(),
  passedScenarios: ReadonlySet<string> = new Set(),
): GateReport {
  const report = new GateReport();
  const parsed = SecurityAuditSchema.safeParse(input);
  const policyParsed = SecurityPolicySchema.safeParse(policyInput);
  const identityParsed = SecurityAuditSchema.shape.source.safeParse(identity);
  if (!parsed.success || !policyParsed.success || !identityParsed.success) {
    report.require(false, 'Security report or exception policy is malformed');
    return report;
  }
  const audit = parsed.data;
  const policy = policyParsed.data;
  report.require(Number.isFinite(now.getTime()), 'Security review clock is invalid');
  for (const key of Object.keys(identity) as (keyof AuditIdentity)[]) {
    report.require(audit.source[key] === identity[key], `Security report has stale ${key}`);
  }
  const age = now.getTime() - Date.parse(audit.generatedAt);
  report.require(
    age >= 0 && age <= policy.maxAgeHours * 3_600_000,
    'Security report is stale or future-dated',
  );
  const exceptions = new Map<string, SecurityPolicy['exceptions'][number]>();
  for (const exception of policy.exceptions) {
    const key = `${exception.id}:${exception.module}`;
    report.require(!exceptions.has(key), 'Security policy has duplicate exceptions');
    exceptions.set(key, exception);
    const start = Date.parse(exception.reviewedAt);
    const end = Date.parse(exception.expiresAt);
    report.require(
      start <= now.getTime() &&
        now.getTime() < end &&
        end > start &&
        end - start <= 30 * 86_400_000,
      `Security exception ${exception.id} is expired or invalid`,
    );
    report.require(
      passedScenarios.has(exception.compensatingScenario),
      `Security exception ${exception.id} has no current passing compensating test`,
    );
  }
  for (const audited of [audit.production, audit.all]) {
    const actual = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
    for (const entry of audited.findings) {
      actual[entry.severity]++;
      const exception = exceptions.get(`${entry.id}:${entry.module}`);
      report.require(
        entry.severity !== 'high' && entry.severity !== 'critical',
        `Security audit blocks ${entry.severity} ${entry.id} in ${entry.module}`,
      );
      report.require(
        exception !== undefined,
        `Security audit has undisposed ${entry.severity} ${entry.id} in ${entry.module}`,
      );
    }
    report.require(
      JSON.stringify(actual) === JSON.stringify(audited.counts),
      'Security report counts differ from findings',
    );
    report.require(
      new Set(audited.findings.map((entry) => `${entry.id}:${entry.module}`)).size ===
        audited.findings.length,
      'Security report has duplicate findings',
    );
  }
  for (const entry of audit.production.findings) {
    report.require(
      audit.all.findings.some(
        (other) =>
          other.id === entry.id &&
          other.module === entry.module &&
          other.severity === entry.severity,
      ),
      'Full audit omits a production finding',
    );
  }
  return report;
}
