import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  INVENTORY_DOCUMENTS,
  inventoryBlock,
  readDocumentation,
  verifyDiscovery,
  verifyDocumentationPaths,
  verifyInventoryText,
} from '../../scripts/lib/documentation.js';
import type { CapabilityManifest, ReleaseInventory } from '../../scripts/lib/release.js';
import {
  installPackagedServer,
  withPackagedServer,
  withPublicPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';

let installed: PackagedServer<'legacy'>;
let manifest: CapabilityManifest;
let release: ReleaseInventory;
let documents: Record<string, string>;

beforeAll(async () => {
  installed = await installPackagedServer('documentation', { legacy: 'legacy' });
  manifest = JSON.parse(
    await readFile(resolve(installed.packageRoot, 'config/capabilities.json'), 'utf8'),
  ) as CapabilityManifest;
  release = JSON.parse(
    await readFile(resolve(installed.packageRoot, 'config/release.json'), 'utf8'),
  ) as ReleaseInventory;
  documents = await readDocumentation(installed.packageRoot);
  expect(documents).toEqual(await readDocumentation(resolve(import.meta.dirname, '../..')));
}, 120_000);
afterAll(async () => await installed.cleanup());

it('[E2E-DOCUMENTATION-PUBLIC] resolves installed Markdown/help links and compares public discovery with every documented inventory', async () => {
  const help = await runCommand(installed.publicCommand.command, [
    ...installed.publicCommand.arguments,
    '--help',
  ]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout).toContain('docs/INSTALL.md');
  expect(
    (await verifyDocumentationPaths(installed.packageRoot, documents, [help.stdout])).failures,
  ).toEqual([]);
  for (const file of INVENTORY_DOCUMENTS) {
    expect(verifyInventoryText(documents[file] ?? '', manifest, release).failures, file).toEqual(
      [],
    );
  }
  const response = await withPublicPackagedServer(
    installed,
    ['--project-root', installed.projects.legacy],
    async (client) => {
      const actual = {
        tools: (await client.listTools()).tools.map((entry) => entry.name),
        templates: (await client.listResourceTemplates()).resourceTemplates.map(
          (entry) => entry.uriTemplate,
        ),
        resources: (await client.listResources()).resources.map((entry) => entry.uri),
        prompts: (await client.listPrompts()).prompts.map((entry) => entry.name),
      };
      expect(verifyDiscovery(actual, manifest, release, 'public').failures).toEqual([]);
    },
  );
  expect(response.stderr).toBe('');
});

it('[E2E-DOCUMENTATION-DEVELOPMENT] compares installed development tools, templates, concrete resources and prompts without enabling network', async () => {
  const help = await runCommand(process.execPath, [installed.cli, '--help']);
  expect(help.exitCode).toBe(0);
  expect(help.stdout).toContain('network-off');
  expect(
    (await verifyDocumentationPaths(installed.packageRoot, documents, [help.stdout])).failures,
  ).toEqual([]);
  const response = await withPackagedServer(
    installed.cli,
    ['--project-root', installed.projects.legacy],
    async (client) => {
      const actual = {
        tools: (await client.listTools()).tools.map((entry) => entry.name),
        templates: (await client.listResourceTemplates()).resourceTemplates.map(
          (entry) => entry.uriTemplate,
        ),
        resources: (await client.listResources()).resources.map((entry) => entry.uri),
        prompts: (await client.listPrompts()).prompts.map((entry) => entry.name),
      };
      expect(verifyDiscovery(actual, manifest, release, 'development').failures).toEqual([]);
      const refused = await client.callTool({
        name: 'search_bga_docs',
        arguments: { query: 'state classes' },
      });
      expect(refused.isError).toBe(true);
      expect(JSON.stringify(refused)).toContain('policy.network.disabled');
    },
  );
  expect(response.stderr).toBe('');
});

it('[E2E-DOCUMENTATION-NEGATIVE] rejects actual omitted files and seeded stale count, name, stability, boundary and help paths', async () => {
  const guide = resolve(installed.packageRoot, 'docs/INSTALL.md');
  const original = await readFile(guide);
  try {
    await rm(guide);
    const report = await verifyDocumentationPaths(installed.packageRoot, documents);
    expect(report.failures).toContain('README.md: missing packaged path docs/INSTALL.md');
    expect(
      (await verifyDocumentationPaths(installed.packageRoot, {}, ['Read docs/INSTALL.md'])).failed,
    ).toBe(true);
  } finally {
    await writeFile(guide, original);
  }
  const block = inventoryBlock(manifest, release);
  for (const [before, after] of [
    ['Tools: 7;', 'Tools: 99;'],
    ['resource templates: 1;', 'resource templates: 0;'],
    ['concrete resources: 11;', 'concrete resources: 5;'],
    ['prompts: 0.', 'prompts: 1.'],
    ['implemented 11', 'implemented 0'],
    ['experimental 1', 'experimental 0'],
    ['Network-backed entries: 11', 'Network-backed entries: 0'],
    ['inspect_project', 'imaginary_tool'],
    ['TB-DOCS-NETWORK', 'TB-LOCAL-FILESYSTEM'],
    ['| implemented |', '| verified |'],
  ] as const) {
    expect(block).toContain(before);
    expect(
      verifyInventoryText(block.replace(before, after), manifest, release).failed,
      before,
    ).toBe(true);
  }
  expect(
    (
      await verifyDocumentationPaths(installed.packageRoot, {
        'README.md': '[missing][ref]\n\n[ref]: docs/MISSING.md',
      })
    ).failed,
  ).toBe(true);
});
