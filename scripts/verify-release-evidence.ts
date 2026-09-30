import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';

export function verifyEvidenceWorkflow(source: string, publisher: string): GateReport {
  const report = new GateReport();
  report.require(
    /^on:\n {2}workflow_dispatch:\s*\n\npermissions:\n {2}contents: read\s*$/mu.test(source),
    'Evidence publication must be manual with read-only root permissions',
  );
  report.require(
    JSON.stringify([...source.matchAll(/^ {2}([a-z]+):\s*$/gmu)].map((m) => m[1])) ===
      JSON.stringify(['prepare', 'publish', 'verify']),
    'Evidence job separation differs',
  );
  const prepare = source.slice(source.indexOf('  prepare:\n'), source.indexOf('  publish:\n'));
  const publish = source.slice(source.indexOf('  publish:\n'), source.indexOf('  verify:\n'));
  const verify = source.slice(source.indexOf('  verify:\n'));
  report.require(
    (source.match(/if: github\.ref == 'refs\/heads\/main'/gu) ?? []).length === 3,
    'Only trusted main may publish evidence',
  );
  report.require(
    (source.match(/contents: write/gu) ?? []).length === 1 &&
      publish.includes('contents: write') &&
      !(prepare + verify).includes('contents: write'),
    'Write permission must be isolated from tests and verification',
  );
  report.require(
    !/id-token:|attestations:|packages:|secrets\.|NPM_TOKEN|NODE_AUTH_TOKEN|--clobber|(?:pnpm|npm|yarn) publish/iu.test(
      source + publisher,
    ),
    'Evidence has a signing, package publication, secret or overwrite path',
  );
  report.require(
    source.includes('needs: prepare') &&
      source.includes('needs: publish') &&
      publish.includes('EXPECTED_PLAN_DIGEST: ${{ needs.prepare.outputs.plan-digest }}'),
    'Prepared digest handoff or sequencing is missing',
  );
  const commands = [...publish.matchAll(/^ {8}run: (.+)$/gmu)].map((m) => m[1]);
  report.require(
    JSON.stringify(commands) ===
      JSON.stringify([
        'node --experimental-strip-types scripts/publish-release-evidence.ts "$RUNNER_TEMP/prepared" "$EXPECTED_PLAN_DIGEST"',
      ]) && !publish.includes('run: |'),
    'Write job may only publish a scanned digest-bound plan',
  );
  report.require(
    !/\bimport\s*\(|\brequire\s*\(/u.test(publisher) &&
      [...publisher.matchAll(/from\s+['"]([^'"]+)['"]/gu)].every((m) =>
        (m[1] ?? '').startsWith('node:'),
      ),
    'Write job helper must use only builtins',
  );
  report.require(
    prepare.includes('pnpm check') &&
      prepare.includes('pnpm release:evidence prepare') &&
      verify.includes('pnpm release:evidence download'),
    'Full gate, verified preparation or public download acceptance is missing',
  );
  report.require(
    (source.match(/persist-credentials: false/gu) ?? []).length === 3 &&
      (source.match(/ref: \$\{\{ github\.sha \}\}/gu) ?? []).length === 3,
    'Exact checkout without credentials is required',
  );
  const pins = new Map([
    ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
    ['actions/setup-node', '820762786026740c76f36085b0efc47a31fe5020'],
    ['actions/upload-artifact', '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'],
    ['actions/download-artifact', '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c'],
  ]);
  const actions = [...source.matchAll(/uses:\s*([^\s#]+)@([^\s#]+)/gu)];
  report.require(
    actions.length > 0 && actions.every((m) => pins.get(m[1] ?? '') === m[2]),
    'Actions must be the reviewed immutable pins',
  );
  report.require(
    !source.includes('\t') && !/^\s*[a-z-]+:\s*[&*][a-z]/mu.test(source),
    'Workflow aliases/tabs are forbidden',
  );
  return report;
}
async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const workflow = await readFile(resolve(root, '.github/workflows/release-evidence.yml'), 'utf8');
  const publisher = await readFile(resolve(root, 'scripts/publish-release-evidence.ts'), 'utf8');
  const report = verifyEvidenceWorkflow(workflow, publisher);
  expectSeededFailure(
    'write permission in preflight',
    verifyEvidenceWorkflow(
      workflow.replace(
        'contents: read\n      actions: read',
        'contents: write\n      actions: read',
      ),
      publisher,
    ),
  );
  expectSeededFailure(
    'missing public evidence verification',
    verifyEvidenceWorkflow(
      workflow.replace('pnpm release:evidence download', 'pnpm build'),
      publisher,
    ),
  );
  expectSeededFailure(
    'unpinned publication action',
    verifyEvidenceWorkflow(
      workflow.replace(
        'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
        'actions/download-artifact@v8',
      ),
      publisher,
    ),
  );
  reportOrExit(
    'Release evidence',
    report,
    'Evidence-only publication is manual, main-only and isolated; schema/signature/coverage checks and public download acceptance are required.',
  );
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename))
  await main();
