import { createServer, type Server } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Client } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  installPackagedServer,
  withPackagedServer,
  callTool,
  type PackagedServer,
} from '../helpers/packaged.js';
import {
  evaluateDocumentation,
  type EvaluationSet,
  type ReviewedExpectations,
} from '../../scripts/lib/documentation-evaluation.js';

const root = resolve(import.meta.dirname, '../fixtures/docs/relevance');
let installed: PackagedServer<'project'>;
let upstream: Server;
let port: number;
let set: EvaluationSet;
let reviewed: ReviewedExpectations;
let oversized = false;
let degradedNoAnswer = false;
const cleanup: { installed?: PackagedServer<'project'>; upstream?: Server } = {};
const stub = pathToFileURL(resolve(import.meta.dirname, 'doc-network-stub.ts')).href;
async function probe<T>(run: (client: Client) => Promise<T>) {
  const { result, stderr } = await withPackagedServer(
    installed.cli,
    ['--project-root', installed.projects.project, '--allow-network'],
    run,
    {
      nodeArguments: ['--import', 'tsx', '--import', stub],
      env: { ...process.env, BGA_MCP_DOC_STUB_PORT: String(port) },
    },
  );
  expect(stderr).toBe('');
  return result;
}

beforeAll(async () => {
  installed = await installPackagedServer('docs-relevance', { project: 'modern' });
  cleanup.installed = installed;
  set = JSON.parse(
    await readFile(resolve(root, '../../../../config/doc-evaluation.json'), 'utf8'),
  ) as EvaluationSet;
  reviewed = JSON.parse(
    await readFile(resolve(root, 'expectations.json'), 'utf8'),
  ) as ReviewedExpectations;
  const pages = new Map(
    await Promise.all(
      reviewed.captures.map(
        async (capture) =>
          [
            new URL(capture.url).pathname,
            await readFile(resolve(root, capture.file), 'utf8'),
          ] as const,
      ),
    ),
  );
  upstream = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'https://en.doc.boardgamearena.com');
    if (url.pathname === '/api.php') {
      // Original API envelope: no inferred wiki ranking. The captured bodies,
      // curated routing and output oracle are the subjects of this replay.
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          query: {
            search:
              degradedNoAnswer &&
              url.searchParams.get('srsearch') === 'BGA documentation unsupported question'
                ? [{ title: 'Missing_page', timestamp: '2026-10-02T00:00:00Z' }]
                : [],
          },
        }),
      );
    } else if (oversized && url.pathname === '/Studio') {
      response.end(
        '<title>Studio</title><h2>Software Versions</h2><p>PHP: 8.4</p><p>' +
          (['pass', 'word'].join('') + '=' + 'a'.repeat(8) + ' ').repeat(60) +
          '</p>',
      );
    } else if (url.pathname === '/Quasar_Nebula') {
      response.end(
        '<title>Quasar Nebula</title><p>translations translation ' +
          'A'.repeat(1000) +
          '</p><p>context</p><p>notifications notification ' +
          'B'.repeat(1000) +
          '</p>',
      );
    } else {
      const page = pages.get(url.pathname);
      response.writeHead(page === undefined ? 404 : 200, { 'content-type': 'text/html' });
      response.end(page ?? 'missing scripted page');
    }
  });
  cleanup.upstream = upstream;
  await new Promise<void>((done) => upstream.listen(0, '127.0.0.1', done));
  const address = upstream.address();
  if (address === null || typeof address === 'string') throw new Error('missing stub port');
  port = address.port;
});
afterAll(async () => {
  if (cleanup.upstream !== undefined)
    await new Promise<void>((done) => cleanup.upstream?.close(() => done()));
  if (cleanup.installed !== undefined) await cleanup.installed.cleanup();
});

