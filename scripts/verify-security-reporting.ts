import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expectSeededFailure, reportOrExit } from './lib/gate.js';
import {
  verifyReportingPolicy,
  type ReportingPolicy,
  type ReportingReceipt,
} from './lib/security-reporting.js';

const root = resolve(import.meta.dirname, '..');
const load = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const policy = await load<ReportingPolicy>('config/security-reporting.json');
const receipt = await load<ReportingReceipt>(policy.liveReceipt);
const document = await readFile(resolve(root, 'SECURITY.md'), 'utf8');
const versionPolicy = await load<{ package: { previousMajorSecurityFixDays: number } }>(
  'config/version-policy.json',
);
const window = versionPolicy.package.previousMajorSecurityFixDays;
expectSeededFailure(
  'disabled private channel',
  verifyReportingPolicy(
    policy,
    { ...receipt, channel: { ...receipt.channel, enabled: false } },
    document,
    window,
  ),
);
expectSeededFailure(
  'unsupported security window',
  verifyReportingPolicy(
    { ...policy, previousMajorSecurityFixDays: window + 1 },
    receipt,
    document,
    window,
  ),
);
expectSeededFailure(
  'unobserved verification',
  verifyReportingPolicy(
    { ...policy, status: 'verified' },
    { ...receipt, lifecycle: null },
    document,
    window,
  ),
);
reportOrExit(
  'Private reporting',
  verifyReportingPolicy(policy, receipt, document, window),
  `Private reporting policy matches its scoped channel observation (${policy.status}); ${receipt.lifecycle === null ? 'external benign report lifecycle remains unverified' : 'retained lifecycle checked'}. Offline checks do not recheck live GitHub availability.`,
);
