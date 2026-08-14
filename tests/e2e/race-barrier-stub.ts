/**
 * Forces one filesystem mutation inside a precisely recorded policy window.
 *
 * This module is loaded into an installed test process before `src/policy.ts`
 * binds its named filesystem imports. It is outside the packed artifact and
 * has no production flag, callback, or dependency. The parent test observes
 * `barrier:reached`, proves the public call is still pending, and writes the
 * release file. Only then does this module mutate the isolated fixture and
 * invoke the real filesystem primitive.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import {
  appendFile,
  rename,
  symlink,
  type lstat as lstatFunction,
  type open as openFunction,
  type opendir as opendirFunction,
} from 'node:fs/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { normalize, resolve } from 'node:path';

type RaceCase = 'file-swap' | 'directory-swap' | 'growth';

interface FsPromises {
  lstat: typeof lstatFunction;
  open: typeof openFunction;
  opendir: typeof opendirFunction;
}

interface RaceEvent {
  readonly sequence: number;
  readonly case: RaceCase;
  readonly stage: string;
}

const raceCase = process.env.BGA_MCP_RACE_BARRIER_CASE as RaceCase | undefined;
const transcript = process.env.BGA_MCP_RACE_BARRIER_TRANSCRIPT;
const release = process.env.BGA_MCP_RACE_BARRIER_RELEASE;
const target = process.env.BGA_MCP_RACE_BARRIER_TARGET;
const safeDirectory = process.env.BGA_MCP_RACE_BARRIER_SAFE_DIRECTORY;
const displacedDirectory = process.env.BGA_MCP_RACE_BARRIER_DISPLACED_DIRECTORY;
const outsideDirectory = process.env.BGA_MCP_RACE_BARRIER_OUTSIDE_DIRECTORY;
const growthMarker = process.env.BGA_MCP_RACE_BARRIER_GROWTH_MARKER;

if (
  (raceCase !== 'file-swap' && raceCase !== 'directory-swap' && raceCase !== 'growth') ||
  transcript === undefined ||
  release === undefined ||
  target === undefined ||
  (raceCase !== 'growth' &&
    (safeDirectory === undefined ||
      displacedDirectory === undefined ||
      outsideDirectory === undefined)) ||
  (raceCase === 'growth' && growthMarker === undefined)
) {
  throw new Error('The filesystem race barrier requires a complete isolated-fixture description');
}

const selectedCase = raceCase;
const transcriptPath = transcript;
const releasePath = release;
const targetPath = normalize(resolve(target));
let sequence = 0;
let triggered = false;
let preOpenLstatComplete = false;
let preOpendirLstatComplete = false;
let opendirComplete = false;

function comparable(path: string): string {
  const normalized = normalize(resolve(path));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isTarget(value: unknown): boolean {
  return typeof value === 'string' && comparable(value) === comparable(targetPath);
}

function record(stage: string): void {
  sequence += 1;
  const event: RaceEvent = { sequence, case: selectedCase, stage };
  appendFileSync(transcriptPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8' });
}

function swapPaths(): {
  readonly safe: string;
  readonly displaced: string;
  readonly outside: string;
} {
  if (
    safeDirectory === undefined ||
    displacedDirectory === undefined ||
    outsideDirectory === undefined
  ) {
    throw new Error('A directory race reached its barrier without complete swap paths');
  }
  return { safe: safeDirectory, displaced: displacedDirectory, outside: outsideDirectory };
}

async function awaitRelease(): Promise<void> {
  record('barrier:reached');
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    if (existsSync(releasePath) && readFileSync(releasePath, 'utf8').trim() === 'release') {
      record('barrier:released');
      return;
    }
    await new Promise<void>((resolveDelay) => {
      setTimeout(resolveDelay, 5);
    });
  }
  throw new Error('The filesystem race barrier was never released by its parent test');
}

const require = createRequire(import.meta.url);
const fsPromises = require('node:fs/promises') as FsPromises;
const originalLstat = fsPromises.lstat;
const originalOpen = fsPromises.open;
const originalOpendir = fsPromises.opendir;

fsPromises.lstat = (async (...arguments_: Parameters<typeof originalLstat>) => {
  const info = await originalLstat(...arguments_);
  const stack = new Error().stack ?? '';
  if (
    selectedCase === 'file-swap' &&
    isTarget(arguments_[0]) &&
    stack.includes('readProjectFile') &&
    !triggered
  ) {
    preOpenLstatComplete = true;
    record('pre-open-lstat:complete');
  } else if (
    selectedCase === 'directory-swap' &&
    isTarget(arguments_[0]) &&
    stack.includes('walk') &&
    !triggered
  ) {
    preOpendirLstatComplete = true;
    record('pre-opendir-lstat:complete');
  } else if (selectedCase === 'directory-swap' && isTarget(arguments_[0]) && opendirComplete) {
    record('post-opendir-lstat:complete');
  }
  return info;
}) as typeof originalLstat;

fsPromises.open = async (...arguments_: Parameters<typeof originalOpen>) => {
  if (!isTarget(arguments_[0])) {
    return await originalOpen(...arguments_);
  }

  if (selectedCase === 'file-swap' && !triggered) {
    if (!preOpenLstatComplete) {
      throw new Error('The real open was reached before the policy completed its pre-open lstat');
    }
    triggered = true;
    await awaitRelease();
    const paths = swapPaths();
    record('mutation:rename-safe-directory');
    await rename(paths.safe, paths.displaced);
    record('mutation:link-outside-directory');
    await symlink(paths.outside, paths.safe, process.platform === 'win32' ? 'junction' : 'dir');
    record('real-open:start');
    const handle = await originalOpen(...arguments_);
    record('real-open:complete');
    const originalStat = handle.stat.bind(handle);
    Object.defineProperty(handle, 'stat', {
      configurable: true,
      value: async function instrumentedStat() {
        const info = await originalStat();
        record('descriptor-stat:complete');
        return info;
      },
      writable: true,
    });
    const originalRead = handle.read.bind(handle);
    handle.read = async (...readArguments: Parameters<typeof originalRead>) => {
      record('descriptor-read:start');
      const result = await originalRead(...readArguments);
      record('descriptor-read:complete');
      return result;
    };
    return handle;
  }

  const handle = await originalOpen(...arguments_);
  if (selectedCase !== 'growth' || triggered) {
    return handle;
  }

  triggered = true;
  record('real-open:complete');
  const originalStat = handle.stat.bind(handle);
  Object.defineProperty(handle, 'stat', {
    configurable: true,
    value: async function instrumentedStat() {
      const info = await originalStat();
      record('descriptor-stat:complete');
      await awaitRelease();
      record('mutation:append-growth');
      if (growthMarker === undefined) {
        throw new Error('The growth race reached its barrier without marker content');
      }
      await appendFile(targetPath, growthMarker);
      return info;
    },
    writable: true,
  });
  const originalRead = handle.read.bind(handle);
  handle.read = async (...readArguments: Parameters<typeof originalRead>) => {
    record('descriptor-read:start');
    const result = await originalRead(...readArguments);
    record('descriptor-read:complete');
    return result;
  };
  return handle;
};

fsPromises.opendir = async (...arguments_: Parameters<typeof originalOpendir>) => {
  if (selectedCase !== 'directory-swap' || triggered || !isTarget(arguments_[0])) {
    return await originalOpendir(...arguments_);
  }
  if (!preOpendirLstatComplete) {
    throw new Error('The real opendir was reached before the policy completed its pre-open lstat');
  }
  triggered = true;
  await awaitRelease();
  const paths = swapPaths();
  record('mutation:rename-configured-directory');
  await rename(paths.safe, paths.displaced);
  record('mutation:link-outside-directory');
  await symlink(paths.outside, paths.safe, process.platform === 'win32' ? 'junction' : 'dir');
  record('real-opendir:start');
  const directory = await originalOpendir(...arguments_);
  opendirComplete = true;
  record('real-opendir:complete');
  return directory;
};

syncBuiltinESMExports();
