import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
  type ToolResponse,
} from '../helpers/packaged.js';

/**
 * Proves the installed server refuses a non-public address however it is
 * written, and connects to nothing when it does.
 *
 * The address guard is the only thing standing between an allowlisted hostname
 * and the developer's own network, and a hostile or mistaken DNS record is the
 * input it exists for. Nobody can arrange that for a name they do not control,
 * so `dns-stub.ts` supplies the answer and records what the socket did with
 * it. Everything else — the guard, the lookup wiring, the tool, the transport
 * — is the installed build.
 */

// Node's --import needs a URL: on Windows an absolute path is not a valid ESM
// specifier and the process refuses to start.
const stubModule = new URL('./dns-stub.ts', import.meta.url).href;

interface LogEntry {
  readonly kind: 'lookup' | 'socket-lookup' | 'connect';
  readonly hostname?: string;
  readonly address?: string;
  readonly error?: string | null;
  readonly call?: number;
  readonly approved?: number;
}

/** The same host, written the ways a resolver may answer with it. */
const LOOPBACK_SPELLINGS: readonly { readonly address: string; readonly family: number }[] = [
  { address: '127.0.0.1', family: 4 },
  // The three the 2026-08-08 review reached through the guard.
  { address: '::ffff:7f00:1', family: 6 },
  { address: '::ffff:a00:1', family: 6 },
  { address: '::ffff:c0a8:101', family: 6 },
  { address: '0:0:0:0:0:ffff:7f00:0001', family: 6 },
  { address: '::7f00:1', family: 6 },
  { address: '2002:7f00:1::', family: 6 },
  { address: 'fe80::1%eth0', family: 6 },
  // An ambiguous form: loopback to a reader that takes it as octal.
  { address: '0177.0.0.1', family: 4 },
];

let server: PackagedServer<'legacy'>;
let logPath: string;

async function withAnswers<T>(
  answers: readonly (readonly { readonly address: string; readonly family: number }[])[],
  use: (client: Client) => Promise<T>,
  extraArguments: readonly string[] = [],
  extraEnvironment: NodeJS.ProcessEnv = {},
): Promise<T> {
  await writeFile(logPath, '');
  const { result } = await withPackagedServer(
    server.cli,
    ['--project-root', server.projects.legacy, '--allow-network', ...extraArguments],
    use,
    {
      nodeArguments: ['--import', 'tsx', '--import', stubModule],
      env: {
        ...process.env,
        ...extraEnvironment,
        BGA_MCP_DNS_LOG: logPath,
        BGA_MCP_DNS_ANSWERS: JSON.stringify(answers),
      },
    },
  );
  return result;
}

async function events(): Promise<readonly LogEntry[]> {
  const text = await readFile(logPath, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LogEntry);
}

