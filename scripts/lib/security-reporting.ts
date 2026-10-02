import { GateReport } from './gate.js';

export interface ReportingPolicy {
  readonly schemaVersion: number;
  readonly owner: string;
  readonly repository: string;
  readonly maintainer: string;
  readonly status: 'implemented' | 'verified';
  readonly channel: string;
  readonly acknowledgementBusinessDays: number;
  readonly initialTriageBusinessDays: number;
  readonly updateCalendarDays: number;
  readonly fixTargetCalendarDays: number;
  readonly disclosureReviewCalendarDays: number;
  readonly previousMajorSecurityFixDays: number;
  readonly supportedPrerelease: string;
  readonly liveReceipt: string;
}

export interface ReportingReceipt {
  readonly schemaVersion: number;
  readonly repository: string;
  readonly observedAt: string;
  readonly channel: { readonly enabled: boolean; readonly anonymousEntry: 'sign-in-required' };
  readonly lifecycle: null | {
    readonly benignTest: true;
    readonly reporterRole: 'non-maintainer' | 'administrator';
    readonly reporterAccessChecked: boolean;
    readonly submittedThrough: 'private-report' | 'maintainer-draft';
    readonly advisoryId: string;
    readonly receivedAt: string;
    readonly acknowledgedAt: string;
    readonly triagedAt: string;
    readonly closedAt: string;
    readonly finalState: string;
    readonly publishedAt: string | null;
    readonly cveId: string | null;
    readonly closureReason: string;
  };
}

/** Channel configuration alone cannot prove an external reporter's private lifecycle. */
export function verifyReportingLifecycle(receipt: ReportingReceipt): GateReport {
  const report = new GateReport();
  report.require(receipt.channel.enabled, 'Private reporting is disabled');
  const lifecycle = receipt.lifecycle;
  if (lifecycle === null) {
    report.require(false, 'Non-maintainer benign report lifecycle has not been observed');
    return report;
  }
  report.require(
    lifecycle.benignTest,
    'Only a benign test belongs in public verification evidence',
  );
  report.require(
    lifecycle.reporterRole === 'non-maintainer' && lifecycle.reporterAccessChecked,
    'Reporter access is not independently checked as non-maintainer',
  );
  report.require(
    lifecycle.submittedThrough === 'private-report',
    'Maintainer draft does not prove the reporting channel',
  );
  report.require(
    /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/u.test(lifecycle.advisoryId),
    'Observed private advisory identity is missing',
  );
  const times = [
    lifecycle.receivedAt,
    lifecycle.acknowledgedAt,
    lifecycle.triagedAt,
    lifecycle.closedAt,
  ].map(Date.parse);
  report.require(
    times.every(Number.isFinite) &&
      times.every((time, index) => index === 0 || time >= (times[index - 1] ?? Infinity)),
    'Received, acknowledged, triaged and closed observations are missing or out of order',
  );
  report.require(
    lifecycle.finalState === 'closed' &&
      lifecycle.closureReason === 'benign channel test; no vulnerability',
    'Benign report was not triaged and closed with its reason',
  );
  report.require(
    lifecycle.publishedAt === null && lifecycle.cveId === null,
    'Benign report must stay private without a CVE',
  );
  return report;
}

export function verifyReportingPolicy(
  policy: ReportingPolicy,
  receipt: ReportingReceipt,
  documentation: string,
  previousMajorSecurityFixDays: number,
): GateReport {
  const report = new GateReport();
  report.require(
    policy.schemaVersion === 1 && receipt.schemaVersion === 1 && policy.owner === 'BGA-406',
    'Unknown security reporting policy/receipt',
  );
  report.require(
    policy.repository === 'Brandon-Born/bga-mcp' &&
      receipt.repository === policy.repository &&
      policy.maintainer === 'Brandon-Born',
    'Private channel repository or owner differs',
  );
  report.require(
    policy.channel === `https://github.com/${policy.repository}/security/advisories/new`,
    'Private channel URL differs from its repository',
  );
  report.require(receipt.channel.enabled, 'Observed private reporting channel is disabled');
  report.require(
    Number.isFinite(Date.parse(receipt.observedAt)),
    'Channel observation date is missing',
  );
  report.require(
    policy.previousMajorSecurityFixDays === previousMajorSecurityFixDays,
    'Supported-major security window differs from version policy',
  );
  for (const [name, value] of Object.entries(policy)) {
    if (name.endsWith('Days'))
      report.require(
        typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
        `${name} must be a positive day count`,
      );
  }
  for (const phrase of [
    policy.channel,
    policy.maintainer,
    policy.supportedPrerelease,
    `${String(policy.acknowledgementBusinessDays)} business days`,
    `${String(policy.initialTriageBusinessDays)} business days`,
    `${String(policy.updateCalendarDays)} calendar days`,
    `${String(policy.fixTargetCalendarDays)} calendar days`,
    `${String(policy.disclosureReviewCalendarDays)} calendar days`,
    `${String(policy.previousMajorSecurityFixDays)} days`,
    'Do not open a public issue',
    'Before a stable release',
    'current stable major',
    'previous major',
  ])
    report.require(documentation.includes(phrase), `SECURITY.md omits reporting policy: ${phrase}`);
  if (policy.status === 'verified')
    report.failures.push(...verifyReportingLifecycle(receipt).failures);
  return report;
}
