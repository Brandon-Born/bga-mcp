import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';
import { inject } from 'vitest';

import { connectStdio } from '../helpers/mcp.js';
import { recordInstalledArtifact } from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesRoot = resolve(repositoryRoot, 'tests/fixtures/projects');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

const SUMMARY = 'bga://project/summary';
const STATES = 'bga://project/states';
const DIAGNOSTICS = 'bga://project/diagnostics';

let temporaryRoot: string;
let cli: string;
let cleanRoot: string;
let brokenRoot: string;
let modernRoot: string;
let hybridRoot: string;
let unreadableRoot: string;
let largeRoot: string;
let refreshRoot: string;

async function digest(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      hash.update(relative(directory, path).split(sep).join('/'));
      hash.update(await readFile(path));
    }
  };
  await walk(directory);
  return hash.digest('hex');
}

async function readResource(client: Client, uri: string): Promise<Record<string, unknown>> {
  const result = await client.readResource({ uri }, { timeout: 15_000 });
  const contents = result.contents as { uri: string; mimeType?: string; text?: string }[];
  expect(contents).toHaveLength(1);
  expect(contents[0]?.uri).toBe(uri);
  expect(contents[0]?.mimeType).toBe('application/json');
  return JSON.parse(contents[0]?.text ?? '{}') as Record<string, unknown>;
}

