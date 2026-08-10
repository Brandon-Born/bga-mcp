import { createServer, type Server } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
 * One case here is evidence and two are regression tests, and they are labelled
 * as such rather than left to look alike. Only the case that fails when its fix
 * is removed carries the scenario identifier: with the discarded body drained
 * again, the far end records four megabytes written instead of a closed socket.
 * The other two pass with the cancellation threading removed, so they are kept
 * for what they do catch — an unhandled rejection, a server that stops
 * answering, a process that will not exit — and they are not evidence that the
 * filesystem work stopped. Proving that needs to count the installed server's
 * own syscalls, which needs a module loader hook: patching `fs.promises` does
 * not reach a named import that the built server already bound.
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
 * - **The filesystem half is observed by the clock.** A server still walking a
 *   large tree cannot answer promptly; one that stopped can. The assertion is
 *   that the next call returns well inside the time the abandoned walk would
 *   have taken, which is a statement about the event loop rather than about
 *   syscall counts.
 */

const stubModule = new URL('./doc-network-stub.ts', import.meta.url).href;

let server: PackagedServer<'legacy'>;
let stub: Server;
let stubPort: number;
/** What the far end saw: bytes written, and whether the client hung up. */
let transcript: { written: number; aborted: boolean }[];

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
): Promise<{ result: T; stderr: string }> {
  return await withPackagedServer(server.cli, ['--project-root', root, ...extra], use, {
    nodeArguments: ['--import', 'tsx', '--import', stubModule],
    env: { ...process.env, BGA_MCP_DOC_STUB_PORT: String(stubPort) },
  });
}

beforeAll(async () => {
  server = await installPackagedServer('cancellation', { legacy: 'legacy' });
  transcript = [];

  stub = createServer((request, response) => {
    const seen = { written: 0, aborted: false };
    transcript.push(seen);
    request.socket.once('close', () => {
      seen.aborted = !response.writableFinished;
    });

    // A page that never answers, for the deadline case: the socket stays open
    // until somebody closes it, and the far end records who did.
    if ((request.url ?? '').includes('stall')) {
      return;
    }
    // A redirect whose body is large: nobody will read it, and the question is
    // whether this server spends the bytes anyway.
    if ((request.url ?? '').includes('redirect')) {
      response.writeHead(302, { location: 'https://en.doc.boardgamearena.com/Studio' });
    } else {
      response.writeHead(200, { 'content-type': 'text/html' });
    }

    const chunk = `<p>${'z'.repeat(16_384)}</p>`;
    const pump = (): void => {
      if (response.writableEnded || seen.written > 4_000_000) {
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
      async (client) => await callTool(client, 'search_bga_docs', { query: 'stall' }, 30_000),
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('policy.timeout.exceeded');
    // The far end saw the connection go, rather than being left holding an
    // open socket for a request nobody is waiting for any more.
    expect(transcript.length).toBeGreaterThan(0);
    expect(
      transcript.every((entry) => entry.aborted),
      'a socket outlived the deadline that abandoned it',
    ).toBe(true);
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
    // Answered after its deadline and inside the cleanup window. This does not
    // prove the walk stopped — see the note at the top of this file.
    expect(result.answered).toBeGreaterThanOrEqual(30);
    // And the cleanup window is a bound, not an invitation.
    expect(result.answered).toBeLessThan(5_000);

    expect(result.setup.isError, result.setup.text).toBe(false);
    expect(result.responsive, 'the server was still busy with abandoned work').toBeLessThan(2_000);
    expect(stderr).not.toContain('Unhandled');
  }, 180_000);

  it('[E2E-DOCS-RESPONSE-LIFECYCLE] drops a body it will never read instead of draining it', async () => {
    transcript = [];
    const root = await bigProject('drop-body', 5);

    const { result } = await connect(
      root,
      ['--allow-network', '--operation-timeout-ms', '10000'],
      async (client) => await callTool(client, 'search_bga_docs', { query: 'redirect' }, 30_000),
    );

    // Whatever the search made of it, the far end is the witness: it was cut
    // off rather than allowed to finish writing four megabytes nobody wanted.
    expect(transcript.length).toBeGreaterThan(0);
    expect(
      transcript.some((entry) => entry.aborted),
      'the server drained a response it had already decided to discard',
    ).toBe(true);
    expect(
      Math.max(...transcript.map((entry) => entry.written)),
      'the server read the whole body of a discarded response',
    ).toBeLessThan(4_000_000);
    expect(result.text.length).toBeGreaterThan(0);
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
