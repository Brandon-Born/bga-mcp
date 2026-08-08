import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';
import { inject } from 'vitest';

import { connectStdio } from '../helpers/mcp.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesRoot = resolve(repositoryRoot, 'tests/fixtures/projects');
// Node's --import needs a URL: on Windows an absolute path such as C:\… is not
// a valid ESM specifier and the process refuses to start.
const denialModule = new URL('./network-denied.ts', import.meta.url).href;
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

const RESOURCES = ['bga://project/summary', 'bga://project/states', 'bga://project/diagnostics'];

let temporaryRoot: string;
let cli: string;
let projectRoot: string;
let networkLog: string;

interface Snapshot {
  readonly digest: string;
  /** Path to size and modification time, so a rewrite with equal content is still caught. */
  readonly metadata: Record<string, string>;
}

async function snapshot(directory: string): Promise<Snapshot> {
  const hash = createHash('sha256');
  const metadata: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = resolve(current, entry.name);
      const portable = relative(directory, path).split(sep).join('/');
      if (entry.isDirectory()) {
        metadata[`${portable}/`] = 'directory';
        await walk(path);
        continue;
      }
      const info = await stat(path);
      metadata[portable] = `${String(info.size)}:${info.mtimeMs.toFixed(0)}`;
      hash.update(portable);
      hash.update(await readFile(path));
    }
  };
  await walk(directory);
  return { digest: hash.digest('hex'), metadata };
}

async function withDeniedNetwork<T>(
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<{ result: T; stderr: string }> {
  const connection = await connectStdio(
    process.execPath,
    ['--import', 'tsx', '--import', denialModule, cli, ...arguments_],
    { timeoutMs: 20_000, env: { ...process.env, BGA_MCP_NETWORK_LOG: networkLog } },
  );
  const processId = connection.transport.pid;
  try {
    const result = await use(connection.client);
    return { result, stderr: connection.stderr() };
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
  }
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-readonly-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-readonly-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  // The artifact is packed once for the whole run; see tests/global-setup.ts.
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, inject('packedArtifact')],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');

  projectRoot = resolve(temporaryRoot, 'projects/brokengame');
  await cp(resolve(fixturesRoot, 'legacy-broken'), projectRoot, { recursive: true });
  await rm(resolve(projectRoot, 'expected.json'));
  networkLog = resolve(temporaryRoot, 'network-attempts.log');
  await writeFile(networkLog, '');
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('local capabilities are read-only and network-off', () => {
  it('[E2E-READ-ONLY-NETWORK-DENIED] runs every capability with the network denied and changes nothing', async () => {
    const before = await snapshot(projectRoot);

    const { result, stderr } = await withDeniedNetwork(
      ['--project-root', projectRoot],
      async (client) => {
        const tools = (await client.listTools()).tools.map((tool) => tool.name);
        const outcomes: Record<string, boolean> = {};
        const messages: Record<string, string> = {};
        for (const name of tools) {
          const response = await client.callTool(
            // The documentation tool takes a query rather than a project; it is
            // called too, because a capability that reaches the network is
            // exactly the one this scenario must watch.
            {
              name,
              arguments:
                name === 'search_bga_docs'
                  ? { query: 'state classes' }
                  : name === 'read_studio_logs'
                    ? { gameId: '1234' }
                    : name === 'check_setup'
                      ? {}
                      : { projectRoot },
            },
            { timeout: 20_000 },
          );
          outcomes[name] = response.isError === true;
          messages[name] = (response.content as { text?: string }[])
            .map((entry) => entry.text ?? '')
            .join('\n');
        }
        for (const uri of RESOURCES) {
          const contents = (await client.readResource({ uri }, { timeout: 20_000 }))
            .contents as unknown[];
          expect(contents).toHaveLength(1);
        }
        return { tools, outcomes, messages };
      },
    );

    // Every local tool ran to completion without the network.
    expect(result.tools.length).toBeGreaterThanOrEqual(10);
    for (const [name, isError] of Object.entries(result.outcomes)) {
      // The two capabilities that would leave the machine are asserted below.
      if (name === 'search_bga_docs' || name === 'read_studio_logs') {
        continue;
      }
      expect(isError, `${name} failed with the network denied`).toBe(false);
    }

    // The one capability that would use the network refuses because the network
    // is off by default, not because the harness blocked it: it never gets far
    // enough to be blocked, which the empty attempt log below confirms.
    expect(result.outcomes.search_bga_docs).toBe(true);
    expect(result.messages.search_bga_docs).toContain('policy.network.disabled');
    expect(result.outcomes.read_studio_logs).toBe(true);
    expect(result.messages.read_studio_logs).toContain('policy.network.disabled');

    // Nothing tried to leave the machine.
    expect(await readFile(networkLog, 'utf8')).toBe('');
    expect(stderr).not.toContain('network access denied');

    // The project is byte-for-byte and metadata-for-metadata unchanged.
    const after = await snapshot(projectRoot);
    expect(after.digest).toBe(before.digest);
    expect(after.metadata).toEqual(before.metadata);
  }, 120_000);

  it('[E2E-READ-ONLY-NETWORK-HARNESS] proves the denial harness itself fails an outbound attempt', async () => {
    const probe = resolve(temporaryRoot, 'probe.mjs');
    await writeFile(
      probe,
      `import net from 'node:net';\ntry { net.connect(80, 'example.com'); } catch (error) { console.log('DENIED', error.message); }\n`,
    );
    const attempt = await runCommand(
      process.execPath,
      ['--import', 'tsx', '--import', denialModule, probe],
      { timeoutMs: 30_000, env: { ...process.env, BGA_MCP_NETWORK_LOG: networkLog } },
    );

    expect(attempt.stdout).toContain('DENIED');
    expect(await readFile(networkLog, 'utf8')).toContain('net.connect');
    await writeFile(networkLog, '');
  }, 60_000);

  it('[E2E-READ-ONLY-INPUT-CANNOT-ESCAPE] keeps the policy in force whatever the client sends', async () => {
    const before = await snapshot(projectRoot);
    const outside = resolve(temporaryRoot, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(resolve(outside, 'target.txt'), 'untouched\n');

    const { result } = await withDeniedNetwork(['--project-root', projectRoot], async (client) => {
      const attempts = [
        { projectRoot: outside },
        { projectRoot: `${projectRoot}/../outside` },
        { projectRoot: '/' },
        { projectRoot: projectRoot, groups: ['state-machine'] },
      ];
      const refused: boolean[] = [];
      for (const argument of attempts) {
        const response = await client
          .callTool({ name: 'validate_project', arguments: argument }, { timeout: 20_000 })
          .catch(() => ({ isError: true, content: [] }));
        refused.push(response.isError === true);
      }
      return refused;
    });

    // The three escaping roots are refused; the legitimate call is not.
    expect(result.slice(0, 3)).toEqual([true, true, true]);
    expect(result[3]).toBe(false);

    expect(await readFile(resolve(outside, 'target.txt'), 'utf8')).toBe('untouched\n');
    const after = await snapshot(projectRoot);
    expect(after.digest).toBe(before.digest);
    expect(after.metadata).toEqual(before.metadata);
  }, 120_000);
});
