/** Test-only observation of issued filesystem promises, never OS cancellation. */
import { appendFileSync, type Dir } from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';

const target = process.env.BGA_MCP_FS_MATRIX_TARGET;
const occurrence = Number(process.env.BGA_MCP_FS_MATRIX_OCCURRENCE ?? '1');
const completionMs = Number(process.env.BGA_MCP_FS_MATRIX_COMPLETION_MS);
const cleanupMs = Number(process.env.BGA_MCP_FS_MATRIX_CLEANUP_MS ?? '0');
const recoveryMs = Number(process.env.BGA_MCP_FS_MATRIX_RECOVERY_MS ?? '0');
const path = process.env.BGA_MCP_FS_MATRIX_TRANSCRIPT;
const startup = process.env.BGA_MCP_FS_MATRIX_STARTUP === '1';
if (
  !target ||
  !path ||
  !Number.isInteger(occurrence) ||
  occurrence < 1 ||
  !Number.isInteger(completionMs) ||
  completionMs < 1 ||
  !Number.isInteger(cleanupMs) ||
  cleanupMs < 0 ||
  !Number.isInteger(recoveryMs) ||
  recoveryMs < 0
)
  throw new Error('Invalid filesystem matrix probe configuration');
const transcript = path;
const now = performance.now.bind(performance);
const timer = globalThis.setTimeout;
let expiry: (() => void) | undefined;
let expired = false;
let selected = false;
let active = false;
let count = 0;
let sequence = 0;
let files = 0;
let directories = 0;
let recoveryHeld = false;

