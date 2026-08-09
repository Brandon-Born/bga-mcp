/**
 * Points the server's HTTPS requests at a stub the test controls.
 *
 * Loaded with `--import` before the installed server starts, this replaces the
 * agent's connection factory: every documentation request is answered by a
 * local HTTP server the suite scripts, or fails the way the suite asked it to.
 *
 * It exists because the failures that matter here cannot be arranged against a
 * real wiki. Nobody can ask boardgamearena.com to lose DNS, stall, or answer
 * one page and not another, and the defect this covers — an outage returning
 * "no documentation matched" — is exactly what a live green run hides.
 *
 * What it deliberately does not prove: TLS, the address guard, and DNS
 * resolution are all replaced along with the socket, so nothing here is
 * evidence about them. They have their own coverage, and a stub that answered
 * as `en.doc.boardgamearena.com` while listening on loopback would otherwise
 * read as evidence that loopback is reachable, which it must never be.
 */
import { Agent } from 'node:https';
import { connect } from 'node:net';

/** How the connection itself behaves, before any request is written. */
type ConnectBehaviour = 'ok' | 'dns-failure';

const port = Number.parseInt(process.env.BGA_MCP_DOC_STUB_PORT ?? '', 10);
const behaviour = (process.env.BGA_MCP_DOC_STUB_CONNECT ?? 'ok') as ConnectBehaviour;

if (!Number.isInteger(port) && behaviour === 'ok') {
  throw new Error('BGA_MCP_DOC_STUB_PORT must name the port of the stub documentation server');
}

type Callback = (error: Error | null, socket?: unknown) => void;

const agent = Agent.prototype as unknown as {
  createConnection: (options: unknown, callback: Callback) => unknown;
};

agent.createConnection = (_options: unknown, callback: Callback): unknown => {
  if (behaviour === 'dns-failure') {
    // The shape Node produces when a name does not resolve, which is the
    // condition the 2026-08-08 review ran under.
    const failure = Object.assign(new Error('getaddrinfo ENOTFOUND en.doc.boardgamearena.com'), {
      code: 'ENOTFOUND',
      syscall: 'getaddrinfo',
      hostname: 'en.doc.boardgamearena.com',
    });
    process.nextTick(() => {
      callback(failure);
    });
    return undefined;
  }
  return connect({ port, host: '127.0.0.1' });
};
