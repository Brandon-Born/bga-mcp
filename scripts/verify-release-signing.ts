import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';

export function verifySigningWorkflow(source: string, signerSource: string): GateReport {
  const report = new GateReport();
  report.require(
    /^on:\n {2}workflow_dispatch:\s*\n\npermissions:\n {2}contents: read\s*$/mu.test(source),
    'Signing must be manual with read-only root permissions',
  );
  const jobNames = [...source.matchAll(/^ {2}([a-z]+):\s*$/gmu)].map((match) => match[1]);
  report.require(
    JSON.stringify(jobNames) === JSON.stringify(['prepare', 'sign', 'verify']),
    'Signing jobs must be isolated prepare/sign/verify jobs',
  );
  // Root contents has a value, so only the three job names match above.
  const prepare = source.slice(source.indexOf('  prepare:\n'), source.indexOf('  sign:\n'));
  const sign = source.slice(source.indexOf('  sign:\n'), source.indexOf('  verify:\n'));
  const verify = source.slice(source.indexOf('  verify:\n'));
  report.require(
    (source.match(/if: github\.ref == 'refs\/heads\/main'/gu) ?? []).length === 3,
    'Each signing stage must refuse non-main refs',
  );
  report.require(
    source.includes('needs: prepare') && source.includes('needs: sign'),
    'Signing dependency order is missing',
  );
  report.require(
    (source.match(/id-token: write/gu) ?? []).length === 1 &&
      sign.includes('id-token: write') &&
      sign.includes('attestations: write'),
    'Signing identity must exist only in signing job',
  );
  report.require(
    !/id-token:|attestations:/.test(prepare + verify),
    'Build or consumer verification has signing permissions',
  );
  report.require(
    !/\b(?:contents|packages|actions): write|(?:npm|pnpm|yarn) publish|git push|gh release create|secrets\.|NPM_TOKEN|NODE_AUTH_TOKEN/iu.test(
      source,
    ),
    'Signing workflow has a publication path or long-lived secret',
  );
  report.require(
    (source.match(/persist-credentials: false/gu) ?? []).length === 3 &&
      (source.match(/ref: \$\{\{ github\.sha \}\}/gu) ?? []).length === 3,
    'Every stage must checkout the exact trusted workflow source without credentials',
  );
  const actions = [...source.matchAll(/uses:\s*([^\s#]+)@([^\s#]+)/gu)];
  report.require(
    actions.length > 0 && actions.every((match) => /^[0-9a-f]{40}$/u.test(match[2] ?? '')),
    'All signing actions must be immutable pins',
  );
  const approvedActions = new Set([
    'actions/checkout',
    'actions/setup-node',
    'actions/download-artifact',
    'actions/upload-artifact',
    'actions/attest',
  ]);
  report.require(
    actions.every((match) => approvedActions.has(match[1] ?? '')),
    'Signing contains an unreviewed action',
  );
  const commands = [...sign.matchAll(/^ {8}run: \|\n((?: {10}.+\n)+)/gmu)].flatMap((match) =>
    (match[1] ?? '')
      .trim()
      .split('\n')
      .map((line) => line.trim()),
  );
  const allowed = [
    'node --experimental-strip-types scripts/release-signing.ts extract "$RUNNER_TEMP/prepared/candidate.zip" "$RUNNER_TEMP/candidate"',
    'node --experimental-strip-types scripts/release-signing.ts predicate "$RUNNER_TEMP/candidate" "$RUNNER_TEMP/release-provenance.json"',
    'cp "$ATTESTATION_BUNDLE" "$RUNNER_TEMP/candidate/sigstore-bundle.json"',
    'cp "$RUNNER_TEMP/release-provenance.json" "$RUNNER_TEMP/candidate/release-provenance.json"',
  ];
  report.require(
    JSON.stringify(commands) === JSON.stringify(allowed) && !/^\s*run: (?!\|)/mu.test(sign),
    'Identity-bearing job may only recheck, describe, attest and retain original bytes',
  );
  report.require(
    sign.includes('push-to-registry: false') &&
      sign.includes('create-storage-record: false') &&
      sign.includes('subject-path: ${{ runner.temp }}/candidate/*') &&
      sign.includes('predicate-path: ${{ runner.temp }}/release-provenance.json'),
    'Signing must explicitly attest reviewed files with custom retention provenance',
  );
  report.require(
    prepare.includes('pnpm check') &&
      prepare.includes('scripts/release-signing.ts prepare') &&
      verify.includes('pnpm verify:signed-release'),
    'Preflight or actual signature/consumer verification is missing',
  );
  report.require(
    !/\bimport\s*\(|\brequire\s*\(/u.test(signerSource) &&
      [...signerSource.matchAll(/from\s+['"]([^'"]+)['"]/gu)].every((match) =>
        (match[1] ?? '').startsWith('node:'),
      ),
    'Signing helper must use only trusted builtins without dependency loading',
  );
  report.require(
    !source.includes('\t') && !/^\s*[a-z-]+:\s*[&*][a-z]/mu.test(source),
    'Signing workflow cannot use aliases or tab indentation',
  );
  return report;
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const workflow = await readFile(resolve(root, '.github/workflows/release-signing.yml'), 'utf8');
  const helper = await readFile(resolve(root, 'scripts/release-signing.ts'), 'utf8');
  const report = verifySigningWorkflow(workflow, helper);
  expectSeededFailure(
    'signing identity in build',
    verifySigningWorkflow(
      workflow.replace('      actions: read', '      actions: read\n      id-token: write'),
      helper,
    ),
  );
  expectSeededFailure(
    'rebuilding in signer',
    verifySigningWorkflow(
      workflow.replace(
        'node --experimental-strip-types scripts/release-signing.ts predicate',
        'pnpm build\n          node --experimental-strip-types scripts/release-signing.ts predicate',
      ),
      helper,
    ),
  );
  expectSeededFailure(
    'unpinned signing action',
    verifySigningWorkflow(
      workflow.replace(
        'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6',
        'actions/attest@v4',
      ),
      helper,
    ),
  );
  reportOrExit(
    'Release signing',
    report,
    'Release signing is manual, main-only and isolated from builds; ordinary verification is offline and actual signatures require the explicit signing workflow.',
  );
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename))
  await main();
