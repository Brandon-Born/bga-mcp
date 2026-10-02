import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';

const WIKI = 'bga-studio-framework-reference';
const COMMUNITY = 'bga-studio-community-pages';
const ORIGIN = 'https://en.doc.boardgamearena.com';
const COOKBOOK = '/BGA_Studio_Cookbook';
const EXTRA = COOKBOOK + 'Extra';
const stubModule = new URL('./doc-network-stub.ts', import.meta.url).href;
let installed: PackagedServer<'legacy'>;
let stub: Server;
let port: number;
let script: (request: IncomingMessage, response: ServerResponse) => void;

interface Result {
  readonly url: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly authority: string;
  readonly provenance: string;
  readonly cached: boolean;
  readonly ageDays: number;
  readonly lastEdited: string | null;
}
function send(response: ServerResponse, path: string) {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(`<title>Cookbook ${path}</title><p>Cookbook authority boundary example.</p>`);
}
function redirect(response: ServerResponse, path: string) {
  response.writeHead(302, { location: path });
  response.end();
}
async function connect<T>(use: (client: Client) => Promise<T>): Promise<T> {
  const { result, stderr } = await withPackagedServer(
    installed.cli,
    ['--project-root', installed.projects.legacy, '--allow-network'],
    use,
    {
      nodeArguments: ['--import', 'tsx', '--import', stubModule],
      env: { ...process.env, BGA_MCP_DOC_STUB_PORT: String(port) },
    },
  );
  expect(stderr === '').toBe(true);
  return result;
}
async function search(client: Client): Promise<readonly Result[]> {
  const result = await callTool(client, 'search_bga_docs', {
    query: 'cookbook',
    sourceId: WIKI,
    maxResults: 5,
  });
  expect(result.isError).toBe(false);
  return (result.structured as { results: Result[] }).results;
}
async function resource(client: Client, topic: string): Promise<Result> {
  const response = await client.readResource({ uri: `bga://docs/${topic}` });
  return JSON.parse((response.contents as { text: string }[])[0]?.text ?? '{}') as Result;
}
function expectSource(result: Result, sourceId: string) {
  expect(result.sourceId).toBe(sourceId);
  expect(result.authority).toBe(
    sourceId === COMMUNITY ? 'official-host-community-edited' : 'official-maintained',
  );
  expect(result.provenance).toBe(sourceId === COMMUNITY ? 'community' : 'official');
  expect(result.sourceTitle).toBe(
    sourceId === COMMUNITY
      ? 'BGA Studio community pages on the official wiki'
      : 'BGA Studio framework reference',
  );
}
function searchScript(request: IncomingMessage, response: ServerResponse) {
  const path = new URL(request.url ?? '/', ORIGIN).pathname;
  if (path === '/api.php') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        query: {
          search: [
            'BGA Studio Cookbook',
            'BGA Studio CookbookExtra',
            'BGA Studio Cookbook/Subpage',
          ].map((title) => ({
            title,
            snippet: 'Cookbook authority',
            timestamp: '2026-09-29T00:00:00Z',
          })),
        },
      }),
    );
  } else send(response, path);
}
async function searchOracle(): Promise<void> {
  script = searchScript;
  const results = await connect(search);
  expect(results).toHaveLength(3);
  for (const result of results)
    expectSource(result, result.url === ORIGIN + COOKBOOK ? COMMUNITY : WIKI);
  for (const result of results) expect(result.lastEdited).toBe('2026-09-29T00:00:00Z');
  script = (request, response) => {
    const path = new URL(request.url ?? '/', ORIGIN).pathname;
    if (path === '/api.php') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          query: {
            search: ['Cookbook In', 'Cookbook Out'].map((title) => ({
              title,
              timestamp: '2026-09-29T00:00:00Z',
            })),
          },
        }),
      );
    } else if (path === '/Cookbook_In') redirect(response, COOKBOOK);
    else if (path === '/Cookbook_Out') redirect(response, EXTRA);
    else send(response, path);
  };
  await connect(async (client) => {
    const response = await callTool(client, 'search_bga_docs', {
      query: 'cookbook',
      sourceId: WIKI,
      maxResults: 5,
    });
    expect(response.isError).toBe(false);
    const result = response.structured as { results: Result[]; sourcesSearched: string[] };
    expect(result.results).toHaveLength(2);
    expect(result.sourcesSearched).toEqual([WIKI, COMMUNITY]);
    for (const entry of result.results) {
      expectSource(entry, entry.url === ORIGIN + COOKBOOK ? COMMUNITY : WIKI);
      expect(entry.lastEdited).toBeNull();
    }
  });
}
async function resourceOracle(): Promise<void> {
  script = (request, response) => {
    const path = new URL(request.url ?? '/', ORIGIN).pathname;
    if (path === COOKBOOK) redirect(response, EXTRA + '?view=reference#section');
    else if (path === '/Studio_file_reference')
      redirect(response, COOKBOOK + '?view=reference#section');
    else send(response, path);
  };
  await connect(async (client) => {
    const out = await resource(client, 'cookbook');
    expectSource(out, WIKI);
    expect(out.url).toBe(ORIGIN + EXTRA + '?view=reference#section');
    // Switch the next request's destination, leaving the same actual client alive.
    script = (request, response) => {
      const path = new URL(request.url ?? '/', ORIGIN).pathname;
      if (path === '/Studio_file_reference')
        redirect(response, COOKBOOK + '?view=reference#section');
      else send(response, path);
    };
    const into = await resource(client, 'file-reference');
    expectSource(into, COMMUNITY);
    expect(into.url).toBe(ORIGIN + COOKBOOK + '?view=reference#section');
    script = (request, response) => {
      const path = new URL(request.url ?? '/', ORIGIN).pathname;
      if (path === '/Studio') redirect(response, COOKBOOK);
      else send(response, path);
    };
    const versions = await client.readResource({ uri: 'bga://framework/version' });
    expect(JSON.parse((versions.contents as { text: string }[])[0]?.text ?? '{}')).toMatchObject({
      sourceId: COMMUNITY,
      authority: 'official-host-community-edited',
      provenance: 'community',
      url: ORIGIN + COOKBOOK,
      status: 'unknown',
    });
  });
}
async function installedProbe(code: string): Promise<unknown> {
  const result = await runCommand(
    process.execPath,
    ['--import', 'tsx', '--import', stubModule, '--input-type=module', '-e', code],
    { timeoutMs: 30_000, env: { ...process.env, BGA_MCP_DOC_STUB_PORT: String(port) } },
  );
  // Diagnostics stay out of assertion text even if an installed probe refuses.
  expect(result.exitCode).toBe(0);
  expect(result.stderr === '').toBe(true);
  return JSON.parse(result.stdout) as unknown;
}
function moduleUrl(path: string) {
  return JSON.stringify(pathToFileURL(resolve(installed.packageRoot, path)).href);
}
const variants = [
  COOKBOOK,
  COOKBOOK + '?view=reference#section',
  EXTRA,
  COOKBOOK + '/Subpage',
  COOKBOOK + '%2FSubpage',
  COOKBOOK + '%3Fview=reference',
  COOKBOOK + '%23section',
  '/%42GA_Studio_Cookbook',
  '/bga_studio_cookbook',
  COOKBOOK + '/',
  '/index.php?title=BGA_Studio_Cookbook',
  '/folder/../BGA_Studio_Cookbook',
];
async function catalogOracle(): Promise<void> {
  const urls = variants
    .map((path) => ORIGIN + path)
    .concat([
      'http://en.doc.boardgamearena.com' + COOKBOOK,
      ORIGIN + ':444' + COOKBOOK,
      'https://en.doc.boardgamearena.com.evil.example' + COOKBOOK,
      'https://user@en.doc.boardgamearena.com' + COOKBOOK,
    ]);
  const result = await installedProbe(`
    import { readFile } from 'node:fs/promises';
    import { parseDocumentationCatalog, sourceForUrl } from ${moduleUrl('dist/docs/catalog.js')};
    const catalog = parseDocumentationCatalog(await readFile(new URL(${moduleUrl('config/doc-sources.json')}), 'utf8'));
    console.log(JSON.stringify(${JSON.stringify(urls)}.map(url => sourceForUrl(catalog, new URL(url))?.id ?? null)));
  `);
  expect(result).toEqual([
    ...variants.map((_, index) => ([0, 1, 11].includes(index) ? COMMUNITY : WIKI)),
    null,
    null,
    null,
    null,
  ]);
}
async function policyOracle(): Promise<void> {
  script = (request, response) => send(response, request.url ?? '/');
  const paths = [
    'BGA_Studio_CookbookExtra',
    'BGA_Studio_Cookbook/Subpage',
    'BGA_Studio_Cookbook%2FSubpage',
    'bga_studio_cookbook',
  ];
  const result = await installedProbe(`
    import { createPolicyBoundary } from ${moduleUrl('dist/policy.js')};
    const policy = await createPolicyBoundary({networkEnabled:true});
    const results = [];
    for (const path of ${JSON.stringify(paths)}) {
      try { await policy.fetchDocumentation({sourceId:${JSON.stringify(COMMUNITY)},path}); results.push('accepted'); }
      catch(error) { results.push(error.code); }
    }
    console.log(JSON.stringify(results));
  `);
  expect(result).toEqual(paths.map(() => 'policy.doc-source.not-allowed'));
}
async function altered(
  path: string,
  replace: (text: string) => string,
  use: () => Promise<void>,
): Promise<void> {
  const absolute = resolve(installed.packageRoot, path);
  const original = await readFile(absolute, 'utf8');
  const changed = replace(original);
  expect(changed).not.toBe(original);
  // Atomic replacement leaves shared pnpm hardlinks untouched.
  const swap = async (text: string) => {
    await writeFile(absolute + '.authority-probe', text);
    await rename(absolute + '.authority-probe', absolute);
  };
  try {
    await swap(changed);
    await use();
  } finally {
    await swap(original);
    expect(await readFile(absolute, 'utf8')).toBe(original);
  }
}
async function cacheOracle(): Promise<void> {
  await altered(
    'dist/docs/cache.js',
    (source) =>
      source.replace(
        'excerpt: entry.excerpt.slice',
        'retrievedAt: new Date(Date.now() - 10 * 86400000).toISOString(),\n            excerpt: entry.excerpt.slice',
      ),
    async () => {
      script = searchScript;
      await connect(async (client) => {
        await search(client);
        const results = await search(client);
        expect(results).toHaveLength(3);
        for (const result of results) {
          const owner = result.url === ORIGIN + COOKBOOK ? COMMUNITY : WIKI;
          expectSource(result, owner);
          expect(result.cached).toBe(owner === WIKI);
          if (owner === WIKI) expect(result.ageDays).toBe(10);
        }
        script = (request, response) => {
          const path = new URL(request.url ?? '/', ORIGIN).pathname;
          if (path === COOKBOOK) redirect(response, EXTRA);
          else send(response, path);
        };
        await resource(client, 'cookbook');
        const out = await resource(client, 'cookbook');
        expectSource(out, WIKI);
        expect(out.cached).toBe(true);
        expect(out.ageDays).toBe(10);
        script = (request, response) => {
          const path = new URL(request.url ?? '/', ORIGIN).pathname;
          if (path === '/Studio_file_reference') redirect(response, COOKBOOK);
          else send(response, path);
        };
        await resource(client, 'file-reference');
        const into = await resource(client, 'file-reference');
        expectSource(into, COMMUNITY);
        expect(into.cached).toBe(false);
      });
    },
  );
}
beforeAll(async () => {
  installed = await installPackagedServer('docs-authority', { legacy: 'legacy' });
  script = (_request, response) => send(response, '/');
  stub = createServer((request, response) => script(request, response));
  await new Promise<void>((ready) => stub.listen(0, '127.0.0.1', ready));
  const address = stub.address();
  port = typeof address === 'object' && address !== null ? address.port : 0;
}, 240_000);
afterAll(async () => {
  await new Promise<void>((ready) => stub.close(() => ready()));
  await installed.cleanup();
});

