/**
 * Delays one filesystem primitive before the installed policy module binds its
 * named imports. This file is loaded only through a test process's `--import`;
 * it is not packed and adds no production switch or callback.
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
const transcript = process.env.BGA_MCP_FS_DELAY_TRANSCRIPT;

if (
  (operation !== 'lstat' && operation !== 'handle-read') ||
  !Number.isInteger(delayMs) ||
  delayMs <= 0 ||
  transcript === undefined
) {
  throw new Error(
    'The filesystem delay probe requires an operation, positive delay, and transcript',
  );
}
const transcriptPath = transcript;

function record(event: string): void {
  appendFileSync(transcriptPath, `${event}\t${String(Date.now())}\n`, { encoding: 'utf8' });
}

async function delay(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

const require = createRequire(import.meta.url);
const fsPromises = require('node:fs/promises') as FsPromises;

if (operation === 'lstat') {
  const original = fsPromises.lstat;
  fsPromises.lstat = (async (...arguments_: Parameters<typeof original>) => {
    record('lstat:start');
    await delay();
    try {
      return await original(...arguments_);
    } finally {
      record('lstat:end');
    }
  }) as typeof original;
} else {
  const originalOpen = fsPromises.open;
  fsPromises.open = async (...arguments_: Parameters<typeof originalOpen>) => {
    const handle = await originalOpen(...arguments_);
    const originalRead = handle.read.bind(handle);
    handle.read = async (...readArguments: Parameters<typeof originalRead>) => {
      record('read:start');
      await delay();
      try {
        return await originalRead(...readArguments);
      } finally {
        record('read:end');
      }
    };
    return handle;
  };
}

syncBuiltinESMExports();
