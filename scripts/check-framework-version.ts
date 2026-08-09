import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { GateReport, reportOrExit } from './lib/gate.js';
import { runCommand } from '../tests/helpers/process.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

interface VersionReading {
  readonly status?: string;
  readonly reason?: string | null;
  readonly heading?: string | null;
  readonly versions?: readonly {
    readonly software?: string;
    readonly version?: string;
    readonly detail?: string | null;
    readonly statedAs?: string;
  }[];
  readonly conflicts?: readonly { readonly software?: string }[];
  readonly url?: string;
  readonly retrievedAt?: string;
}

/**
 * Software the maintained list states, and the value it stated when this was
 * last reviewed.
 *
 * The value is not asserted — BGA upgrades its platform and this would then
 * fail for being right. What is asserted is that the entry is read at all, and
 * a changed value is printed so the reviewer sees it.
 */
const EXPECTED: readonly { readonly software: string; readonly reviewedAs: string }[] = [
  { software: 'PHP', reviewedAs: '8.4' },
  { software: 'SQL', reviewedAs: '5.7' },
  { software: 'Dojo Toolkit', reviewedAs: '1.15' },
  { software: 'Font Awesome', reviewedAs: '4.7' },
  { software: 'Font Awesome', reviewedAs: '6.4.0' },
];

/** Installs the packed artifact, so this reads the resource a developer installs. */
async function installArtifact(root: string): Promise<string> {
  const pack = await runCommand(corepackCommand, ['pnpm', 'pack', '--pack-destination', root], {
    cwd: repositoryRoot,
    timeoutMs: 180_000,
  });
  if (pack.exitCode !== 0) {
    throw new Error(`Packing the artifact failed: ${pack.stderr}\n${pack.stdout}`);
  }
  const archive = (await readdir(root)).find((file) => file.endsWith('.tgz'));
  if (archive === undefined) {
    throw new Error('Package manager produced no tarball');
  }

  const installRoot = resolve(root, 'install');
  await mkdir(installRoot, { recursive: true });
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-version-check', private: true })}\n`,
  );
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, resolve(root, archive)],
    { timeoutMs: 180_000 },
  );
  if (install.exitCode !== 0) {
    throw new Error(`Installing the artifact failed: ${install.stderr}\n${install.stdout}`);
  }
  return resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');
}

/**
 * Reads the framework versions from the installed server against the live page.
 *
 * Deliberately outside `pnpm check`, for the same reason as the documentation
 * evaluation: it needs a third party's wiki, and a commit gate that depends on
 * someone else's uptime fails for reasons that have nothing to do with the
 * commit. It is run before a documentation release, and whenever the drift
 * monitor reports the Studio page changed.
 *
 * The offline captures in `tests/unit/framework-versions.test.ts` prove the
 * reading. This proves the reading is of the page that exists today, which no
 * capture can.
 */
async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'bga-mcp-version-check-'));
  const report = new GateReport();
  try {
    const cli = await installArtifact(root);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cli, '--allow-network'],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'bga-mcp-framework-version-check', version: '1.0.0' });
    await client.connect(transport);

    let reading: VersionReading;
    try {
      const response = await client.readResource(
        { uri: 'bga://framework/version' },
        { timeout: 60_000 },
      );
      const contents = response.contents as { text?: string }[];
      reading = JSON.parse(contents[0]?.text ?? '{}') as VersionReading;
    } finally {
      await client.close();
    }

    process.stdout.write(`status: ${reading.status ?? 'missing'} (${reading.url ?? 'no url'})\n`);
    process.stdout.write(`heading: ${reading.heading ?? 'none'}\n`);
    for (const entry of reading.versions ?? []) {
      const detail =
        entry.detail === null || entry.detail === undefined ? '' : ` (${entry.detail})`;
      process.stdout.write(
        `  ${entry.software ?? '?'} ${entry.version ?? '?'}${detail}` +
          `\n      stated as: ${entry.statedAs ?? ''}\n`,
      );
    }

    report.require(
      reading.status === 'read',
      `The resource returned ${reading.status ?? 'nothing'}: ${reading.reason ?? 'no reason given'}`,
    );
    report.require(
      reading.heading?.toLowerCase().includes('software versions') === true,
      `The reading anchored on "${reading.heading ?? 'nothing'}" rather than the Software Versions heading`,
    );

    const read = reading.versions ?? [];
    for (const expected of EXPECTED) {
      const found = read.filter((entry) => entry.software === expected.software);
      report.require(
        found.length > 0,
        `The page states a ${expected.software} version and the resource did not read one`,
      );
      if (found.length > 0 && !found.some((entry) => entry.version === expected.reviewedAs)) {
        // Not a failure: the platform moves. It is printed so that a release
        // is made by someone who has seen the change.
        process.stdout.write(
          `note: ${expected.software} was reviewed as ${expected.reviewedAs} and now reads ` +
            `${found.map((entry) => entry.version ?? '?').join(', ')}. Re-read the page and refresh the captures.\n`,
        );
      }
    }
    report.require(
      read.every((entry) => (entry.statedAs ?? '').length > 0),
      'A value was returned without the line it was read from',
    );
    report.require(
      !read.some((entry) => /^https?:/u.test(entry.version ?? '')),
      'A URL was returned as a version, which is the defect this check exists for',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  reportOrExit(
    'Live framework version',
    report,
    'The installed resource read the Software Versions section of the current Studio page, with a source line for every value.',
  );
}

await main();
