import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

/**
 * What a deadline does to work already in flight.
 *
 * The response-lifecycle cases are evidence because the far end observes the
 * socket while the installed server and the same MCP client are still alive.
 * The filesystem probes load a test-only pre-import before the installed
 * policy module binds its named imports. It delays and records the actual
 * `lstat` or descriptor `read`, then the test snapshots that transcript while
 * the same server stays alive. The shim is absent from the tarball and exposes
 * no production flag or callback.
 *
 * The 2026-08-08 review measured the difference: a five-millisecond probe
 * returned `policy.timeout.exceeded` while the operation ran on to completion,
 * and an installed-client scan of five hundred files recorded twenty-eight
 * further filesystem operations in the next three hundred and fifty
 * milliseconds — instrumentation showed shutdown, not cancellation, eventually
 * stopping it.
 *
 * Two halves, each with an oracle that is outside the server:
 *
 * - **The network half is observed by the far end.** The stub knows when its
 *   socket was closed and how many bytes it managed to send, so "the body was
 *   dropped rather than drained" is the other party's observation rather than
 *   this server's own report.
 * - **The filesystem half is observed in the installed process.** A delayed
 *   syscall must record its end before timeout settlement, the transcript must
 *   remain unchanged afterwards, and the same MCP client must still work.
 */

const stubModule = new URL('./doc-network-stub.ts', import.meta.url).href;
const dnsStubModule = new URL('./dns-stub.ts', import.meta.url).href;
const fsDelayModule = new URL('./fs-delay-stub.ts', import.meta.url).href;
const parserDeadlineModule = new URL('./parser-deadline-stub.ts', import.meta.url).href;
const PARSER_DEADLINE_MS = 5_000;
const PARSER_EXPIRY_CHECKPOINT = 5;
const PARSER_MARKER = 'parser-content-that-must-not-be-published';

let server: PackagedServer<'legacy'>;
let stub: Server;
let stubPort: number;
let stallEveryRequest: boolean;
/** What the far end saw: bytes written, and whether the client hung up. */
let transcript: { written: number; aborted: boolean }[];

function sendStalledBody(
  response: ServerResponse,
  seen: { written: number; aborted: boolean },
): void {
  response.writeHead(200, { 'content-type': 'text/html' });
  const chunk = `<p>${'s'.repeat(512)}</p>`;
  const pump = (): void => {
    if (response.destroyed || response.writableEnded) {
      return;
    }
    seen.written += chunk.length;
    if (response.write(chunk)) {
      setTimeout(pump, 10);
      return;
    }
    response.once('drain', () => {
      setTimeout(pump, 10);
    });
  };
  pump();
}

/** A project big enough that walking it is measurable work. */
async function bigProject(name: string, files: number): Promise<string> {
  const root = resolve(server.temporaryRoot, name);
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, 'gameinfos.inc.php'), '<?php\n$gameinfos = [];\n');
  for (let index = 0; index < files; index += 1) {
    const directory = resolve(root, `module-${String(index % 40)}`);
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, `part-${String(index)}.php`),
      `<?php\n// ${'a'.repeat(400)}\n`,
    );
  }
  return root;
}

async function connect<T>(
  root: string,
  extra: readonly string[],
  use: (client: Client) => Promise<T>,
  environment: NodeJS.ProcessEnv = {},
): Promise<{ result: T; stderr: string }> {
  return await withPackagedServer(server.cli, ['--project-root', root, ...extra], use, {
    nodeArguments: ['--import', 'tsx', '--import', stubModule],
    env: {
      ...process.env,
      ...environment,
      BGA_MCP_DOC_STUB_PORT: String(stubPort),
    },
  });
}

/**
 * Observes cancellation while the installed server and its MCP client are
 * still alive. Checking after `withPackagedServer` returns would only prove
 * that process shutdown eventually closed the socket.
 */
async function observeNetworkQuiescence(
  minimumRequests: number,
): Promise<{ aborted: boolean; noLateWork: boolean }> {
  const atSettlement = transcript.map((entry) => entry.written);
  await new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, 350);
  });
  return {
    aborted: transcript.length >= minimumRequests && transcript.some((entry) => entry.aborted),
    noLateWork:
      transcript.length === atSettlement.length &&
      transcript.every((entry, index) => entry.written === atSettlement[index]),
  };
}

