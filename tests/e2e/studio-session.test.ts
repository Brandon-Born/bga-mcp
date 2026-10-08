// secret-scan:allow-file Seeded non-secret sample session values that prove redaction.
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { chmod, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
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
 * Proves that the session this server actually sends is the one it protects,
 * whichever provider it came from.
 *
 * The 2026-08-08 review found those two things apart: `--studio-session-file`
 * was read, trimmed, and sent to Studio, while the redaction list read only
 * `BGA_STUDIO_SESSION` and stayed empty. A synthetic file session was resolved
 * with nothing registered to remove it, and the test of the day seeded only the
 * environment provider, so nothing said so.
 *
 * The page below is what makes this measurable rather than notional: a Studio
 * request log can echo the developer's own session back at them, so one own
 * line carries the value in a shape no pattern recognises. Only the exact
 * resolved value, registered before anything is published, removes it.
 *
 * The connection is replaced by `doc-network-stub.ts`, so nothing here is
 * evidence about TLS, DNS resolution, or the address guard.
 */

const stubModule = new URL('./doc-network-stub.ts', import.meta.url).href;

const OWN_ACCOUNT = 'mytest0';
const GAME = 'mcpverification';

/** Two structurally complete Cookie headers, with nothing in common. */
const FILE_SESSION =
  'PHPSESSIDCanaryFile=fileSessionValueCanary0123456789; TournoiEnLigneidCanaryFile=fileTokenValueCanary0123456789';
const ENV_SESSION =
  'PHPSESSIDCanaryEnv=envSessionValueCanary9876543210; TournoiEnLigneidCanaryEnv=envTokenValueCanary9876543210';

/** Every component of both, and both whole headers. Each must be absent. */
const CANARIES = [
  FILE_SESSION,
  ENV_SESSION,
  'PHPSESSIDCanaryFile',
  'fileSessionValueCanary0123456789',
  'TournoiEnLigneidCanaryFile',
  'fileTokenValueCanary0123456789',
  'PHPSESSIDCanaryEnv',
  'envSessionValueCanary9876543210',
  'TournoiEnLigneidCanaryEnv',
  'envTokenValueCanary9876543210',
];

/**
 * A page that echoes back the session it was sent.
 *
 * A Studio request log really can carry the developer's own cookie, and this is
 * the shape that makes the control measurable: the value comes back inside an
 * own-account line, written as an ordinary query parameter that no pattern
 * recognises as a credential. Whichever provider won, its exact value is what
 * has to disappear — a page echoing a fixed string would only prove that a
 * string nobody sent was absent.
 */
function pageFor(cookie: string | undefined): string {
  const echoed = (cookie ?? '').split(';')[0]?.split('=')[1] ?? 'no-session-was-sent';
  const lines = [
    `20/06 21:50:56 [info] [T403] [4/${OWN_ACCOUNT}] 0.26 GET /replay.html?hint=${echoed}`,
    `20/06 21:50:57 [info] [T403] [4/${OWN_ACCOUNT}] 0.11 GET /gamestate.html?id=403`,
  ];
  return `<html><body><pre>${lines.join('\n')}</pre></body></html>`;
}

/** How the stub answers, so one suite can force every failure shape. */
type Behaviour =
  'ok' | 'redirect' | 'server-error' | 'invalid' | 'stall' | 'missing-project' | 'script-only';

let server: PackagedServer<'legacy'>;
let stub: Server;
let stubPort: number;
let behaviour: Behaviour;
let received: (string | undefined)[];
let sessionFile: string;

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

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, BGA_MCP_DOC_STUB_PORT: String(stubPort), ...overrides };
}

