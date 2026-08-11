import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';
import { inject } from 'vitest';

import { connectStdio } from '../helpers/mcp.js';
import { recordInstalledArtifact } from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

let temporaryRoot: string;
let cli: string;

async function withServer<T>(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
  use: (client: Client) => Promise<T>,
): Promise<T> {
  const connection = await connectStdio(process.execPath, [cli, ...arguments_], {
    timeoutMs: 10_000,
    env: { ...process.env, ...environment },
  });
  const processId = connection.transport.pid;
  try {
    return await use(connection.client);
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
  }
}

async function read(client: Client, argument: unknown): Promise<string> {
  const result = await client.callTool(
    { name: 'read_studio_logs', arguments: argument as Record<string, unknown> },
    { timeout: 15_000 },
  );
  return (result.content as { text?: string }[]).map((entry) => entry.text ?? '').join('\n');
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-studio-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-studio-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );
  const artifact = inject('packedArtifact');
  await recordInstalledArtifact('read-studio-logs', artifact);
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, artifact],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged read_studio_logs', () => {
  it('[E2E-STUDIO-LOGS-DISABLED] is advertised as experimental and refuses until asked for', async () => {
    const { tool, response } = await withServer(['--allow-network'], {}, async (client) => {
      const listed = await client.listTools();
      return {
        tool: listed.tools.find((entry) => entry.name === 'read_studio_logs'),
        response: await read(client, { gameId: 'mcpverification' }),
      };
    });

    // The trade is stated in the description rather than hidden.
    expect(tool?.description).toContain('Experimental');
    expect(tool?.description).toMatch(/BGA does\s+not document or version/u);
    expect(tool?.description).toMatch(/withheld entirely rather than\s+redacted/u);

    expect(response).toContain('policy.studio.disabled');
    expect(response).toContain('--experimental-studio-logs');
  });

  it('[E2E-STUDIO-LOGS-NO-SESSION] refuses without a session, and never takes one as an argument', async () => {
    const response = await withServer(
      ['--allow-network', '--experimental-studio-logs', '--studio-dev-account', 'mytest0'],
      { BGA_STUDIO_SESSION: '' },
      async (client) => await read(client, { gameId: 'mcpverification' }),
    );

    expect(response).toContain('policy.studio.no-session');
    expect(response).toContain('BGA_STUDIO_SESSION');
    // The refusal explains where the session belongs without echoing one.
    expect(response).toContain('never accepted as a tool argument');
  });

  it('[E2E-STUDIO-LOGS-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(
      ['--allow-network', '--experimental-studio-logs', '--studio-dev-account', 'mytest0'],
      {},
      async (client) => {
        for (const argument of [
          {},
          { gameId: '' },
          { gameId: 'not a project name' },
          // The numeric Play ID from the game URL. A live run on 2026-08-10
          // confirmed Studio does not know it as a project: the same page
          // answers "The project doesn't exist or you don't have access to it".
          { gameId: '15414' },
          { gameId: 'name-with-hyphens' },
          { gameId: 'mcpverification&other=1' },
          { gameId: '../escape' },
          { gameId: 'mcpverification', maxLines: 0 },
          { gameId: 'mcpverification', maxLines: 5000 },
          // A session is not part of the contract, so it cannot be smuggled in.
          { gameId: 'mcpverification', session: 'PHPSESSID=abc' },
        ]) {
          const failure = await read(client, argument).catch((error: unknown) => error);
          const text = failure instanceof Error ? failure.message : failure;
          expect(String(text).toLowerCase()).toMatch(
            /invalid|unrecognized|schema|required|expected|studio/u,
          );
        }
      },
    );
  });
});
