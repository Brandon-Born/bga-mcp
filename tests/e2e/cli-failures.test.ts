// secret-scan:allow-file Original non-secret canaries prove terminal failure redaction.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { installPackagedServer, type PackagedServer } from '../helpers/packaged.js';
import type { CommandResult } from '../helpers/process.js';

let installed: PackagedServer<'legacy'>;
const session = 'cli-session-canary-421-never-retain';
const fileSession = 'cli-file-session-canary-421-never-retain';
const cause = 'cli-cause-canary-421-never-retain';
const pathCanary = 'cli-path-canary-421-never-retain';
const payload = `${session} ${cause} /private/${pathCanary}`;
const fail = `throw new Error(${JSON.stringify(payload)}, {cause: new Error(${JSON.stringify(cause)})});`;

beforeAll(async () => {
  installed = await installPackagedServer('cli-failures', { legacy: 'legacy' });
});
afterAll(async () => await installed.cleanup());

/** Replace one installed dependency atomically; never overwrite pnpm store hardlinks. */
async function withMutation(
  path: string,
  from: string,
  to: string,
  use: () => Promise<void>,
): Promise<void> {
  const original = await readFile(path, 'utf8');
  if (!original.includes(from)) throw new Error('CLI probe injection site disappeared');
  const replace = async (source: string): Promise<void> => {
    await writeFile(`${path}.cli-probe`, source);
    await rename(`${path}.cli-probe`, path);
  };
  await replace(original.replace(from, to));
  try {
    await use();
  } finally {
    await replace(original);
  }
}

