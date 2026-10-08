import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inject } from 'vitest';

import { connectStdio } from '../helpers/mcp.js';
import { digestDirectory, recordInstalledArtifact } from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';
import { CheckSetupOutputSchema, type CheckSetupResult } from '../../src/tools/check-setup.js';

const fixturesRoot = resolve(
  fileURLToPath(new URL('../../', import.meta.url)),
  'tests/fixtures/projects',
);
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

let temporaryRoot: string;
let cli: string;
let projectRoot: string;
let projectDigest: string;

async function checkSetup(
  arguments_: readonly string[],
  options: { readonly session?: string; readonly protocolVersion?: string } = {},
): Promise<CheckSetupResult & { text: string }> {
  const networkLog = resolve(temporaryRoot, 'network-attempts.log');
  await writeFile(networkLog, '');
  const connection = await connectStdio(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      new URL('./network-denied.ts', import.meta.url).href,
      cli,
      ...arguments_,
    ],
    {
      timeoutMs: 10_000,
      ...(options.protocolVersion === undefined
        ? {}
        : { protocolVersion: options.protocolVersion }),
      env: { ...process.env, BGA_STUDIO_SESSION: options.session, BGA_MCP_NETWORK_LOG: networkLog },
    },
  );
  const processId = connection.transport.pid;
  try {
    const result = await connection.client.callTool(
      { name: 'check_setup', arguments: {} },
      { timeout: 15_000 },
    );
    expect(result.isError).not.toBe(true);
    const structured = CheckSetupOutputSchema.parse(result.structuredContent);
    return {
      ...structured,
      text: (result.content as { text?: string }[]).map((entry) => entry.text ?? '').join('\n'),
    };
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
    expect(connection.stderr() === '', 'setup report wrote to stderr').toBe(true);
    expect(await readFile(networkLog, 'utf8')).toBe('');
  }
}

const session = 'opaque=setup-matrix-non-secret-fixture';
const eras = ['2025-11-25', '2026-07-28'] as const;
const completeArgs = () => [
  '--project-root',
  projectRoot,
  '--allow-network',
  '--experimental-studio-logs',
  '--studio-dev-account',
  'setupfixture0',
];

function fullyConfigured(report: CheckSetupResult): void {
  expect(report.ready).toBe(true);
  expect(report.findings.map(({ code, status }) => ({ code, status }))).toEqual([
    { code: 'project.roots.available', status: 'ok' },
    { code: 'network.enabled', status: 'ok' },
    { code: 'studio.session.present', status: 'ok' },
    { code: 'studio.accounts.declared', status: 'ok' },
  ]);
}

function privateOutput(
  report: CheckSetupResult & { text: string },
  values: readonly string[],
): void {
  const output = JSON.stringify(report);
  expect(
    values.some((value) => output.includes(value)),
    'setup report exposed private fixture data',
  ).toBe(false);
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-setupe2e-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-setup-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );
  const artifact = inject('packedArtifact');
  await recordInstalledArtifact('check-setup', artifact);
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, artifact],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');

  projectRoot = resolve(temporaryRoot, 'projects/bgamcplegacy');
  await cp(resolve(fixturesRoot, 'legacy'), projectRoot, { recursive: true });
  await rm(resolve(projectRoot, 'expected.json'));
  projectDigest = await digestDirectory(projectRoot);
}, 240_000);

