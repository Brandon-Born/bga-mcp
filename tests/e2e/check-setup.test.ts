import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inject } from 'vitest';

import { connectStdio } from '../helpers/mcp.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const fixturesRoot = resolve(
  fileURLToPath(new URL('../../', import.meta.url)),
  'tests/fixtures/projects',
);
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

interface Finding {
  readonly code: string;
  readonly status: string;
  readonly summary: string;
  readonly nextAction?: string;
}

let temporaryRoot: string;
let cli: string;
let projectRoot: string;

async function checkSetup(
  arguments_: readonly string[],
): Promise<{ ready: boolean; findings: Finding[]; text: string }> {
  const connection = await connectStdio(process.execPath, [cli, ...arguments_], {
    timeoutMs: 10_000,
  });
  const processId = connection.transport.pid;
  try {
    const result = await connection.client.callTool(
      { name: 'check_setup', arguments: {} },
      { timeout: 15_000 },
    );
    const structured = result.structuredContent as { ready: boolean; findings: Finding[] };
    return {
      ready: structured.ready,
      findings: structured.findings,
      text: (result.content as { text?: string }[]).map((entry) => entry.text ?? '').join('\n'),
    };
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
  }
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-setupe2e-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-setup-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, inject('packedArtifact')],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');

  projectRoot = resolve(temporaryRoot, 'projects/bgamcplegacy');
  await cp(resolve(fixturesRoot, 'legacy'), projectRoot, { recursive: true });
  await rm(resolve(projectRoot, 'expected.json'));
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged check_setup', () => {
  it('[E2E-SETUP-NOTHING-CONFIGURED] tells an agent what is missing when nothing is configured', async () => {
    const report = await checkSetup([]);

    // The point of this capability: it answers rather than refusing, even when
    // everything else would refuse.
    expect(report.ready).toBe(false);
    const codes = report.findings.map((entry) => entry.code);
    expect(codes).toContain('project.roots.none');
    expect(codes).toContain('network.disabled');
    expect(codes).toContain('studio.disabled');

    for (const finding of report.findings.filter((entry) => entry.status === 'action-needed')) {
      // Every actionable finding carries the action, not just the symptom.
      expect(finding.nextAction ?? '').not.toBe('');
    }
    expect(report.text).toContain('needs something');
  });

  it('[E2E-SETUP-READY] reports ready once a project root exists, with optional things still off', async () => {
    const report = await checkSetup(['--project-root', projectRoot]);

    expect(report.ready).toBe(true);
    const codes = report.findings.map((entry) => entry.code);
    expect(codes).toContain('project.roots.available');
    // Network being off is reported, and is not a reason to call the server
    // unready: the local capabilities are the point of it.
    expect(codes).toContain('network.disabled');
    expect(report.text).toContain('ready to use');
  });
});