async function connect<T>(
  use: (client: Client) => Promise<T>,
  options: {
    readonly extra?: readonly string[];
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Promise<{ result: T; stderr: string }> {
  return await withPackagedServer(server.cli, studioArguments(options.extra), use, {
    nodeArguments: ['--import', 'tsx', '--import', stubModule],
    env: environment(options.env),
  });
}

const onWindows = process.platform === 'win32';

/**
 * What the file provider does on a platform that has none.
 *
 * Every case below is about a session that came from a file. Where there is no
 * such provider (BGA-328 refuses it on Windows), the thing worth asserting is
 * that the refusal is plain, actionable, and silent about the path — so the
 * case asserts that rather than skipping and leaving its scenario with no
 * evidence on the platform it ran on.
 */
async function expectFileProviderRefused(): Promise<void> {
  const { result, stderr } = await connect(
    async (client) => await callTool(client, 'check_setup', {}),
    { extra: ['--studio-session-file', sessionFile] },
  );

  expect(result.isError, result.text).toBe(false);
  expect(result.text).toContain('not supported on Windows');
  expect(result.text).toContain('BGA_STUDIO_SESSION');
  expect(result.text).not.toContain(sessionFile);
  expect(JSON.stringify(result.structured)).not.toContain(sessionFile);
  expectClean('the Windows refusal', result.text);
  expectClean('the server stderr', stderr);
}

/**
 * The provider this platform actually has.
 *
 * Windows has no file provider (BGA-328 refuses it there), so a case that just
 * needs a resolved session uses the variable; the claim under test is the same
 * either way, and both values are canaries.
 */
function sessionOptions(): {
  readonly extra?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
} {
  return onWindows
    ? { env: { BGA_STUDIO_SESSION: ENV_SESSION } }
    : { extra: ['--studio-session-file', sessionFile] };
}

function expectClean(surface: string, text: string | undefined): void {
  const searched = text ?? '';
  for (const canary of CANARIES) {
    expect(searched.includes(canary), `${canary} reached ${surface}`).toBe(false);
  }
}

beforeAll(async () => {
  server = await installPackagedServer('studio-session', { legacy: 'legacy' });

  sessionFile = resolve(server.temporaryRoot, 'studio-session.txt');
  // Written the way the guide says to write it: the whole header, and a
  // trailing newline, because that is what a shell redirect leaves behind.
  await writeFile(sessionFile, `${FILE_SESSION}\n`, { mode: 0o600 });
  await chmod(sessionFile, 0o600);

  behaviour = 'ok';
  received = [];
  stub = createServer((request, response) => {
    received.push(request.headers.cookie);
    if (behaviour === 'stall') {
      // Answers eventually, so the socket is not what fails; the deadline is.
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(pageFor(request.headers.cookie));
      }, 5_000);
      return;
    }
    if (behaviour === 'redirect') {
      response.writeHead(302, { location: 'https://studio.boardgamearena.com/account' });
      response.end();
      return;
    }
    if (behaviour === 'server-error') {
      response.writeHead(500, { 'content-type': 'text/html' });
      response.end('<html><body>Studio is unwell</body></html>');
      return;
    }
    if (behaviour === 'script-only') {
      // What Studio actually serves, observed live on 2026-08-10: an
      // application shell that is almost entirely script, with the log
      // rendered in the browser rather than present in the HTML.
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        `<html><head>${'<script>var x=1;</script>'.repeat(200)}</head><body><h1>Manage game</h1></body></html>`,
      );
      return;
    }
    if (behaviour === 'missing-project') {
      // Studio answers 200 with this sentence, which is what makes an empty
      // log and an absent project look alike unless something reads it.
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        "<html><body><p>The project doesn't exist or you don't have access to it</p></body></html>",
      );
      return;
    }
    if (behaviour === 'invalid') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end('  not a page at all');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(pageFor(request.headers.cookie));
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

describe('packaged Studio session redaction', () => {
  it('[E2E-STUDIO-FILE-SESSION-REDACTION] sends a session and removes it from a successful result', async () => {
    // Which provider is available is a platform fact: Windows has no file
    // provider to protect (BGA-328 refuses it there), so the variable is what
    // must be registered. The assertion is the same either way, and it runs
    // everywhere rather than skipping where it cannot use a file.
    behaviour = 'ok';
    received = [];
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
      onWindows
        ? { env: { BGA_STUDIO_SESSION: ENV_SESSION } }
        : { extra: ['--studio-session-file', sessionFile] },
    );

    expect(result.isError, result.text).toBe(false);
    // The value protected is the value sent, byte for byte — including the
    // trailing newline the file carried, which normalization removed once.
    expect(received.at(-1)).toBe(onWindows ? ENV_SESSION : FILE_SESSION);

    // The page echoed the session back inside the developer's own line, so
    // this is a result that would have carried it.
    expect(pageFor(received.at(-1))).toContain(
      onWindows ? 'envSessionValueCanary9876543210' : 'fileSessionValueCanary0123456789',
    );
    expectClean('the tool text', result.text);
    expectClean('the structured content', JSON.stringify(result.structured));
    expectClean('the server stderr', stderr);
    // The line carrying it is withheld whole rather than edited: a registered
    // session value makes a line credential-bearing, and there is no reading of
    // a leaked credential that stays useful. Counted, not shown.
    expect(result.structured?.withheld).toMatchObject({ sensitive: 1 });
    // The developer's other own line still came back, so this is a screen
    // rather than an off switch.
    expect(JSON.stringify(result.structured)).toContain('/gamestate.html?id=403');
  });

  it('[E2E-STUDIO-FILE-SESSION-REDACTION] states its precedence and protects the value it chose', async () => {
    if (onWindows) {
      // No file provider on this platform, so what this case is about
      // is the refusal: it says why, it names the supported route, and
      // it never names the file.
      await expectFileProviderRefused();
      return;
    }
    behaviour = 'ok';
    received = [];
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
      {
        extra: ['--studio-session-file', sessionFile],
        env: { BGA_STUDIO_SESSION: ENV_SESSION },
      },
    );

    expect(result.isError, result.text).toBe(false);
    // Explicit configuration wins over the ambient variable.
    expect(received.at(-1)).toBe(FILE_SESSION);
    expect(received.at(-1)).not.toBe(ENV_SESSION);
    // Both are registered anyway: the one not chosen is still a credential this
    // process was handed.
    expectClean('the tool text', result.text);
    expectClean('the structured content', JSON.stringify(result.structured));
    expectClean('the server stderr', stderr);
  });

  it('[E2E-STUDIO-FILE-SESSION-REDACTION] does not fall back to the environment when the named file fails', async () => {
    if (onWindows) {
      // No file provider on this platform, so what this case is about
      // is the refusal: it says why, it names the supported route, and
      // it never names the file.
      await expectFileProviderRefused();
      return;
    }
    const { result } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
      {
        extra: ['--studio-session-file', resolve(server.temporaryRoot, 'absent-session.txt')],
        env: { BGA_STUDIO_SESSION: ENV_SESSION },
      },
    );

    // Sending a different credential than the one the operator named would be
    // the worse answer, so a configured file that fails means no session.
    expect(result.isError).toBe(true);
    expect(result.text).toContain('policy.studio.no-session');
    expectClean('the refusal', result.text);
  });

  it('[E2E-STUDIO-FILE-SESSION-REDACTION] keeps it out of every failure the page can cause', async () => {
    if (onWindows) {
      // No file provider on this platform, so what this case is about
      // is the refusal: it says why, it names the supported route, and
      // it never names the file.
      await expectFileProviderRefused();
      return;
    }
    for (const forced of ['redirect', 'server-error', 'invalid'] as Behaviour[]) {
      behaviour = forced;
      const { result, stderr } = await connect(
        async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
        { extra: ['--studio-session-file', sessionFile] },
      );

      expectClean(`a failure caused by ${forced}`, result.text);
      expectClean(`the structured content after ${forced}`, JSON.stringify(result.structured));
      expectClean('the server stderr', stderr);
    }
  });

  it('[E2E-STUDIO-FILE-SESSION-REDACTION] keeps it out of the terminal check and everything a CI job retains', async () => {
    if (onWindows) {
      // No file provider on this platform, so what this case is about
      // is the refusal: it says why, it names the supported route, and
      // it never names the file.
      await expectFileProviderRefused();
      return;
    }
    behaviour = 'ok';
    const preflight = await runCommand(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        stubModule,
        server.cli,
        ...studioArguments(['--studio-session-file', sessionFile]),
        '--studio-check',
        GAME,
      ],
      { env: environment({ BGA_STUDIO_SESSION: ENV_SESSION }), timeoutMs: 60_000 },
    );

    expectClean('--studio-check stdout', preflight.stdout);
    expectClean('--studio-check stderr', preflight.stderr);
    // It still says a session was found, which is the whole point of the check.
    expect(preflight.stdout).toContain('session');

    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
      { extra: ['--studio-session-file', sessionFile] },
    );
    const setup = await connect(async (client) => await callTool(client, 'check_setup', {}), {
      extra: ['--studio-session-file', sessionFile],
    });

    const artifact = resolve(server.temporaryRoot, 'simulated-ci-artifact.log');
    await writeFile(
      artifact,
      [
        result.text,
        JSON.stringify(result.structured),
        stderr,
        setup.result.text,
        JSON.stringify(setup.result.structured),
        setup.stderr,
        preflight.stdout,
        preflight.stderr,
      ].join('\n'),
    );
    expectClean('a retained artifact', await readFile(artifact, 'utf8'));

    // And the session was never something a caller could have supplied.
    const schema = await connect(
      async (client) =>
        await client.callTool(
          { name: 'read_studio_logs', arguments: { gameId: GAME, session: FILE_SESSION } },
          { timeout: 15_000 },
        ),
      { extra: ['--studio-session-file', sessionFile] },
    );
    expect(JSON.stringify(schema.result)).toContain('Unrecognized key');
  });
});

