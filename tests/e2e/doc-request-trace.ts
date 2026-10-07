/** Test-only observation of real packaged-config reads; no I/O is replaced. */
import { appendFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports as synchronize } from 'node:module';

const trace = process.env.BGA_MCP_DOC_PRIVACY_TRACE;
const original = fs.readFile;
fs.readFile = (async (...arguments_: Parameters<typeof original>) => {
  if (
    trace !== undefined &&
    typeof arguments_[0] === 'string' &&
    arguments_[0].endsWith('doc-sources.json')
  ) {
    appendFileSync(trace, 'catalog-read\n');
  }
  return await original(...arguments_);
}) as typeof original;
synchronize();
