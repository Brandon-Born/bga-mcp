import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exerciseInstallGuide } from './lib/install-guide.js';

// Run unchanged guide tooling in the consumer environment without invalidating native-client receipts.
const [artifact, repository, output] = process.argv.slice(2);
assert(artifact && repository && output);
const result = await exerciseInstallGuide(resolve(artifact), resolve(repository));
await writeFile(resolve(output), `${JSON.stringify(result)}\n`, { flag: 'wx' });
