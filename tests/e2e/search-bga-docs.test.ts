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

interface ToolResponse {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: Record<string, unknown> | undefined;
}

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

async function search(client: Client, argument: unknown): Promise<ToolResponse> {
  const result = await client.callTool(
    { name: 'search_bga_docs', arguments: argument as Record<string, unknown> },
    { timeout: 15_000 },
  );
  const content = result.content as { type: string; text?: string }[];
  return {
    isError: result.isError === true,
    text: content.map((entry) => entry.text ?? '').join('\n'),
    structured: result.structuredContent as Record<string, unknown> | undefined,
  };
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-docs-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-docs-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  const artifact = inject('packedArtifact');
  await recordInstalledArtifact('search-bga-docs', artifact);
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

describe('packaged search_bga_docs', () => {
  it('[E2E-DOCS-ADVERTISED] is discoverable and declares itself as reaching outside the machine', async () => {
    const tool = await withServer(['--project-root', projectRoot], async (client) => {
      const listed = await client.listTools();
      return listed.tools.find((entry) => entry.name === 'search_bga_docs');
    });

    expect(tool).toBeDefined();
    // The only capability with openWorldHint: everything else is local.
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    expect(tool?.description).toContain('--allow-network');
    expect(tool?.description).toContain('untrusted content');
  });

  it('[E2E-DOCS-NETWORK-OFF] refuses every lookup when the network is not enabled', async () => {
    const response = await withServer(
      ['--project-root', projectRoot],
      async (client) => await search(client, { query: 'state classes' }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.network.disabled');
    expect(response.text).toContain('--allow-network');
  });

  it('[E2E-DOCS-REQUEST-CARRIES-NO-PROJECT-DATA] refuses a query carrying local work, before any request', async () => {
    await withServer(['--project-root', projectRoot, '--allow-network'], async (client) => {
      // A path names the developer's machine; pasted source is their game.
      const path = await search(client, { query: `why does ${projectRoot} fail` });
      expect(path.isError).toBe(true);
      expect(path.text).toContain('policy.doc-request.content');

      const pasted = await search(client, {
        query: '<?php class BgaMcpLegacy extends Table {',
      });
      expect(pasted.isError).toBe(true);
      expect(pasted.text).toContain('policy.doc-request.content');

      // The refusal names the reason without echoing the project path back.
      expect(path.text).not.toContain(projectRoot);
    });
  });

  it('[E2E-DOCS-UNKNOWN-SOURCE] refuses a source that is not in the reviewed catalog', async () => {
    const response = await withServer(
      ['--project-root', projectRoot, '--allow-network'],
      async (client) => await search(client, { query: 'state classes', sourceId: 'some-blog' }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.doc-source.not-allowed');
  });

  it('[E2E-DOCS-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(['--project-root', projectRoot], async (client) => {
      for (const argument of [
        {},
        { query: '' },
        { query: 'states', maxResults: 0 },
        { query: 'states', maxResults: 99 },
        { query: 'states', extra: true },
      ]) {
        const failure = await search(client, argument).catch((error: unknown) => error);
        if (failure instanceof Error) {
          expect(failure.message).toMatch(/valid|invalid|schema|required|expected/iu);
          continue;
        }
        expect((failure as ToolResponse).isError, `accepted ${JSON.stringify(argument)}`).toBe(
          true,
        );
      }
    });
  });
});
