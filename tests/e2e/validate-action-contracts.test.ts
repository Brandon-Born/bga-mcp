import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';

import { connectStdio } from '../helpers/mcp.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesRoot = resolve(repositoryRoot, 'tests/fixtures/projects');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

interface ContractResult {
  readonly schemaVersion: number;
  readonly layout: string;
  readonly clientSourcesRead: number;
  readonly phpSourcesRead: number;
  readonly trace: {
    clientCalls: { action: string; argumentNames: string[]; style: string; source: string }[];
    entryPoints: { action: string; argumentNames: string[]; source: string }[];
    declaredActions: string[];
    gameMethods: string[];
  };
  readonly rules: { code: string; certainty: string; falsePositives: string[] }[];
  readonly diagnostics: {
    status: string;
    summary: Record<string, number>;
    findings: { kind: string; code: string; certainty: string; message: string }[];
  };
}

interface ToolResponse {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: ContractResult | undefined;
}

let temporaryRoot: string;
let cli: string;
let cleanRoot: string;
let brokenRoot: string;
let modernRoot: string;
let expectedBroken: { status: string; summary: Record<string, number>; codes: string[] };

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

async function callValidate(client: Client, argument: unknown): Promise<ToolResponse> {
  const result = await client.callTool(
    { name: 'validate_action_contracts', arguments: argument as Record<string, unknown> },
    { timeout: 10_000 },
  );
  const content = result.content as { type: string; text?: string }[];
  return {
    isError: result.isError === true,
    text: content.map((entry) => entry.text ?? '').join('\n'),
    structured: result.structuredContent as ContractResult | undefined,
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
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-contracts-'));
  const packRoot = resolve(temporaryRoot, 'pack');
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(packRoot);
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-contracts-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  const pack = await runCommand(corepackCommand, ['pnpm', 'pack', '--pack-destination', packRoot], {
    cwd: repositoryRoot,
    timeoutMs: 120_000,
  });
  expect(pack.exitCode, `${pack.stderr}\n${pack.stdout}`).toBe(0);
  const archive = (await readdir(packRoot)).find((file) => file.endsWith('.tgz'));
  if (archive === undefined) {
    throw new Error('Package manager produced no tarball');
  }
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, resolve(packRoot, archive)],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');

  const projects = resolve(temporaryRoot, 'projects');
  cleanRoot = resolve(projects, 'cleangame');
  brokenRoot = resolve(projects, 'brokengame');
  modernRoot = resolve(projects, 'moderngame');
  for (const [fixture, target] of [
    ['legacy', cleanRoot],
    ['legacy-broken', brokenRoot],
    ['modern', modernRoot],
  ] as const) {
    await cp(resolve(fixturesRoot, fixture), target, { recursive: true });
  }
  expectedBroken = (
    JSON.parse(await readFile(resolve(brokenRoot, 'expected.json'), 'utf8')) as {
      actionContracts: { status: string; summary: Record<string, number>; codes: string[] };
    }
  ).actionContracts;
  for (const target of [cleanRoot, brokenRoot, modernRoot]) {
    await rm(resolve(target, 'expected.json'));
  }
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged validate_action_contracts', () => {
  it('[E2E-VALIDATE-ACTIONS-CLEAN] traces a healthy contract from client to game method', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await callValidate(client, { projectRoot: cleanRoot }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    expect(result).toMatchObject({ schemaVersion: 1, layout: 'legacy' });
    expect(result?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
    expect(result?.trace.clientCalls).toEqual([
      {
        action: 'actPass',
        argumentNames: ['comment'],
        style: 'ajaxcall',
        source: 'bgamcplegacy.js',
      },
    ]);
    expect(result?.trace.entryPoints).toEqual([
      { action: 'actPass', argumentNames: ['comment'], source: 'bgamcplegacy.action.php' },
    ]);
    expect(result?.trace.declaredActions).toEqual(['actPass']);
    expect(result?.clientSourcesRead).toBeGreaterThan(0);

    for (const rule of result?.rules ?? []) {
      if (rule.certainty !== 'certain') {
        expect(rule.falsePositives.length).toBeGreaterThan(0);
      }
    }
    expect(response.text).toContain('status passed');
  });

  it('[E2E-VALIDATE-ACTIONS-SEEDED-DEFECTS] finds exactly the seeded contract defects', async () => {
    const response = await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(false);
    const diagnostics = response.structured?.diagnostics;
    expect(diagnostics?.status).toBe(expectedBroken.status);
    expect(diagnostics?.summary).toEqual(expectedBroken.summary);
    expect(diagnostics?.findings.map((finding) => finding.code)).toEqual(expectedBroken.codes);

    const mismatch = diagnostics?.findings.find(
      (finding) => finding.code === 'action.argument.mismatch',
    );
    expect(mismatch).toMatchObject({ kind: 'heuristic', certainty: 'likely' });
    expect(mismatch?.message).toContain("'cardId'");

    const convention = diagnostics?.findings.find(
      (finding) => finding.code === 'action.name.convention',
    );
    expect(convention).toMatchObject({ kind: 'issue', certainty: 'certain' });

    expect(response.text).toContain('action.entry-point.missing');
    expect(response.text).toContain('(likely)');
  });

  it('[E2E-VALIDATE-ACTIONS-UNTRACEABLE] never reports a clean contract it could not trace', async () => {
    const response = await withServer(
      ['--project-root', modernRoot],
      async (client) => await callValidate(client, { projectRoot: modernRoot }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured?.diagnostics.status).toBe('findings');
    expect(response.structured?.diagnostics.findings[0]).toMatchObject({
      code: 'action.trace.unavailable',
      certainty: 'certain',
    });
  });

  it('[E2E-VALIDATE-ACTIONS-IMMUTABLE] changes nothing in the project it validates', async () => {
    const before = await digest(brokenRoot);
    await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );
    expect(await digest(brokenRoot)).toBe(before);
  });

  it('[E2E-VALIDATE-ACTIONS-DETERMINISTIC] returns identical results for repeated calls', async () => {
    const [first, second] = await withServer(['--project-root', brokenRoot], async (client) => [
      await callValidate(client, { projectRoot: brokenRoot }),
      await callValidate(client, { projectRoot: brokenRoot }),
    ]);
    expect(JSON.stringify(first.structured)).toBe(JSON.stringify(second.structured));
  });

  it('[E2E-VALIDATE-ACTIONS-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      for (const argument of [{}, { projectRoot: 7 }, { projectRoot: '' }, { root: cleanRoot }]) {
        const failure = await callValidate(client, argument).catch((error: unknown) => error);
        if (failure instanceof Error) {
          expect(failure.message).toMatch(/valid|invalid|schema|required|expected/iu);
          continue;
        }
        expect((failure as ToolResponse).isError).toBe(true);
      }
    });
  });

  it('[E2E-VALIDATE-ACTIONS-UNLISTED-ROOT] refuses a root the server was not started with', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.root.not-allowed');
    expect(JSON.stringify(response)).not.toContain(brokenRoot);
  });
});
