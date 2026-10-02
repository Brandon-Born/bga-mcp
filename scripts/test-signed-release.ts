import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import { connectStdio } from '../tests/helpers/mcp.js';
import { waitForProcessExit } from '../tests/helpers/scenario.js';
import {
  attestationArguments,
  readSigningCandidate,
  verifySignedCandidate,
} from './release-signing.js';
import { scanText } from './lib/secret-scan.js';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

async function requireCryptographicRefusal(arguments_: string[]): Promise<void> {
  let refused = false;
  try {
    await execute('gh', arguments_, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    refused = typeof error === 'object' && error !== null && 'code' in error && error.code === 1;
  }
  assert(refused, 'Signature verifier did not refuse seeded defect');
}

async function digestDirectory(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (path: string): Promise<void> => {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else {
        hash.update(relative(directory, child));
        hash.update(await readFile(child));
      }
    }
  };
  await walk(directory);
  return hash.digest('hex');
}

async function main(): Promise<void> {
  const directory = process.env.BGA_MCP_SIGNED_CANDIDATE;
  const signer = process.env.BGA_MCP_SIGNER_COMMIT;
  assert(directory && signer);
  const receipt = JSON.parse(
    await readFile(resolve(root, 'docs/verification/release-candidate-v1.0.0-rc.4.json'), 'utf8'),
  ) as unknown;
  const candidate = await readSigningCandidate(directory, receipt);
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga-signed-consumer-'));
  try {
    // Acquire trust roots independently of the supplied packet, then keep all signature probes offline.
    const { stdout: roots } = await execute('gh', ['attestation', 'trusted-root'], {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const rootFile = resolve(scratch, 'trusted-root.jsonl');
    await writeFile(rootFile, roots);
    await verifySignedCandidate(directory, signer, rootFile);
    const artifact = resolve(directory, candidate.identity.artifactName);
    const bundle = resolve(directory, 'sigstore-bundle.json');
    const tampered = resolve(scratch, candidate.identity.artifactName);
    await writeFile(
      tampered,
      Buffer.concat([await readFile(artifact), Buffer.from('\nmodified\n')]),
    );
    await requireCryptographicRefusal(attestationArguments(tampered, bundle, signer, rootFile));
    await requireCryptographicRefusal(
      attestationArguments(artifact, bundle, '0'.repeat(40), rootFile),
    );
    const wrongWorkflow = attestationArguments(artifact, bundle, signer, rootFile);
    wrongWorkflow[wrongWorkflow.indexOf('--signer-workflow') + 1] =
      'Brandon-Born/bga-mcp/.github/workflows/not-the-signer.yml';
    await requireCryptographicRefusal(wrongWorkflow);

    const install = resolve(scratch, 'install');
    const project = resolve(scratch, 'project');
    await mkdir(install);
    await writeFile(
      resolve(install, 'package.json'),
      JSON.stringify({
        name: 'bga-signed-candidate-consumer',
        private: true,
        packageManager: 'pnpm@11.15.1',
      }),
    );
    await execute('corepack', ['pnpm', 'add', '--prefer-offline', '--dir', install, artifact], {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    await cp(resolve(root, 'tests/fixtures/projects/legacy'), project, { recursive: true });
    await rm(resolve(project, 'expected.json'), { force: true });
    const before = await digestDirectory(project);
    const connection = await connectStdio(
      resolve(install, 'node_modules/.bin/bga-mcp'),
      ['--project-root', project],
      { timeoutMs: 10_000 },
    );
    const pid = connection.transport.pid;
    try {
      const tools = (await connection.client.listTools()).tools.map((tool) => tool.name).sort();
      const resources = (await connection.client.listResources()).resources
        .map((resource) => resource.uri)
        .sort();
      assert.deepEqual(tools, [
        'audit_database_usage',
        'inspect_project',
        'run_pre_release_audit',
        'validate_action_contracts',
        'validate_notifications',
        'validate_project',
        'validate_state_machine',
      ]);
      assert.deepEqual(resources, [
        'bga://project/diagnostics',
        'bga://project/states',
        'bga://project/summary',
      ]);
      const firstUse = await connection.client.callTool({
        name: 'inspect_project',
        arguments: { projectRoot: project },
      });
      assert.notEqual(firstUse.isError, true);
      assert.equal(
        (firstUse.structuredContent as { layout?: unknown } | undefined)?.layout,
        'legacy',
      );
      for (const excluded of ['check_setup', 'search_bga_docs', 'read_studio_logs'])
        await assert.rejects(connection.client.callTool({ name: excluded, arguments: {} }));
    } finally {
      await connection.client.close();
      if (pid !== null) await waitForProcessExit(pid);
    }
    assert.equal(connection.stderr(), '');
    assert.equal(await digestDirectory(project), before);
    await execute('corepack', ['pnpm', 'remove', '--dir', install, 'bga-mcp'], {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    await assert.rejects(access(resolve(install, 'node_modules/.bin/bga-mcp')));
    await readSigningCandidate(directory, receipt);
    const result = `${JSON.stringify({ schemaVersion: 1, candidateTag: candidate.identity.sourceTag, candidateCommit: candidate.identity.sourceCommit, originalArtifactDigest: candidate.identity.artifactDigest, signerCommit: signer, signature: 'verified', provenance: 'matched reviewed candidate and original producer', modifiedArtifact: 'refused by cryptographic verifier', wrongSignerCommit: 'refused', wrongSignerWorkflow: 'refused', independentTrustedRootDigest: `sha256:${createHash('sha256').update(roots).digest('hex')}`, freshInstall: 'passed', firstUse: 'passed', projectUnchanged: true, serverExited: true, removal: 'passed', rebuilt: false, published: false }, null, 2)}\n`;
    assert.equal(scanText(result, 'signed-release-verification.json').length, 0);
    await mkdir(resolve(root, '.artifacts'), { recursive: true });
    await writeFile(resolve(root, '.artifacts/signed-release-verification.json'), result);
    process.stdout.write(
      'Signed original candidate verified; real-client fresh install and cryptographic refusal probes passed.\n',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

try {
  await main();
} catch {
  process.stderr.write('Signed release verification failed; candidate approval is blocked.\n');
  process.exitCode = 1;
}
