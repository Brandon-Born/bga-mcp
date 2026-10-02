import { createServer, type Server } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Client } from '@modelcontextprotocol/client';
import {
  installPackagedServer,
  withPackagedServer,
  callTool,
  type PackagedServer,
} from '../helpers/packaged.js';

const ORIGIN = 'https://en.doc.boardgamearena.com';
const WIKI = 'bga-studio-framework-reference';
const COMMUNITY = 'bga-studio-community-pages';
const FILES = '/Studio_file_reference';
const COOKBOOK = '/BGA_Studio_Cookbook';
let installed: PackagedServer<'project'>;
let upstream: Server;
let port: number;
const cleanup: { installed?: PackagedServer<'project'>; upstream?: Server } = {};
let clock: string;
let unavailable = false;
let stalled = false;
let destination: string | null = null;
let generation = 'first';
const requests = new Map<string, number>();
interface Entry {
  url: string;
  excerpt: string;
  sourceId: string;
  authority: string;
  provenance: string;
  retrievedAt: string;
  lastModified: string | null;
  lastEdited?: string | null;
  ageDays: number;
  stale: boolean;
  cached: boolean;
  trust: string;
}
async function date(day: number) {
  await writeFile(clock, new Date(Date.UTC(2026, 9, 2 + day)).toISOString());
}
function count(path: string) {
  return requests.get(path) ?? 0;
}
async function topic(client: Client, name = 'file-reference'): Promise<Entry> {
  const response = await client.readResource({ uri: `bga://docs/${name}` });
  return JSON.parse((response.contents as { text: string }[])[0]?.text ?? '{}') as Entry;
}
async function search(client: Client, query = 'project files', maxResults = 1) {
  const response = await callTool(client, 'search_bga_docs', { query, maxResults });
  expect(response.isError).toBe(false);
  return response.structured as {
    results: Entry[];
    degraded: boolean;
    failures: { scope: string; code: string }[];
  };
}
async function connect(use: (client: Client) => Promise<void>, network = true, timeoutMs?: number) {
  await date(0);
  requests.clear();
  unavailable = false;
  stalled = false;
  destination = null;
  generation = 'first';
  const result = await withPackagedServer(
    installed.cli,
    [
      '--project-root',
      installed.projects.project,
      ...(network ? ['--allow-network'] : []),
      ...(timeoutMs === undefined ? [] : ['--operation-timeout-ms', String(timeoutMs)]),
    ],
    use,
    {
      nodeArguments: [
        '--import',
        'tsx',
        '--import',
        pathToFileURL(resolve(import.meta.dirname, 'doc-network-stub.ts')).href,
        '--import',
        pathToFileURL(resolve(import.meta.dirname, 'doc-cache-clock.ts')).href,
      ],
      env: { ...process.env, BGA_MCP_DOC_STUB_PORT: String(port), BGA_MCP_DOC_CACHE_CLOCK: clock },
    },
  );
  expect(result.stderr).toBe('');
}
beforeAll(async () => {
  installed = await installPackagedServer('docs-cache-lifecycle', { project: 'modern' });
  cleanup.installed = installed;
  clock = resolve(installed.temporaryRoot, 'cache-clock.txt');
  upstream = createServer((request, response) => {
    const path = new URL(request.url ?? '/', ORIGIN).pathname;
    requests.set(path, count(path) + 1);
    if (stalled) return;
    if (unavailable) {
      response.writeHead(503);
      response.end('scripted unavailable source');
      return;
    }
    if (path === '/api.php') {
      response.end(
        JSON.stringify({
          query: {
            search: [{ title: 'Studio file reference', timestamp: '2026-10-02T00:00:00Z' }],
          },
        }),
      );
    } else if (path === FILES && destination !== null) {
      response.writeHead(302, { location: destination });
      response.end();
    } else {
      response.setHeader('last-modified', 'Fri, 02 Oct 2026 00:00:00 GMT');
      // Original synthetic prose: tests lifecycle, not BGA framework facts.
      response.end(
        `<title>Project files Cookbook</title><p>Project files and Cookbook ${generation} generation.</p>`,
      );
    }
  });
  cleanup.upstream = upstream;
  await new Promise<void>((done) => upstream.listen(0, '127.0.0.1', done));
  const address = upstream.address();
  if (address === null || typeof address === 'string') throw new Error('Missing port');
  port = address.port;
});
afterAll(async () => {
  if (cleanup.upstream !== undefined)
    await new Promise<void>((done) => cleanup.upstream?.close(() => done()));
  if (cleanup.installed !== undefined) await cleanup.installed.cleanup();
});

