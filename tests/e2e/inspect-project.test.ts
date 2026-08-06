// secret-scan:allow-file Seeded non-secret key material that proves it never reaches a result.
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';
import { inject } from 'vitest';

import { connectStdio } from '../helpers/mcp.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesRoot = resolve(repositoryRoot, 'tests/fixtures/projects');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

const SEEDED_KEY_MATERIAL = 'seeded-private-key-material-that-must-never-be-returned';

interface ToolResponse {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: Record<string, unknown> | undefined;
}

let temporaryRoot: string;
let cli: string;
let modernRoot: string;
let legacyRoot: string;
let unrecognizedRoot: string;
let linkedRoot: string;
let outsideRoot: string;
let largeRoot: string;

async function digest(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = resolve(current, entry.name);
      if (entry.isSymbolicLink()) {
        hash.update(`link:${relative(directory, path).split(sep).join('/')}`);
        continue;
      }
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

async function callInspect(
  client: Client,
  argument: unknown,
  timeoutMs = 10_000,
): Promise<ToolResponse> {
  const result = await client.callTool(
    { name: 'inspect_project', arguments: argument as Record<string, unknown> },
    { timeout: timeoutMs },
  );
  const content = result.content as { type: string; text?: string }[];
  return {
    isError: result.isError === true,
    text: content.map((entry) => entry.text ?? '').join('\n'),
    structured: result.structuredContent as Record<string, unknown> | undefined,
  };
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
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-inspect-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-inspect-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  // The artifact is packed once for the whole run; see tests/global-setup.ts.
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, inject('packedArtifact')],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');

  const projects = resolve(temporaryRoot, 'projects');
  modernRoot = resolve(projects, 'bgamcpmodern');
  legacyRoot = resolve(projects, 'bgamcplegacy');
  unrecognizedRoot = resolve(projects, 'notagame');
  linkedRoot = resolve(projects, 'linkedgame');
  outsideRoot = resolve(temporaryRoot, 'outside');
  largeRoot = resolve(projects, 'largegame');

  await cp(resolve(fixturesRoot, 'modern'), modernRoot, { recursive: true });
  await cp(resolve(fixturesRoot, 'legacy'), legacyRoot, { recursive: true });
  await rm(resolve(modernRoot, 'expected.json'));
  await rm(resolve(legacyRoot, 'expected.json'));

  await mkdir(unrecognizedRoot, { recursive: true });
  await writeFile(resolve(unrecognizedRoot, 'README.md'), '# not a BGA project\n');

  await mkdir(outsideRoot, { recursive: true });
  await writeFile(resolve(outsideRoot, 'id_ed25519'), `${SEEDED_KEY_MATERIAL}\n`);

  await cp(resolve(fixturesRoot, 'legacy'), linkedRoot, { recursive: true });
  await rm(resolve(linkedRoot, 'expected.json'));
  await symlink(
    outsideRoot,
    resolve(linkedRoot, 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  await mkdir(largeRoot, { recursive: true });
  await writeFile(
    resolve(largeRoot, 'gameinfos.inc.php'),
    "<?php\n$gameinfos = ['game_name' => 'Large'];\n",
  );
  await writeFile(resolve(largeRoot, 'largegame.game.php'), '<?php\nclass X {}\n');
  for (let index = 0; index < 600; index += 1) {
    await writeFile(resolve(largeRoot, `module-${String(index)}.php`), '<?php\n// filler\n');
  }
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged inspect_project', () => {
  it('[E2E-INSPECT-PROJECT-MODERN] describes a modern project and changes nothing', async () => {
    const before = await digest(modernRoot);
    const response = await withServer(
      ['--project-root', modernRoot],
      async (client) => await callInspect(client, { projectRoot: modernRoot }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured).toMatchObject({
      schemaVersion: 1,
      layout: 'modern',
      gameKey: 'bgamcpmodern',
      metadata: { gameName: 'BgaMcpModernFixture', playerCounts: [2], source: 'gameinfos.jsonc' },
      truncated: false,
    });
    expect(response.text).toContain('modern layout (certain)');
    const diagnostics = (response.structured as { diagnostics: { status: string } }).diagnostics;
    expect(diagnostics.status).toBe('unsupported');
    expect(await digest(modernRoot)).toBe(before);
  });

  it('[E2E-INSPECT-PROJECT-LEGACY] reads a legacy state machine through the public schema', async () => {
    const before = await digest(legacyRoot);
    const response = await withServer(
      ['--project-root', legacyRoot],
      async (client) => await callInspect(client, { projectRoot: legacyRoot }),
    );

    expect(response.isError).toBe(false);
    const structured = response.structured as {
      layout: string;
      states: {
        parsed: boolean;
        definitions: { name: string; transitions: Record<string, number> }[];
      };
      diagnostics: { status: string };
    };
    expect(structured.layout).toBe('legacy');
    expect(structured.states.parsed).toBe(true);
    expect(structured.states.definitions.map((state) => state.name)).toEqual([
      'gameSetup',
      'playerTurn',
      'gameEnd',
    ]);
    expect(structured.states.definitions[1]?.transitions).toEqual({ pass: 99 });
    expect(structured.diagnostics.status).toBe('passed');
    expect(response.text).toContain('3 definitions with 2 transitions');
    expect(await digest(legacyRoot)).toBe(before);
  });

  it('[E2E-INSPECT-PROJECT-UNRECOGNIZED] refuses to report a clean result for an unknown layout', async () => {
    const response = await withServer(
      ['--project-root', unrecognizedRoot],
      async (client) => await callInspect(client, { projectRoot: unrecognizedRoot }),
    );

    expect(response.isError).toBe(false);
    const structured = response.structured as {
      layout: string;
      diagnostics: { status: string; findings: { code: string; severity?: string }[] };
    };
    expect(structured.layout).toBe('unrecognized');
    expect(structured.diagnostics.findings[0]).toMatchObject({
      code: 'project.layout.unrecognized',
      severity: 'error',
    });
  });

  it('[E2E-INSPECT-PROJECT-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(['--project-root', modernRoot], async (client) => {
      for (const argument of [{}, { projectRoot: 42 }, { projectRoot: '' }, { root: modernRoot }]) {
        const failure = await callInspect(client, argument).catch((error: unknown) => error);
        if (failure instanceof Error) {
          expect(failure.message).toMatch(/valid|invalid|schema|required|expected/iu);
          continue;
        }
        expect((failure as ToolResponse).isError).toBe(true);
      }
    });
  });

  it('[E2E-INSPECT-PROJECT-UNLISTED-ROOT] refuses a root the server was not started with', async () => {
    const response = await withServer(
      ['--project-root', modernRoot],
      async (client) => await callInspect(client, { projectRoot: legacyRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.root.not-allowed');
    expect(response.structured).toBeUndefined();
  });

  it('[E2E-INSPECT-PROJECT-UNCONFIGURED] denies every project when no root is configured', async () => {
    const response = await withServer(
      [],
      async (client) => await callInspect(client, { projectRoot: modernRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.root.unconfigured');
  });

  it('[E2E-INSPECT-PROJECT-TRAVERSAL] refuses a path that climbs out of an allowed root', async () => {
    const response = await withServer(['--project-root', modernRoot], async (client) => {
      return await callInspect(client, { projectRoot: resolve(modernRoot, '..', 'notagame') });
    });

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.root.not-allowed');
  });

  it('[E2E-INSPECT-PROJECT-SYMLINK-ESCAPE] never follows a link out of the project root', async () => {
    const response = await withServer(
      ['--project-root', linkedRoot],
      async (client) => await callInspect(client, { projectRoot: linkedRoot }),
    );

    expect(response.isError).toBe(false);
    const structured = response.structured as {
      skippedLinks: string[];
      diagnostics: { findings: { code: string }[] };
    };
    expect(structured.skippedLinks).toEqual(['escape']);
    expect(structured.diagnostics.findings.map((finding) => finding.code)).toContain(
      'project.listing.link-skipped',
    );
    expect(JSON.stringify(response)).not.toContain(SEEDED_KEY_MATERIAL);
    expect(JSON.stringify(response)).not.toContain('id_ed25519');
  });

  it('[E2E-INSPECT-PROJECT-REDACTION] keeps absolute paths and seeded secrets out of failures', async () => {
    const response = await withServer(['--project-root', modernRoot], async (client) => {
      return await callInspect(client, { projectRoot: outsideRoot });
    });

    expect(response.isError).toBe(true);
    expect(JSON.stringify(response)).not.toContain(outsideRoot);
    expect(JSON.stringify(response)).not.toContain(SEEDED_KEY_MATERIAL);
    expect(response.text).toContain('[redacted-path]');
  });

  it('[E2E-INSPECT-PROJECT-TIMEOUT] aborts work that outlives the configured deadline', async () => {
    const response = await withServer(
      ['--project-root', largeRoot, '--operation-timeout-ms', '1'],
      async (client) => await callInspect(client, { projectRoot: largeRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.timeout.exceeded');
  });

  it('[E2E-INSPECT-PROJECT-OUTPUT-LIMIT] refuses a result above the configured output budget', async () => {
    const response = await withServer(
      ['--project-root', legacyRoot, '--max-output-bytes', '256'],
      async (client) => await callInspect(client, { projectRoot: legacyRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.output.too-large');
  });
});