describe('installed captured documentation relevance', () => {
  it('[E2E-DOC-RELEVANCE-CAPTURES] scores all nine unchanged questions and seven reviewed topics through discovered MCP', async () => {
    const result = await probe(async (client) => {
      expect((await client.listTools()).tools.map((tool) => tool.name)).toContain(
        'search_bga_docs',
      );
      expect((await client.listResources()).resources.map((resource) => resource.uri)).toContain(
        'bga://docs/studio',
      );
      return evaluateDocumentation(client, set, reviewed);
    });
    expect(
      result.questions.filter((outcome) => !outcome.answered),
      JSON.stringify(result),
    ).toEqual([]);
    expect(
      result.topics.filter((outcome) => !outcome.answered),
      JSON.stringify(result),
    ).toEqual([]);
    expect(result.summary).toMatchObject({ answered: 9, attributed: 9, passed: true });
    expect(result.passed).toBe(true);
    degradedNoAnswer = true;
    try {
      const partial = await probe((client) => evaluateDocumentation(client, set, reviewed));
      expect(partial.questions.find((outcome) => outcome.id === 'no-answer')).toMatchObject({
        answered: false,
        attributed: false,
      });
      expect(partial.passed).toBe(false);
    } finally {
      degradedNoAnswer = false;
    }

    expect(
      await readFile(
        resolve(installed.packageRoot, 'tests/fixtures/docs/relevance/client.html'),
        'utf8',
      ).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  });
  it('[E2E-DOC-EXCERPT-BUDGET] cold and warm search/resources stay within 1200 characters after redaction', async () => {
    oversized = true;
    try {
      await probe(async (client) => {
        for (let i = 0; i < 2; i += 1) {
          const response = await callTool(client, 'search_bga_docs', {
            query: 'which PHP version does BGA Studio run',
            maxResults: 1,
          });
          expect(response.isError).toBe(false);
          const entry = (response.structured as { results: { excerpt: string }[] }).results[0];
          expect(entry?.excerpt).toContain('PHP: 8.4');
          expect(entry?.excerpt).not.toContain('a'.repeat(8));
          expect(entry?.excerpt.length).toBeLessThanOrEqual(1200);
          const resource = await client.readResource({ uri: 'bga://docs/studio' });
          const content = resource.contents[0];
          const text = content !== undefined && 'text' in content ? content.text : '';
          const topic = JSON.parse(text) as { excerpt: string };
          expect(topic.excerpt).not.toContain('a'.repeat(8));
          expect(topic.excerpt.length).toBeLessThanOrEqual(1200);
        }
      });
    } finally {
      oversized = false;
    }
  });
  it('[E2E-DOC-QUERY-CACHE] a changed question cannot reuse another selection on the same live client', async () => {
    // This separate original response is deliberately not a captured BGA page.
    // It is the cache defect reproducer, independent of live ranking quality.
    const path = resolve(installed.packageRoot, 'dist/docs/topics.js');
    const original = await readFile(path, 'utf8');
    const modified = original.replace("path: 'Studio_file_reference'", "path: 'Quasar_Nebula'");
    expect(modified).not.toBe(original);
    const replace = async (text: string) => {
      await writeFile(path + '.relevance-probe', text);
      await rename(path + '.relevance-probe', path);
    };
    await replace(modified);
    try {
      await probe(async (client) => {
        const ask = async (query: string) => {
          const response = await callTool(client, 'search_bga_docs', { query, maxResults: 1 });
          expect(response.isError).toBe(false);
          return (response.structured as { results: { excerpt: string; cached: boolean }[] })
            .results[0];
        };
        // Include the topic keyword to reach our scripted same page while the
        // question-specific selection remains a distinct reviewed generic question.
        expect((await ask('project translations'))?.excerpt).toContain('translations');
        expect((await ask('project notifications'))?.excerpt).toContain('notifications');
        expect((await ask('project notifications'))?.cached).toBe(true);
      });
    } finally {
      await replace(original);
    }
  });
  it('[E2E-DOC-RELEVANCE-MUTATION] the oracle detects lost navigation exclusion in the installed implementation', async () => {
    const path = resolve(installed.packageRoot, 'dist/docs/retrieve.js');
    const original = await readFile(path, 'utf8');
    const modified = original.replace(
      'documentationPassageHtml(page.body, request.query, signal)',
      'page.body',
    );
    expect(modified).not.toBe(original);
    const replace = async (text: string) => {
      await writeFile(path + '.relevance-probe', text);
      await rename(path + '.relevance-probe', path);
    };
    await replace(modified);
    try {
      const result = await probe((client) => evaluateDocumentation(client, set, reviewed));
      expect(result.passed).toBe(false);
      expect(result.topics.find((topic) => topic.id === 'studio')?.answered).toBe(false);
    } finally {
      await replace(original);
    }
  });
});
