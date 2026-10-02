import { runFrameworkChange } from './framework-change.js';

// BGA-408: use the same release ledger, and fetch only one explicitly selected
// official page. The former implicit multi-page --record loop is retired.
await runFrameworkChange(process.argv.slice(2));