async function withServer<T>(
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<T> {
  const connection = await connectStdio(process.execPath, [cli, ...arguments_], {
    timeoutMs: 10_000,
  });
  const processId = connection.transport.pid;
  try {
    return await use(connection.client);
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
  }
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-resources-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-resources-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  // The artifact is packed once for the whole run; see tests/global-setup.ts.
  const artifact = inject('packedArtifact');
  await recordInstalledArtifact('project-resources', artifact);
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, artifact],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');

  const projects = resolve(temporaryRoot, 'projects');
  cleanRoot = resolve(projects, 'cleangame');
  brokenRoot = resolve(projects, 'brokengame');
  modernRoot = resolve(projects, 'moderngame');
  hybridRoot = resolve(projects, 'hybridgame');
  unreadableRoot = resolve(projects, 'unreadablegame');
  refreshRoot = resolve(projects, 'refreshgame');
  largeRoot = resolve(projects, 'largegame');
  for (const [fixture, target] of [
    ['legacy', cleanRoot],
    ['legacy-broken', brokenRoot],
    ['modern', modernRoot],
    ['hybrid', hybridRoot],
    ['modern-unreadable', unreadableRoot],
    ['legacy', refreshRoot],
  ] as const) {
    await cp(resolve(fixturesRoot, fixture), target, { recursive: true });
    await rm(resolve(target, 'expected.json'));
  }

  // More files than the listing budget allows, so the resource has to bound
  // its own output rather than serve whatever the project happens to hold.
  await mkdir(largeRoot, { recursive: true });
  await writeFile(
    resolve(largeRoot, 'gameinfos.inc.php'),
    "<?php\n$gameinfos = ['game_name' => 'Large', 'players' => [2]];\n",
  );
  await writeFile(resolve(largeRoot, 'largegame.game.php'), '<?php\nclass X {}\n');
  for (let index = 0; index < 600; index += 1) {
    await writeFile(resolve(largeRoot, `module-${String(index)}.php`), '<?php\n// filler\n');
  }
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged project resources', () => {
  it('[E2E-RESOURCE-DISCOVERY] advertises exactly the resources the manifest declares', async () => {
    const listed = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await client.listResources(),
    );

    // The project resources, alongside the documentation ones this scenario
    // does not own.
    const projectResources = listed.resources
      .map((entry) => entry.uri)
      .filter((uri) => uri.startsWith('bga://project/'))
      .sort();
    expect(projectResources).toEqual([DIAGNOSTICS, STATES, SUMMARY]);
    for (const entry of listed.resources) {
      expect(entry.mimeType).toBe('application/json');
      expect(entry.description ?? '').not.toBe('');
    }
  });

  it('[E2E-RESOURCE-SUMMARY] serves the normalized project model', async () => {
    const summary = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await readResource(client, SUMMARY),
    );

    expect(summary).toMatchObject({
      schemaVersion: 1,
      layout: 'legacy',
      gameKey: 'bgamcplegacy',
      metadata: { gameName: 'BgaMcpLegacyFixture', playerCounts: [2] },
    });
    const components = summary.components as { id: string; present: boolean }[];
    expect(components.filter((component) => component.present).length).toBeGreaterThan(5);
  });

  it('[E2E-RESOURCE-STATES] serves state definitions with their validation and uncertainty', async () => {
    const states = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await readResource(client, STATES),
    );

    expect(states).toMatchObject({ schemaVersion: 1, source: 'states.inc.php', parsed: true });
    const definitions = states.definitions as { id: number; name: string }[];
    expect(definitions.map((state) => state.name)).toEqual(['gameSetup', 'playerTurn', 'gameEnd']);
    expect(states.unsupported).toEqual([]);
    expect(states.validation).toMatchObject({ status: 'passed' });
  });

  it('[E2E-RESOURCE-DIAGNOSTICS] serves the aggregate findings of every validator', async () => {
    const [clean, broken] = await Promise.all([
      withServer(
        ['--project-root', cleanRoot],
        async (client) => await readResource(client, DIAGNOSTICS),
      ),
      withServer(
        ['--project-root', brokenRoot],
        async (client) => await readResource(client, DIAGNOSTICS),
      ),
    ]);

    expect(clean).toMatchObject({ schemaVersion: 1, status: 'passed' });
    expect((clean.diagnostics as { findings: unknown[] }).findings).toEqual([]);

    expect(broken).toMatchObject({ status: 'findings' });
    const groups = broken.groups as { id: string; ran: boolean; findingCount: number }[];
    expect(groups.map((group) => group.id).sort()).toEqual([
      'action-contracts',
      'database',
      'notifications',
      'state-machine',
    ]);
    expect(groups.every((group) => group.ran)).toBe(true);
    expect((broken.diagnostics as { findings: unknown[] }).findings.length).toBeGreaterThan(10);
  });

  it('[E2E-RESOURCE-UNCONFIGURED] refuses to serve a project when no root is configured', async () => {
    await withServer([], async (client) => {
      for (const uri of [SUMMARY, STATES, DIAGNOSTICS]) {
        await expect(client.readResource({ uri })).rejects.toThrow(/policy\.root\.unconfigured/u);
      }
      // The resources are still advertised; only reading them fails.
      const advertised = (await client.listResources()).resources.filter((entry) =>
        entry.uri.startsWith('bga://project/'),
      );
      expect(advertised).toHaveLength(3);
    });
  });

  it('[E2E-RESOURCE-AMBIGUOUS] refuses to choose between several configured roots', async () => {
    await withServer(
      ['--project-root', cleanRoot, '--project-root', brokenRoot],
      async (client) => {
        await expect(client.readResource({ uri: SUMMARY })).rejects.toThrow(
          /resource\.project\.ambiguous/u,
        );
        const failure = await client
          .readResource({ uri: SUMMARY })
          .catch((error: unknown) => error as Error);
        expect(failure.message).toContain('2 roots are configured');
        expect(failure.message).not.toContain(cleanRoot);
      },
    );
  });

  it('[E2E-RESOURCE-IMMUTABLE] changes nothing in the project it describes', async () => {
    const before = await digest(brokenRoot);
    await withServer(['--project-root', brokenRoot], async (client) => {
      for (const uri of [SUMMARY, STATES, DIAGNOSTICS]) {
        await readResource(client, uri);
      }
    });
    expect(await digest(brokenRoot)).toBe(before);
  });

  it('rejects a resource URI the server does not serve', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      await expect(client.readResource({ uri: 'bga://project/secrets' })).rejects.toThrow(
        /not found|unknown|resource/iu,
      );
    });
  });
  it('[E2E-RESOURCE-STATES-GENERATIONS] serves one documented shape for every supported generation', async () => {
    for (const [root, expectedLayout, first] of [
      [cleanRoot, 'legacy', { id: 1, origin: 'array' }],
      [modernRoot, 'modern', { id: 2, origin: 'class' }],
      [hybridRoot, 'hybrid', { id: 2, origin: 'class' }],
    ] as const) {
      const states = (await withServer(
        ['--project-root', root],
        async (client) => await readResource(client, STATES),
      )) as {
        layout: string;
        definitions: { id: number; origin: string }[];
        initial: { ids: number[]; origin: string };
        validation: { status: string };
      };

      expect(states.layout, expectedLayout).toBe(expectedLayout);
      // The same fields whichever form the project declares its states in.
      expect(states.definitions[0], expectedLayout).toMatchObject(first);
      expect(typeof states.initial.origin, expectedLayout).toBe('string');
      expect(states.validation.status, expectedLayout).toBe('passed');
    }
  });

  it('[E2E-RESOURCE-DIAGNOSTICS-UNSUPPORTED] never implies an unsupported check passed', async () => {
    const diagnostics = (await withServer(
      ['--project-root', unreadableRoot],
      async (client) => await readResource(client, DIAGNOSTICS),
    )) as {
      status: string;
      diagnostics: {
        status: string;
        summary: Record<string, number>;
        findings: { kind: string }[];
      };
    };

    // Everything this project states about itself is unreadable, so the
    // resource says so instead of serving a clean result.
    expect(diagnostics.diagnostics.status).toBe('unsupported');
    expect(diagnostics.diagnostics.summary.unsupported).toBeGreaterThan(0);
    expect(diagnostics.diagnostics.summary.errors).toBe(0);
    expect(
      diagnostics.diagnostics.findings.every((finding) => finding.kind === 'unsupported-syntax'),
    ).toBe(true);
  });

  it('[E2E-RESOURCE-SUMMARY-BOUNDED] stays within its output limit on a large project', async () => {
    const summary = (await withServer(
      ['--project-root', largeRoot],
      async (client) => await readResource(client, SUMMARY),
    )) as { fileCount: number; truncated: boolean; components: { files: string[] }[] };

    expect(summary.fileCount).toBeGreaterThan(100);
    // Either the listing was cut short or every component list is bounded; in
    // both cases the resource stays small enough to serve.
    expect(
      summary.truncated || summary.components.every((component) => component.files.length <= 20),
    ).toBe(true);
    expect(JSON.stringify(summary).length).toBeLessThan(200_000);
  });

  it('[E2E-RESOURCE-REFRESH] serves the project as it is now, not as it was when the session opened', async () => {
    const states = resolve(refreshRoot, 'states.inc.php');
    const before = await readFile(states, 'utf8');
    try {
      const [first, second] = await withServer(['--project-root', refreshRoot], async (client) => {
        const initial = (await readResource(client, STATES)) as {
          definitions: { id: number; transitions: Record<string, number> }[];
        };
        // The same session, a changed project: a resource that cached its
        // first read would keep serving a machine that no longer exists.
        await writeFile(states, before.replace("'pass' => 99", "'pass' => 99, 'again' => 2"));
        const refreshed = (await readResource(client, STATES)) as {
          definitions: { id: number; transitions: Record<string, number> }[];
        };
        return [initial, refreshed];
      });

      expect(Object.keys(first.definitions[1]?.transitions ?? {})).toEqual(['pass']);
      expect(Object.keys(second.definitions[1]?.transitions ?? {})).toEqual(['pass', 'again']);
    } finally {
      await writeFile(states, before);
    }
  });
});
