import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';
import { inject } from 'vitest';

import { connectStdio } from '../helpers/mcp.js';
import { recordInstalledArtifact } from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesRoot = resolve(repositoryRoot, 'tests/fixtures/projects');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

let temporaryRoot: string;
let cli: string;
let projectRoot: string;

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

async function readFailure(client: Client, uri: string): Promise<string> {
  try {
    await client.readResource({ uri }, { timeout: 15_000 });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Reading ${uri} was expected to fail`);
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-docsres-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-docsres-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  const artifact = inject('packedArtifact');
  await recordInstalledArtifact('docs-resources', artifact);
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
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged documentation resources', () => {
  it('[E2E-DOCS-TOPIC-LISTED] lists every documentation topic as a readable resource', async () => {
    const listed = await withServer(
      ['--project-root', projectRoot],
      async (client) => await client.listResources(),
    );

    const uris = listed.resources.map((entry) => entry.uri);
    // Resolution is a fixed table, so the list is the contract: a client can
    // see every topic without guessing at page names.
    expect(uris).toContain('bga://docs/states');
    expect(uris).toContain('bga://docs/migration');
    expect(uris).toContain('bga://docs/cookbook');
    expect(uris).toContain('bga://framework/version');

    const cookbook = listed.resources.find((entry) => entry.uri === 'bga://docs/cookbook');
    expect(cookbook?.description).toContain('Anyone may edit');
  });

  it('[E2E-DOCS-TOPIC-UNKNOWN] refuses an unknown topic and says what the topics are', async () => {
    const message = await withServer(
      ['--project-root', projectRoot, '--allow-network'],
      async (client) => await readFailure(client, 'bga://docs/not-a-topic'),
    );

    expect(message).toContain('Unknown documentation topic');
    expect(message).toContain('states');
  });

  it('[E2E-DOCS-TOPIC-UNKNOWN] refuses a topic that tries to become a path', async () => {
    await withServer(['--project-root', projectRoot, '--allow-network'], async (client) => {
      for (const uri of ['bga://docs/..%2F..%2Fetc%2Fpasswd', 'bga://docs/Special:Export']) {
        const message = await readFailure(client, uri);
        // A topic is a name from a table, never a page path, so neither of
        // these reaches the request builder at all.
        expect(message).toContain('Unknown documentation topic');
      }
    });
  });

  it('[E2E-DOCS-TOPIC-NETWORK-OFF] refuses a topic read when the network is not enabled', async () => {
    const message = await withServer(
      ['--project-root', projectRoot],
      async (client) => await readFailure(client, 'bga://docs/states'),
    );

    expect(message).toContain('policy.network.disabled');
    expect(message).toContain('--allow-network');
  });

  it('[E2E-FRAMEWORK-VERSION-LISTED] advertises the framework version resource with its limits', async () => {
    const listed = await withServer(
      ['--project-root', projectRoot],
      async (client) => await client.listResources(),
    );

    const resource = listed.resources.find((entry) => entry.uri === 'bga://framework/version');
    expect(resource).toBeDefined();
    // The description states the two things a reader must know before trusting
    // a version: where it came from, and that unknown is a possible answer.
    expect(resource?.description).toContain('Studio page');
    expect(resource?.description).toContain('Unknown rather than guessed');
  });

  it('[E2E-FRAMEWORK-VERSION-NETWORK-OFF] refuses to serve versions when the network is not enabled', async () => {
    const message = await withServer(
      ['--project-root', projectRoot],
      async (client) => await readFailure(client, 'bga://framework/version'),
    );

    // It refuses rather than serving something stale and unlabelled.
    expect(message).toContain('policy.network.disabled');
  });
});
