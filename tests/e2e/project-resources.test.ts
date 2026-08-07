import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

const SUMMARY = 'bga://project/summary';
const STATES = 'bga://project/states';
const DIAGNOSTICS = 'bga://project/diagnostics';

let temporaryRoot: string;
let cli: string;
let cleanRoot: string;
let brokenRoot: string;

async function digest(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      hash.update(relative(directory, path).split(sep).join('/'));
      hash.update(await readFile(path));
    }
  };
  await walk(directory);
  return hash.digest('hex');
}

async function readResource(client: Client, uri: string): Promise<Record<string, unknown>> {
  const result = await client.readResource({ uri }, { timeout: 15_000 });
  const contents = result.contents as { uri: string; mimeType?: string; text?: string }[];
  expect(contents).toHaveLength(1);
  expect(contents[0]?.uri).toBe(uri);
  expect(contents[0]?.mimeType).toBe('application/json');
  return JSON.parse(contents[0]?.text ?? '{}') as Record<string, unknown>;
}

async function withServer<T>(
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<T> {
  const connection = await connectStdio(process.execPath, [cli, ...arguments_], {
    timeoutMs: 10_000,
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

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-resources-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-resources-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  // The artifact is packed once for the whole run; see tests/global-setup.ts.
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, inject('packedArtifact')],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');

  const projects = resolve(temporaryRoot, 'projects');
  cleanRoot = resolve(projects, 'cleangame');
  brokenRoot = resolve(projects, 'brokengame');
  await cp(resolve(fixturesRoot, 'legacy'), cleanRoot, { recursive: true });
  await cp(resolve(fixturesRoot, 'legacy-broken'), brokenRoot, { recursive: true });
  for (const target of [cleanRoot, brokenRoot]) {
    await rm(resolve(target, 'expected.json'));
  }
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged project resources', () => {
  it('[E2E-RESOURCE-DISCOVERY] advertises exactly the resources the manifest declares', async () => {
    const listed = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await client.listResources(),
    );

    expect(listed.resources.map((entry) => entry.uri).sort()).toEqual([
      DIAGNOSTICS,
      STATES,
      SUMMARY,
    ]);
    for (const entry of listed.resources) {
      expect(entry.mimeType).toBe('application/json');
      expect(entry.description ?? '').not.toBe('');
    }
  });

  it('[E2E-RESOURCE-SUMMARY] serves the normalized project model', async () => {
    const summary = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await readResource(client, SUMMARY),
    );

    expect(summary).toMatchObject({
      schemaVersion: 1,
      layout: 'legacy',
      gameKey: 'bgamcplegacy',
      metadata: { gameName: 'BgaMcpLegacyFixture', playerCounts: [2] },
    });
    const components = summary.components as { id: string; present: boolean }[];
    expect(components.filter((component) => component.present).length).toBeGreaterThan(5);
  });

  it('[E2E-RESOURCE-STATES] serves state definitions with their validation and uncertainty', async () => {
    const states = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await readResource(client, STATES),
    );

    expect(states).toMatchObject({ schemaVersion: 1, source: 'states.inc.php', parsed: true });
    const definitions = states.definitions as { id: number; name: string }[];
    expect(definitions.map((state) => state.name)).toEqual(['gameSetup', 'playerTurn', 'gameEnd']);
    expect(states.unsupported).toEqual([]);
    expect(states.validation).toMatchObject({ status: 'passed' });
  });

  it('[E2E-RESOURCE-DIAGNOSTICS] serves the aggregate findings of every validator', async () => {
    const [clean, broken] = await Promise.all([
      withServer(
        ['--project-root', cleanRoot],
        async (client) => await readResource(client, DIAGNOSTICS),
      ),
      withServer(
        ['--project-root', brokenRoot],
        async (client) => await readResource(client, DIAGNOSTICS),
      ),
    ]);

    expect(clean).toMatchObject({ schemaVersion: 1, status: 'passed' });
    expect((clean.diagnostics as { findings: unknown[] }).findings).toEqual([]);

    expect(broken).toMatchObject({ status: 'findings' });
    const groups = broken.groups as { id: string; ran: boolean; findingCount: number }[];
    expect(groups.map((group) => group.id).sort()).toEqual([
      'action-contracts',
      'database',
      'notifications',
      'state-machine',
    ]);
    expect(groups.every((group) => group.ran)).toBe(true);
    expect((broken.diagnostics as { findings: unknown[] }).findings.length).toBeGreaterThan(10);
  });

  it('[E2E-RESOURCE-UNCONFIGURED] refuses to serve a project when no root is configured', async () => {
    await withServer([], async (client) => {
      for (const uri of [SUMMARY, STATES, DIAGNOSTICS]) {
        await expect(client.readResource({ uri })).rejects.toThrow(/policy\.root\.unconfigured/u);
      }
      // The resources are still advertised; only reading them fails.
      expect((await client.listResources()).resources).toHaveLength(3);
    });
  });

  it('[E2E-RESOURCE-AMBIGUOUS] refuses to choose between several configured roots', async () => {
    await withServer(
      ['--project-root', cleanRoot, '--project-root', brokenRoot],
      async (client) => {
        await expect(client.readResource({ uri: SUMMARY })).rejects.toThrow(
          /resource\.project\.ambiguous/u,
        );
        const failure = await client
          .readResource({ uri: SUMMARY })
          .catch((error: unknown) => error as Error);
        expect(failure.message).toContain('2 roots are configured');
        expect(failure.message).not.toContain(cleanRoot);
      },
    );
  });

  it('[E2E-RESOURCE-IMMUTABLE] changes nothing in the project it describes', async () => {
    const before = await digest(brokenRoot);
    await withServer(['--project-root', brokenRoot], async (client) => {
      for (const uri of [SUMMARY, STATES, DIAGNOSTICS]) {
        await readResource(client, uri);
      }
    });
    expect(await digest(brokenRoot)).toBe(before);
  });

  it('rejects a resource URI the server does not serve', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      await expect(client.readResource({ uri: 'bga://project/secrets' })).rejects.toThrow(
        /not found|unknown|resource/iu,
      );
    });
  });
});
