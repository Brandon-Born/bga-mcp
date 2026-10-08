import { createServer, type Server } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Client } from '@modelcontextprotocol/client';
import {
  installPackagedServer,
  withPackagedServer,
  callTool,
  type PackagedServer,
} from '../helpers/packaged.js';

// The third-party socket is scripted; URL confinement and body-budget decisions
// remain the installed implementation. This does not establish TLS or DNS.
const stub = new URL('./doc-network-stub.ts', import.meta.url).href;
let installed: PackagedServer<'project'>;
let upstream: Server;
let port: number;
let mode: 'redirect' | 'oversized' | 'page' = 'page';
let requests: string[] = [];
const cleanup: { installed?: PackagedServer<'project'>; upstream?: Server } = {};

async function replace(path: string, text: string) {
  await writeFile(path + '.boundary-probe', text);
  await rename(path + '.boundary-probe', path);
}

async function probe<T>(run: (client: Client) => Promise<T>, network = true) {
  requests = [];
  const { result, stderr } = await withPackagedServer(
    installed.cli,
    ['--project-root', installed.projects.project, ...(network ? ['--allow-network'] : [])],
    run,
    {
      nodeArguments: ['--import', 'tsx', '--import', stub],
      env: { ...process.env, BGA_MCP_DOC_STUB_PORT: String(port) },
    },
  );
  expect(stderr).toBe('');
  return result;
}

async function refusal(client: Client) {
  try {
    await client.readResource({ uri: 'bga://docs/studio' });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('The installed documentation resource should refuse this request.');
}

beforeAll(async () => {
  installed = await installPackagedServer('docs-boundary', { project: 'modern' });
  cleanup.installed = installed;
  upstream = createServer((request, response) => {
    requests.push(request.url ?? '');
    if (mode === 'redirect' && request.url === '/Studio') {
      response.writeHead(302, { location: 'https://unreviewed.invalid/Private' });
      response.end();
    } else if (mode === 'oversized') {
      response.end('x'.repeat(524_289));
    } else {
      response.end('<title>Studio</title><h2>Software Versions</h2><p>PHP: 8.4</p>');
    }
  });
  cleanup.upstream = upstream;
  await new Promise<void>((done) => upstream.listen(0, '127.0.0.1', done));
  const address = upstream.address();
  if (address === null || typeof address === 'string') throw new Error('Missing scripted port.');
  port = address.port;
}, 240_000);

afterAll(async () => {
  if (cleanup.upstream !== undefined)
    await new Promise<void>((done) => cleanup.upstream?.close(() => done()));
  if (cleanup.installed !== undefined) await cleanup.installed.cleanup();
});

describe('installed documentation boundary obligations', () => {
  it('[E2E-DOC-BOUNDARY-CONFINEMENT] refuses HTTP catalog URLs and unknown sources before any outbound request', async () => {
    await probe(async (client) => {
      const response = await callTool(client, 'search_bga_docs', {
        query: 'studio',
        sourceId: 'unreviewed-source',
      });
      expect(response.isError).toBe(true);
      expect(response.text).toContain('policy.doc-source.not-allowed');
    });
    expect(requests).toEqual([]);

    const path = resolve(installed.packageRoot, 'config/doc-sources.json');
    const original = await readFile(path, 'utf8');
    const modified = original.replaceAll(
      'https://en.doc.boardgamearena.com/',
      'http://en.doc.boardgamearena.com/',
    );
    expect(modified).not.toBe(original);
    await replace(path, modified);
    try {
      await probe(async (client) => {
        expect(await refusal(client)).toContain('policy.doc-source.not-allowed');
        expect((await callTool(client, 'check_setup', {})).isError).toBe(false);
      });
      expect(requests).toEqual([]);
    } finally {
      await replace(path, original);
    }
  });

  it('[E2E-DOC-BOUNDARY-CONFINEMENT] refuses an off-catalog redirect and the installed guard-removal control crosses it', async () => {
    mode = 'redirect';
    try {
      await probe(async (client) => {
        expect(await refusal(client)).toContain('policy.doc-source.not-allowed');
        expect((await callTool(client, 'check_setup', {})).isError).toBe(false);
      });
      expect(requests).toEqual(['/Studio']);
      const path = resolve(installed.packageRoot, 'dist/policy.js');
      const original = await readFile(path, 'utf8');
      const modified = original.replace(
        'const hopSource = sourceForUrl(catalog, current);',
        'const hopSource = sourceForUrl(catalog, current) ?? source;',
      );
      expect(modified).not.toBe(original);
      await replace(path, modified);
      try {
        await probe((client) => client.readResource({ uri: 'bga://docs/studio' }));
        expect(requests).toEqual(['/Studio', '/Private']);
      } finally {
        await replace(path, original);
      }
    } finally {
      mode = 'page';
    }
  });

  it('[E2E-DOC-BOUNDARY-BODY-BUDGET] refuses an oversized successful body and leaves the same client responsive', async () => {
    mode = 'oversized';
    try {
      await probe(async (client) => {
        const message = await refusal(client);
        expect(message).toContain('policy.output.too-large');
        expect(message).not.toContain('x'.repeat(80));
        expect((await callTool(client, 'check_setup', {})).isError).toBe(false);
      });
      expect(requests).toEqual(['/Studio']);
    } finally {
      mode = 'page';
    }
    await probe((client) => client.readResource({ uri: 'bga://docs/studio' }));
    expect(requests).toEqual(['/Studio']);
  });
});