function record(event: string, operation?: string): void {
  appendFileSync(
    transcript,
    JSON.stringify({
      sequence: ++sequence,
      event,
      operation,
      expired,
      files,
      directories,
      time: now(),
    }) + '\n',
  );
}
function stage(): string {
  const stack = new Error().stack ?? '';
  const stages = [
    'ensureClientRoots',
    'resolveWithinProject',
    'resolveProjectRoot',
    'readProjectFile',
    'walk',
    'readSessionFile',
    'readPackagedConfig',
    'resolveConfiguredRoots',
    'create',
  ];
  return (
    stages
      .map((name) => ({ name, index: stack.indexOf(name) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index)[0]?.name ?? 'other'
  );
}
async function pause(ms: number): Promise<void> {
  if (ms)
    await new Promise<void>((resolve) => {
      timer(resolve, ms);
    });
}
async function observe<T>(kind: string, issue: () => Promise<T>, cleanup = false): Promise<T> {
  if (!active) return await issue();
  const operation = `${stage()}:${kind}`;
  let hold = 0;
  if (!selected && operation === target && ++count === occurrence) {
    selected = true;
    record('setup:start', operation);
    await pause(200); // Setup outlasts the nominal 100 ms deadline deliberately.
    record('setup:end', operation);
    hold = completionMs;
  } else if (expired && cleanup) hold = cleanupMs;
  else if (published && !recoveryHeld && recoveryMs > 0 && operation === 'readSessionFile:read') {
    recoveryHeld = true;
    hold = recoveryMs;
  }
  record(cleanup ? 'cleanup:start' : 'work:start', operation);
  // Issue the actual primitive before queued expiry and attach both handlers.
  const pending = issue().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  if (recoveryHeld && hold === recoveryMs) record('recovery:issued', operation);
  if (hold === completionMs && !expired) {
    record('selected:issued', operation);
    queueMicrotask(() => {
      expiry?.();
    });
  }
  await pause(hold);
  const result = await pending;
  record(cleanup ? 'cleanup:end' : 'work:end', operation);
  if ('error' in result) throw result.error;
  return result.value;
}

Object.defineProperty(performance, 'now', {
  configurable: true,
  value: () => {
    const stack = new Error().stack ?? '';
    return stack.includes('registerDeadline') || stack.includes('cancellationCheckpoint')
      ? expired
        ? 101
        : 0
      : now();
  },
});
globalThis.setTimeout = ((
  callback: (...args: unknown[]) => void,
  ms?: number,
  ...args: unknown[]
) => {
  const stack = new Error().stack ?? '';
  const startupRegistration = target.startsWith('readPackagedConfig:')
    ? stack.includes('readPackagedConfig')
    : /\b(?:PolicyBoundary|Function)\.create\b/u.test(stack);
  if (
    !selected &&
    ms === (startup ? 10000 : 100) &&
    stack.includes('runWithTimeout') &&
    (startup
      ? startupRegistration
      : !/\b(?:PolicyBoundary|Function)\.create\b/u.test(stack) &&
        !stack.includes('readPackagedConfig'))
  ) {
    active = true;
    record('deadline:register');
    expiry = () => {
      if (!expired) {
        expired = true;
        record('deadline:expire');
        callback(...args);
      }
    };
    return timer(() => undefined, ms);
  }
  // Observe the real cleanup ceiling without changing its scheduling. A nominal
  // 150 ms hold plus actual native cleanup/logging can exceed 250 ms under load.
  if (active && ms === 250 && (new Error().stack ?? '').includes('runWithTimeout')) {
    return timer(() => {
      // The losing race timer is not abandoned filesystem work.
      if (!published) record('cleanup:ceiling');
      callback(...args);
    }, ms);
  }
  return timer(callback, ms, ...args);
}) as typeof setTimeout;
const write = process.stdout.write.bind(process.stdout);
const errorWrite = process.stderr.write.bind(process.stderr);
let published = false;
process.stderr.write = ((...args: Parameters<typeof errorWrite>) => {
  const chunk = args[0];
  const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
  if (startup && !published && text.includes('policy.timeout.exceeded')) {
    published = true;
    record('response:timeout');
  }
  return errorWrite(...args);
}) as typeof process.stderr.write;
process.stdout.write = ((...args: Parameters<typeof write>) => {
  const chunk = args[0];
  const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
  if (!published && text.includes('policy.timeout.exceeded')) {
    for (const line of text.split('\n')) {
      try {
        const frame: unknown = JSON.parse(line);
        if (
          typeof frame === 'object' &&
          frame !== null &&
          (('error' in frame && typeof frame.error === 'object' && frame.error !== null) ||
            ('result' in frame &&
              typeof frame.result === 'object' &&
              frame.result !== null &&
              'isError' in frame.result &&
              frame.result.isError === true))
        ) {
          published = true;
          record('response:timeout');
          // Later readiness calls are independent operations, not abandoned work.
        }
      } catch {
        /* A partial or non-JSON frame is not publication evidence. */
      }
    }
  }
  return write(...args);
}) as typeof process.stdout.write;

const fs = createRequire(import.meta.url)('node:fs/promises') as typeof FsPromises;
const realpath = fs.realpath;
const readFile = fs.readFile;
fs.readFile = (async (...args: Parameters<typeof readFile>) => {
  const options = args[1];
  const signal =
    typeof options === 'object' && options !== null && 'signal' in options
      ? options.signal
      : undefined;
  try {
    return await observe('readFile', () => readFile(...args));
  } finally {
    if (active && stage() === 'readPackagedConfig')
      record(
        'readFile:signal',
        signal === undefined ? 'missing' : signal.aborted ? 'aborted' : 'live',
      );
  }
}) as typeof readFile;
fs.realpath = (async (...args: Parameters<typeof realpath>) =>
  await observe('realpath', () => realpath(...args))) as typeof realpath;
const lstat = fs.lstat;
fs.lstat = (async (...args: Parameters<typeof lstat>) =>
  await observe('lstat', () => lstat(...args))) as typeof lstat;
const open = fs.open;
fs.open = async (...args: Parameters<typeof open>) =>
  await observe('open', async () => {
    const handle = await open(...args);
    if (!active) return handle;
    files++;
    record('file:acquired');
    const stat = handle.stat.bind(handle);
    handle.stat = (async (...statArgs: Parameters<typeof stat>) =>
      await observe('stat', () => stat(...statArgs))) as typeof stat;
    const read = handle.read.bind(handle);
    handle.read = async (...readArgs: Parameters<typeof read>) =>
      await observe('read', () => read(...readArgs));
    const close = handle.close.bind(handle);
    handle.close = async () =>
      await observe(
        'close',
        async () => {
          await close();
          files--;
          record('file:released');
        },
        true,
      );
    return handle;
  });
function instrumentDirectory(dir: Dir): Dir {
  directories++;
  record('directory:acquired');
  let released = false;
  function release(): void {
    if (!released) {
      released = true;
      directories--;
      record('directory:released');
    }
  }
  const close = dir.close.bind(dir);
  dir.close = async () =>
    await observe(
      'dir-close',
      async () => {
        try {
          await close();
          release();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ERR_DIR_CLOSED') release();
          throw error;
        }
      },
      true,
    );
  const iterator = dir[Symbol.asyncIterator].bind(dir);
  dir[Symbol.asyncIterator] = () => {
    const source = iterator();
    const next = source.next.bind(source);
    source.next = async (...args: Parameters<typeof next>) =>
      await observe('dir-next', async () => {
        const result = await next(...args);
        if (result.done) release();
        return result;
      });
    const returned = source.return?.bind(source);
    if (returned)
      source.return = async (...args: Parameters<typeof returned>) =>
        await observe(
          'dir-return',
          async () => {
            const result = await returned(...args);
            release();
            return result;
          },
          true,
        );
    return source;
  };
  return dir;
}
const opendir = fs.opendir;
fs.opendir = async (...args: Parameters<typeof opendir>) =>
  await observe('opendir', async () => {
    const dir = await opendir(...args);
    return active ? instrumentDirectory(dir) : dir;
  });
syncBuiltinESMExports();
