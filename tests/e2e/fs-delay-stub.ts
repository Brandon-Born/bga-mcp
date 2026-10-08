/**
 * Delays one filesystem primitive before the installed policy module binds its
 * named imports. The test-only clock holds the first operation's deadline until
 * the delayed primitive is in flight, then invokes its actual expiry callback.
 * This file is loaded only through a test process's `--import`; it is not packed
 * and adds no production switch or callback. Real timer latency is tested by
 * the separate uninstrumented deadline case.
 */
import { appendFileSync } from 'node:fs';
import type { lstat as lstatFunction, open as openFunction } from 'node:fs/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';

interface FsPromises {
  lstat: typeof lstatFunction;
  open: typeof openFunction;
}

const operation = process.env.BGA_MCP_FS_DELAY_OPERATION;
const delayMs = Number.parseInt(process.env.BGA_MCP_FS_DELAY_MS ?? '', 10);
const deadlineMs = Number.parseInt(process.env.BGA_MCP_FS_DEADLINE_MS ?? '', 10);
const setupDelayMs = Number.parseInt(process.env.BGA_MCP_FS_SETUP_DELAY_MS ?? '', 10);
const transcript = process.env.BGA_MCP_FS_DELAY_TRANSCRIPT;

if (
  (operation !== 'lstat' && operation !== 'handle-read') ||
  !Number.isInteger(delayMs) ||
  delayMs <= 0 ||
  !Number.isInteger(deadlineMs) ||
  deadlineMs <= 0 ||
  !Number.isInteger(setupDelayMs) ||
  setupDelayMs <= deadlineMs ||
  transcript === undefined
) {
  throw new Error(
    'The filesystem probe requires an operation, delays, a positive deadline, and transcript; setup must exceed the deadline',
  );
}
const transcriptPath = transcript;

function record(event: string): void {
  appendFileSync(transcriptPath, `${event}\t${String(Date.now())}\n`, { encoding: 'utf8' });
}

const originalNow = performance.now.bind(performance);
const originalSetTimeout = globalThis.setTimeout;
let expireDeadline: (() => void) | undefined;
let expired = false;
let setupDelayed = false;
let timeoutPublished = false;

// Observe the child publishing its timeout before transport scheduling can make
// a late native completion appear to have preceded the response at the client.
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((...arguments_: Parameters<typeof originalWrite>) => {
  const chunk = arguments_[0];
  const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
  if (!timeoutPublished && text.includes('policy.timeout.exceeded')) {
    for (const line of text.split('\n')) {
      try {
        const frame: unknown = JSON.parse(line);
        if (
          typeof frame === 'object' &&
          frame !== null &&
          'result' in frame &&
          typeof frame.result === 'object' &&
          frame.result !== null &&
          'isError' in frame.result &&
          frame.result.isError === true
        ) {
          timeoutPublished = true;
          record('response:timeout');
        }
      } catch {
        // Non-JSON output is not evidence of a published tool response.
      }
    }
  }
  return originalWrite(...arguments_);
}) as typeof process.stdout.write;

Object.defineProperty(performance, 'now', {
  configurable: true,
  value: function filesystemProbeClock(): number {
    const stack = new Error().stack ?? '';
    if (stack.includes('registerDeadline') || stack.includes('cancellationCheckpoint')) {
      return expired ? deadlineMs + 1 : 0;
    }
    return originalNow();
  },
});

// Capture only the first operation's real expiry callback. Its returned timer
// stays a real Node handle that production clears normally. Letting it fire a
// no-op cannot expire the operation before the primitive has been issued.
globalThis.setTimeout = ((
  callback: (...arguments_: unknown[]) => void,
  milliseconds?: number,
  ...arguments_: unknown[]
) => {
  if (
    expireDeadline === undefined &&
    milliseconds === deadlineMs &&
    (new Error().stack ?? '').includes('runWithTimeout') &&
    !/\b(?:PolicyBoundary|Function)\.create\b/u.test(new Error().stack ?? '') &&
    !(new Error().stack ?? '').includes('readPackagedConfig')
  ) {
    record('deadline:register');
    expireDeadline = () => {
      if (!expired) {
        expired = true;
        record('deadline:expire');
        callback(...arguments_);
      }
    };
    return originalSetTimeout(() => undefined, milliseconds);
  }
  return originalSetTimeout(callback, milliseconds, ...arguments_);
}) as typeof setTimeout;

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    originalSetTimeout(resolve, milliseconds);
  });
}

/** Issue native I/O first, then hold its observed completion for the probe. */
async function heldCompletion<T>(pending: Promise<T>): Promise<T> {
  // Attach both handlers immediately: a delayed native rejection must not
  // become unhandled while the test holds its completion.
  const observed = pending.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await delay(delayMs);
  const result = await observed;
  if ('error' in result) {
    throw result.error;
  }
  return result.value;
}

async function slowSetup(): Promise<void> {
  if (expireDeadline !== undefined && !setupDelayed) {
    setupDelayed = true;
    record('setup:start');
    await delay(setupDelayMs);
    record('setup:end');
  }
}

function start(event: string): void {
  record(event);
  if (expireDeadline !== undefined && !expired) {
    // The async syscall wrapper returns its pending promise before expiry.
    queueMicrotask(expireDeadline);
  }
}

const require = createRequire(import.meta.url);
const fsPromises = require('node:fs/promises') as FsPromises;

if (operation === 'lstat') {
  const original = fsPromises.lstat;
  fsPromises.lstat = (async (...arguments_: Parameters<typeof original>) => {
    await slowSetup();
    start('lstat:start');
    try {
      return await heldCompletion(original(...arguments_));
    } finally {
      record('lstat:end');
    }
  }) as typeof original;
} else {
  const originalOpen = fsPromises.open;
  fsPromises.open = async (...arguments_: Parameters<typeof originalOpen>) => {
    await slowSetup();
    const handle = await originalOpen(...arguments_);
    const originalRead = handle.read.bind(handle);
    handle.read = async (...readArguments: Parameters<typeof originalRead>) => {
      start('read:start');
      try {
        return await heldCompletion(originalRead(...readArguments));
      } finally {
        record('read:end');
      }
    };
    return handle;
  };
}

syncBuiltinESMExports();
