// External installed-process clock; never shipped or consulted by production.
// Only zero-argument date construction moves. Native timers and Date.now stay real.
import { readFileSync } from 'node:fs';
const clock = process.env.BGA_MCP_DOC_CACHE_CLOCK;
if (clock === undefined) throw new Error('Missing documentation test clock');
globalThis.Date = new Proxy(Date, {
  construct(target, args: unknown[]) {
    return Reflect.construct(
      target,
      args.length === 0 ? [readFileSync(clock, 'utf8').trim()] : args,
    ) as Date;
  },
});
