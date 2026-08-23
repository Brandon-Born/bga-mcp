import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';
import { expect, inject } from 'vitest';

import { connectStdio } from './mcp.js';
import { runCommand } from './process.js';
import { waitForProcessExit } from './scenario.js';

/**
 * Shared scaffolding for the packaged end-to-end suites.
 *
 * Every capability suite installs the same artifact, copies the same fixtures,
 * connects the same way, and hashes the project the same way. Keeping that in
 * one place means a new suite starts with its assertions rather than a hundred
 * lines of setup, and a change to how the artifact is installed reaches every
 * suite at once.
 */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesRoot = resolve(repositoryRoot, 'tests/fixtures/projects');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

export interface PackagedServer<Fixture extends string = string> {
  /** Path of the installed development entry point, for development-profile suites. */
  readonly cli: string;
  /** Root of the installed bga-mcp package. */
  readonly packageRoot: string;
  /** The package-manager-created public command and the arguments needed to invoke its shim. */
  readonly publicCommand: {
    readonly command: string;
    readonly arguments: readonly string[];
  };
  /** Fixture name to the copy this suite may read, typed by the names requested. */
  readonly projects: Readonly<Record<Fixture, string>>;
  readonly temporaryRoot: string;
  cleanup: () => Promise<void>;
}

export interface ToolResponse<T = Record<string, unknown>> {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: T | undefined;
}

/**
 * Installs the artifact packed once for the whole run and copies the fixtures
 * a suite asks for, with each fixture's `expected.json` removed so the copy
 * looks like a real project.
 */
/**
 * Records which build a packaged suite installed, and proves it is the shared
 * one.
 *
 * A scenario is only evidence for the artifact it ran against, so the suite
 * hashes what it installs and appends the result where the evidence emitter
 * reads it. A suite that somehow installed a different tarball shows up as a
 * different digest instead of passing quietly.
 */
export async function recordInstalledArtifact(suite: string, artifact: string): Promise<string> {
  const digest = `sha256:${createHash('sha256')
    .update(await readFile(artifact))
    .digest('hex')}`;
  expect(digest, `${suite} installed an artifact other than the one packed for this run`).toBe(
    inject('packedArtifactDigest'),
  );

  try {
    await writeFile(
      resolve(repositoryRoot, `.artifacts/packaged-runs/${suite}.json`),
      `${JSON.stringify({ suite, digest }, null, 2)}\n`,
    );
  } catch {
    // The directory is created by global setup. A suite run on its own without
    // it still installs and asserts; it simply contributes no retained row.
  }
  return digest;
}

export async function installPackagedServer<Fixture extends string>(
  label: string,
  fixtures: Readonly<Record<Fixture, string>>,
): Promise<PackagedServer<Fixture>> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `bga-mcp-${label}-`));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: `bga-mcp-${label}-install`, private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  const artifact = inject('packedArtifact');
  await recordInstalledArtifact(label, artifact);
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, artifact],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);

  const packageRoot = resolve(installRoot, 'node_modules/bga-mcp');
  const publicBin = resolve(
    installRoot,
    'node_modules/.bin',
    process.platform === 'win32' ? 'bga-mcp.cmd' : 'bga-mcp',
  );
  const publicCommand =
    process.platform === 'win32'
      ? {
          command: process.env.ComSpec ?? 'cmd.exe',
          arguments: ['/d', '/s', '/c', publicBin] as const,
        }
      : { command: publicBin, arguments: [] as const };

  const projects = {} as Record<Fixture, string>;
  for (const [name, fixture] of Object.entries(fixtures) as [Fixture, string][]) {
    const target = resolve(temporaryRoot, 'projects', name);
    await cp(resolve(fixturesRoot, fixture), target, { recursive: true });
    await rm(resolve(target, 'expected.json'), { force: true });
    projects[name] = target;
  }

  return {
    cli: resolve(packageRoot, 'dist/cli.js'),
    packageRoot,
    publicCommand,
    projects,
    temporaryRoot,
    cleanup: async () => {
      await rm(temporaryRoot, { recursive: true, force: true });
    },
  };
}

/**
 * Copies an installed project and removes files from it.
 *
 * Used to build a project that is genuinely missing one side of a contract,
 * which is a different thing from a layout the readers cannot interpret.
 */
export async function deriveProject(
  server: PackagedServer,
  from: string,
  name: string,
  remove: readonly string[],
): Promise<string> {
  const target = resolve(server.temporaryRoot, 'projects', name);
  await cp(from, target, { recursive: true });
  for (const path of remove) {
    await rm(resolve(target, path), { recursive: true, force: true });
  }
  return target;
}

/** Reads a fixture's declared expectations before the copy strips them. */
export async function readFixtureExpectations<T>(fixture: string): Promise<T> {
  return JSON.parse(await readFile(resolve(fixturesRoot, fixture, 'expected.json'), 'utf8')) as T;
}

/** Content digest of a directory, used to prove a capability changed nothing. */
export async function digestDirectory(directory: string): Promise<string> {
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

/** Starts the installed server, runs the body against a real client, and shuts it down. */
export async function withPackagedServer<T>(
  cli: string,
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
  options: { readonly env?: NodeJS.ProcessEnv; readonly nodeArguments?: readonly string[] } = {},
): Promise<{ result: T; stderr: string }> {
  const connection = await connectStdio(
    process.execPath,
    [...(options.nodeArguments ?? []), cli, ...arguments_],
    { timeoutMs: 20_000, ...(options.env === undefined ? {} : { env: options.env }) },
  );
  const processId = connection.transport.pid;
  try {
    const result = await use(connection.client);
    return { result, stderr: connection.stderr() };
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
  }
}

/** Starts the package-manager-created public command rather than an internal JS file. */
export async function withPublicPackagedServer<T>(
  server: PackagedServer,
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<{ result: T; stderr: string }> {
  const connection = await connectStdio(server.publicCommand.command, [
    ...server.publicCommand.arguments,
    ...arguments_,
  ]);
  const processId = connection.transport.pid;
  try {
    const result = await use(connection.client);
    return { result, stderr: connection.stderr() };
  } finally {
    await connection.client.close();
    if (processId !== null) await waitForProcessExit(processId);
  }
}

/** Calls a tool and normalizes its response for assertions. */
export async function callTool<T = Record<string, unknown>>(
  client: Client,
  name: string,
  argument: unknown,
  timeoutMs = 15_000,
): Promise<ToolResponse<T>> {
  const result = await client.callTool(
    { name, arguments: argument as Record<string, unknown> },
    { timeout: timeoutMs },
  );
  const content = result.content as { type: string; text?: string }[];
  return {
    isError: result.isError === true,
    text: content.map((entry) => entry.text ?? '').join('\n'),
    structured: result.structuredContent as T | undefined,
  };
}

/**
 * The malformed inputs every capability must reject.
 *
 * A tool may either throw a protocol error or return an error result; both are
 * a refusal, and this asserts whichever the SDK produced.
 */
export async function expectSchemaRejections(
  client: Client,
  name: string,
  argumentSets: readonly unknown[],
): Promise<void> {
  for (const argument of argumentSets) {
    const failure = await callTool(client, name, argument).catch((error: unknown) => error);
    if (failure instanceof Error) {
      expect(failure.message).toMatch(/valid|invalid|schema|required|expected/iu);
      continue;
    }
    expect((failure as ToolResponse).isError, `${name} accepted ${JSON.stringify(argument)}`).toBe(
      true,
    );
  }
}
