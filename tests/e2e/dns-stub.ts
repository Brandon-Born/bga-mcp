/**
 * Answers the installed server's name resolution with addresses the test picks.
 *
 * Loaded with `--import` before the server starts. It records every lookup and
 * every socket event to the file named by `BGA_MCP_DNS_LOG`, so a suite can
 * assert not only that a request was refused but that nothing was connected to
 * and that the name was not resolved a second time.
 *
 * The production guard, resolver wiring, and socket lookup all run: what is
 * replaced is the answer DNS gives, which is the one thing a test cannot
 * arrange for a name it does not control. That is also the attack — a hostile
 * or mistaken record for an allowlisted host — so it is the input worth
 * controlling.
 *
 * `node:dns` is patched through `createRequire` rather than imported. An ESM
 * `import` of a builtin freezes its named exports at that moment, so importing
 * it here would hand the server the original function and quietly prove
 * nothing.
 */
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';

interface Answer {
  readonly address: string;
  readonly family: number;
}

const logPath = process.env.BGA_MCP_DNS_LOG ?? '';
/** One answer per lookup, in order. The last one repeats. */
const answers = JSON.parse(process.env.BGA_MCP_DNS_ANSWERS ?? '[]') as Answer[][];
const stallResolution = process.env.BGA_MCP_DNS_STALL === '1';
let lookups = 0;

function record(entry: Record<string, unknown>): void {
  if (logPath !== '') {
    appendFileSync(logPath, `${JSON.stringify({ ...entry, at: Date.now() })}\n`);
  }
}

const require = createRequire(import.meta.url);
const dns = require('node:dns') as Record<string, unknown>;

function takeAnswer(hostname: string): Answer[] {
  const answer = answers[Math.min(lookups, answers.length - 1)] ?? [];
  lookups += 1;
  record({ kind: 'lookup', hostname, answer, call: lookups });
  return answer;
}

dns.lookup = (
  hostname: string,
  options: unknown,
  callback?: (error: Error | null, ...rest: unknown[]) => void,
): void => {
  const answer = takeAnswer(hostname);

  const done = (typeof options === 'function' ? options : callback) as (
    error: Error | null,
    ...rest: unknown[]
  ) => void;
  const all = typeof options === 'object' && options !== null && 'all' in options;
  process.nextTick(() => {
    if (answer.length === 0) {
      const failure = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
        code: 'ENOTFOUND',
      });
      done(failure);
      return;
    }
    if (all) {
      done(null, answer);
      return;
    }
    done(null, answer[0]?.address, answer[0]?.family);
  });
};

/**
 * Production uses a dedicated Resolver when a request carries a deadline,
 * because `dns.lookup` cannot be cancelled. Patch that resolver's answers too
 * while leaving its orchestration, per-request lifetime, and `cancel()` call
 * observable to the installed-package test.
 */
type ResolveCallback = (error: Error | null, addresses: string[]) => void;
interface ResolverState {
  readonly hostname: string;
  readonly answer: readonly Answer[];
  readonly pending: Set<ResolveCallback>;
  cancelled: boolean;
}

const resolverStates = new WeakMap<object, ResolverState>();
const ResolverClass = dns.Resolver as { readonly prototype: object };

function stateFor(resolver: object, hostname: string): ResolverState {
  const existing = resolverStates.get(resolver);
  if (existing !== undefined) {
    return existing;
  }
  const created: ResolverState = {
    hostname,
    answer: takeAnswer(hostname),
    pending: new Set(),
    cancelled: false,
  };
  resolverStates.set(resolver, created);
  return created;
}

function noRecords(hostname: string): Error {
  return Object.assign(new Error(`query ENODATA ${hostname}`), { code: 'ENODATA' });
}

function patchResolve(method: 'resolve4' | 'resolve6', family: 4 | 6): void {
  Object.defineProperty(ResolverClass.prototype, method, {
    configurable: true,
    writable: true,
    value: function resolve(
      this: object,
      hostname: string,
      optionsOrCallback: unknown,
      maybeCallback?: ResolveCallback,
    ): void {
      const callback = (
        typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      ) as ResolveCallback | undefined;
      if (callback === undefined) {
        throw new TypeError(`${method} requires a callback`);
      }

      const state = stateFor(this, hostname);
      if (stallResolution) {
        state.pending.add(callback);
        return;
      }
      process.nextTick(() => {
        if (state.cancelled) {
          return;
        }
        const matching = state.answer
          .filter((entry) => entry.family === family)
          .map((entry) => entry.address);
        callback(matching.length === 0 ? noRecords(hostname) : null, matching);
      });
    },
  });
}

patchResolve('resolve4', 4);
patchResolve('resolve6', 6);
Object.defineProperty(ResolverClass.prototype, 'cancel', {
  configurable: true,
  writable: true,
  value: function cancel(this: object): void {
    const state = resolverStates.get(this);
    if (state === undefined || state.cancelled) {
      return;
    }
    state.cancelled = true;
    record({ kind: 'cancel', hostname: state.hostname });
    const failure = Object.assign(new Error('query cancelled'), { code: 'ECANCELLED' });
    for (const callback of state.pending) {
      process.nextTick(() => {
        callback(failure, []);
      });
    }
    state.pending.clear();
  },
});

/**
 * Whether an approved address may be connected to.
 *
 * Off by default: a case that answers with a public address would otherwise
 * send a real packet to a real stranger from whatever machine runs the suite.
 * With it on, the socket's own lookup is run and recorded and the socket is
 * then destroyed, so what the socket was handed is observable and nothing
 * leaves the machine.
 */
const observeOnly = process.env.BGA_MCP_DNS_OBSERVE_ONLY === '1';

// Sockets are recorded rather than replaced: `lookup` fires with what the
// guard answered, and `connect` fires only if a connection was actually
// established, so "nothing was connected to" is observable rather than assumed.
// Kept to call through with the socket as `this`, which is what the patch does.
// eslint-disable-next-line @typescript-eslint/unbound-method -- see above
const connect = net.Socket.prototype.connect;
type Connect = (this: net.Socket, ...args: unknown[]) => net.Socket;
(net.Socket.prototype as unknown as { connect: Connect }).connect = function patchedConnect(
  this: net.Socket,
  ...args: unknown[]
): net.Socket {
  this.on('lookup', (error: Error | null, address: string) => {
    record({
      kind: 'socket-lookup',
      error: (error as { code?: string } | null)?.code ?? null,
      address,
    });
  });
  this.on('connect', () => {
    record({ kind: 'connect', address: this.remoteAddress ?? '' });
  });

  const options = args[0] as { host?: string; lookup?: unknown } | undefined;
  const guarded = options?.lookup;
  if (observeOnly && typeof guarded === 'function') {
    // The socket's own lookup, called exactly as the socket would call it.
    (guarded as (host: string, options: unknown, callback: unknown) => void)(
      options?.host ?? '',
      { all: true },
      (error: Error | null, address: unknown) => {
        // Asked with `all`, the guard answers with a list. How many entries it
        // returns is the pinning: one approved address, not the set DNS gave.
        const approved = Array.isArray(address)
          ? (address as Answer[])
          : [{ address: String(address), family: 0 }];
        record({
          kind: 'socket-lookup',
          error: (error as { code?: string } | null)?.code ?? null,
          address: approved[0]?.address ?? '',
          approved: approved.length,
        });
        this.destroy(new Error('the harness observed this socket instead of connecting it'));
      },
    );
    return this;
  }
  return (connect as unknown as Connect).apply(this, args);
};
