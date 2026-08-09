import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

/**
 * Drives the documentation capabilities through the installed package against
 * a documentation server the test scripts.
 *
 * Every case here is a failure or a page a live wiki cannot be asked for on
 * demand: no DNS, a source that stalls, one page missing while the search
 * works, an answer nobody can parse, and the Studio page as it stood on two
 * different days. The connection is replaced by `doc-network-stub.ts`, so what
 * these prove is what the capability reports — not TLS, not the address guard,
 * and not name resolution, each of which has its own coverage.
 */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const capturesRoot = resolve(repositoryRoot, 'tests/fixtures/docs');
// Node's --import needs a URL: on Windows an absolute path is not a valid
// ESM specifier and the process refuses to start.
const stubModule = new URL('./doc-network-stub.ts', import.meta.url).href;

/** How the stub answers one request. Set per case, read by the server. */
type Script = (request: IncomingMessage, response: ServerResponse) => void;

interface SearchResult {
  readonly results?: readonly { readonly url?: string; readonly excerpt?: string }[];
  readonly sourcesSearched?: readonly string[];
  readonly sourcesAttempted?: readonly string[];
  readonly failures?: readonly {
    readonly sourceId?: string;
    readonly scope?: string;
    readonly code?: string;
  }[];
  readonly degraded?: boolean;
}

interface VersionResult {
  readonly status?: string;
  readonly reason?: string | null;
  readonly heading?: string | null;
  readonly versions?: readonly {
    readonly software?: string;
    readonly version?: string;
    readonly statedAs?: string;
  }[];
  readonly conflicts?: readonly {
    readonly software?: string;
    readonly versions?: readonly string[];
  }[];
  readonly retrievedAt?: string;
  readonly url?: string;
  readonly provenance?: string;
}

const WIKI = 'bga-studio-framework-reference';
const COMMUNITY = 'bga-studio-community-pages';

let server: PackagedServer<'legacy'>;
let stub: Server;
let stubPort: number;
let script: Script;
let currentCapture: string;
let olderCapture: string;

/** The wiki's answer shape, with as many hits as the case needs. */
function searchBody(titles: readonly string[]): string {
  return JSON.stringify({
    query: {
      search: titles.map((title) => ({
        title,
        snippet: `about <span class="searchmatch">${title}</span>`,
        timestamp: '2026-07-29T12:28:38Z',
      })),
    },
  });
}

function send(response: ServerResponse, status: number, body: string, type = 'text/html'): void {
  response.writeHead(status, { 'content-type': type });
  response.end(body);
}

/** A page that says something about what was asked, so it is not dropped as noise. */
function page(title: string, text: string): string {
  return `<html><head><title>${title}</title></head><body><p>${text}</p></body></html>`;
}

async function connect<T>(
  use: (client: Client) => Promise<T>,
  options: { readonly connect?: 'ok' | 'dns-failure'; readonly timeoutMs?: number } = {},
): Promise<T> {
  const { result } = await withPackagedServer(
    server.cli,
    [
      '--project-root',
      server.projects.legacy,
      '--allow-network',
      ...(options.timeoutMs === undefined
        ? []
        : ['--operation-timeout-ms', String(options.timeoutMs)]),
    ],
    use,
    {
      nodeArguments: ['--import', 'tsx', '--import', stubModule],
      env: {
        ...process.env,
        BGA_MCP_DOC_STUB_PORT: String(stubPort),
        BGA_MCP_DOC_STUB_CONNECT: options.connect ?? 'ok',
      },
    },
  );
  return result;
}

async function readVersion(client: Client): Promise<VersionResult> {
  const response = await client.readResource(
    { uri: 'bga://framework/version' },
    { timeout: 20_000 },
  );
  const contents = response.contents as { text?: string }[];
  return JSON.parse(contents[0]?.text ?? '{}') as VersionResult;
}

beforeAll(async () => {
  server = await installPackagedServer('docs-network', { legacy: 'legacy' });
  currentCapture = await readFile(resolve(capturesRoot, 'studio-software-versions.html'), 'utf8');
  olderCapture = await readFile(
    resolve(capturesRoot, 'studio-software-versions-2026-04-01.html'),
    'utf8',
  );

  script = (_request, response) => {
    send(response, 404, 'no script for this case');
  };
  stub = createServer((request, response) => {
    script(request, response);
  });
  await new Promise<void>((ready) => {
    stub.listen(0, '127.0.0.1', ready);
  });
  const address = stub.address();
  stubPort = typeof address === 'object' && address !== null ? address.port : 0;
}, 240_000);

afterAll(async () => {
  await new Promise<void>((closed) => {
    stub.close(() => {
      closed();
    });
  });
  await server.cleanup();
});

