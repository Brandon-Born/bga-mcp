/**
 * Records and denies Node filesystem mutations in the installed server.
 * The two explicit harness logs are the only writable files; neither is part
 * of the isolated user profile or project. Reads and stdio remain available.
 * This is observation of the Node boundary, not an OS syscall sandbox.
 */
import fs from 'node:fs';
import promises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

const open = fs.openSync;
const write = fs.writeSync;
const close = fs.closeSync;
const logPath = process.env.BGA_MCP_WRITE_LOG;
const networkLog = process.env.BGA_MCP_NETWORK_LOG;

function append(path: string, content: string): void {
  // appendFileSync itself calls fs.writeSync. Capture the issued primitives
  // instead, so recording a denied write cannot recurse into this observer.
  const descriptor = open(path, 'a');
  try {
    write(descriptor, content);
  } finally {
    close(descriptor);
  }
}

function deny(name: string): never {
  if (logPath !== undefined) append(logPath, `${name}\n`);
  throw new Error(`filesystem mutation denied by the telemetry test harness: ${name}`);
}

const mutations = [
  'writeFile',
  'appendFile',
  'write',
  'writev',
  'createWriteStream',
  'mkdir',
  'mkdtemp',
  'copyFile',
  'cp',
  'rename',
  'unlink',
  'rm',
  'rmdir',
  'truncate',
  'ftruncate',
  'chmod',
  'fchmod',
  'lchmod',
  'chown',
  'fchown',
  'lchown',
  'utimes',
  'futimes',
  'lutimes',
  'link',
  'symlink',
];

for (const [target, prefix] of [
  [fs, 'fs'],
  [promises, 'fs/promises'],
] as const) {
  const record = target as unknown as Record<string, unknown>;
  for (const mutation of mutations) {
    for (const name of [mutation, `${mutation}Sync`]) {
      if (typeof record[name] !== 'function') continue;
      record[name] = (...args: unknown[]): never | void => {
        // network-denied.ts has its own observed sink. Allow exactly that sink
        // so a caught network denial cannot hide the independent attempt log.
        if (name === 'appendFileSync' && networkLog !== undefined && args[0] === networkLog) {
          append(networkLog, args[1] as string);
          return;
        }
        return deny(`${prefix}.${name}`);
      };
    }
  }
  for (const name of ['open', 'openSync']) {
    const original = record[name];
    if (typeof original !== 'function') continue;
    record[name] = (...args: unknown[]): unknown => {
      const flags = args[1];
      const readOnly =
        typeof flags === 'string'
          ? flags === 'r' || flags === 'rs' || flags === 'sr'
          : typeof flags === 'number' &&
            (flags &
              (fs.constants.O_WRONLY |
                fs.constants.O_RDWR |
                fs.constants.O_CREAT |
                fs.constants.O_TRUNC |
                fs.constants.O_APPEND)) ===
              0;
      if (!readOnly) return deny(`${prefix}.${name}`);
      return Reflect.apply(original, target, args) as unknown;
    };
  }
}
syncBuiltinESMExports();
