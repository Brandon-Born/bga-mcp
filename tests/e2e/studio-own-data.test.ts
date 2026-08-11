import { createServer, type Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';

/**
 * Proves that nothing belonging to anybody else leaves the installed server,
 * through any of the places it can publish.
 *
 * The condition this capability runs under is that it returns the developer's
 * own data and nothing else. The 2026-08-08 review found that condition
 * enforced on the MCP result and nowhere else: the Studio preflight named the
 * other developers whose lines the same screen had just withheld, and the
 * integration test of the day asserted that it did. So the assertions here are
 * on surfaces rather than on functions — the tool result, the setup report, the
 * terminal check, a published failure, the process's own stderr, and a file
 * standing in for what a CI job keeps.
 *
 * The connection is replaced by `doc-network-stub.ts`, so this is not evidence
 * about TLS, DNS, or the address guard, each of which has its own coverage.
 */

// Node's --import needs a URL: on Windows an absolute path is not a valid ESM
// specifier and the process refuses to start.
const stubModule = new URL('./doc-network-stub.ts', import.meta.url).href;

const OWN_ACCOUNT = 'mytest0';
const SESSION = 'PHPSESSID=not-a-real-session';
// The Studio project name, which is what the `game` parameter carries; a live
// run on 2026-08-10 settled that (BGA-320). Nothing here depends on which.
const GAME = 'mcpverification';

/** The one line that is the developer's own, and the only thing that may come back. */
const OWN_LINE =
  "20/06 21:50:56 [info] [T403] [4/mytest0] 0.26 SELECT player_id FROM player WHERE player_id='4'";

/**
 * Every other shape the page can carry, each with a value that appears nowhere
 * else, so finding it in an output is proof of where it came from.
 */
const FOREIGN_LINES = [
  '20/06 21:51:02 [info] [T998] [77/otherdev7] /cinco/cinco/playCardCanary.html?id=77',
  '20/06 21:51:03 [info] [T998] [78/RealPlayer9] /cinco/cinco/drawCardCanary.html?id=78',
  // A name that starts with the developer's own: a prefix match would hand it over.
  '20/06 21:51:04 [info] [T403] [9/mytest0evil] /cinco/cinco/prefixCanary.html',
  // Credential-bearing, and the account on it is the developer's own.
  '20/06 21:51:05 [info] [T403] [4/mytest0] /cinco/exchange.html?lock=97d1c7a1-canary-4d1f-8206-de39ce8204fc',
  'PHP Fatal error: unattributableCanary exploded',
];

/** Absent, byte for byte, from every surface below. */
const CANARIES = [
  'otherdev7',
  'RealPlayer9',
  'mytest0evil',
  'playCardCanary',
  'drawCardCanary',
  'prefixCanary',
  '97d1c7a1-canary-4d1f-8206-de39ce8204fc',
  'unattributableCanary',
];

const PAGE = `<html><body><pre>${[OWN_LINE, ...FOREIGN_LINES].join('\n')}</pre></body></html>`;

let server: PackagedServer<'legacy'>;
let stub: Server;
let stubPort: number;
let requests: string[];

function studioArguments(extra: readonly string[] = []): readonly string[] {
  return [
    '--project-root',
    server.projects.legacy,
    '--allow-network',
    '--experimental-studio-logs',
    '--studio-dev-account',
    OWN_ACCOUNT,
    ...extra,
  ];
}

function environment(): NodeJS.ProcessEnv {
  return { ...process.env, BGA_MCP_DOC_STUB_PORT: String(stubPort), BGA_STUDIO_SESSION: SESSION };
}

async function connect<T>(
  use: (client: Client) => Promise<T>,
  extra: readonly string[] = [],
): Promise<{ result: T; stderr: string }> {
  return await withPackagedServer(server.cli, studioArguments(extra), use, {
    nodeArguments: ['--import', 'tsx', '--import', stubModule],
    env: environment(),
  });
}

function expectClean(surface: string, text: string): void {
  for (const canary of CANARIES) {
    expect(text.includes(canary), `${canary} reached ${surface}`).toBe(false);
  }
}

beforeAll(async () => {
  server = await installPackagedServer('studio-own-data', { legacy: 'legacy' });
  requests = [];
  stub = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGE);
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

describe('packaged own-data-only publication', () => {
  it('[E2E-STUDIO-ALL-OUTPUTS-OWN-DATA] returns the developer own line and nothing else', async () => {
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
    );

    expect(result.isError, result.text).toBe(false);
    // The one thing that is theirs comes back, so this is a screen and not an
    // off switch.
    expect(JSON.stringify(result.structured)).toContain('SELECT player_id');
    expect(result.text).toContain('1 log line(s)');

    expectClean('the tool text', result.text);
    expectClean('the structured content', JSON.stringify(result.structured));
    expectClean('the server stderr', stderr);
    // What was withheld is stated as counts, without any of it.
    expect(result.text).toContain('Withheld:');
  });

  it('[E2E-STUDIO-ALL-OUTPUTS-OWN-DATA] keeps foreign lines out of a published failure', async () => {
    // The page is fetched and parsed, and then the result is refused for being
    // too large: a failure published after the parser has already seen the
    // other developers' lines.
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
      ['--max-output-bytes', '400'],
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('policy.output.too-large');
    expectClean('a published failure', result.text);
    expectClean('the server stderr', stderr);
    expect(result.text).not.toContain(SESSION);
  });

  it('[E2E-STUDIO-ALL-OUTPUTS-OWN-DATA] keeps them out of the setup report', async () => {
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'check_setup', {}),
    );

    expect(result.isError, result.text).toBe(false);
    // The setup report says which accounts are declared, which are the
    // developer's own, and never what the page happens to contain.
    expect(result.text).toContain(OWN_ACCOUNT);
    expectClean('check_setup text', result.text);
    expectClean('check_setup structured content', JSON.stringify(result.structured));
    expectClean('the server stderr', stderr);
  });

  it('[E2E-STUDIO-ALL-OUTPUTS-OWN-DATA] keeps them out of the terminal check, and still says what to fix', async () => {
    const matching = await runCommand(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        stubModule,
        server.cli,
        ...studioArguments(),
        '--studio-check',
        GAME,
      ],
      { env: environment(), timeoutMs: 60_000 },
    );

    expect(matching.exitCode, matching.stderr).toBe(0);
    expect(matching.stdout).toContain('are yours and would be returned');
    expectClean('--studio-check stdout', matching.stdout);
    expectClean('--studio-check stderr', matching.stderr);

    // The case the leak was in: nothing on the page is the developer's, which
    // is what a mistyped account name looks like.
    const mistyped = await runCommand(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        stubModule,
        server.cli,
        '--project-root',
        server.projects.legacy,
        '--allow-network',
        '--experimental-studio-logs',
        '--studio-dev-account',
        'mytest9',
        '--studio-check',
        GAME,
      ],
      { env: environment(), timeoutMs: 60_000 },
    );

    expect(mistyped.exitCode).toBe(1);
    expect(mistyped.stdout).toContain('none belong to a declared account');
    // Actionable without naming anyone: a count, and where the real name is.
    expect(mistyped.stdout).toContain('attributed line(s) were found');
    expect(mistyped.stdout).toContain('--studio-dev-account');
    expectClean('--studio-check stdout', mistyped.stdout);
    expectClean('--studio-check stderr', mistyped.stderr);
  });

  it('[E2E-STUDIO-ALL-OUTPUTS-OWN-DATA] keeps them out of everything a CI job would retain', async () => {
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
    );
    const terminal = await runCommand(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        stubModule,
        server.cli,
        ...studioArguments(),
        '--studio-check',
        GAME,
      ],
      { env: environment(), timeoutMs: 60_000 },
    );

    // Everything the run produced, written the way a workflow keeps a log, and
    // read back off disk rather than asserted on in memory.
    const artifact = resolve(server.temporaryRoot, 'simulated-ci-artifact.log');
    await writeFile(
      artifact,
      [
        result.text,
        JSON.stringify(result.structured),
        stderr,
        terminal.stdout,
        terminal.stderr,
      ].join('\n'),
    );

    const retained = await readFile(artifact, 'utf8');
    expectClean('a retained artifact', retained);
    // The page really did carry all of it, so absence above is a screen working
    // rather than a page that never arrived.
    expect(requests.some((url) => url.includes(`game=${GAME}`))).toBe(true);
    expect(PAGE).toContain('otherdev7');
  });
});
