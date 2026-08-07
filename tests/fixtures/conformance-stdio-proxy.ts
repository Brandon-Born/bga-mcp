import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { JSONRPCMessage } from '@modelcontextprotocol/server';
import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from '@modelcontextprotocol/node';

/**
 * Drives the real packaged server, over its real transport, from the official
 * conformance suite.
 *
 * The suite's `server` command only speaks Streamable HTTP (`--url` is a
 * required option), while `bga-mcp` ships only stdio. Testing an in-process
 * server object instead would prove something about a factory rather than about
 * the artifact a developer installs, so this stands the two transports back to
 * back: every session spawns `dist/cli.js` as a subprocess and relays JSON-RPC
 * frames between it and the HTTP session, unchanged in either direction.
 *
 * The relay is deliberately dumb. It does not negotiate, rewrite, or answer
 * anything: initialization, capabilities, protocol version, errors, and
 * notifications are all the child's. Whatever the suite observes is what the
 * shipped binary sent.
 */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = resolve(repositoryRoot, 'dist/cli.js');
const projectRoot = resolve(repositoryRoot, 'tests/fixtures/projects/legacy');

const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

interface Session {
  readonly http: NodeStreamableHTTPServerTransport;
  readonly stdio: StdioClientTransport;
}

const sessions = new Map<string, Session>();

/**
 * Every child spawned, registered or not.
 *
 * A request that never completes initialization still spawns one, and it is not
 * in `sessions` because no session id was ever issued. Without this set those
 * children outlive the run: their pipes keep this process's event loop alive,
 * so the proxy never exits and whatever is waiting on it waits forever.
 */
const children = new Set<StdioClientTransport>();

/** Closes an unclaimed child rather than letting it idle for the whole run. */
const UNCLAIMED_CHILD_TIMEOUT_MS = 30_000;

/**
 * Stands one HTTP session in front of one stdio child process.
 *
 * A session per child is what the suite expects and what the previous adapter
 * lacked: it held a single transport for the whole process, so the first
 * scenario claimed the session and every scenario after it was answered
 * `Session not found`.
 */
async function createSession(): Promise<Session> {
  const stdio = new StdioClientTransport({
    command: process.execPath,
    args: [cli, '--project-root', projectRoot],
    stderr: 'pipe',
  });

  children.add(stdio);
  const unclaimed = setTimeout(() => {
    void stdio.close();
    void http.close();
  }, UNCLAIMED_CHILD_TIMEOUT_MS);
  unclaimed.unref();

  const http = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (sessionId: string) => {
      clearTimeout(unclaimed);
      sessions.set(sessionId, { http, stdio });
    },
    onsessionclosed: (sessionId: string) => {
      sessions.delete(sessionId);
      void stdio.close();
    },
  });

  http.onmessage = (message: JSONRPCMessage) => {
    void stdio.send(message).catch(report);
  };
  stdio.onmessage = (message: JSONRPCMessage) => {
    void http.send(message).catch(report);
  };

  // A child that dies takes its HTTP session with it, rather than leaving the
  // suite waiting on a response that can never arrive.
  stdio.onclose = () => {
    clearTimeout(unclaimed);
    children.delete(stdio);
    void http.close();
  };
  http.onclose = () => {
    void stdio.close();
  };
  stdio.onerror = report;
  http.onerror = report;

  stdio.stderr?.on('data', (chunk: unknown) => {
    process.stderr.write(`candidate stderr: ${String(chunk)}`);
  });

  await stdio.start();
  await http.start();
  return { http, stdio };
}

function report(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Conformance stdio proxy error: ${message}\n`);
}

function sessionIdOf(request: IncomingMessage): string | undefined {
  const header = request.headers['mcp-session-id'];
  return Array.isArray(header) ? header[0] : header;
}

const httpServer = createHttpServer((request, response) => {
  if (request.url !== '/mcp') {
    response.writeHead(404).end();
    return;
  }
  if (!validateHost(request, response) || !validateOrigin(request, response)) {
    return;
  }

  void (async () => {
    try {
      const sessionId = sessionIdOf(request);
      const existing = sessionId === undefined ? undefined : sessions.get(sessionId);
      // An unknown session id is passed to a fresh transport rather than
      // answered here, so the "session not found" behaviour under test stays
      // the transport's, not this file's.
      const session = existing ?? (await createSession());
      await session.http.handleRequest(request, response);
    } catch (error) {
      report(error);
      if (!response.headersSent) {
        response.writeHead(500).end();
      }
    }
  })();
});

const close = (): void => {
  for (const child of children) {
    void child.close();
  }
  children.clear();
  sessions.clear();
  httpServer.close(() => {
    process.exitCode = 0;
  });
  // A child that ignores close would otherwise hold this process open, and the
  // caller cannot tell that apart from a hung proxy. Leave regardless.
  setTimeout(() => {
    process.exit(0);
  }, 1_000).unref();
};
process.once('SIGINT', close);
process.once('SIGTERM', close);

httpServer.listen(0, '127.0.0.1', () => {
  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Conformance stdio proxy did not receive a TCP address');
  }
  process.stdout.write(`CONFORMANCE_URL=http://127.0.0.1:${String(address.port)}/mcp\n`);
});
