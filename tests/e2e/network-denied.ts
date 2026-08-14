/**
 * Denies the server every way out of the machine.
 *
 * Loaded with `--import` before the server starts, this replaces the network
 * primitives with functions that throw and record the attempt. If any
 * capability tries to open a socket, resolve a name, or make a request, the
 * server fails loudly instead of succeeding quietly, and the attempt is written
 * to the file named by BGA_MCP_NETWORK_LOG.
 */
import { appendFileSync } from 'node:fs';
import dgram from 'node:dgram';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const logPath = process.env.BGA_MCP_NETWORK_LOG;

function deny(what: string): never {
  if (logPath !== undefined && logPath !== '') {
    appendFileSync(logPath, `${what}\n`);
  }
  throw new Error(`network access denied by the test harness: ${what}`);
}

function denyAll(target: object, names: readonly string[], label: string): void {
  const record = target as Record<string, unknown>;
  for (const name of names) {
    if (typeof record[name] !== 'function') {
      continue;
    }
    record[name] = (...args: unknown[]): never => {
      void args;
      return deny(`${label}.${name}`);
    };
  }
}

denyAll(net, ['connect', 'createConnection'], 'net');
denyAll(tls, ['connect'], 'tls');
denyAll(http, ['request', 'get'], 'http');
denyAll(https, ['request', 'get'], 'https');
denyAll(dns, ['lookup', 'resolve', 'resolve4', 'resolve6'], 'dns');
denyAll(dnsPromises, ['lookup', 'resolve', 'resolve4', 'resolve6'], 'dns/promises');
denyAll(dns.Resolver.prototype, ['resolve4', 'resolve6'], 'dns.Resolver');
denyAll(dnsPromises.Resolver.prototype, ['resolve4', 'resolve6'], 'dns/promises.Resolver');
denyAll(dgram, ['createSocket'], 'dgram');

const originalFetch = globalThis.fetch;
if (typeof originalFetch === 'function') {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: (): never => deny('fetch'),
  });
}

// A socket constructed directly bypasses net.connect, so the prototype is
// replaced as well.
net.Socket.prototype.connect = function connect(): never {
  return deny('net.Socket.connect');
};
