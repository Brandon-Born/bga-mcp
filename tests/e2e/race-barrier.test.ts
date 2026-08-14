import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
  type ToolResponse,
} from '../helpers/packaged.js';

/**
 * Installed-package proof for the three deterministic race windows BGA-330
 * leaves to BGA-413.
 *
 * A preload-only module wraps the real filesystem primitives before the
 * installed policy binds them. Each public MCP call pauses at its selected
 * window, this test proves the call has not settled, and only then releases
 * the fixture mutation. The transcript therefore records the mutation between
 * the production stages rather than arranging state between client calls.
 */

type RaceCase = 'file-swap' | 'directory-swap' | 'growth';

interface RaceEvent {
  readonly sequence: number;
  readonly case: RaceCase;
  readonly stage: string;
}

interface Fixture {
  readonly root: string;
  readonly target: string;
  readonly safeDirectory?: string;
  readonly displacedDirectory?: string;
  readonly outsideDirectory?: string;
  readonly original?: string;
  restore: () => Promise<void>;
}

interface ProbeResult {
  readonly case: RaceCase;
  readonly response: ToolResponse;
  readonly setup: ToolResponse;
  readonly events: readonly RaceEvent[];
  readonly stderr: string;
}

const barrierModule = new URL('./race-barrier-stub.ts', import.meta.url).href;
const PATH_REFUSAL = 'policy.path.symlink-escape';
const FILE_MARKER = 'outside-file-marker-must-never-be-published';
const DIRECTORY_NAME_MARKER = 'outside-directory-marker.php';
const DIRECTORY_CONTENT_MARKER = 'outside-directory-content-must-never-be-published';
const GROWTH_MARKER = 'appended-growth-marker-must-never-be-published';
const MARKERS = [FILE_MARKER, DIRECTORY_NAME_MARKER, DIRECTORY_CONTENT_MARKER, GROWTH_MARKER];

let server: PackagedServer<'modern'>;

function parseEvents(source: string): RaceEvent[] {
  return source
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RaceEvent);
}

function expectNoMarkers(surface: string, value: unknown): void {
  const encoded =
    value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  for (const marker of MARKERS) {
    expect(encoded.includes(marker), `${marker} reached ${surface}`).toBe(false);
  }
}

async function waitForBarrier(
  transcriptPath: string,
  operation: Promise<ToolResponse>,
): Promise<RaceEvent[]> {
  let settled = false;
  let outcome: ToolResponse | Error | undefined;
  const settlement = operation.then(
    (response) => {
      settled = true;
      outcome = response;
    },
    (error: unknown) => {
      settled = true;
      outcome = error instanceof Error ? error : new Error(String(error));
    },
  );
  const isSettled = (): boolean => settled;
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    const events = parseEvents(await readFile(transcriptPath, 'utf8'));
    if (events.some((event) => event.stage === 'barrier:reached')) {
      expect(isSettled(), 'the public operation settled before the race barrier was released').toBe(
        false,
      );
      return events;
    }
    if (isSettled()) {
      await settlement;
      throw new Error(
        `The public operation settled before reaching its installed race barrier: ${JSON.stringify({
          events,
          outcome,
        })}`,
      );
    }
    await new Promise<void>((resolveDelay) => {
      setTimeout(resolveDelay, 5);
    });
  }
  throw new Error('The installed filesystem operation never reached its race barrier');
}

async function copyModern(name: string): Promise<string> {
  const root = resolve(server.temporaryRoot, name);
  await cp(server.projects.modern, root, { recursive: true });
  return await realpath(root);
}

