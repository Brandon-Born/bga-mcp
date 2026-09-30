import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { digestDirectory } from './lib/install-guide.js';
import { exerciseClientFlow } from './lib/client-flow.js';
import { connectCodexSmoke } from './lib/codex-smoke.js';
import { scanText } from './lib/secret-scan.js';
import { readSigningCandidate } from './release-signing.js';
import { runCommand } from '../tests/helpers/process.js';

const userConfig = resolve(homedir(), '.codex/config.toml');
const configBefore = await readFile(userConfig);
const repository = resolve(import.meta.dirname, '..');
const packet = process.env.BGA_MCP_SIGNED_CANDIDATE;
assert(
  packet && process.platform === 'darwin',
  'This controlled Codex smoke targets macOS and the verified original candidate',
);
const receipt = JSON.parse(
  await readFile(
    resolve(repository, 'docs/verification/release-candidate-v1.0.0-rc.1.json'),
    'utf8',
  ),
) as unknown;
const candidate = await readSigningCandidate(packet, receipt);
const scratch = await mkdtemp(resolve(tmpdir(), 'bga-codex-smoke-'));
try {
  const install = resolve(scratch, 'install');
  const project = resolve(scratch, 'project');
  const outside = resolve(scratch, 'outside');
  await mkdir(install);
  await mkdir(outside);
  await writeFile(
    resolve(install, 'package.json'),
    JSON.stringify({ name: 'bga-codex-smoke', private: true, packageManager: 'pnpm@11.15.1' }),
  );
  const result = await runCommand(
    'corepack',
    [
      'pnpm',
      'add',
      '--prefer-offline',
      '--dir',
      install,
      resolve(packet, candidate.identity.artifactName),
    ],
    { timeoutMs: 120_000 },
  );
  assert.equal(result.exitCode, 0);
  await cp(resolve(repository, 'tests/fixtures/projects/legacy'), project, { recursive: true });
  await rm(resolve(project, 'expected.json'), { force: true });
  const inventory = JSON.parse(
    await readFile(resolve(install, 'node_modules/bga-mcp/config/release.json'), 'utf8'),
  ) as { capabilities: { tools: string[]; resources: string[] } };
  const version = await runCommand('codex', ['--version']);
  const binary = await runCommand('which', ['codex']);
  assert.equal(binary.exitCode, 0);
  const binaryDigest = `sha256:${createHash('sha256')
    .update(await readFile(binary.stdout.trim()))
    .digest('hex')}`;
  const runnerCommit = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: repository });
  const runnerStatus = await runCommand('git', ['status', '--porcelain'], { cwd: repository });
  assert.equal(runnerCommit.exitCode, 0);
  assert.equal(runnerStatus.exitCode, 0);
  assert.equal(version.exitCode, 0);
  const before = await digestDirectory(project);
  const connection = await connectCodexSmoke(
    'codex',
    resolve(install, 'node_modules/.bin/bga-mcp'),
    project,
  );
  let observations;
  try {
    observations = await exerciseClientFlow(
      connection.client,
      inventory.capabilities,
      project,
      outside,
      'legacy',
    );
  } finally {
    await connection.close();
  }
  assert.equal(await digestDirectory(project), before);
  assert(
    (await readFile(userConfig)).equals(configBefore),
    'User configuration changed during controlled smoke',
  );
  const restarted = await connectCodexSmoke(
    'codex',
    resolve(install, 'node_modules/.bin/bga-mcp'),
    project,
  );
  try {
    assert.notEqual((await restarted.client.callTool('inspect_project', {})).isError, true);
  } finally {
    await restarted.close();
  }
  assert.equal(await digestDirectory(project), before);
  const removed = await runCommand('corepack', ['pnpm', 'remove', '--dir', install, 'bga-mcp'], {
    timeoutMs: 120_000,
  });
  assert.equal(removed.exitCode, 0);
  await assert.rejects(readFile(resolve(install, 'node_modules/.bin/bga-mcp')));
  assert(
    (await readFile(userConfig)).equals(configBefore),
    'User configuration changed during controlled smoke',
  );
  const output = `${JSON.stringify(
    {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      owner: 'BGA-401',
      client: version.stdout.trim(),
      clientBinaryDigest: binaryDigest,
      runnerCommit: runnerCommit.stdout.trim(),
      runnerTreeDirty: runnerStatus.stdout.trim().length > 0,
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      candidateTag: candidate.identity.sourceTag,
      candidateCommit: candidate.identity.sourceCommit,
      artifactDigest: candidate.identity.artifactDigest,
      ...observations,
      appServerExited: true,
      serverProcessesExited: true,
      restart: 'passed',
      removal: 'passed',
      projectUnchanged: true,
      userConfigurationUnchanged: true,
      stderrDiagnosticsObserved: connection.stderrSeen(),
      runnerDigests: Object.fromEntries(
        await Promise.all(
          [
            'scripts/test-codex-client.ts',
            'scripts/lib/codex-smoke.ts',
            'scripts/lib/client-flow.ts',
            'scripts/lib/install-guide.ts',
          ].map(
            async (path) =>
              [
                path,
                `sha256:${createHash('sha256')
                  .update(await readFile(resolve(repository, path)))
                  .digest('hex')}`,
              ] as const,
          ),
        ),
      ),
      inferenceTurns: 0,
      scope: 'Codex app-server MCP connection, not GUI or agent development evaluation',
    },
    null,
    2,
  )}\n`;
  assert.equal(scanText(output, 'codex-client-smoke.json').length, 0);
  await writeFile(resolve(repository, '.artifacts/codex-client-smoke.json'), output);
  process.stdout.write('Native Codex MCP client smoke passed; sanitized receipt retained.\n');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