describe('packaged documentation search accounting', () => {
  it('[E2E-DOCS-ALL-SOURCES-UNREACHABLE] fails the lookup when nothing could be reached', async () => {
    script = (_request, response) => {
      send(response, 500, 'the stub should never be reached in this case');
    };

    const response = await connect(
      async (client) =>
        await callTool<SearchResult>(client, 'search_bga_docs', { query: 'meeple wobble' }),
      { connect: 'dns-failure' },
    );

    // The defect this owns: every fetch failed and the tool reported success
    // with "No documentation matched", which says the documentation does not
    // cover the question.
    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.doc-fetch.failed');
    expect(response.text).toContain('failed lookup rather than an empty one');
    expect(response.text).not.toContain('No documentation matched');
    // The refusal describes the failure without carrying the developer's work.
    expect(response.text).not.toContain(server.projects.legacy);
  });

  it('[E2E-DOCS-ALL-SOURCES-TIMEOUT] fails the lookup when no source answers in time', async () => {
    // A connection that is accepted and then never answered: the deadline is
    // the only thing that ends it.
    script = () => {
      /* deliberately no response */
    };

    const response = await connect(
      async (client) =>
        await callTool<SearchResult>(client, 'search_bga_docs', { query: 'meeple wobble' }, 30_000),
      { timeoutMs: 2_000 },
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.timeout.exceeded');
    expect(response.text).not.toContain('No documentation matched');
    expect(response.structured?.results).toBeUndefined();
  });

  it('[E2E-DOCS-SOURCE-DEGRADED] answers from the source that worked and names the one that did not', async () => {
    // "cookbook recipes" resolves to a community topic page and also searches
    // the wiki, so one source can fail while the other answers.
    script = (request, response) => {
      const url = request.url ?? '';
      if (url.startsWith('/api.php')) {
        send(response, 200, searchBody(['Cookbook recipes']), 'application/json');
        return;
      }
      if (url.startsWith('/BGA_Studio_Cookbook')) {
        send(response, 404, 'gone');
        return;
      }
      send(response, 200, page('Cookbook recipes', 'Community recipes for cookbook problems.'));
    };

    const response = await connect(
      async (client) =>
        await callTool<SearchResult>(client, 'search_bga_docs', { query: 'cookbook recipes' }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured?.results?.length).toBeGreaterThan(0);
    // Only the source that answered is named as searched. The community source
    // was asked and failed, and both facts are reported separately.
    expect(response.structured?.sourcesSearched).toEqual([WIKI]);
    expect(response.structured?.sourcesAttempted).toContain(COMMUNITY);
    expect(response.structured?.failures).toContainEqual({
      sourceId: COMMUNITY,
      scope: 'page',
      code: 'policy.doc-fetch.failed',
    });
    expect(response.structured?.degraded).toBe(true);
    expect(response.text).toContain('Partial result');
  });

  it('[E2E-DOCS-PAGE-DEGRADED] keeps the pages it could read when one of them fails', async () => {
    script = (request, response) => {
      const url = request.url ?? '';
      if (url.startsWith('/api.php')) {
        send(response, 200, searchBody(['Meeple storage', 'Meeple wobble']), 'application/json');
        return;
      }
      if (url.startsWith('/Meeple_wobble')) {
        send(response, 404, 'gone');
        return;
      }
      send(response, 200, page('Meeple storage', 'Storing a meeple between rounds.'));
    };

    const response = await connect(
      async (client) =>
        await callTool<SearchResult>(client, 'search_bga_docs', { query: 'meeple storage' }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured?.results).toHaveLength(1);
    // The search itself worked, so the source counts as searched and only the
    // page is reported as failed.
    expect(response.structured?.sourcesSearched).toEqual([WIKI]);
    expect(response.structured?.failures).toEqual([
      { sourceId: WIKI, scope: 'page', code: 'policy.doc-fetch.failed' },
    ]);
    expect(response.structured?.degraded).toBe(true);
  });

  it('[E2E-DOCS-SEARCH-UNREADABLE] refuses when the only source answers with something it cannot read', async () => {
    script = (request, response) => {
      const url = request.url ?? '';
      if (url.startsWith('/api.php')) {
        // A proxy interception page, an API error, a truncated body: all the
        // same to a parser, and none of them is "nothing matched".
        send(response, 200, '<html>we are down for maintenance</html>');
        return;
      }
      send(response, 200, page('Meeple wobble', 'Nothing to see.'));
    };

    const response = await connect(
      async (client) =>
        await callTool<SearchResult>(client, 'search_bga_docs', { query: 'meeple wobble' }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.doc-fetch.failed');
    expect(response.text).not.toContain('No documentation matched');
  });

  it('[E2E-DOCS-NO-MATCH] reports a search that genuinely found nothing as an empty result', async () => {
    script = (request, response) => {
      const url = request.url ?? '';
      if (url.startsWith('/api.php')) {
        send(response, 200, JSON.stringify({ query: { search: [] } }), 'application/json');
        return;
      }
      send(response, 404, 'no page');
    };

    const response = await connect(
      async (client) =>
        await callTool<SearchResult>(client, 'search_bga_docs', { query: 'meeple wobble' }),
    );

    // The distinction the whole item is about: this one really is an answer.
    expect(response.isError).toBe(false);
    expect(response.structured?.results).toEqual([]);
    expect(response.structured?.sourcesSearched).toEqual([WIKI]);
    expect(response.structured?.degraded).toBe(false);
    expect(response.structured?.failures).toEqual([]);
    expect(response.text).toContain('No documentation matched');
    expect(response.text).not.toContain('Partial result');
  });

  it('[E2E-DOCS-SOURCE-WITHOUT-SEARCH] says a source cannot be searched rather than finding nothing in it', async () => {
    script = (_request, response) => {
      send(response, 500, 'nothing should be requested');
    };

    const response = await connect(
      async (client) =>
        await callTool<SearchResult>(client, 'search_bga_docs', {
          query: 'meeple wobble',
          sourceId: COMMUNITY,
        }),
    );

    // This source is one page, reachable through bga://docs/cookbook. Asking
    // it a question searched nothing, so an empty result would be a lie about
    // what was tried.
    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.doc-source.not-allowed');
    expect(response.text).toContain('bga://docs/');
  });
});

describe('packaged framework version resource', () => {
  it('[E2E-FRAMEWORK-VERSION-CURRENT] reads the section of the page as captured', async () => {
    script = (_request, response) => {
      send(response, 200, currentCapture);
    };

    const reading = await connect(readVersion);

    expect(reading.status).toBe('read');
    expect(reading.heading).toBe('Software Versions');
    expect(reading.versions?.map((entry) => [entry.software, entry.version])).toEqual([
      ['Dojo Toolkit', '1.15'],
      ['PHP', '8.4'],
      ['SQL', '5.7'],
      ['SQL', '8.0'],
      ['Font Awesome', '4.7'],
      ['Font Awesome', '6.4.0'],
    ]);
    // The reading that shipped returned one value: a forum announcement URL,
    // taken from the navigation that followed the table-of-contents entry.
    expect(reading.versions?.every((entry) => (entry.statedAs ?? '').length > 0)).toBe(true);
    expect(reading.versions?.some((entry) => (entry.statedAs ?? '').includes('forum'))).toBe(false);
    // A value without a date is not a fact about anything: the page changes.
    expect(reading.retrievedAt ?? '').toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(reading.url).toContain('/Studio');
    expect(reading.provenance).toBe('official');
  });

  it('[E2E-FRAMEWORK-VERSION-STALE] reads the page in front of it, not the one it read before', async () => {
    script = (_request, response) => {
      send(response, 200, olderCapture);
    };

    const reading = await connect(readVersion);

    expect(reading.status).toBe('read');
    // The same page as it stood on 2026-04-01: one SQL value, not two.
    expect(reading.versions?.filter((entry) => entry.software === 'SQL')).toHaveLength(1);
    expect(
      reading.versions?.find((entry) => entry.software === 'Dojo Toolkit')?.statedAs,
    ).not.toContain('deprecated');
  });

  it('[E2E-FRAMEWORK-VERSION-MISSING] reports unknown when the page states no versions', async () => {
    script = (_request, response) => {
      send(
        response,
        200,
        page('Studio', 'Everything you need to know about developing on BGA Studio.'),
      );
    };

    const reading = await connect(readVersion);

    expect(reading.status).toBe('unknown');
    expect(reading.versions).toEqual([]);
    expect(reading.reason ?? '').not.toBe('');
  });

  it('[E2E-FRAMEWORK-VERSION-CONFLICTING] reports two stated versions rather than choosing one', async () => {
    script = (_request, response) => {
      send(
        response,
        200,
        currentCapture.replace('<li>PHP: 8.4</li>', '<li>PHP: 8.4</li><li>PHP: 8.2</li>'),
      );
    };

    const reading = await connect(readVersion);

    expect(reading.status).toBe('read');
    expect(reading.conflicts).toContainEqual({ software: 'PHP', versions: ['8.4', '8.2'] });
    // Both readings survive to the client, each with the line it came from.
    expect(reading.versions?.filter((entry) => entry.software === 'PHP')).toHaveLength(2);
  });
});