async function fileSwapFixture(): Promise<Fixture> {
  const root = await copyModern('race-file-swap');
  // A one-file state subdirectory keeps the forced intermediate replacement
  // from making unrelated concurrent model reads fail first with not-found.
  const safeDirectory = resolve(root, 'modules/php/States/RaceBarrier');
  const displacedDirectory = resolve(server.temporaryRoot, 'race-file-swap-original');
  const outsideDirectory = resolve(server.temporaryRoot, 'race-file-swap-outside');
  await mkdir(safeDirectory, { recursive: true });
  await mkdir(outsideDirectory, { recursive: true });
  await writeFile(resolve(safeDirectory, 'Target.php'), '<?php final class RaceBarrierTarget {}\n');
  await writeFile(resolve(outsideDirectory, 'Target.php'), `<?php // ${FILE_MARKER}\n`);
  return {
    root,
    target: resolve(safeDirectory, 'Target.php'),
    safeDirectory,
    displacedDirectory,
    outsideDirectory,
    restore: async () => {
      const current = await lstat(safeDirectory).catch(() => undefined);
      if (current?.isSymbolicLink() === true) {
        await unlink(safeDirectory);
      }
      const displaced = await lstat(displacedDirectory).catch(() => undefined);
      if (displaced !== undefined) {
        await rename(displacedDirectory, safeDirectory);
      }
    },
  };
}

async function directorySwapFixture(): Promise<Fixture> {
  const root = await copyModern('race-directory-swap');
  const displacedDirectory = resolve(server.temporaryRoot, 'race-directory-swap-original');
  const outsideDirectory = resolve(server.temporaryRoot, 'race-directory-swap-outside');
  await mkdir(outsideDirectory, { recursive: true });
  await writeFile(resolve(outsideDirectory, DIRECTORY_NAME_MARKER), DIRECTORY_CONTENT_MARKER);
  return {
    root,
    target: root,
    safeDirectory: root,
    displacedDirectory,
    outsideDirectory,
    restore: async () => {
      const current = await lstat(root).catch(() => undefined);
      if (current?.isSymbolicLink() === true) {
        await unlink(root);
      }
      const displaced = await lstat(displacedDirectory).catch(() => undefined);
      if (displaced !== undefined) {
        await rename(displacedDirectory, root);
      }
    },
  };
}

async function growthFixture(): Promise<Fixture> {
  const root = await copyModern('race-growth');
  const target = resolve(root, 'gameinfos.jsonc');
  const original = await readFile(target, 'utf8');
  return {
    root,
    target,
    original,
    restore: async () => {
      await writeFile(target, original);
    },
  };
}

function environmentFor(
  raceCase: RaceCase,
  fixture: Fixture,
  transcriptPath: string,
  releasePath: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BGA_MCP_RACE_BARRIER_CASE: raceCase,
    BGA_MCP_RACE_BARRIER_TRANSCRIPT: transcriptPath,
    BGA_MCP_RACE_BARRIER_RELEASE: releasePath,
    BGA_MCP_RACE_BARRIER_TARGET: fixture.target,
    ...(fixture.safeDirectory === undefined
      ? {}
      : { BGA_MCP_RACE_BARRIER_SAFE_DIRECTORY: fixture.safeDirectory }),
    ...(fixture.displacedDirectory === undefined
      ? {}
      : { BGA_MCP_RACE_BARRIER_DISPLACED_DIRECTORY: fixture.displacedDirectory }),
    ...(fixture.outsideDirectory === undefined
      ? {}
      : { BGA_MCP_RACE_BARRIER_OUTSIDE_DIRECTORY: fixture.outsideDirectory }),
    ...(raceCase === 'growth' ? { BGA_MCP_RACE_BARRIER_GROWTH_MARKER: GROWTH_MARKER } : {}),
  };
}

async function runProbe(raceCase: RaceCase, fixture: Fixture): Promise<ProbeResult> {
  const transcriptPath = resolve(server.temporaryRoot, `${raceCase}.transcript`);
  const releasePath = resolve(server.temporaryRoot, `${raceCase}.release`);
  await writeFile(transcriptPath, '');
  await rm(releasePath, { force: true });

  try {
    const connected = await withPackagedServer(
      server.cli,
      ['--project-root', fixture.root],
      async (client: Client) => {
        const operation = callTool(client, 'inspect_project', {}, 30_000);
        const atBarrier = await waitForBarrier(transcriptPath, operation);
        expect(atBarrier.at(-1)?.stage).toBe('barrier:reached');
        await writeFile(releasePath, 'release\n');
        const response = await operation;
        const events = parseEvents(await readFile(transcriptPath, 'utf8'));
        await fixture.restore();
        const setup = await callTool(client, 'check_setup', {}, 30_000);
        return { response, events, setup };
      },
      {
        nodeArguments: ['--import', 'tsx', '--import', barrierModule],
        env: environmentFor(raceCase, fixture, transcriptPath, releasePath),
      },
    );
    return { case: raceCase, ...connected.result, stderr: connected.stderr };
  } finally {
    await fixture.restore();
  }
}

