import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  deriveProject,
  digestDirectory,
  expectSchemaRejections,
  installPackagedServer,
  readFixtureExpectations,
  withPackagedServer,
  type PackagedServer,
  type ToolResponse,
} from '../helpers/packaged.js';

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

let server: PackagedServer<'cleangame' | 'brokengame' | 'moderngame' | 'moderncleangame'>;
let cleanRoot: string;
let brokenRoot: string;
let modernRoot: string;
let modernCleanRoot: string;
let oneSidedRoot: string;
let expectedModern: { status: string; summary: Record<string, number>; codes: string[] } =
  {} as never;
let expectedBroken: { status: string; summary: Record<string, number>; codes: string[] };

async function callValidate(
  client: Client,
  argument: unknown,
): Promise<ToolResponse<ContractResult>> {
  return await callTool<ContractResult>(client, 'validate_action_contracts', argument);
}

async function withServer<T>(
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<T> {
  return (await withPackagedServer(server.cli, arguments_, use)).result;
}

beforeAll(async () => {
  server = await installPackagedServer('contracts', {
    cleangame: 'legacy',
    brokengame: 'legacy-broken',
    moderngame: 'modern-broken',
    moderncleangame: 'modern',
  });
  cleanRoot = server.projects.cleangame;
  brokenRoot = server.projects.brokengame;
  modernRoot = server.projects.moderngame;
  modernCleanRoot = server.projects.moderncleangame;
  oneSidedRoot = await deriveProject(server, modernCleanRoot, 'onesided', ['modules/js']);
  expectedBroken = (
    await readFixtureExpectations<{
      actionContracts: { status: string; summary: Record<string, number>; codes: string[] };
    }>('legacy-broken')
  ).actionContracts;
  expectedModern = (
    await readFixtureExpectations<{
      actionContracts: { status: string; summary: Record<string, number>; codes: string[] };
    }>('modern-broken')
  ).actionContracts;
}, 240_000);

afterAll(async () => {
  await server.cleanup();
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
      ['--project-root', oneSidedRoot],
      async (client) => await callValidate(client, { projectRoot: oneSidedRoot }),
    );

    // The readers understand this layout; the project is simply missing one
    // side of the contract, and that is reported rather than passed.
    expect(response.isError).toBe(false);
    expect(response.structured?.diagnostics.status).toBe('findings');
    expect(response.structured?.diagnostics.findings[0]?.message).toContain(
      'no readable client source',
    );
  });

  it('[E2E-VALIDATE-ACTIONS-IMMUTABLE] changes nothing in the project it validates', async () => {
    const before = await digestDirectory(brokenRoot);
    await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );
    expect(await digestDirectory(brokenRoot)).toBe(before);
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
      await expectSchemaRejections(client, 'validate_action_contracts', [
        // An omitted projectRoot now means the sole configured root, so it is
        // valid input rather than malformed; the refusals are proven by the
        // default-root scenarios.
        { projectRoot: 7 },
        { projectRoot: '' },
        { root: cleanRoot },
      ]);
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

  it('[E2E-VALIDATE-ACTIONS-MODERN-CLEAN] passes a modern project built to the documented shapes', async () => {
    const response = await withServer(
      ['--project-root', modernCleanRoot],
      async (client) => await callValidate(client, { projectRoot: modernCleanRoot }),
    );

    expect(response.isError).toBe(false);
    const structured = response.structured;
    expect(structured?.layout).toBe('modern');
    expect(structured?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
    expect(structured?.trace.entryPoints.map((entry) => entry.action).sort()).toEqual([
      'actPass',
      'actPlay',
    ]);
  });

  it('[E2E-VALIDATE-ACTIONS-MODERN-DEFECTS] finds exactly the defects the modern broken fixture declares', async () => {
    const response = await withServer(
      ['--project-root', modernRoot],
      async (client) => await callValidate(client, { projectRoot: modernRoot }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured?.diagnostics.status).toBe(expectedModern.status);
    expect(response.structured?.diagnostics.summary).toEqual(expectedModern.summary);
    expect(response.structured?.diagnostics.findings.map((finding) => finding.code)).toEqual(
      expectedModern.codes,
    );
  });
});
