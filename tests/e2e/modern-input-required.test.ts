import { createServer, type Server } from 'node:http';
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';

import { connectStdio } from '../helpers/mcp.js';
import { installPackagedServer, type PackagedServer } from '../helpers/packaged.js';
import { waitForProcessExit } from '../helpers/scenario.js';

let server: PackagedServer<'legacy' | 'modern'>;
let studioStub: Server;
let studioStubPort: number;

const stubModule = new URL('./doc-network-stub.ts', import.meta.url).href;
const STUDIO_ACCOUNT = 'mytest0';
const STUDIO_PAGE = `<html><body><pre>20/06 21:50:56 [info] [T403] [4/${STUDIO_ACCOUNT}] 0.26 GET /modern/setup.html</pre></body></html>`;

async function withModernClient<T>(
  roots: () => Promise<{ roots: { uri: string; name?: string }[] }>,
  use: (client: Client, requested: () => number) => Promise<T>,
): Promise<T> {
  const connection = await connectStdio(process.execPath, [server.cli], {
    protocolVersion: '2026-07-28',
    timeoutMs: 20_000,
    clientOptions: {
      capabilities: { roots: {} },
      inputRequired: { autoFulfill: true, maxRounds: 4 },
    },
  });
  let requests = 0;
  connection.client.setRequestHandler('roots/list', async () => {
    requests += 1;
    return await roots();
  });
  const processId = connection.transport.pid;
  try {
    return await use(connection.client, () => requests);
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
    expect(connection.stderr()).toBe('');
  }
}

async function withModernStudioClient<T>(
  reply: () => Promise<{
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, string | number | boolean | string[]>;
  }>,
  use: (client: Client, requested: () => number) => Promise<T>,
  capabilities = true,
): Promise<T> {
  const connection = await connectStdio(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      stubModule,
      server.cli,
      '--allow-network',
      '--experimental-studio-logs',
    ],
    {
      protocolVersion: '2026-07-28',
      timeoutMs: 20_000,
      env: {
        ...process.env,
        BGA_MCP_DOC_STUB_PORT: String(studioStubPort),
        BGA_STUDIO_SESSION: 'PHPSESSID=modernInputRequiredSession',
      },
      clientOptions: {
        ...(capabilities ? { capabilities: { elicitation: { form: {} } } } : {}),
        inputRequired: { autoFulfill: true, maxRounds: 4 },
      },
    },
  );
  let requests = 0;
  if (capabilities) {
    connection.client.setRequestHandler('elicitation/create', async () => {
      requests += 1;
      return await reply();
    });
  }
  const processId = connection.transport.pid;
  try {
    return await use(connection.client, () => requests);
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
    expect(connection.stderr()).toBe('');
  }
}

function text(result: { content: unknown }): string {
  return (result.content as { text?: string }[]).map((entry) => entry.text ?? '').join('\n');
}

beforeAll(async () => {
  server = await installPackagedServer('modern-input-required', {
    legacy: 'legacy',
    modern: 'modern',
  });

  studioStub = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(STUDIO_PAGE);
  });
  await new Promise<void>((ready) => {
    studioStub.listen(0, '127.0.0.1', ready);
  });
  const address = studioStub.address();
  studioStubPort = typeof address === 'object' && address !== null ? address.port : 0;
}, 240_000);

afterAll(async () => {
  await new Promise<void>((closed) => {
    studioStub.close(() => {
      closed();
    });
  });
  await server.cleanup();
});