describe('installed documentation page authority', () => {
  it(
    '[E2E-DOC-AUTHORITY-CATALOG] classifies exact normalized pages and reviewed site fallback',
    catalogOracle,
  );
  it(
    '[E2E-DOC-AUTHORITY-POLICY] refuses using a page-specific source for prefix neighbours',
    policyOracle,
  );
  it(
    '[E2E-DOC-AUTHORITY-SEARCH] preserves each result page source rather than a text prefix',
    searchOracle,
  );
  it(
    '[E2E-DOC-AUTHORITY-RESOURCES] reclassifies topic redirects into and out of the Cookbook',
    resourceOracle,
  );
  it(
    '[E2E-DOC-AUTHORITY-CACHE] applies final-page 7/30-day retention on repeated search calls',
    cacheOracle,
  );
  it('[E2E-DOC-AUTHORITY-REDIRECTS] sends each hop with its owning policy and returns final provenance', async () => {
    const observed: { path: string; agent: string }[] = [];
    script = (request, response) => {
      const path = new URL(request.url ?? '/', ORIGIN).pathname;
      observed.push({ path, agent: String(request.headers['user-agent']) });
      if (path === '/Into') redirect(response, COOKBOOK + '?view=reference#section');
      else if (path === COOKBOOK) redirect(response, EXTRA);
      else send(response, path);
    };
    await altered(
      'config/doc-sources.json',
      (text) => {
        const catalog = JSON.parse(text) as {
          sources: { id: string; retrieval: { userAgent: string } }[];
        };
        for (const source of catalog.sources)
          source.retrieval.userAgent =
            source.id === WIKI ? 'authority-probe-root' : 'authority-probe-page';
        return JSON.stringify(catalog);
      },
      async () => {
        const result = await installedProbe(`
        import { createPolicyBoundary } from ${moduleUrl('dist/policy.js')};
        const policy = await createPolicyBoundary({networkEnabled:true});
        const page = await policy.fetchDocumentation({sourceId:${JSON.stringify(WIKI)},path:'Into'});
        console.log(JSON.stringify({sourceId:page.sourceId,authority:page.authority,url:page.url}));
      `);
        expect(result).toEqual({
          sourceId: WIKI,
          authority: 'official-maintained',
          url: ORIGIN + EXTRA,
        });
      },
    );
    expect(observed).toEqual([
      { path: '/Into', agent: 'authority-probe-root' },
      { path: COOKBOOK, agent: 'authority-probe-page' },
      { path: EXTRA, agent: 'authority-probe-root' },
    ]);
  });
  it('[E2E-DOC-AUTHORITY-MUTATION] a seeded raw prefix fails catalog, policy, search, resources and cache', async () => {
    await altered(
      'dist/docs/catalog.js',
      (source) =>
        source.replace(
          "return canonical.pathname === '/' || url.pathname === canonical.pathname;",
          'return url.href.startsWith(source.canonicalUrl);',
        ),
      async () => {
        for (const oracle of [
          catalogOracle,
          policyOracle,
          searchOracle,
          resourceOracle,
          cacheOracle,
        ])
          await expect(oracle()).rejects.toThrow();
      },
    );
  }, 120_000);
});
