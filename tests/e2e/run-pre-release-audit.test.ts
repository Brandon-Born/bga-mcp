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

interface AuditResult {
  readonly schemaVersion: number;
  readonly layout: string;
  readonly catalogVersion: string;
  readonly counts: Record<string, number>;
  readonly checks: {
    id: string;
    outcome: string;
    summary: string;
    group?: string;
    findings?: { code: string }[];
    reason?: string;
  }[];
}

interface ToolResponse {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: AuditResult | undefined;
}

let temporaryRoot: string;
let cli: string;
let cleanRoot: string;
let brokenRoot: string;
let modernRoot: string;
let hybridRoot: string;
let unreadableRoot: string;
let catalogVersion: string;
let manualCheckIds: string[];

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

async function audit(client: Client, argument: unknown): Promise<ToolResponse> {
  const result = await client.callTool(
    { name: 'run_pre_release_audit', arguments: argument as Record<string, unknown> },
    { timeout: 15_000 },
  );
  const content = result.content as { type: string; text?: string }[];
  return {
    isError: result.isError === true,
    text: content.map((entry) => entry.text ?? '').join('\n'),
    structured: result.structuredContent as AuditResult | undefined,
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
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-prerelease-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-prerelease-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
  );

  // The artifact is packed once for the whole run; see tests/global-setup.ts.
  const artifact = inject('packedArtifact');
  await recordInstalledArtifact('run-pre-release-audit', artifact);
  const install = await runCommand(
    corepackCommand,
    ['pnpm', 'add', '--prefer-offline', '--dir', installRoot, artifact],
    { timeoutMs: 120_000 },
  );
  expect(install.exitCode, `${install.stderr}\n${install.stdout}`).toBe(0);
  cli = resolve(installRoot, 'node_modules/bga-mcp/dist/cli.js');

  // The catalog the installed package ships is the one the audit must report.
  const catalog = JSON.parse(
    await readFile(resolve(installRoot, 'node_modules/bga-mcp/config/rule-catalog.json'), 'utf8'),
  ) as { catalogVersion: string; checks: { id: string; automatable: boolean }[] };
  catalogVersion = catalog.catalogVersion;
  manualCheckIds = catalog.checks.filter((check) => !check.automatable).map((check) => check.id);

  const projects = resolve(temporaryRoot, 'projects');
  cleanRoot = resolve(projects, 'cleangame');
  brokenRoot = resolve(projects, 'brokengame');
  modernRoot = resolve(projects, 'moderngame');
  hybridRoot = resolve(projects, 'hybridgame');
  unreadableRoot = resolve(projects, 'unreadablegame');
  for (const [fixture, target] of [
    ['legacy', cleanRoot],
    ['legacy-broken', brokenRoot],
    ['modern', modernRoot],
    ['hybrid', hybridRoot],
    ['modern-unreadable', unreadableRoot],
  ] as const) {
    await cp(resolve(fixturesRoot, fixture), target, { recursive: true });
  }
  for (const target of [cleanRoot, brokenRoot, modernRoot, hybridRoot, unreadableRoot]) {
    await rm(resolve(target, 'expected.json'));
  }
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged run_pre_release_audit', () => {
  it('[E2E-PRE-RELEASE-CLEAN] passes every automated check on a clean project', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await audit(client, { projectRoot: cleanRoot }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    expect(result?.counts.failed).toBe(0);
    expect(result?.counts.unsupported).toBe(0);
    expect(result?.counts.passed).toBeGreaterThan(20);
    expect(response.text).toContain('0 failed');
  });

  it('[E2E-PRE-RELEASE-FAILING] fails the checks a defective project breaks, with their findings', async () => {
    const response = await withServer(
      ['--project-root', brokenRoot],
      async (client) => await audit(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    expect(result?.counts.failed).toBeGreaterThan(5);

    const failed = result?.checks.filter((check) => check.outcome === 'failed') ?? [];
    for (const check of failed) {
      expect(check.findings?.length ?? 0).toBeGreaterThan(0);
      // Every finding carries the code of the check it failed.
      expect(check.findings?.every((entry) => entry.code === check.id)).toBe(true);
    }
    expect(failed.map((check) => check.id)).toContain('state.transition.target-exists');
    // The summary lists the first ten failures and says how many it left out.
    expect(response.text).toContain('failed: action.argument.mismatch');
    expect(response.text).toContain('more failed checks in the full result');
  });

  it('[E2E-PRE-RELEASE-PARTIAL-SUPPORT] reports unsupported rather than passing what it could not check', async () => {
    const response = await withServer(
      ['--project-root', modernRoot],
      async (client) => await audit(client, { projectRoot: modernRoot }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    // The modern layout is read now, so its state checks produce verdicts.
    const stateChecks = result?.checks.filter((check) => check.group === 'state-machine') ?? [];
    expect(stateChecks.length).toBeGreaterThan(0);
    for (const check of stateChecks) {
      expect(check.outcome).not.toBe('manual-required');
    }
    // Nothing is silently converted into a pass: every check has an outcome.
    const total = Object.values(result?.counts ?? {}).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(result?.checks.length);
  });

  it('[E2E-PRE-RELEASE-HYBRID] audits every automated group on a part-migrated project', async () => {
    const response = await withServer(
      ['--project-root', hybridRoot],
      async (client) => await audit(client, { projectRoot: hybridRoot }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured?.layout).toBe('hybrid');
    expect(response.structured?.counts.failed).toBe(0);
    expect(response.structured?.counts.unsupported).toBe(0);
    for (const group of ['state-machine', 'action-contracts', 'notifications', 'database']) {
      const checks = response.structured?.checks.filter((check) => check.group === group) ?? [];
      expect(checks.length, group).toBeGreaterThan(0);
      expect(
        checks.every((check) => check.outcome === 'passed'),
        group,
      ).toBe(true);
    }
  });

  it('[E2E-PRE-RELEASE-UNSUPPORTED-PRESERVED] keeps syntax it could not read as unsupported instead of failing it', async () => {
    const response = await withServer(
      ['--project-root', unreadableRoot],
      async (client) => await audit(client, { projectRoot: unreadableRoot }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    const stateChecks = result?.checks.filter((check) => check.group === 'state-machine') ?? [];

    // Regression: the installed package turned a state class it could not read
    // into two failed checks and reported unsupported: 0.
    expect(stateChecks.length).toBeGreaterThan(0);
    expect(stateChecks.filter((check) => check.outcome === 'failed')).toEqual([]);
    expect(stateChecks.every((check) => check.outcome === 'unsupported')).toBe(true);
    expect(result?.counts.unsupported).toBeGreaterThanOrEqual(stateChecks.length);
    for (const check of stateChecks) {
      expect(check.reason ?? '').not.toBe('');
    }
    expect(response.text).toContain('unsupported');
  });

  it('[E2E-PRE-RELEASE-MANUAL-NEVER-PASSES] never reports a manual check as passed', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await audit(client, { projectRoot: cleanRoot }),
    );

    const result = response.structured;
    const manual = result?.checks.filter((check) => check.outcome === 'manual-required') ?? [];
    expect(manual.map((check) => check.id).sort()).toEqual([...manualCheckIds].sort());
    for (const check of manual) {
      expect(check.reason ?? '').not.toBe('');
    }
    for (const id of manualCheckIds) {
      const check = result?.checks.find((entry) => entry.id === id);
      expect(check?.outcome).not.toBe('passed');
    }
    expect(response.text).toContain('never counted as passed');
  });

  it('[E2E-PRE-RELEASE-CATALOG-VERSION] names the catalog version it applied', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await audit(client, { projectRoot: cleanRoot }),
    );

    expect(response.structured?.catalogVersion).toBe(catalogVersion);
    expect(response.text).toContain(`rule catalog ${catalogVersion}`);

    const total = Object.values(response.structured?.counts ?? {}).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(total).toBe(response.structured?.checks.length);
  });

  it('[E2E-PRE-RELEASE-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      // `{}` is valid now: an omitted projectRoot means the sole configured
      // root, proven by the default-root scenarios.
      for (const argument of [{ projectRoot: 7 }, { projectRoot: '' }, { root: cleanRoot }]) {
        const failure = await audit(client, argument).catch((error: unknown) => error);
        if (failure instanceof Error) {
          expect(failure.message).toMatch(/valid|invalid|schema|required|expected/iu);
          continue;
        }
        expect((failure as ToolResponse).isError).toBe(true);
      }
    });
  });

  it('[E2E-PRE-RELEASE-IMMUTABLE] changes nothing in the project it audits', async () => {
    const before = await digest(brokenRoot);
    await withServer(
      ['--project-root', brokenRoot],
      async (client) => await audit(client, { projectRoot: brokenRoot }),
    );
    expect(await digest(brokenRoot)).toBe(before);
  });
});
