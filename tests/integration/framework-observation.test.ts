import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import { Readable } from 'node:stream';

import { ERROR_CODES } from '../../src/errors.js';
import {
  DEFAULT_OPERATION_TIMEOUT_MS,
  FRAMEWORK_REPLACEMENTS,
  MAX_DOCUMENTATION_BYTES,
  PolicyBoundary,
} from '../../src/policy.js';

const { request, resolve4, resolve6 } = vi.hoisted(() => ({
  request: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));
vi.mock('node:https', () => ({ request }));
vi.mock('node:dns', () => ({
  Resolver: class {
    resolve4 = resolve4;
    resolve6 = resolve6;
    cancel = vi.fn();
  },
}));
const pages = FRAMEWORK_REPLACEMENTS.flatMap(({ pages: urls }) => [...urls]);
const page = FRAMEWORK_REPLACEMENTS[0].pages[0];

function response(
  statusCode: number,
  headers: Record<string, string>,
  body = '<p>Official text</p>',
) {
  return Object.assign(Readable.from([Buffer.from(body)]), { statusCode, headers });
}

function installResponse(incoming: ReturnType<typeof response>) {
  request.mockImplementation(
    (url: URL, options: RequestOptions, receive: (value: typeof incoming) => void) => {
      const outgoing = new EventEmitter();
      return Object.assign(outgoing, {
        end() {
          const lookup = options.lookup as unknown as (
            hostname: string,
            options: { all: boolean },
            done: (error: Error | null, addresses: { address: string; family: number }[]) => void,
          ) => void;
          lookup(url.hostname, { all: true }, (error, addresses) => {
            if (error !== null) outgoing.emit('error', error);
            else {
              expect(addresses).toEqual([{ address: '8.8.8.8', family: 4 }]);
              receive(incoming);
            }
          });
        },
      });
    },
  );
}

beforeEach(() => {
  request.mockReset();
  resolve4.mockImplementation((_name, done: (error: null, answers: string[]) => void) =>
    done(null, ['8.8.8.8']),
  );
  resolve6.mockImplementation((_name, done: (error: null, answers: string[]) => void) =>
    done(null, []),
  );
});

it('[INT-FRAMEWORK-OBSERVATION-BOUNDARY] selects only canonical pages and sends fixed headers on a direct TLS connection', async () => {
  expect(new Set(pages).size).toBe(9);
  for (const url of pages) {
    installResponse(response(200, { 'content-type': 'text/html; charset=utf-8' }));
    await expect(PolicyBoundary.fetchMaintainerFrameworkPage(url)).resolves.toBe(
      '<p>Official text</p>',
    );
    expect(request).toHaveBeenLastCalledWith(
      new URL(url),
      expect.objectContaining({
        method: 'GET',
        agent: false,
        rejectUnauthorized: true,
        headers: {
          'user-agent': 'bga-mcp (+https://github.com/Brandon-Born/bga-mcp)',
          accept: 'text/html',
          'accept-encoding': 'identity',
        },
      }),
      expect.any(Function),
    );
  }
  request.mockClear();
  const withUserInfo = new URL(page);
  withUserInfo.username = 'fixture';
  for (const url of [
    page + 'neighbour/',
    page + '?query=source',
    page + '#anchor',
    withUserInfo.href,
    page.replace('.com/', '.com:443/'),
    page.replace('.com/', '.com.evil/'),
    page.replace('https:', 'http:'),
    page.replace('/back-end/', '/other/../back-end/'),
  ])
    await expect(PolicyBoundary.fetchMaintainerFrameworkPage(url)).rejects.toMatchObject({
      code: ERROR_CODES.policyDocSourceNotAllowed,
    });
  expect(request).not.toHaveBeenCalled();
});

it('[INT-FRAMEWORK-OBSERVATION-BOUNDARY] refuses redirects, partial pages and non-HTML content', async () => {
  for (const [status, headers] of [
    [302, { location: FRAMEWORK_REPLACEMENTS[0].pages[1] }],
    [302, { location: 'https://outside.example/' }],
    [206, { 'content-type': 'text/html' }],
    [200, { 'content-type': 'application/json' }],
  ] as const) {
    const incoming = response(status, headers);
    installResponse(incoming);
    await expect(PolicyBoundary.fetchMaintainerFrameworkPage(page)).rejects.toMatchObject({
      code: ERROR_CODES.policyDocFetchFailed,
    });
  }
  expect(request).toHaveBeenCalledTimes(4);
});

it('[INT-FRAMEWORK-OBSERVATION-BOUNDARY] rejects a private DNS answer and bounds response bytes', async () => {
  installResponse(response(200, { 'content-type': 'text/html' }));
  resolve4.mockImplementationOnce((_name, done: (error: null, answers: string[]) => void) =>
    done(null, ['8.8.8.8', '127.0.0.1']),
  );
  await expect(PolicyBoundary.fetchMaintainerFrameworkPage(page)).rejects.toMatchObject({
    code: ERROR_CODES.policyDocAddressBlocked,
  });
  installResponse(
    response(200, { 'content-type': 'text/html' }, 'x'.repeat(MAX_DOCUMENTATION_BYTES + 1)),
  );
  await expect(PolicyBoundary.fetchMaintainerFrameworkPage(page)).rejects.toMatchObject({
    code: ERROR_CODES.policyOutputTooLarge,
  });
});

it('[INT-FRAMEWORK-OBSERVATION-BOUNDARY] aborts the pending request on the existing operation deadline', async () => {
  vi.useFakeTimers();
  try {
    let observedSignal: AbortSignal | undefined;
    request.mockImplementation((_url: URL, options: RequestOptions) => {
      const outgoing = new EventEmitter();
      observedSignal = options.signal;
      if (observedSignal === undefined) throw new Error('Missing request signal');
      observedSignal.addEventListener('abort', () => outgoing.emit('error', new Error('aborted')));
      return Object.assign(outgoing, { end: vi.fn() });
    });
    const refusal = expect(PolicyBoundary.fetchMaintainerFrameworkPage(page)).rejects.toMatchObject(
      {
        code: ERROR_CODES.policyTimeoutExceeded,
      },
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_OPERATION_TIMEOUT_MS);
    await refusal;
    expect(observedSignal?.aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
