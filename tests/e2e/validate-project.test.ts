import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@modelcontextprotocol/client';
import { inject } from 'vitest';

import { connectStdio } from '../helpers/mcp.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesRoot = resolve(repositoryRoot, 'tests/fixtures/projects');
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

interface GroupOutcome {
  readonly id: string;
  readonly requested: boolean;
  readonly ran: boolean;
  readonly status: string;
  readonly summary: Record<string, number>;
  readonly findingCount: number;
  readonly error?: { code: string; message: string };
}

interface ProjectResult {
  readonly schemaVersion: number;
  readonly layout: string;
  readonly status: string;
  readonly groups: GroupOutcome[];
  readonly truncation: { limit: number; omitted: number };
  readonly diagnostics: {
    status: string;
    summary: Record<string, number>;
    findings: { kind: string; code: string; certainty: string; message: string }[];
  };
}

interface ToolResponse {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: ProjectResult | undefined;
}

let temporaryRoot: string;
let cli: string;
let cleanRoot: string;
let brokenRoot: string;
/** A project whose schema is too large to read, so only that group fails. */
let unreadableSchemaRoot: string;

async function call(
  client: Client,
  name: string,
  argument: Record<string, unknown>,
): Promise<ToolResponse> {
  const result = await client.callTool({ name, arguments: argument }, { timeout: 15_000 });
  const content = result.content as { type: string; text?: string }[];
  return {
    isError: result.isError === true,
    text: content.map((entry) => entry.text ?? '').join('\n'),
    structured: result.structuredContent as ProjectResult | undefined,
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
  temporaryRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-project-'));
  const installRoot = resolve(temporaryRoot, 'install');
  await mkdir(installRoot);
  await writeFile(
    resolve(installRoot, 'package.json'),
    `${JSON.stringify({ name: 'bga-mcp-project-install', private: true, packageManager: 'pnpm@11.15.1' })}\n`,
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
  cleanRoot = resolve(projects, 'cleangame');
  brokenRoot = resolve(projects, 'brokengame');
  unreadableSchemaRoot = resolve(projects, 'hugeschema');
  for (const [fixture, target] of [
    ['legacy', cleanRoot],
    ['legacy-broken', brokenRoot],
    ['legacy-broken', unreadableSchemaRoot],
  ] as const) {
    await cp(resolve(fixturesRoot, fixture), target, { recursive: true });
  }
  for (const target of [cleanRoot, brokenRoot, unreadableSchemaRoot]) {
    await rm(resolve(target, 'expected.json'));
  }

  // Seeds a failure in exactly one validator: the schema exceeds the read
  // budget, so the database group fails while the others still run.
  await writeFile(
    resolve(unreadableSchemaRoot, 'dbmodel.sql'),
    `-- oversized fixture\n${'-- filler comment line to exceed the read budget\n'.repeat(30_000)}`,
  );
}, 240_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('packaged validate_project', () => {
  it('[E2E-VALIDATE-PROJECT-MATCHES-PARTS] agrees with every validator run on its own', async () => {
    await withServer(['--project-root', brokenRoot], async (client) => {
      const aggregate = await call(client, 'validate_project', { projectRoot: brokenRoot });
      expect(aggregate.isError).toBe(false);
      const result = aggregate.structured;
      expect(result?.status).toBe('findings');

      const parts = {
        'state-machine': await call(client, 'validate_state_machine', { projectRoot: brokenRoot }),
        'action-contracts': await call(client, 'validate_action_contracts', {
          projectRoot: brokenRoot,
        }),
        notifications: await call(client, 'validate_notifications', { projectRoot: brokenRoot }),
        database: await call(client, 'audit_database_usage', { projectRoot: brokenRoot }),
      };

      const expectedCodes: string[] = [];
      for (const [id, response] of Object.entries(parts)) {
        const diagnostics = (response.structured as unknown as ProjectResult).diagnostics;
        const group = result?.groups.find((entry) => entry.id === id);
        expect(group, `missing group ${id}`).toMatchObject({
          ran: true,
          status: diagnostics.status,
          findingCount: diagnostics.findings.length,
        });
        expect(group?.summary).toEqual(diagnostics.summary);
        expectedCodes.push(...diagnostics.findings.map((finding) => finding.code));
      }

      // Every finding from every validator survives aggregation, unchanged.
      expect(result?.diagnostics.findings.map((finding) => finding.code)).toEqual(
        expectedCodes.sort(),
      );
      expect(result?.truncation.omitted).toBe(0);
    });
  });

  it('[E2E-VALIDATE-PROJECT-GROUP-SELECTION] runs only the groups requested', async () => {
    const response = await withServer(
      ['--project-root', brokenRoot],
      async (client) =>
        await call(client, 'validate_project', {
          projectRoot: brokenRoot,
          groups: ['database', 'notifications'],
        }),
    );

    expect(response.isError).toBe(false);
    const byId = Object.fromEntries(
      (response.structured?.groups ?? []).map((group) => [group.id, group]),
    );
    expect(byId.database?.ran).toBe(true);
    expect(byId.notifications?.ran).toBe(true);
    expect(byId['state-machine']).toMatchObject({ requested: false, status: 'skipped' });
    expect(byId['action-contracts']).toMatchObject({ requested: false, status: 'skipped' });

    for (const finding of response.structured?.diagnostics.findings ?? []) {
      expect(finding.code.startsWith('database.') || finding.code.startsWith('notification.')).toBe(
        true,
      );
    }
    expect(response.text).toContain('state-machine: skipped');
  });

  it('[E2E-VALIDATE-PROJECT-BOUNDED] keeps the most severe findings and reports what it dropped', async () => {
    const response = await withServer(
      ['--project-root', brokenRoot],
      async (client) =>
        await call(client, 'validate_project', { projectRoot: brokenRoot, maxFindings: 2 }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    expect(result?.diagnostics.findings).toHaveLength(2);
    expect(result?.truncation.limit).toBe(2);
    expect(result?.truncation.omitted).toBeGreaterThan(0);
    // Both errors outrank every warning, and the kept pair is ordered by code.
    expect(result?.diagnostics.findings.map((finding) => finding.code)).toEqual([
      'database.table.undeclared',
      'state.transition.target-exists',
    ]);
    expect(result?.diagnostics.summary).toEqual({
      errors: 2,
      warnings: 0,
      information: 0,
      unsupported: 0,
    });
    // The per-group counts still describe the complete run.
    const total = (result?.groups ?? []).reduce((sum, group) => sum + group.findingCount, 0);
    expect(total).toBeGreaterThan(2);
    expect(response.text).toContain('findings were omitted');
  });

  it('[E2E-VALIDATE-PROJECT-PARTIAL-FAILURE] reports a failed validator and refuses to look clean', async () => {
    const response = await withServer(
      ['--project-root', unreadableSchemaRoot],
      async (client) =>
        await call(client, 'validate_project', { projectRoot: unreadableSchemaRoot }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    expect(result?.status).toBe('incomplete');

    const database = result?.groups.find((group) => group.id === 'database');
    expect(database).toMatchObject({ ran: false, status: 'failed' });
    expect(database?.error?.code).toBe('policy.output.too-large');

    // The other validators still ran and kept their findings.
    for (const id of ['state-machine', 'action-contracts', 'notifications']) {
      expect(result?.groups.find((group) => group.id === id)?.ran).toBe(true);
    }
    expect(result?.diagnostics.findings.length).toBeGreaterThan(0);
    expect(response.text).toContain('status incomplete');
    expect(response.text).toContain('database: failed (policy.output.too-large)');
  });

  it('[E2E-VALIDATE-PROJECT-CLEAN] passes a project every validator accepts', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await call(client, 'validate_project', { projectRoot: cleanRoot }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured?.status).toBe('passed');
    expect(response.structured?.diagnostics.findings).toEqual([]);
    expect(response.structured?.groups.every((group) => group.ran)).toBe(true);
    expect(response.text).toContain('status passed');
  });

  it('[E2E-VALIDATE-PROJECT-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      for (const argument of [
        {},
        { projectRoot: 7 },
        { projectRoot: cleanRoot, groups: ['not-a-group'] },
        { projectRoot: cleanRoot, groups: [] },
        { projectRoot: cleanRoot, maxFindings: 0 },
      ]) {
        const failure = await call(client, 'validate_project', argument).catch(
          (error: unknown) => error,
        );
        if (failure instanceof Error) {
          expect(failure.message).toMatch(/valid|invalid|schema|required|expected/iu);
          continue;
        }
        expect((failure as ToolResponse).isError).toBe(true);
      }
    });
  });

  it('[E2E-VALIDATE-PROJECT-UNLISTED-ROOT] refuses a root the server was not started with', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await call(client, 'validate_project', { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.root.not-allowed');
    expect(JSON.stringify(response)).not.toContain(brokenRoot);
  });
});
