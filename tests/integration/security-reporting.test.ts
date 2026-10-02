import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  verifyReportingLifecycle,
  verifyReportingPolicy,
  type ReportingPolicy,
  type ReportingReceipt,
} from '../../scripts/lib/security-reporting.js';

const root = resolve(import.meta.dirname, '../..');
const policy = JSON.parse(
  await readFile(resolve(root, 'config/security-reporting.json'), 'utf8'),
) as ReportingPolicy;
const receipt = JSON.parse(
  await readFile(resolve(root, policy.liveReceipt), 'utf8'),
) as ReportingReceipt;
const document = await readFile(resolve(root, 'SECURITY.md'), 'utf8');

it('[GATE-PRIVATE-REPORTING] refuses missing policy, disabled channel, support drift and unobserved verified status', () => {
  expect(verifyReportingPolicy(policy, receipt, document, 180).failures).toEqual([]);
  expect(
    verifyReportingPolicy(policy, receipt, document.replace(policy.channel, ''), 180).failed,
  ).toBe(true);
  expect(
    verifyReportingPolicy(
      policy,
      { ...receipt, channel: { enabled: false, anonymousEntry: 'sign-in-required' } },
      document,
      180,
    ).failed,
  ).toBe(true);
  expect(verifyReportingPolicy(policy, receipt, document, 181).failed).toBe(true);
  expect(
    verifyReportingPolicy(
      { ...policy, status: 'verified' },
      { ...receipt, lifecycle: null },
      document,
      180,
    ).failed,
  ).toBe(true);
});

it('[INT-PRIVATE-REPORTING-LIFECYCLE] rejects an admin draft, incomplete triage, publication, a CVE and unordered observations', () => {
  // Synthetic lifecycle is only a verifier control, never evidence of a live report.
  const observed: ReportingReceipt = {
    ...receipt,
    lifecycle: {
      benignTest: true,
      reporterRole: 'non-maintainer',
      reporterAccessChecked: true,
      submittedThrough: 'private-report',
      advisoryId: 'GHSA-aaaa-bbbb-cccc',
      receivedAt: '2026-10-02T00:00:00Z',
      acknowledgedAt: '2026-10-02T00:01:00Z',
      triagedAt: '2026-10-02T00:02:00Z',
      closedAt: '2026-10-02T00:03:00Z',
      finalState: 'closed',
      publishedAt: null,
      cveId: null,
      closureReason: 'benign channel test; no vulnerability',
    },
  };
  expect(verifyReportingLifecycle(observed).failures).toEqual([]);
  const lifecycle = observed.lifecycle;
  if (lifecycle === null) throw new Error('Synthetic control has no lifecycle');
  for (const change of [
    { reporterRole: 'administrator' as const },
    { reporterAccessChecked: false },
    { submittedThrough: 'maintainer-draft' as const },
    { acknowledgedAt: '' },
    { triagedAt: '' },
    { finalState: 'triage' },
    { closedAt: lifecycle.receivedAt },
    { publishedAt: lifecycle.closedAt },
    { cveId: 'CVE-0000-0000' },
  ])
    expect(
      verifyReportingLifecycle({ ...observed, lifecycle: { ...lifecycle, ...change } }).failed,
    ).toBe(true);
});
