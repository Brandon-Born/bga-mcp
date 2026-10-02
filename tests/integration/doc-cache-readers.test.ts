import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { vi } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../../src/config.js';
import { createServerWithPolicy } from '../../src/server.js';
import {
  createPolicyBoundary,
  type PolicyBoundary,
  type DocumentationResponse,
} from '../../src/policy.js';
import { DocumentationCache } from '../../src/docs/cache.js';
import { readDocumentationPage } from '../../src/docs/retrieve.js';
import { BgaMcpError, ERROR_CODES } from '../../src/errors.js';

const WIKI = 'bga-studio-framework-reference';
const COMMUNITY = 'bga-studio-community-pages';
const ORIGIN = 'https://en.doc.boardgamearena.com/';
const FIRST = new Date('2026-10-02T00:00:00Z');
function page(path: string, sourceId = WIKI): DocumentationResponse {
  const body =
    '<title>Project files Cookbook</title><p>Project files Cookbook original synthetic lifecycle example.</p>';
  return {
    url: ORIGIN + path,
    sourceId,
    authority: sourceId === COMMUNITY ? 'official-host-community-edited' : 'official-maintained',
    status: 200,
    body,
    bytes: Buffer.byteLength(body),
    retrievedAt: new Date().toISOString(),
    lastModified: null,
    redirects: [],
  };
}
function advance(days: number) {
  vi.setSystemTime(new Date(FIRST.getTime() + days * 86400000));
}
async function session(
  setup: (policy: PolicyBoundary) => void,
  use: (client: Client) => Promise<void>,
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIRST);
  const prepared = await createServerWithPolicy({ ...DEFAULT_SERVER_CONFIG, networkEnabled: true });
  setup(prepared.policy);
  const server = prepared.create();
  const client = new Client({ name: 'cache-integration', version: '1' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(right);
    await client.connect(left);
    await use(client);
  } finally {
    await client.close();
    await server.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
}
async function topic(client: Client) {
  const resource = await client.readResource({ uri: 'bga://docs/file-reference' });
  return JSON.parse((resource.contents as { text: string }[])[0]?.text ?? '{}') as {
    cached: boolean;
    stale: boolean;
    ageDays: number;
    sourceId: string;
    retrievedAt: string;
  };
}
async function search(client: Client, arguments_: Record<string, unknown>) {
  const result = await client.callTool({ name: 'search_bga_docs', arguments: arguments_ });
  return {
    error: result.isError === true,
    value: result.structuredContent as {
      results: { cached: boolean; stale: boolean; lastEdited: string | null }[];
      degraded: boolean;
      failures: { code: string }[];
    },
  };
}

it('[INT-DOC-CACHE-LIFECYCLE] in-process readers reuse pages and date failed refreshes while API discovery stays live', async () => {
  let outage = false;
  const requests: string[] = [];
  await session(
    (policy) => {
      // Script the external response at policy's fetch seam. This integration
      // test is supporting coverage, never evidence about real DNS/TLS or MCP stdio.
      vi.spyOn(policy, 'fetchDocumentation').mockImplementation((request) => {
        requests.push(request.path);
        if (outage)
          throw new BgaMcpError(ERROR_CODES.policyDocFetchFailed, 'scripted unavailable upstream');
        if (request.path === 'api.php')
          return Promise.resolve({
            ...page(request.path),
            body: JSON.stringify({
              query: {
                search: [{ title: 'Studio file reference', timestamp: '2026-10-02T00:00:00Z' }],
              },
            }),
          });
        return Promise.resolve(page(request.path));
      });
    },
    async (client) => {
      const first = await topic(client);
      expect((await topic(client)).cached).toBe(true);
      const args = { query: 'project files', sourceId: WIKI, maxResults: 1 };
      expect((await search(client, args)).value.results[0]?.cached).toBe(false);
      expect((await search(client, args)).value.results[0]).toMatchObject({
        cached: true,
        lastEdited: null,
      });
      expect(requests.filter((path) => path === 'Studio_file_reference')).toHaveLength(2);
      expect(requests.filter((path) => path === 'api.php')).toHaveLength(2);
      // Store the curated lookup separately from the API-discovered selection.
      await search(client, { query: 'project files', maxResults: 1 });
      advance(31);
      outage = true;
      expect(await topic(client)).toMatchObject({
        ...first,
        cached: true,
        stale: true,
        ageDays: 31,
      });
      const fallback = await search(client, { query: 'project files', maxResults: 1 });
      expect(fallback.error).toBe(false);
      expect(fallback.value.degraded).toBe(true);
      expect(fallback.value.results[0]).toMatchObject({
        cached: true,
        stale: true,
        lastEdited: null,
      });
      expect(fallback.value.failures[0]?.code).toBe(ERROR_CODES.policyDocFetchFailed);
      // With API discovery unavailable an uncurated question cannot invent hits.
      expect(
        (await search(client, { query: 'unsupported nebula orbit', sourceId: WIKI, maxResults: 1 }))
          .error,
      ).toBe(true);
      outage = false;
      expect((await topic(client)).cached).toBe(false);
      expect((await topic(client)).retrievedAt).not.toBe(first.retrievedAt);
    },
  );
});
it('[INT-DOC-CACHE-LIFECYCLE] redirected readers reestablish final ownership and reject refused refreshes', async () => {
  let destination = 'BGA_Studio_Cookbook';
  let refused = false;
  await session(
    (policy) => {
      vi.spyOn(policy, 'fetchDocumentation').mockImplementation(() => {
        if (refused)
          throw new BgaMcpError(ERROR_CODES.policyDocAddressBlocked, 'scripted refused address');
        return Promise.resolve({
          ...page(destination, destination === 'BGA_Studio_Cookbook' ? COMMUNITY : WIKI),
          redirects: [ORIGIN + 'Studio_file_reference'],
        });
      });
    },
    async (client) => {
      expect(await topic(client)).toMatchObject({ sourceId: COMMUNITY, cached: false });
      expect(await topic(client)).toMatchObject({ sourceId: COMMUNITY, cached: true });
      destination = 'CookbookExtra';
      expect(await topic(client)).toMatchObject({ sourceId: WIKI, cached: false });
      refused = true;
      await expect(topic(client)).rejects.toThrow(ERROR_CODES.policyDocAddressBlocked);
    },
  );
});
it('[INT-DOC-CACHE-LIFECYCLE] cached page preparation rejects invalid sources, paths, lost permission and cancellation', async () => {
  const policy = await createPolicyBoundary({ networkEnabled: true });
  const cache = new DocumentationCache();
  const request = { sourceId: WIKI, path: 'Studio', query: 'project files', maxExcerptChars: 1200 };
  const signal = new AbortController().signal;
  const fetch = vi.spyOn(policy, 'fetchDocumentation').mockResolvedValue(page('Studio'));
  try {
    await readDocumentationPage(policy, cache, request, signal);
    await expect(
      readDocumentationPage(policy, cache, { ...request, sourceId: 'missing' }, signal),
    ).rejects.toMatchObject({ code: ERROR_CODES.policyDocSourceNotAllowed });
    await expect(
      readDocumentationPage(policy, cache, { ...request, path: '//outside.example' }, signal),
    ).rejects.toMatchObject({ code: ERROR_CODES.policyDocSourceNotAllowed });
    const abort = new AbortController();
    abort.abort(new BgaMcpError(ERROR_CODES.policyTimeoutExceeded, 'expired'));
    await expect(readDocumentationPage(policy, cache, request, abort.signal)).rejects.toThrow(
      'expired',
    );
    fetch.mockResolvedValue({ ...page('Other'), sourceId: 'unreviewed' });
    await expect(
      readDocumentationPage(policy, cache, { ...request, path: 'Other' }, signal),
    ).rejects.toMatchObject({ code: ERROR_CODES.policyDocSourceNotAllowed });
    const denied = await createPolicyBoundary({});
    await expect(readDocumentationPage(denied, cache, request, signal)).rejects.toMatchObject({
      code: ERROR_CODES.policyNetworkDisabled,
    });
  } finally {
    vi.restoreAllMocks();
  }
});