afterAll(async () => {
  try {
    expect(await digestDirectory(projectRoot)).toBe(projectDigest);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
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

  it('[E2E-SETUP-FULLY-CONFIGURED] reports complete configuration without using the credential or making a network request', async () => {
    for (const protocolVersion of eras) {
      const report = await checkSetup(completeArgs(), { session, protocolVersion });
      fullyConfigured(report);
      expect(
        report.findings.find(({ code }) => code === 'studio.session.present')?.summary,
      ).toContain('environment');
      privateOutput(report, [session, temporaryRoot]);
      expect(await checkSetup(completeArgs(), { session, protocolVersion })).toEqual(report);
    }
    if (process.platform !== 'win32') {
      const file = resolve(temporaryRoot, 'synthetic-session.txt');
      await writeFile(file, session);
      await chmod(file, 0o600);
      const original = await readFile(file);
      for (const protocolVersion of eras) {
        const report = await checkSetup([...completeArgs(), '--studio-session-file', file], {
          protocolVersion,
        });
        fullyConfigured(report);
        expect(
          report.findings.find(({ code }) => code === 'studio.session.present')?.summary,
        ).toContain('configured file');
        privateOutput(report, [session, file, temporaryRoot]);
        expect((await readFile(file)).equals(original), 'setup changed the provider').toBe(true);
      }
    }
  });

  it('[E2E-SETUP-PART-WAY] names independently missing settings and refuses a configured provider without falling back', async () => {
    for (const protocolVersion of eras) {
      const withoutSession = await checkSetup(completeArgs(), { protocolVersion });
      expect(withoutSession.ready).toBe(false);
      expect(
        withoutSession.findings.find(({ code }) => code === 'studio.session.missing')?.status,
      ).toBe('action-needed');
      expect(
        withoutSession.findings.find(({ code }) => code === 'studio.accounts.declared')?.status,
      ).toBe('ok');
      const withoutAccounts = await checkSetup(completeArgs().slice(0, -2), {
        session,
        protocolVersion,
      });
      expect(withoutAccounts.ready).toBe(false);
      expect(
        withoutAccounts.findings.find(({ code }) => code === 'studio.session.present')?.status,
      ).toBe('ok');
      expect(
        withoutAccounts.findings.find(({ code }) => code === 'studio.accounts.none')?.status,
      ).toBe('action-needed');
      const withoutRoot = await checkSetup(completeArgs().slice(2), { session, protocolVersion });
      expect(withoutRoot.ready).toBe(false);
      expect(withoutRoot.findings.find(({ code }) => code === 'project.roots.none')?.status).toBe(
        'action-needed',
      );
      const missingFile = resolve(temporaryRoot, 'missing-private-provider.txt');
      const refusedProvider = await checkSetup(
        [...completeArgs(), '--studio-session-file', missingFile],
        { session, protocolVersion },
      );
      expect(refusedProvider.ready).toBe(false);
      expect(refusedProvider.findings.some(({ code }) => code === 'studio.session.present')).toBe(
        false,
      );
      expect(
        refusedProvider.findings.find(({ code }) => code === 'studio.session.missing')?.status,
      ).toBe('action-needed');
      for (const report of [withoutSession, withoutAccounts, withoutRoot, refusedProvider]) {
        expect(
          report.findings
            .filter(({ status }) => status === 'action-needed')
            .every(({ nextAction }) => (nextAction?.length ?? 0) > 0),
        ).toBe(true);
        privateOutput(report, [session, missingFile, temporaryRoot]);
      }
    }
  });

  it('[E2E-SETUP-MATRIX-MUTATION] detects an incorrect installed configuration classification and restores the package', async () => {
    const path = resolve(cli, '../setup/status.js');
    const original = await readFile(path, 'utf8');
    const changed = original.replace("'studio.session.present'", "'studio.session.missing'");
    expect(changed).not.toBe(original);
    const replace = async (source: string) => {
      await writeFile(path + '.matrix-probe', source);
      await rename(path + '.matrix-probe', path);
    };
    await replace(changed);
    try {
      const report = await checkSetup(completeArgs(), { session });
      expect(() => fullyConfigured(report)).toThrow();
    } finally {
      await replace(original);
    }
    fullyConfigured(await checkSetup(completeArgs(), { session }));
    expect(await readFile(path, 'utf8')).toBe(original);
  });

  it('[E2E-SETUP-CLI-CONFIGURATION] keeps configuration-only preflight actionable and private with every network primitive denied', async () => {
    const log = resolve(temporaryRoot, 'cli-network-attempts.log');
    const run = async (args: readonly string[], value?: string) => {
      await writeFile(log, '');
      const result = await runCommand(
        process.execPath,
        [
          '--import',
          'tsx',
          '--import',
          new URL('./network-denied.ts', import.meta.url).href,
          cli,
          '--studio-check',
          ...args,
        ],
        { env: { ...process.env, BGA_STUDIO_SESSION: value, BGA_MCP_NETWORK_LOG: log } },
      );
      expect(result.stderr === '', 'CLI setup wrote to stderr').toBe(true);
      expect(await readFile(log, 'utf8')).toBe('');
      expect(
        [session, temporaryRoot].some((privateValue) =>
          (result.stdout + result.stderr).includes(privateValue),
        ),
        'CLI setup exposed private fixture data',
      ).toBe(false);
      return result;
    };
    const off = await run(['--project-root', projectRoot]);
    expect(off.exitCode).toBe(1);
    expect(off.stdout).toContain('--allow-network');
    const partWay = await run(completeArgs());
    expect(partWay.exitCode).toBe(1);
    expect(partWay.stdout).toContain('No Studio session');
    const complete = await run(completeArgs(), session);
    expect(complete.exitCode).toBe(0);
    expect(complete.stdout).toContain('Configuration looks complete');
    if (process.platform !== 'win32') {
      const file = resolve(temporaryRoot, 'synthetic-session.txt');
      const original = await readFile(file);
      const fromFile = await run([...completeArgs(), '--studio-session-file', file]);
      expect(fromFile.exitCode).toBe(0);
      expect(fromFile.stdout).toContain('configured file');
      expect(fromFile.stdout.includes(file), 'CLI setup exposed the provider path').toBe(false);
      expect((await readFile(file)).equals(original), 'setup changed the provider').toBe(true);
    }
  });

  it('[E2E-SETUP-PUBLIC-EXCLUDED] keeps setup reports outside the installed public profile', async () => {
    const publicCli = resolve(cli, '../release-cli.js');
    const log = resolve(temporaryRoot, 'public-network-attempts.log');
    await writeFile(log, '');
    const connection = await connectStdio(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        new URL('./network-denied.ts', import.meta.url).href,
        publicCli,
        '--project-root',
        projectRoot,
      ],
      {
        env: { ...process.env, BGA_STUDIO_SESSION: undefined, BGA_MCP_NETWORK_LOG: log },
      },
    );
    const pid = connection.transport.pid;
    try {
      expect((await connection.client.listTools()).tools.map(({ name }) => name)).not.toContain(
        'check_setup',
      );
      await expect(
        connection.client.callTool({ name: 'check_setup', arguments: {} }),
      ).rejects.toMatchObject({ code: -32602 });
    } finally {
      await connection.client.close();
      if (pid !== null) await waitForProcessExit(pid);
      expect(connection.stderr() === '', 'public profile wrote to stderr').toBe(true);
      expect(await readFile(log, 'utf8')).toBe('');
    }
  });
});
