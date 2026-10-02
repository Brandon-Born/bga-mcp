import { frameworkReleaseGuard } from './framework-change.js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import prettier from 'prettier';

import { HELP_TEXT, RELEASE_HELP_TEXT } from '../src/config.js';
import {
  INVENTORY_DOCUMENTS,
  inventoryBlock,
  readDocumentation,
  replaceInventory,
  verifyDocumentationPaths,
  verifyInventoryText,
} from './lib/documentation.js';
import { expectSeededFailure, reportOrExit } from './lib/gate.js';
import type { CapabilityManifest, ReleaseInventory } from './lib/release.js';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  await readFile(resolve(root, 'config/capabilities.json'), 'utf8'),
) as CapabilityManifest;
const release = JSON.parse(
  await readFile(resolve(root, 'config/release.json'), 'utf8'),
) as ReleaseInventory;
const documents = await readDocumentation(root);
if (process.argv.includes('--write')) {
  await frameworkReleaseGuard();
  for (const file of INVENTORY_DOCUMENTS) {
    // Keep the same formatting as the repository gate, without requiring callers to repair it.
    const updated = replaceInventory(documents[file] ?? '', inventoryBlock(manifest, release));
    const formatted = await prettier.format(updated, {
      ...(await prettier.resolveConfig(resolve(root, file))),
      filepath: file,
    });
    await writeFile(resolve(root, file), formatted);
  }
} else {
  const report = await verifyDocumentationPaths(root, documents, [HELP_TEXT, RELEASE_HELP_TEXT]);
  for (const file of INVENTORY_DOCUMENTS) {
    // Formatting is intentionally normalized before comparing the generated block.
    const text = documents[file] ?? '';
    const expected = await prettier.format(
      replaceInventory(text, inventoryBlock(manifest, release)),
      { ...(await prettier.resolveConfig(resolve(root, file))), filepath: file },
    );
    report.require(text === expected, `${file}: documented inventory differs from its sources`);
  }
  expectSeededFailure(
    'missing packaged documentation',
    await verifyDocumentationPaths(root, { 'README.md': '[missing](docs/SEEDED-MISSING.md)' }),
  );
  expectSeededFailure(
    'stale documented count',
    verifyInventoryText(
      inventoryBlock(manifest, release).replace('Tools: 7;', 'Tools: 99;'),
      manifest,
      release,
    ),
  );
  reportOrExit(
    'Documentation',
    report,
    'Documentation inventories and local links match their sources; missing-file and stale-count controls failed as expected. Packaged discovery is checked separately by E2E.',
  );
}