/**
 * The provider itself, rather than what it protects.
 *
 * A file holding a credential earns the checks a credential deserves, and the
 * 2026-08-08 review found none of them: an unbounded `readFile` on whatever
 * path was configured, so a directory, a FIFO that never answers, a symlink
 * into somebody else's file, or a file every account on the machine can read
 * were all the same to it. Each is refused here through the installed server,
 * and every refusal is checked for saying why without saying where.
 */
describe('packaged Studio project identifier', () => {
  it('[E2E-STUDIO-WRONG-PROJECT] answers a wrong project the way Studio does', async () => {
    // What a live run on 2026-08-10 observed: /studiogame?game=15414 — the
    // numeric Play ID of the dedicated project — answers 200 with "The project
    // doesn't exist or you don't have access to it". The schema refuses that
    // value before the handler, and a name Studio does not know reaches the
    // page and comes back as a wrong project rather than as an empty log.
    behaviour = 'missing-project';
    const { result } = await connect(
      async (client) =>
        await callTool(client, 'read_studio_logs', { gameId: 'notmyproject' }, 20_000),
      sessionOptions(),
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('does not exist');
    expect(result.text).toContain('Manage Games');
    // Not an empty result, which would say the project is quiet rather than
    // absent, and not an unrelated policy error either.
    expect(result.text).not.toContain('0 log line(s)');
    expect(result.text).not.toContain('policy.output.too-large');
  });

  it('[E2E-STUDIO-WRONG-PROJECT] says a page with no log region is a limit of this reader', async () => {
    // The live shape: retrieved, whole, and carrying nothing this tool can
    // read. "0 log line(s)" would be a claim about the developer's project;
    // this is a claim about the reader, which is the true one.
    behaviour = 'script-only';
    const { result } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
      sessionOptions(),
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('carries no log lines');
    expect(result.text).toContain('rendered in the browser');
    expect(result.text).not.toContain('0 log line(s)');
  });

  it('[E2E-STUDIO-WRONG-PROJECT] refuses the numeric Play ID before it reaches Studio', async () => {
    const { result } = await connect(async (client) => {
      const failure = await client
        .callTool({ name: 'read_studio_logs', arguments: { gameId: '15414' } }, { timeout: 15_000 })
        .catch((error: unknown) => error);
      return failure instanceof Error ? failure.message : JSON.stringify(failure);
    }, sessionOptions());

    // The refusal names what to use instead, because "invalid" alone leaves a
    // developer holding the identifier that is written on their own game page.
    expect(result).toContain('Manage Games');
    expect(result).toContain('Play ID');
  });
});

describe('packaged Studio session file provider', () => {
  /** Writes a candidate session file and returns the path. */
  async function candidate(name: string, contents: string, mode = 0o600): Promise<string> {
    const path = resolve(server.temporaryRoot, name);
    await writeFile(path, contents, { mode });
    await chmod(path, mode);
    return path;
  }

  async function setupWith(path: string): Promise<{ text: string; structured: string }> {
    const { result } = await connect(async (client) => await callTool(client, 'check_setup', {}), {
      extra: ['--studio-session-file', path],
    });
    return { text: result.text, structured: JSON.stringify(result.structured) };
  }

  it('[E2E-STUDIO-SESSION-FILE-SAFE] accepts only what a credential file may be, per platform', async () => {
    const path = await candidate('good-session.txt', `${FILE_SESSION}\n`);

    if (onWindows) {
      // No ACL reading this project is willing to shell out for from inside
      // the credential path, so the provider is refused rather than pretending
      // to have checked.
      const setup = await setupWith(path);
      expect(setup.text).toContain('not supported on Windows');
      expect(setup.text).toContain('BGA_STUDIO_SESSION');
      expect(setup.text).not.toContain(path);
      expect(setup.structured).not.toContain(path);
      return;
    }

    behaviour = 'ok';
    received = [];
    const { result } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
      { extra: ['--studio-session-file', path] },
    );

    expect(result.isError, result.text).toBe(false);
    expect(received.at(-1)).toBe(FILE_SESSION);
  });

  it('[E2E-STUDIO-SESSION-FILE-SAFE] refuses what a credential file must not be', async () => {
    if (onWindows) {
      // No file provider on this platform, so what this case is about
      // is the refusal: it says why, it names the supported route, and
      // it never names the file.
      await expectFileProviderRefused();
      return;
    }
    const directory = resolve(server.temporaryRoot, 'session-directory');
    await mkdir(directory, { recursive: true });

    const target = await candidate('link-target.txt', FILE_SESSION);
    const link = resolve(server.temporaryRoot, 'session-link.txt');
    await symlink(target, link);

    const fifo = resolve(server.temporaryRoot, 'session-fifo');
    execFileSync('mkfifo', [fifo]);

    const refusals: [string, string, string][] = [
      ['a directory', directory, 'not a regular file'],
      // Refused by the kernel at open, not by a check a rename could outrun.
      ['a symbolic link', link, 'symbolic link'],
      // Would block forever on open without O_NONBLOCK, so the refusal
      // arriving at all is half the assertion.
      ['a FIFO', fifo, 'not a regular file'],
      [
        'a world-readable file',
        await candidate('loose-session.txt', FILE_SESSION, 0o644),
        'readable by other accounts',
      ],
      ['an empty file', await candidate('empty-session.txt', ''), 'is empty'],
      [
        'an oversized file',
        await candidate('huge-session.txt', 'x'.repeat(8_192)),
        'larger than 4096 bytes',
      ],
      [
        'a missing file',
        resolve(server.temporaryRoot, 'no-such-session.txt'),
        'could not be opened',
      ],
    ];

    for (const [what, path, reason] of refusals) {
      const setup = await setupWith(path);
      expect(setup.text, `${what} was accepted`).toContain(reason);
      // Says why, never where.
      expect(setup.text, `${what} published its path`).not.toContain(path);
      expect(setup.structured, `${what} published its path`).not.toContain(path);
      expectClean(`the ${what} refusal`, setup.text);
    }
  });

  it('[E2E-STUDIO-SESSION-FILE-SAFE] never names the file in the terminal check, whatever it decides', async () => {
    if (onWindows) {
      // No file provider on this platform, so what this case is about
      // is the refusal: it says why, it names the supported route, and
      // it never names the file.
      await expectFileProviderRefused();
      return;
    }
    behaviour = 'ok';
    const good = await candidate('named-session.txt', FILE_SESSION);
    const loose = await candidate('named-loose-session.txt', FILE_SESSION, 0o666);

    for (const path of [good, loose]) {
      const preflight = await runCommand(
        process.execPath,
        [
          '--import',
          'tsx',
          '--import',
          stubModule,
          server.cli,
          ...studioArguments(['--studio-session-file', path]),
          '--studio-check',
          GAME,
        ],
        { env: environment(), timeoutMs: 60_000 },
      );

      expect(preflight.stdout, 'the preflight printed the session path').not.toContain(path);
      expect(preflight.stderr, 'the preflight printed the session path').not.toContain(path);
      expectClean('--studio-check stdout', preflight.stdout);
      expectClean('--studio-check stderr', preflight.stderr);
    }
  });

  it('[E2E-STUDIO-SESSION-FILE-SAFE] refuses devices and sockets without reading or disclosing their paths', async () => {
    if (onWindows) {
      await expectFileProviderRefused();
      return;
    }
    const device = await setupWith('/dev/null');
    expect(device.text).toContain('not a regular file');
    expect(device.text).not.toContain('/dev/null');
    const socketPath = resolve(server.temporaryRoot, 'credential-socket');
    const socket = createSocketServer();
    await new Promise<void>((ready) => {
      socket.listen(socketPath, ready);
    });
    try {
      const result = await setupWith(socketPath);
      expect(result.text).toMatch(/could not be opened|not a regular file/u);
      expect(result.text).not.toContain(socketPath);
      expect(result.structured).not.toContain(socketPath);
      expectClean('socket refusal', result.text);
    } finally {
      await new Promise<void>((closed, reject) => {
        socket.close((error) => (error === undefined ? closed() : reject(error)));
      });
    }
  });
});
