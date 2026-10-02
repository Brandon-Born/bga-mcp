import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CompatibilityMatrix } from './lib/compatibility.js';
import {
  frameworkSources,
  verifyFrameworkPolicy,
  type FrameworkLedger,
} from './lib/framework-change.js';
import { expectSeededFailure, reportOrExit } from './lib/gate.js';
const root = resolve(import.meta.dirname, '..');
const load = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const ledger = await load<FrameworkLedger>('config/framework-review.json');
const sources = frameworkSources(
  await load<CompatibilityMatrix>('config/compatibility.json'),
  await load('config/rule-catalog.json'),
);
expectSeededFailure(
  'unowned framework response',
  verifyFrameworkPolicy({ ...ledger, owner: '' }, sources),
);
expectSeededFailure(
  'missing impact map',
  verifyFrameworkPolicy(ledger, [{ url: sources[0]?.url ?? '', claims: [], scenarios: [] }]),
);
for (const path of ['scripts/create-release-candidate.ts', 'scripts/documentation-inventory.ts']) {
  if (!(await readFile(resolve(root, path), 'utf8')).includes('await frameworkReleaseGuard()'))
    throw new Error(`${path} bypasses the framework publication hold`);
}
reportOrExit(
  'Framework process',
  verifyFrameworkPolicy(ledger, sources),
  `Framework change process maps ${String(sources.length)} official pages to compatibility claims and targeted tests. This offline policy gate does not clear live release holds; framework:release checks those separately.`,
);