async function installedProductionFiles(): Promise<{ names: string[]; source: string }> {
  const packageRoot = resolve(dirname(server.cli), '..');
  const names: string[] = [];
  const sources: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        names.push(relative(packageRoot, path).split(sep).join('/'));
        if (path.endsWith('.js')) {
          sources.push(await readFile(path, 'utf8'));
        }
      }
    }
  };
  await walk(packageRoot);
  return { names: names.sort(), source: sources.join('\n') };
}

beforeAll(async () => {
  server = await installPackagedServer('race-barrier', { modern: 'modern' });
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('installed filesystem race barrier', () => {
  it('[E2E-POLICY-RACE-BARRIER] refuses each forced race in its recorded policy window', async () => {
    const probes = [
      await runProbe('file-swap', await fileSwapFixture()),
      await runProbe('directory-swap', await directorySwapFixture()),
      await runProbe('growth', await growthFixture()),
    ];

    expect(probes[0]?.events.map((event) => event.stage)).toEqual([
      'pre-open-lstat:complete',
      'barrier:reached',
      'barrier:released',
      'mutation:rename-safe-directory',
      'mutation:link-outside-directory',
      'real-open:start',
      'real-open:complete',
      'descriptor-stat:complete',
    ]);
    expect(probes[1]?.events.map((event) => event.stage)).toEqual([
      'pre-opendir-lstat:complete',
      'barrier:reached',
      'barrier:released',
      'mutation:rename-configured-directory',
      'mutation:link-outside-directory',
      'real-opendir:start',
      'real-opendir:complete',
      'post-opendir-lstat:complete',
    ]);
    expect(probes[2]?.events.map((event) => event.stage)).toEqual([
      'real-open:complete',
      'descriptor-stat:complete',
      'barrier:reached',
      'barrier:released',
      'mutation:append-growth',
      'descriptor-read:start',
      'descriptor-read:complete',
    ]);

    for (const probe of probes) {
      expect(probe.events.map((event) => event.sequence)).toEqual(
        Array.from({ length: probe.events.length }, (_, index) => index + 1),
      );
      expect(probe.events.every((event) => event.case === probe.case)).toBe(true);
      expect(probe.response.isError, probe.response.text).toBe(true);
      expect(probe.response.text).toContain(PATH_REFUSAL);
      expect(probe.setup.isError, probe.setup.text).toBe(false);
      expect(probe.stderr).not.toContain('Unhandled');
      expectNoMarkers(`${probe.case} tool content`, probe.response.text);
      expectNoMarkers(`${probe.case} structured content`, probe.response.structured);
      expectNoMarkers(`${probe.case} stderr`, probe.stderr);
      expectNoMarkers(`${probe.case} stage transcript`, probe.events);
    }

    const artifact = resolve(server.temporaryRoot, 'simulated-ci-race-barrier.log');
    await writeFile(
      artifact,
      probes
        .flatMap((probe) => [
          probe.response.text,
          JSON.stringify(probe.response.structured),
          probe.stderr,
          JSON.stringify(probe.events),
        ])
        .join('\n'),
    );
    expectNoMarkers('a retained artifact', await readFile(artifact, 'utf8'));

    const installed = await installedProductionFiles();
    expect(installed.names.some((name) => name.includes('race-barrier-stub'))).toBe(false);
    expect(installed.source).not.toContain('BGA_MCP_RACE_BARRIER_');
  }, 180_000);
});