async function readResourceFailure(client: Client, uri: string): Promise<string> {
  try {
    await client.readResource({ uri }, { timeout: 30_000 });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Reading ${uri} was expected to fail`);
}

async function filesystemProbe(
  root: string,
  operation: 'lstat' | 'handle-read',
): Promise<{
  response: Awaited<ReturnType<typeof callTool>>;
  atSettlement: string;
  afterWait: string;
  setup: Awaited<ReturnType<typeof callTool>>;
  stderr: string;
}> {
  const transcriptPath = resolve(server.temporaryRoot, `fs-${operation}.log`);
  await writeFile(transcriptPath, '');
  const { result, stderr } = await withPackagedServer(
    server.cli,
    ['--project-root', root, '--operation-timeout-ms', '100'],
    async (client) => {
      const response = await callTool(client, 'inspect_project', {}, 30_000);
      const atSettlement = await readFile(transcriptPath, 'utf8');
      await new Promise<void>((resolveDelay) => {
        setTimeout(resolveDelay, 350);
      });
      const afterWait = await readFile(transcriptPath, 'utf8');
      const setup = await callTool(client, 'check_setup', {}, 30_000);
      return { response, atSettlement, afterWait, setup };
    },
    {
      nodeArguments: ['--import', 'tsx', '--import', fsDelayModule],
      env: {
        ...process.env,
        BGA_MCP_FS_DELAY_OPERATION: operation,
        BGA_MCP_FS_DELAY_MS: '250',
        BGA_MCP_FS_DELAY_TRANSCRIPT: transcriptPath,
      },
    },
  );
  return { ...result, stderr };
}

interface ParserDeadlineEvent {
  readonly sequence: number;
  readonly stage: 'register' | 'parser-checkpoint';
  readonly parserCheckpoints: number;
  readonly value: number;
}

function parserEvents(source: string): ParserDeadlineEvent[] {
  return source
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ParserDeadlineEvent);
}

async function slowParserProject(name: string): Promise<string> {
  const root = resolve(server.temporaryRoot, name);
  await mkdir(root, { recursive: true });
  await writeFile(
    resolve(root, 'gameinfos.jsonc'),
    `/*${PARSER_MARKER}${'x'.repeat(32_768)}*/{"name":"SlowParser","players":[2]}\n`,
  );
  return root;
}

async function parserDeadlineProbe(
  root: string,
  label: string,
): Promise<{
  response: Awaited<ReturnType<typeof callTool>>;
  atSettlement: string;
  afterWait: string;
  setup: Awaited<ReturnType<typeof callTool>>;
  stderr: string;
}> {
  const controlPath = resolve(server.temporaryRoot, `parser-${label}.control`);
  const transcriptPath = resolve(server.temporaryRoot, `parser-${label}.log`);
  await writeFile(controlPath, 'armed\n');
  await writeFile(transcriptPath, '');

  const { result, stderr } = await withPackagedServer(
    server.cli,
    ['--project-root', root, '--operation-timeout-ms', String(PARSER_DEADLINE_MS)],
    async (client) => {
      const response = await callTool(client, 'inspect_project', {}, 30_000);
      const atSettlement = await readFile(transcriptPath, 'utf8');
      await writeFile(controlPath, 'disarmed\n');
      await new Promise<void>((resolveDelay) => {
        setTimeout(resolveDelay, 350);
      });
      const afterWait = await readFile(transcriptPath, 'utf8');
      const setup = await callTool(client, 'check_setup', {}, 30_000);
      return { response, atSettlement, afterWait, setup };
    },
    {
      nodeArguments: ['--import', 'tsx', '--import', parserDeadlineModule],
      env: {
        ...process.env,
        BGA_MCP_PARSER_DEADLINE_CONTROL: controlPath,
        BGA_MCP_PARSER_DEADLINE_TRANSCRIPT: transcriptPath,
        BGA_MCP_PARSER_DEADLINE_MS: String(PARSER_DEADLINE_MS),
        BGA_MCP_PARSER_DEADLINE_CHECKPOINT: String(PARSER_EXPIRY_CHECKPOINT),
      },
    },
  );
  return { ...result, stderr };
}

beforeAll(async () => {
  server = await installPackagedServer('cancellation', { legacy: 'legacy' });
  transcript = [];
  stallEveryRequest = false;

  stub = createServer((request, response) => {
    const seen = { written: 0, aborted: false };
    transcript.push(seen);
    request.socket.once('close', () => {
      seen.aborted = !response.writableFinished;
    });

    const requestUrl = request.url ?? '';
    if (requestUrl.includes('/deadline-redirect-target')) {
      sendStalledBody(response, seen);
      return;
    }
    if (requestUrl.includes('deadline-redirect')) {
      response.writeHead(302, {
        location: 'https://en.doc.boardgamearena.com/deadline-redirect-target',
      });
      response.end();
      return;
    }

    // A page whose body never finishes, for the deadline case: headers and a
    // first chunk force the request into the bounded response reader, then the
    // socket stays open until somebody closes it and the far end records who.
    if (stallEveryRequest || requestUrl.includes('stall')) {
      sendStalledBody(response, seen);
      return;
    }
    // A redirect whose body is large: nobody will read it, and the question is
    // whether this server spends the bytes anyway.
    if (requestUrl.includes('non-success-body')) {
      response.writeHead(503, { 'content-type': 'text/html' });
    } else if (requestUrl.includes('redirect')) {
      response.writeHead(302, { location: 'https://en.doc.boardgamearena.com/Studio' });
    } else {
      response.writeHead(200, { 'content-type': 'text/html' });
    }

    const chunk = `<p>${'z'.repeat(16_384)}</p>`;
    const pump = (): void => {
      if (response.destroyed || response.writableEnded || seen.written > 4_000_000) {
        response.end();
        return;
      }
      if (response.write(chunk)) {
        seen.written += chunk.length;
        setTimeout(pump, 5);
        return;
      }
      seen.written += chunk.length;
      response.once('drain', pump);
    };
    pump();
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

describe('packaged operation deadlines', () => {
  it('[E2E-DOCS-RESPONSE-LIFECYCLE] closes a socket the deadline abandoned', async () => {
    transcript = [];
    const root = await bigProject('stalled-body', 5);

    const { result } = await connect(
      root,
      ['--allow-network', '--operation-timeout-ms', '300'],
      async (client) => {
        const timedOut = await callTool(client, 'search_bga_docs', { query: 'stall' }, 30_000);
        const network = await observeNetworkQuiescence(1);
        const setup = await callTool(client, 'check_setup', {}, 30_000);
        return { timedOut, network, setup };
      },
    );

    expect(result.timedOut.isError).toBe(true);
    expect(result.timedOut.text).toContain('policy.timeout.exceeded');
    // The far end saw the connection go, rather than being left holding an
    // open socket for a request nobody is waiting for any more. This was
    // observed before shutdown, and the same client remained usable.
    expect(transcript.length).toBeGreaterThan(0);
    expect(result.network.aborted, 'a socket outlived the deadline that abandoned it').toBe(true);
    expect(result.network.noLateWork, 'the response body kept sending after settlement').toBe(true);
    expect(result.setup.isError, result.setup.text).toBe(false);
  }, 180_000);

  it('[E2E-DOCS-RESPONSE-LIFECYCLE] carries the deadline through a redirect without killing its caller', async () => {
    transcript = [];
    const root = await bigProject('stalled-redirect-target', 5);

    const { result } = await connect(
      root,
      ['--allow-network', '--operation-timeout-ms', '300'],
      async (client) => {
        const timedOut = await callTool(
          client,
          'search_bga_docs',
          { query: 'deadline-redirect' },
          30_000,
        );
        const network = await observeNetworkQuiescence(2);
        const setup = await callTool(client, 'check_setup', {}, 30_000);
        return { timedOut, network, setup };
      },
    );

    expect(result.timedOut.isError).toBe(true);
    expect(result.timedOut.text).toContain('policy.timeout.exceeded');
    expect(
      result.network.aborted,
      'the redirected request outlived the original operation deadline',
    ).toBe(true);
    expect(result.network.noLateWork, 'the redirect chain did work after settlement').toBe(true);
    expect(result.setup.isError, result.setup.text).toBe(false);
  }, 180_000);

  it('[E2E-DOCS-RESPONSE-LIFECYCLE] cancels its own DNS resolver without killing its caller', async () => {
    const root = await bigProject('stalled-dns', 5);
    const logPath = resolve(server.temporaryRoot, 'dns-cancellation.log');
    await writeFile(logPath, '');

    const { result } = await withPackagedServer(
      server.cli,
      ['--project-root', root, '--allow-network', '--operation-timeout-ms', '300'],
      async (client) => {
        const timedOut = await callTool(
          client,
          'search_bga_docs',
          { query: 'meeple wobble' },
          30_000,
        );
        const settledAt = Date.now();
        const eventsBeforeShutdown = (await readFile(logPath, 'utf8'))
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as { readonly kind?: string; readonly at?: number });
        await new Promise<void>((resolveDelay) => {
          setTimeout(resolveDelay, 350);
        });
        const eventsAfterObservation = (await readFile(logPath, 'utf8'))
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as { readonly kind?: string; readonly at?: number });
        const setup = await callTool(client, 'check_setup', {}, 30_000);
        return { timedOut, settledAt, eventsBeforeShutdown, eventsAfterObservation, setup };
      },
      {
        nodeArguments: ['--import', 'tsx', '--import', dnsStubModule],
        env: {
          ...process.env,
          BGA_MCP_DNS_LOG: logPath,
          BGA_MCP_DNS_ANSWERS: JSON.stringify([[{ address: '93.184.216.34', family: 4 }]]),
          BGA_MCP_DNS_STALL: '1',
        },
      },
    );

    expect(result.timedOut.isError).toBe(true);
    expect(result.timedOut.text).toContain('policy.timeout.exceeded');
    expect(result.eventsBeforeShutdown.some((entry) => entry.kind === 'lookup')).toBe(true);
    expect(
      result.eventsBeforeShutdown.some((entry) => entry.kind === 'cancel'),
      'the DNS query outlived the deadline that abandoned it',
    ).toBe(true);
    expect(
      result.eventsBeforeShutdown
        .filter((entry) => entry.kind === 'cancel')
        .every((entry) => (entry.at ?? Number.POSITIVE_INFINITY) <= result.settledAt),
      'DNS cancellation happened after the public timeout settled',
    ).toBe(true);
    expect(
      result.eventsAfterObservation.length,
      'DNS work continued after the public timeout settled',
    ).toBe(result.eventsBeforeShutdown.length);
    expect(result.eventsBeforeShutdown.some((entry) => entry.kind === 'connect')).toBe(false);
    expect(result.setup.isError, result.setup.text).toBe(false);
  }, 180_000);

  it('[E2E-DOCS-RESPONSE-LIFECYCLE] cancels a documentation resource read without killing its caller', async () => {
    transcript = [];
    stallEveryRequest = true;
    const root = await bigProject('stalled-resource', 5);

    try {
      const { result } = await connect(
        root,
        ['--allow-network', '--operation-timeout-ms', '300'],
        async (client) => {
          const failure = await readResourceFailure(client, 'bga://docs/states');
          const network = await observeNetworkQuiescence(1);
          const setup = await callTool(client, 'check_setup', {}, 30_000);
          return { failure, network, setup };
        },
      );

      expect(result.failure).toContain('policy.timeout.exceeded');
      expect(
        result.network.aborted,
        'the documentation resource left its request alive after its deadline',
      ).toBe(true);
      expect(result.network.noLateWork, 'the resource body kept sending after settlement').toBe(
        true,
      );
      expect(result.setup.isError, result.setup.text).toBe(false);
    } finally {
      stallEveryRequest = false;
    }
  }, 180_000);

  it('[E2E-STUDIO-READ-NETWORK-CANCELLATION] cancels a Studio read without killing its caller', async () => {
    transcript = [];
    const root = await bigProject('stalled-studio', 5);

    const { result } = await connect(
      root,
      [
        '--allow-network',
        '--experimental-studio-logs',
        '--studio-dev-account',
        'mytest0',
        '--operation-timeout-ms',
        '300',
      ],
      async (client) => {
        const timedOut = await callTool(client, 'read_studio_logs', { gameId: 'stall' }, 30_000);
        const network = await observeNetworkQuiescence(1);
        const setup = await callTool(client, 'check_setup', {}, 30_000);
        return { timedOut, network, setup };
      },
      { BGA_STUDIO_SESSION: 'PHPSESSID=not-a-real-session' },
    );

    expect(result.timedOut.isError).toBe(true);
    expect(result.timedOut.text).toContain('policy.timeout.exceeded');
    expect(
      result.network.aborted,
      'the Studio request outlived the deadline that abandoned it',
    ).toBe(true);
    expect(result.network.noLateWork, 'the Studio body kept sending after settlement').toBe(true);
    expect(result.setup.isError, result.setup.text).toBe(false);
  }, 180_000);

  it('reports a deadline and stays responsive afterwards', async () => {
    const root = await bigProject('slow-walk', 2_000);

    const { result, stderr } = await connect(
      root,
      ['--operation-timeout-ms', '30'],
      async (client) => {
        const started = Date.now();
        const timedOut = await callTool(client, 'validate_project', {}, 30_000);
        const answered = Date.now() - started;

        // The next call is the measurement: a server still walking two
        // thousand files cannot answer promptly, and this one has to.
        const afterwards = Date.now();
        const setup = await callTool(client, 'check_setup', {}, 30_000);
        return { timedOut, answered, setup, responsive: Date.now() - afterwards };
      },
    );

    expect(result.timedOut.isError).toBe(true);
    expect(result.timedOut.text).toContain('policy.timeout.exceeded');
    // Answered after its deadline, once the operation acknowledged the abort.
    // The deterministic syscall/parser probes own the no-late-work proof.
    expect(result.answered).toBeGreaterThanOrEqual(30);
    // A cooperative operation still stops promptly.
    expect(result.answered).toBeLessThan(5_000);

    expect(result.setup.isError, result.setup.text).toBe(false);
    expect(result.responsive, 'the server was still busy with abandoned work').toBeLessThan(2_000);
    expect(stderr).not.toContain('Unhandled');
  }, 180_000);

  it('[E2E-FILESYSTEM-CANCELLATION] awaits a delayed listing syscall before publishing timeout', async () => {
    const root = await bigProject('delayed-lstat', 2);
    const result = await filesystemProbe(root, 'lstat');

    expect(result.response.isError).toBe(true);
    expect(result.response.text).toContain('policy.timeout.exceeded');
    expect(result.atSettlement).toContain('lstat:start');
    expect(result.atSettlement).toContain('lstat:end');
    expect(result.afterWait).toBe(result.atSettlement);
    expect(result.setup.isError, result.setup.text).toBe(false);
    expect(result.stderr).not.toContain('Unhandled');
  }, 180_000);

  it('[E2E-FILESYSTEM-CANCELLATION] awaits a delayed descriptor read before publishing timeout', async () => {
    const root = await bigProject('delayed-read', 1);
    const result = await filesystemProbe(root, 'handle-read');

    expect(result.response.isError).toBe(true);
    expect(result.response.text).toContain('policy.timeout.exceeded');
    expect(result.atSettlement).toContain('read:start');
    expect(result.atSettlement).toContain('read:end');
    expect(result.afterWait).toBe(result.atSettlement);
    expect(result.setup.isError, result.setup.text).toBe(false);
    expect(result.stderr).not.toContain('Unhandled');
  }, 180_000);

  it('[E2E-POLICY-PARSER-DEADLINE] expires inside an installed non-yielding parser checkpoint', async () => {
    const root = await slowParserProject('slow-parser');
    const result = await parserDeadlineProbe(root, 'active');
    const events = parserEvents(result.atSettlement);

    expect(
      result.response.isError,
      JSON.stringify({ response: result.response.text, events }, null, 2),
    ).toBe(true);
    expect(result.response.text).toContain('policy.timeout.exceeded');
    expect(result.response.text).not.toContain(PARSER_MARKER);
    expect(events.map((event) => event.stage)).toEqual([
      'register',
      ...Array.from({ length: PARSER_EXPIRY_CHECKPOINT }, () => 'parser-checkpoint' as const),
    ]);
    expect(events.map((event) => event.sequence)).toEqual(
      Array.from({ length: events.length }, (_, index) => index + 1),
    );
    expect(events.at(-1)).toMatchObject({
      stage: 'parser-checkpoint',
      parserCheckpoints: PARSER_EXPIRY_CHECKPOINT,
      value: PARSER_DEADLINE_MS + 1,
    });
    expect(result.afterWait, 'parser work continued after the public timeout settled').toBe(
      result.atSettlement,
    );
    expect(result.setup.isError, result.setup.text).toBe(false);
    expect(result.stderr).not.toContain(PARSER_MARKER);
    expect(result.stderr).not.toContain('Unhandled');

    // Mutation control: remove the installed periodic checkpoint and repeat
    // the same probe. It must now complete instead of timing out, proving the
    // oracle is observing that production checkpoint rather than shutdown or
    // an elapsed-time guess. Restore the installed artifact even on failure.
    const deadlineModule = resolve(dirname(server.cli), 'deadline.js');
    const original = await readFile(deadlineModule, 'utf8');
    const neutralized = original.replace(
      /export function periodicCancellationCheckpoint\(iteration, signal\) \{\n {4}if \(\(iteration & 0x3ff\) === 0\) \{\n {8}cancellationCheckpoint\(signal\);\n {4}\}\n\}/u,
      'export function periodicCancellationCheckpoint() {\n}',
    );
    expect(neutralized, 'the mutation control did not find the installed checkpoint').not.toBe(
      original,
    );
    await writeFile(deadlineModule, neutralized);
    try {
      const control = await parserDeadlineProbe(root, 'neutralized');
      const controlEvents = parserEvents(control.atSettlement);
      expect(control.response.isError, control.response.text).toBe(false);
      expect(controlEvents.map((event) => event.stage)).toEqual(['register']);
      expect(control.afterWait).toBe(control.atSettlement);
      expect(control.setup.isError, control.setup.text).toBe(false);
      expect(control.response.text).not.toContain(PARSER_MARKER);
      expect(control.stderr).not.toContain(PARSER_MARKER);
      expect(control.stderr).not.toContain('Unhandled');
    } finally {
      await writeFile(deadlineModule, original);
    }
  }, 180_000);

  it('[E2E-DOCS-RESPONSE-LIFECYCLE] drops a body it will never read instead of draining it', async () => {
    transcript = [];
    const root = await bigProject('drop-body', 5);

    const { result } = await connect(
      root,
      ['--allow-network', '--operation-timeout-ms', '10000'],
      async (client) => {
        const response = await callTool(client, 'search_bga_docs', { query: 'redirect' }, 30_000);
        const network = await observeNetworkQuiescence(1);
        const setup = await callTool(client, 'check_setup', {}, 30_000);
        return { response, network, setup };
      },
    );

    // Whatever the search made of it, the far end is the witness: it was cut
    // off rather than allowed to finish writing four megabytes nobody wanted.
    expect(transcript.length).toBeGreaterThan(0);
    expect(result.network.aborted, 'the server drained a response it had already discarded').toBe(
      true,
    );
    expect(result.network.noLateWork, 'a discarded redirect body kept sending').toBe(true);
    expect(
      Math.max(...transcript.map((entry) => entry.written)),
      'the server read the whole body of a discarded response',
    ).toBeLessThan(4_000_000);
    expect(result.response.text.length).toBeGreaterThan(0);
    expect(result.setup.isError, result.setup.text).toBe(false);
  }, 180_000);

  it('[E2E-DOCS-RESPONSE-LIFECYCLE] destroys a non-success body before settling', async () => {
    transcript = [];
    const root = await bigProject('drop-non-success-body', 5);

    const { result } = await connect(
      root,
      ['--allow-network', '--operation-timeout-ms', '10000'],
      async (client) => {
        const response = await callTool(
          client,
          'search_bga_docs',
          { query: 'non-success-body' },
          30_000,
        );
        const network = await observeNetworkQuiescence(1);
        const setup = await callTool(client, 'check_setup', {}, 30_000);
        return { response, network, setup };
      },
    );

    expect(result.response.isError).toBe(true);
    expect(result.response.text).toContain('policy.doc-fetch.failed');
    expect(result.network.aborted, 'the server drained a non-success response body').toBe(true);
    expect(result.network.noLateWork, 'a refused response body kept sending').toBe(true);
    expect(
      Math.max(...transcript.map((entry) => entry.written)),
      'the server read the whole body of a refused response',
    ).toBeLessThan(4_000_000);
    expect(result.setup.isError, result.setup.text).toBe(false);
  }, 180_000);

  it('exits cleanly after a deadline rather than staying alive on abandoned work', async () => {
    const root = await bigProject('shutdown', 1_500);

    const { result, stderr } = await connect(
      root,
      ['--operation-timeout-ms', '40'],
      async (client) => await callTool(client, 'validate_project', {}, 30_000),
    );

    expect(result.isError).toBe(true);
    // `withPackagedServer` waits for the process to exit after closing the
    // client, so reaching this line at all means the server shut down rather
    // than staying alive on work nobody was waiting for.
    expect(stderr).not.toContain('Unhandled');
    expect(stderr).not.toContain('ExperimentalWarning: abort');
  }, 180_000);
});