beforeAll(async () => {
  server = await installPackagedServer('address-guard', { legacy: 'legacy' });
  logPath = resolve(server.temporaryRoot, 'dns-events.log');
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('packaged address guard', () => {
  it('[E2E-DOCS-ADDRESS-NORMALIZATION] refuses a non-public answer in every spelling, and connects to nothing', async () => {
    for (const answer of LOOPBACK_SPELLINGS) {
      const response = await withAnswers([[answer]], async (client) =>
        // A query with no curated topic, so the call makes exactly one lookup.
        callTool(client, 'search_bga_docs', { query: 'meeple wobble' }),
      );

      expect(response.isError, answer.address).toBe(true);
      // Unparseable forms are refused for being unparseable rather than
      // guessed at; either way the request never leaves the machine.
      expect(response.text, answer.address).toContain('policy.doc-address.blocked');

      const recorded = await events();
      // The name was resolved once. Nothing was connected to, and nothing
      // re-resolved it for a second, better answer.
      expect(
        recorded.filter((entry) => entry.kind === 'lookup'),
        answer.address,
      ).toHaveLength(1);
      expect(
        recorded.filter((entry) => entry.kind === 'connect'),
        answer.address,
      ).toEqual([]);
      expect(
        recorded.find((entry) => entry.kind === 'socket-lookup')?.address ?? '',
        answer.address,
      ).toBe('');
    }
  });

  it('[E2E-DOCS-ADDRESS-NORMALIZATION] refuses a name that answers with one public and one private address', async () => {
    const response = await withAnswers(
      [
        [
          { address: '93.184.216.34', family: 4 },
          { address: '::ffff:a00:1', family: 6 },
        ],
      ],
      async (client) => await callTool(client, 'search_bga_docs', { query: 'meeple wobble' }),
    );

    // Which of the two the socket would have used is not this server's choice,
    // so the name is refused rather than the answer filtered.
    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.doc-address.blocked');
    expect(response.text).toContain('private');
    expect((await events()).filter((entry) => entry.kind === 'connect')).toEqual([]);
  });

  it('[E2E-DOCS-ADDRESS-NORMALIZATION] never resolves a second time after a refusal', async () => {
    // The second answer is public. A capability that retried, or that resolved
    // again between the check and the connection, would take it and connect.
    const response = await withAnswers(
      [[{ address: '::ffff:7f00:1', family: 6 }], [{ address: '93.184.216.34', family: 4 }]],
      async (client) => await callTool(client, 'search_bga_docs', { query: 'meeple wobble' }),
    );

    expect(response.isError).toBe(true);
    const recorded = await events();
    expect(recorded.filter((entry) => entry.kind === 'lookup')).toHaveLength(1);
    expect(recorded.filter((entry) => entry.kind === 'connect')).toEqual([]);
  });

  it('[E2E-STUDIO-READ-ADDRESS-NORMALIZATION] refuses a non-public Studio answer the same way', async () => {
    const response = await withAnswers(
      [[{ address: '::ffff:7f00:1', family: 6 }]],
      async (client) =>
        await callTool(client, 'read_studio_logs', { gameId: 'mcpverification' }, 20_000),
      ['--experimental-studio-logs', '--studio-dev-account', 'testdev'],
      { BGA_STUDIO_SESSION: 'PHPSESSID=not-a-real-session' },
    );

    // The Studio path is narrower than the documentation path in every other
    // way, and it is not narrower here: same guard, same refusal.
    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.doc-address.blocked');
    // The session never appears in a published failure.
    expect(response.text).not.toContain('not-a-real-session');

    const recorded = await events();
    expect(recorded.filter((entry) => entry.kind === 'connect')).toEqual([]);
    expect(recorded.some((entry) => entry.hostname === 'studio.boardgamearena.com')).toBe(true);
  });

  it('[E2E-DOCS-ADDRESS-NORMALIZATION] hands the socket only the address it approved', async () => {
    // The socket is observed rather than connected here, because the only
    // addresses this guard approves are real ones belonging to strangers.
    const response: ToolResponse = await withAnswers(
      [
        [
          { address: '93.184.216.34', family: 4 },
          { address: '93.184.216.35', family: 4 },
        ],
      ],
      async (client) => await callTool(client, 'search_bga_docs', { query: 'meeple wobble' }),
      [],
      { BGA_MCP_DNS_OBSERVE_ONLY: '1' },
    );

    expect(response.isError).toBe(true);
    // Not an address refusal: the guard approved these, and the harness stopped
    // the socket rather than the policy.
    expect(response.text).not.toContain('policy.doc-address.blocked');

    const recorded = await events();
    const answered = recorded.filter((entry) => entry.kind === 'socket-lookup');
    expect(answered.length).toBeGreaterThan(0);
    // One approved address, pinned. The gap between checking and connecting is
    // where a second answer would otherwise be substituted.
    for (const entry of answered) {
      expect(entry.error).toBeNull();
      expect(entry.address).toBe('93.184.216.34');
      // DNS answered with two addresses and the socket was given one.
      expect(entry.approved).toBe(1);
    }
    expect(recorded.filter((entry) => entry.kind === 'connect')).toEqual([]);
  });
});
