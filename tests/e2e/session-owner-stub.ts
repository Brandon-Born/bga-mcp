/** Observe actual descriptor ownership and reads; never substitute either UID. */
import { appendFileSync } from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';

const selected = process.env.BGA_MCP_OWNER_FILE;
const transcript = process.env.BGA_MCP_OWNER_TRANSCRIPT;
if (!selected || !transcript) throw new Error('Ownership observation needs owned fixture paths');
const log = transcript;
let grew = false;
function record(event: string, fields: Record<string, number> = {}): void {
  appendFileSync(log, JSON.stringify({ event, processUid: process.getuid?.(), ...fields }) + '\n');
}
const fs = createRequire(import.meta.url)('node:fs/promises') as typeof FsPromises;
const open = fs.open;
fs.open = async (...arguments_: Parameters<typeof open>) => {
  const handle = await open(...arguments_);
  if (String(arguments_[0]) !== selected) return handle;
  record('open');
  const stat = handle.stat.bind(handle);
  handle.stat = (async (...statArguments: Parameters<typeof stat>) => {
    const metadata = await stat(...statArguments);
    record('stat', {
      fileUid: Number(metadata.uid),
      mode: Number(metadata.mode) & 0o777,
      size: Number(metadata.size),
    });
    if (process.env.BGA_MCP_OWNER_GROW === '1' && !grew) {
      grew = true;
      await fs.writeFile(selected, 'x'.repeat(8192));
      record('growth', { size: 8192 });
    }
    return metadata;
  }) as typeof stat;
  const read = handle.read.bind(handle);
  handle.read = async (...readArguments: Parameters<typeof read>) => {
    const values: readonly unknown[] = readArguments;
    record('read', {
      requestedBytes: typeof values[2] === 'number' ? values[2] : -1,
    });
    return await read(...readArguments);
  };
  const close = handle.close.bind(handle);
  handle.close = async () => {
    await close();
    record('close');
  };
  return handle;
};
syncBuiltinESMExports();