describe('installed documentation cache lifecycle', () => {
  it('[E2E-DOC-CACHE-WARM] exact page selections skip upstream page requests while API searches stay live', async () => {
    await connect(async (client) => {
      expect((await client.listTools()).tools.map((t) => t.name)).toContain('search_bga_docs');
      expect((await client.listResources()).resources.map((r) => r.uri)).toContain(
        'bga://docs/file-reference',
      );
      const cold = await topic(client);
      const warm = await topic(client);
      expect(cold).toMatchObject({
        cached: false,
        ageDays: 0,
        stale: false,
        sourceId: WIKI,
        trust: 'untrusted-content',
      });
      expect(warm).toEqual({ ...cold, cached: true });
      expect(count(FILES)).toBe(1);
      const first = (await search(client)).results[0];
      const second = (await search(client)).results[0];
      expect(second).toEqual({ ...first, cached: true });
      expect(count(FILES)).toBe(2);
      await search(client, 'project files', 2);
      await search(client, 'project files', 2);
      expect(count('/api.php')).toBe(2);
      expect(count(FILES)).toBe(2);
      // A different question still fetches its own excerpt.
      await search(client, 'project file locations');
      expect(count(FILES)).toBe(3);
      const beforeRefusal = [...requests];
      for (const query of ['project files <?php', 'project files /private/example/source']) {
        const refusal = await callTool(client, 'search_bga_docs', { query, maxResults: 1 });
        expect(refusal.isError).toBe(true);
        expect(refusal.text).toContain('policy.doc-request.content');
      }
      expect([...requests]).toEqual(beforeRefusal);
      unavailable = true;
      expect(await topic(client)).toEqual(warm);
      expect((await search(client)).results[0]).toEqual(second);
      expect(count(FILES)).toBe(3);
      await expect(topic(client, 'game-logic')).rejects.toThrow('policy.doc-fetch.failed');
      const unknown = await callTool(client, 'search_bga_docs', {
        query: 'states class directory',
        maxResults: 1,
      });
      expect(unknown.isError).toBe(true);
    });
    await connect(async (client) => {
      const response = await callTool(client, 'search_bga_docs', {
        query: 'project files',
        maxResults: 1,
      });
      expect(response.isError).toBe(true);
      await expect(topic(client)).rejects.toThrow('policy.network.disabled');
      expect([...requests.values()]).toEqual([]);
    }, false);
    for (const path of ['tests/e2e/doc-cache-clock.ts', 'dist/e2e/doc-cache-clock.js']) {
      await expect(readFile(resolve(installed.packageRoot, path), 'utf8')).rejects.toThrow();
    }
  });
  it('[E2E-DOC-CACHE-REFRESH] deadline expiry refuses stale fallback and the same client remains usable', async () => {
    await connect(
      async (client) => {
        await topic(client);
        await date(31);
        stalled = true;
        await expect(topic(client)).rejects.toThrow('policy.timeout.exceeded');
        stalled = false;
        expect(await topic(client)).toMatchObject({ cached: false, stale: false });
      },
      true,
      150,
    );
  });
  it('[E2E-DOC-CACHE-REFRESH] expiry refreshes changed upstream content and failed refresh preserves only dated matching excerpts', async () => {
    await connect(async (client) => {
      const original = await topic(client);
      const first = (await search(client)).results[0];
      const community = await topic(client, 'cookbook');
      expect(community).toMatchObject({
        sourceId: COMMUNITY,
        authority: 'official-host-community-edited',
        provenance: 'community',
      });
      await date(7);
      expect((await topic(client, 'cookbook')).cached).toBe(true);
      expect(count(COOKBOOK)).toBe(1);
      await date(8);
      generation = 'second';
      const refreshedCommunity = await topic(client, 'cookbook');
      expect(refreshedCommunity).toMatchObject({ cached: false, ageDays: 0, stale: false });
      expect(refreshedCommunity.excerpt).toContain('second');
      expect(count(COOKBOOK)).toBe(2);
      await date(30);
      expect((await topic(client)).cached).toBe(true);
      expect(count(FILES)).toBe(2);
      await date(31);
      unavailable = true;
      const stale = await topic(client);
      expect(stale).toMatchObject({ ...original, cached: true, stale: true, ageDays: 31 });
      const fallback = await search(client);
      expect(fallback.results[0]).toMatchObject({
        ...first,
        cached: true,
        stale: true,
        ageDays: 31,
        lastEdited: null,
      });
      expect(fallback.degraded).toBe(true);
      expect(fallback.failures).toContainEqual({
        sourceId: WIKI,
        scope: 'page',
        code: 'policy.doc-fetch.failed',
      });
      expect(
        (
          await callTool(client, 'search_bga_docs', {
            query: 'project files another question',
            maxResults: 1,
          })
        ).isError,
      ).toBe(true);
      unavailable = false;
      const refreshed = await topic(client);
      const refreshedSearch = (await search(client)).results[0];
      for (const entry of [refreshed, refreshedSearch]) {
        expect(entry).toMatchObject({ cached: false, stale: false, ageDays: 0 });
        expect(entry?.excerpt).toContain('second');
        expect(entry?.retrievedAt).not.toBe(original.retrievedAt);
      }
      expect((await topic(client)).cached).toBe(true);
    });
  });
  it('[E2E-DOC-CACHE-REDIRECT] aliases reestablish final authority and a failed or refused redirect never serves the previous destination', async () => {
    await connect(async (client) => {
      destination = COOKBOOK;
      const first = await topic(client);
      const warm = await topic(client);
      expect(warm).toMatchObject({
        ...first,
        cached: true,
        sourceId: COMMUNITY,
        url: ORIGIN + COOKBOOK,
      });
      expect(count(FILES)).toBe(2);
      expect(count(COOKBOOK)).toBe(2);
      destination = '/CookbookExtra';
      generation = 'second';
      const changed = await topic(client);
      expect(changed).toMatchObject({
        cached: false,
        sourceId: WIKI,
        authority: 'official-maintained',
        provenance: 'official',
        url: ORIGIN + '/CookbookExtra',
      });
      expect(changed.excerpt).toContain('second');
      unavailable = true;
      await expect(topic(client)).rejects.toThrow('policy.doc-fetch.failed');
      unavailable = false;
      destination = 'https://outside.example/';
      await expect(topic(client)).rejects.toThrow('policy.doc-source.not-allowed');
      // Expired direct entries also cannot turn an allowlist refusal into fallback.
      destination = null;
      await topic(client);
      await date(31);
      destination = 'https://outside.example/';
      await expect(topic(client)).rejects.toThrow('policy.doc-source.not-allowed');
    });
  });
  it('[E2E-DOC-CACHE-MUTATION] request-count oracle detects unconditional fetch before the installed cache', async () => {
    const path = resolve(installed.packageRoot, 'dist/docs/retrieve.js');
    const original = await readFile(path, 'utf8');
    const changed = original.replace('cached !== null && !cached.stale', 'false');
    expect(changed).not.toBe(original);
    const swap = async (text: string) => {
      await writeFile(path + '.cache-probe', text);
      await rename(path + '.cache-probe', path);
    };
    await swap(changed);
    try {
      await connect(async (client) => {
        await topic(client);
        await topic(client);
        expect(count(FILES)).toBe(2);
      });
    } finally {
      await swap(original);
      expect(await readFile(path, 'utf8')).toBe(original);
    }
  });
});