describe('2026 multi-round-trip project roots', () => {
  it('[E2E-MODERN-INPUT-REQUIRED-ROOTS] asks for one root, validates it, and completes the original tool call', async () => {
    await withModernClient(
      () => Promise.resolve({ roots: [{ uri: pathToFileURL(server.projects.legacy).href }] }),
      async (client, requested) => {
        const result = await client.callTool(
          { name: 'inspect_project', arguments: {} },
          { timeout: 30_000 },
        );
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ layout: 'legacy' });
        expect(requested()).toBe(1);
      },
    );
  }, 180_000);

  it('[E2E-MODERN-INPUT-REQUIRED-ROOTS] observes changed roots on a later call', async () => {
    let current = server.projects.legacy;
    await withModernClient(
      () => Promise.resolve({ roots: [{ uri: pathToFileURL(current).href }] }),
      async (client, requested) => {
        const first = await client.callTool(
          { name: 'inspect_project', arguments: {} },
          { timeout: 30_000 },
        );
        expect(first.structuredContent).toMatchObject({ layout: 'legacy' });
        current = server.projects.modern;
        const second = await client.callTool(
          { name: 'inspect_project', arguments: {} },
          { timeout: 30_000 },
        );
        expect(second.structuredContent).toMatchObject({ layout: 'modern' });
        expect(requested()).toBe(2);
      },
    );
  }, 180_000);

  it('[E2E-MODERN-INPUT-REQUIRED-OUTCOMES] distinguishes empty, multiple, invalid, and link roots', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'bga-mcp-modern-roots-'));
    const target = resolve(scratch, 'target');
    const linked = resolve(scratch, 'linked');
    await cp(server.projects.legacy, target, { recursive: true });
    await symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir');

    try {
      for (const [label, roots, expected] of [
        ['empty', [], /supplied no project roots/iu],
        [
          'multiple',
          [
            { uri: pathToFileURL(server.projects.legacy).href },
            { uri: pathToFileURL(server.projects.modern).href },
          ],
          /ambiguous/iu,
        ],
        ['invalid-scheme', [{ uri: 'https://example.invalid/project' }], /non-file/iu],
        [
          'missing',
          [{ uri: pathToFileURL(resolve(scratch, 'missing')).href }],
          /none of the project roots/iu,
        ],
      ] as const) {
        await withModernClient(
          () => Promise.resolve({ roots: [...roots] }),
          async (client, requested) => {
            const result = await client.callTool(
              { name: 'inspect_project', arguments: {} },
              { timeout: 30_000 },
            );
            expect(result.isError, label).toBe(true);
            expect(text(result), label).toMatch(expected);
            expect(requested(), label).toBe(1);
          },
        );
      }

      await withModernClient(
        () => Promise.resolve({ roots: [{ uri: pathToFileURL(linked).href }] }),
        async (client, requested) => {
          const result = await client.callTool(
            { name: 'inspect_project', arguments: {} },
            { timeout: 30_000 },
          );
          expect(result.isError).not.toBe(true);
          expect(result.structuredContent).toMatchObject({ layout: 'legacy' });
          expect(requested()).toBe(1);
        },
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }, 180_000);

  it('[E2E-MODERN-INPUT-REQUIRED-OUTCOMES] reports an unsupported modern interaction without claiming the client offered nothing', async () => {
    const connection = await connectStdio(process.execPath, [server.cli], {
      protocolVersion: '2026-07-28',
      timeoutMs: 20_000,
      clientOptions: { inputRequired: { autoFulfill: false } },
    });
    const processId = connection.transport.pid;
    try {
      const error = await connection.client
        .callTool({ name: 'inspect_project', arguments: {} }, { timeout: 30_000 })
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/cannot request input|required capability/iu);
      expect((error as Error).message).not.toContain('offered none');
    } finally {
      await connection.client.close();
      if (processId !== null) {
        await waitForProcessExit(processId);
      }
    }
  }, 180_000);

  it('[E2E-MODERN-INPUT-REQUIRED-ROOTS] applies the same interaction to project resources', async () => {
    await withModernClient(
      () => Promise.resolve({ roots: [{ uri: pathToFileURL(server.projects.legacy).href }] }),
      async (client, requested) => {
        const result = await client.readResource(
          { uri: 'bga://project/summary' },
          { timeout: 30_000 },
        );
        const payload = JSON.parse((result.contents[0] as { text: string }).text) as {
          layout: string;
        };
        expect(payload.layout).toBe('legacy');
        expect(requested()).toBe(1);
      },
    );
  }, 180_000);

  it('[E2E-LEGACY-CLIENT-ROOTS] retains the push-style roots interaction on the supported era', async () => {
    const connection = await connectStdio(process.execPath, [server.cli], {
      timeoutMs: 20_000,
      clientOptions: { capabilities: { roots: {} } },
    });
    let requests = 0;
    connection.client.setRequestHandler('roots/list', () => {
      requests += 1;
      return Promise.resolve({ roots: [{ uri: pathToFileURL(server.projects.legacy).href }] });
    });
    const processId = connection.transport.pid;
    try {
      const result = await connection.client.callTool(
        { name: 'inspect_project', arguments: {} },
        { timeout: 30_000 },
      );
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ layout: 'legacy' });
      expect(requests).toBe(1);
    } finally {
      await connection.client.close();
      if (processId !== null) {
        await waitForProcessExit(processId);
      }
      expect(connection.stderr()).toBe('');
    }
  }, 180_000);

  it('[E2E-MODERN-INPUT-REQUIRED-SETUP] supplies non-secret setup and proceeds in the original call', async () => {
    await withModernStudioClient(
      () => Promise.resolve({ action: 'accept', content: { accounts: STUDIO_ACCOUNT } }),
      async (client, requested) => {
        const result = await client.callTool(
          { name: 'read_studio_logs', arguments: { gameId: 'mcpverification' } },
          { timeout: 30_000 },
        );
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ ownAccounts: [STUDIO_ACCOUNT] });
        expect(requested()).toBe(1);
      },
    );
  }, 180_000);

  it('[E2E-MODERN-INPUT-REQUIRED-SETUP] distinguishes decline, no value, and unsupported setup', async () => {
    await withModernStudioClient(
      () => Promise.resolve({ action: 'decline' }),
      async (client, requested) => {
        for (let call = 0; call < 2; call += 1) {
          const result = await client.callTool(
            { name: 'read_studio_logs', arguments: { gameId: 'mcpverification' } },
            { timeout: 30_000 },
          );
          expect(result.isError).toBe(true);
          expect(text(result)).toMatch(/declined/iu);
        }
        expect(requested()).toBe(1);
      },
    );

    await withModernStudioClient(
      () => Promise.resolve({ action: 'accept', content: { accounts: '   ' } }),
      async (client, requested) => {
        const result = await client.callTool(
          { name: 'read_studio_logs', arguments: { gameId: 'mcpverification' } },
          { timeout: 30_000 },
        );
        expect(result.isError).toBe(true);
        expect(text(result)).toMatch(/no usable account/iu);
        expect(requested()).toBe(1);
      },
    );

    await withModernStudioClient(
      () => Promise.resolve({ action: 'accept', content: { accounts: STUDIO_ACCOUNT } }),
      async (client, requested) => {
        const error = await client
          .callTool(
            { name: 'read_studio_logs', arguments: { gameId: 'mcpverification' } },
            { timeout: 30_000 },
          )
          .catch((cause: unknown) => cause);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/cannot request input|required capability/iu);
        expect(requested()).toBe(0);
      },
      false,
    );
  }, 180_000);
});