/** Keep stdin open: a startup refusal must exit without the parent closing it. */
async function execute(
  cli: string,
  args: readonly string[],
  shutdown = false,
): Promise<CommandResult> {
  const preload = resolve(installed.temporaryRoot, 'signal-probe.mjs');
  if (shutdown) {
    // Windows process.kill is unconditional. Emitting the same Node event after
    // a real initialize response exercises the registered handler on all CI OSes.
    await writeFile(
      preload,
      "process.on('message', () => { process.disconnect(); process.emit('SIGTERM'); });\n",
    );
  }
  return await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [...(shutdown ? ['--import', pathToFileURL(preload).href] : []), cli, ...args],
      {
        env: { ...process.env, BGA_STUDIO_SESSION: `opaque=${session}` },
        stdio: shutdown ? ['pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let sent = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 15_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (shutdown && !sent && stdout.includes('"result"')) {
        sent = true;
        child.send('shutdown');
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut || signal !== null) reject(new Error('CLI probe did not terminate normally'));
      else done({ stdout, stderr, exitCode: code ?? 1 });
    });
    if (shutdown)
      child.stdin?.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'cli-probe', version: '1' },
          },
        })}\n`,
      );
  });
}

function safe(result: CommandResult, code: number, errorCode?: string): void {
  // Assertions disclose only a boolean if a mutant leaks: no canary, stack or
  // captured process output is copied into test-results/evidence/CI logs.
  const leaked =
    [session, fileSession, cause, pathCanary, installed.temporaryRoot].some((value) =>
      `${result.stdout}${result.stderr}`.includes(value),
    ) || /\n\s+at |\[cause\]|ENOENT|node:internal/u.test(result.stderr);
  expect(leaked, 'CLI failure exposed private diagnostic data').toBe(false);
  expect(result.exitCode).toBe(code);
  if (errorCode !== undefined) expect(result.stderr.includes(`[${errorCode}]`)).toBe(true);
}

const rootArgs = (): string[] => ['--project-root', installed.projects.legacy];
const cliFiles = (): string[] => [
  installed.cli,
  resolve(installed.packageRoot, 'dist/release-cli.js'),
];

describe('installed executable failure boundary', () => {
  it('[E2E-CLI-FAILURE-CONFIGURATION] redacts unknown arguments and unavailable roots in both profiles', async () => {
    for (const cli of cliFiles()) {
      safe(await execute(cli, [`--unknown-${session}`]), 2, 'config.invalid');
      safe(
        await execute(cli, ['--project-root', resolve(installed.temporaryRoot, pathCanary)]),
        2,
        'policy.root.unavailable',
      );
      safe(await execute(cli, ['--help']), 0);
      safe(await execute(cli, ['--version']), 0);
    }
    safe(
      await execute(installed.cli, [
        '--studio-check',
        '--project-root',
        resolve(installed.temporaryRoot, pathCanary),
      ]),
      2,
      'policy.root.unavailable',
    );
  });

  it('[E2E-CLI-FAILURE-STUDIO] refuses a missing session provider and disabled Studio policy without private output', async () => {
    const refused = await execute(installed.cli, ['--studio-check', ...rootArgs()]);
    safe(refused, 1);
    expect(refused.stdout.includes('Network access is disabled.')).toBe(true);
    const missing = await execute(installed.cli, [
      '--studio-check',
      ...rootArgs(),
      '--allow-network',
      '--experimental-studio-logs',
      '--studio-session-file',
      resolve(installed.temporaryRoot, pathCanary),
    ]);
    safe(missing, 1);
    expect(
      missing.stdout.includes(
        process.platform === 'win32' ? 'not supported' : 'could not be opened',
      ),
    ).toBe(true);
  });

  it('[E2E-CLI-FAILURE-SETUP] collapses unexpected setup failures and registers file sessions before known failures', async () => {
    const policyPath = resolve(installed.packageRoot, 'dist/policy.js');
    {
      // Insert at the existing body, leaving the CLI boundary entirely intact.
      const original = await readFile(policyPath, 'utf8');
      const marker = /static async create\([^)]*\) \{/u.exec(original)?.[0];
      if (marker === undefined) throw new Error('Policy startup site disappeared');
      await withMutation(policyPath, marker, `${marker}\n${fail}`, async () => {
        for (const cli of cliFiles())
          safe(await execute(cli, rootArgs()), 1, 'internal.unexpected');
        safe(
          await execute(installed.cli, ['--studio-check', ...rootArgs()]),
          1,
          'internal.unexpected',
        );
      });
    }
    await withMutation(
      policyPath,
      'await boundary.studioSession({ signal });',
      `await boundary.studioSession({ signal });\nthrow new PolicyViolationError(ERROR_CODES.configInvalid, 'safe message', {details: {get raw() { ${fail} }}});`,
      async () => {
        for (const cli of cliFiles())
          safe(await execute(cli, rootArgs()), 1, 'internal.unexpected');
      },
    );
    const secretFile = resolve(installed.temporaryRoot, 'session');
    await writeFile(secretFile, `opaque=${fileSession}`, { mode: 0o600 });
    await withMutation(
      policyPath,
      'await boundary.studioSession({ signal });',
      `await boundary.studioSession({ signal });\nthrow new PolicyViolationError(ERROR_CODES.policyStudioNotAllowed, ${JSON.stringify(`${session} ${process.platform === 'win32' ? '' : fileSession} /private/${pathCanary}`)}, {cause: new Error(${JSON.stringify(cause)})});`,
      async () => {
        for (const cli of [installed.cli]) {
          // POSIX proves the file provider; Windows retains its environment route.
          const args =
            cli === installed.cli && process.platform !== 'win32'
              ? [...rootArgs(), '--studio-session-file', secretFile]
              : rootArgs();
          safe(await execute(cli, args), 2, 'policy.studio.not-allowed');
        }
      },
    );
  });

  it('[E2E-CLI-FAILURE-IMPORT] collapses dependency initialization failures before the runner exists', async () => {
    const server = resolve(installed.packageRoot, 'dist/server.js');
    const original = await readFile(server, 'utf8');
    await withMutation(server, original, `${fail}\n${original}`, async () => {
      for (const cli of cliFiles()) safe(await execute(cli, rootArgs()), 1, 'internal.unexpected');
    });
  });

  it('[E2E-CLI-FAILURE-STARTUP] closes stdin after a protocol startup exception', async () => {
    const sdk = createRequire(await realpath(resolve(installed.packageRoot, 'package.json')))
      .resolve('@modelcontextprotocol/server/stdio')
      .replace(/\.cjs$/u, '.mjs');
    await withMutation(sdk, 'async start() {', `async start() {\n${fail}`, async () => {
      for (const cli of cliFiles()) safe(await execute(cli, rootArgs()), 1, 'internal.unexpected');
    });
  });

  it('[E2E-CLI-FAILURE-SHUTDOWN] preserves failure exit codes when server and transport cleanup throw', async () => {
    const sdk = createRequire(await realpath(resolve(installed.packageRoot, 'package.json')))
      .resolve('@modelcontextprotocol/server/stdio')
      .replace(/\.cjs$/u, '.mjs');
    await withMutation(sdk, 'async close() {', `async close() {\n${fail}`, async () => {
      for (const cli of cliFiles())
        safe(await execute(cli, rootArgs(), true), 1, 'internal.unexpected');
    });
  });

  it('[GATE-LOG-REDACTION] a runtime throw outside the boundary is detected without retaining its private output', async () => {
    const runner = resolve(installed.packageRoot, 'dist/cli-runner.js');
    await withMutation(runner, 'let policy;', `${fail}\nlet policy;`, async () => {
      const leaked = await execute(installed.cli, ['--studio-check', ...rootArgs()]);
      safe(leaked, 1, 'internal.unexpected');
    });
    const files = [
      installed.cli,
      resolve(installed.packageRoot, 'dist/cli-runner.js'),
      resolve(installed.packageRoot, 'dist/policy.js'),
    ];
    for (const file of files)
      expect((await readFile(file, 'utf8')).includes('BGA_CLI_TEST')).toBe(false);
  });
});
