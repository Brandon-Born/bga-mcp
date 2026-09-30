import { execFile } from 'node:child_process';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { releaseDigest } from './lib/release.js';
import {
  normalizeAudit,
  verifySecurityAudit,
  type AuditIdentity,
  type SecurityAudit,
  type SecurityPolicy,
  SecurityPolicySchema,
} from './lib/security-audit.js';
import { integrityDigest, type Evidence } from './lib/evidence.js';
import { scanText } from './lib/secret-scan.js';

const execute = promisify(execFile);
const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

export async function auditIdentity(root: string): Promise<AuditIdentity> {
  const [{ stdout }, lock, packageText, workspace, policy] = await Promise.all([
    execute('git', ['rev-parse', 'HEAD'], { cwd: root }),
    readFile(resolve(root, 'pnpm-lock.yaml')),
    readFile(resolve(root, 'package.json')),
    readFile(resolve(root, 'pnpm-workspace.yaml')),
    readFile(resolve(root, 'config/security-audit-policy.json')),
  ]);
  return {
    commit: stdout.trim(),
    lockDigest: releaseDigest(lock),
    packageDigest: releaseDigest(packageText),
    workspaceDigest: releaseDigest(workspace),
    policyDigest: releaseDigest(policy),
  };
}

async function collect(root: string, production: boolean): Promise<SecurityAudit['all']> {
  let stdout: string;
  try {
    ({ stdout } = await execute(
      corepack,
      [
        'pnpm',
        'audit',
        '--json',
        '--audit-level=low',
        '--registry=https://registry.npmjs.org',
        ...(production ? ['--prod'] : []),
      ],
      { cwd: root, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    ));
  } catch (error) {
    // Exit 1 denotes findings only when a complete JSON report proves it.
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 1 ||
      !('stdout' in error) ||
      typeof error.stdout !== 'string'
    ) {
      // eslint-disable-next-line preserve-caught-error -- Raw subprocess stdout/stderr may contain credentials and must not enter a cause chain.
      throw new Error('Registry security audit unavailable');
    }
    stdout = error.stdout;
  }
  try {
    return normalizeAudit(JSON.parse(stdout));
  } catch {
    throw new Error('Registry security audit returned an incomplete or invalid report');
  }
}

export async function currentCompensatingScenarios(
  root: string,
  identity: AuditIdentity,
): Promise<Set<string>> {
  try {
    const evidence = JSON.parse(
      await readFile(resolve(root, '.artifacts/verification-evidence.json'), 'utf8'),
    ) as Evidence;
    if (
      evidence.source.commit !== identity.commit ||
      evidence.package.lockDigest !== identity.lockDigest ||
      evidence.tests.failed !== 0 ||
      evidence.tests.skipped !== 0 ||
      !evidence.source.clean ||
      evidence.integrity?.value !== integrityDigest(evidence) ||
      !Number.isFinite(Date.parse(evidence.generatedAt)) ||
      Date.now() - Date.parse(evidence.generatedAt) > 86_400_000 ||
      Date.parse(evidence.generatedAt) > Date.now()
    )
      return new Set();
    return new Set(
      [...evidence.capabilities, ...evidence.claims]
        .flatMap((entry) => entry.scenarios)
        .filter((entry) => entry.status === 'passed')
        .map((entry) => entry.id),
    );
  } catch {
    return new Set();
  }
}

export async function runSecurityAudit(
  root: string,
): Promise<{ audit: SecurityAudit; policy: SecurityPolicy; text: string }> {
  const identity = await auditIdentity(root);
  const reportPath = resolve(root, '.artifacts/security-audit.json');
  await rm(reportPath, { force: true });
  const policy = SecurityPolicySchema.parse(
    JSON.parse(await readFile(resolve(root, 'config/security-audit-policy.json'), 'utf8')),
  );
  // pnpm's ignore configuration would hide findings from this independent disposition gate.
  const workspace = await readFile(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
  if (/\b(?:audit|auditConfig|auditLevel)\s*:/u.test(workspace))
    throw new Error('Audit filtering in workspace configuration is forbidden');
  let ignored: string;
  try {
    ({ stdout: ignored } = await execute(
      corepack,
      ['pnpm', 'config', 'get', 'auditConfig', '--json'],
      { cwd: root, timeout: 30_000, maxBuffer: 1_000_000 },
    ));
  } catch {
    throw new Error('Advisory filter configuration could not be checked');
  }
  if (!['undefined', 'null', '{}', ''].includes(ignored.trim())) {
    throw new Error('Global advisory filtering must be removed before release assessment');
  }
  let production: SecurityAudit['all'];
  let all: SecurityAudit['all'];
  try {
    [production, all] = await Promise.all([collect(root, true), collect(root, false)]);
  } catch {
    await mkdir(resolve(root, '.artifacts'), { recursive: true });
    await writeFile(
      reportPath,
      `${JSON.stringify({
        schemaVersion: 1,
        status: 'unavailable',
        generatedAt: new Date().toISOString(),
        source: identity,
      })}\n`,
    );
    throw new Error('Registry security audit unavailable or invalid; release is blocked');
  }
  if (JSON.stringify(identity) !== JSON.stringify(await auditIdentity(root))) {
    throw new Error('Dependency source changed during security audit');
  }
  const audit: SecurityAudit = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    registry: 'https://registry.npmjs.org',
    source: identity,
    production,
    all,
  };
  const text = `${JSON.stringify(audit, null, 2)}\n`;
  if (scanText(text, 'security-audit.json').length !== 0)
    throw new Error('Security report contains unsafe content');
  await mkdir(resolve(root, '.artifacts'), { recursive: true });
  await writeFile(reportPath, text);
  const report = verifySecurityAudit(
    audit,
    policy,
    identity,
    new Date(),
    await currentCompensatingScenarios(root, identity),
  );
  if (report.failed)
    throw new Error(`Security preflight failed:\n- ${report.failures.join('\n- ')}`);
  return { audit, policy, text };
}

// Importing this module in the candidate builder does not run a separate audit.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const { audit } = await runSecurityAudit(resolve(import.meta.dirname, '..'));
    process.stdout.write(
      `Security preflight passed: production ${String(audit.production.findings.length)}, full graph ${String(audit.all.findings.length)} findings; sanitized report retained.\n`,
    );
  } catch {
    process.stderr.write(
      'Security preflight failed; release preparation is blocked. Review the sanitized report if available.\n',
    );
    process.exitCode = 1;
  }
}
