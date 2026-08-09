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

interface DatabaseAuditResult {
  readonly schemaVersion: number;
  readonly layout: string;
  readonly schemaSource: string | null;
  readonly phpSourcesRead: number;
  readonly schema: { name: string; columns: string[] }[];
  readonly queries: {
    tables: string[];
    columns: string[];
    interpolated: boolean;
    text: string;
    source: string;
  }[];
  readonly rules: { code: string; certainty: string; falsePositives: string[] }[];
  readonly diagnostics: {
    status: string;
    summary: Record<string, number>;
    findings: { kind: string; code: string; certainty: string; message: string }[];
  };
}

let server: PackagedServer<
  'cleangame' | 'brokengame' | 'moderngame' | 'moderncleangame' | 'stateclassgame' | 'hybridgame'
>;
let cleanRoot: string;
let brokenRoot: string;
let modernRoot: string;
let modernCleanRoot: string;
let hybridRoot: string;
let stateClassRoot: string;
let oneSidedRoot: string;
let expectedModern: { status: string; summary: Record<string, number>; codes: string[] } =
  {} as never;
let expectedBroken: { status: string; summary: Record<string, number>; codes: string[] };

async function callValidate(
  client: Client,
  argument: unknown,
): Promise<ToolResponse<DatabaseAuditResult>> {
  return await callTool<DatabaseAuditResult>(client, 'audit_database_usage', argument);
}

async function withServer<T>(
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<T> {
  return (await withPackagedServer(server.cli, arguments_, use)).result;
}

beforeAll(async () => {
  server = await installPackagedServer('dbaudit', {
    cleangame: 'legacy',
    brokengame: 'legacy-broken',
    moderngame: 'modern-broken',
    moderncleangame: 'modern',
    hybridgame: 'hybrid',
    stateclassgame: 'modern-state-classes',
  });
  cleanRoot = server.projects.cleangame;
  brokenRoot = server.projects.brokengame;
  modernRoot = server.projects.moderngame;
  modernCleanRoot = server.projects.moderncleangame;
  hybridRoot = server.projects.hybridgame;
  stateClassRoot = server.projects.stateclassgame;
  oneSidedRoot = await deriveProject(server, modernCleanRoot, 'onesided', ['dbmodel.sql']);
  expectedBroken = (
    await readFixtureExpectations<{
      database: { status: string; summary: Record<string, number>; codes: string[] };
    }>('legacy-broken')
  ).database;
  expectedModern = (
    await readFixtureExpectations<{
      database: { status: string; summary: Record<string, number>; codes: string[] };
    }>('modern-broken')
  ).database;
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('packaged audit_database_usage', () => {
  it('[E2E-AUDIT-DATABASE-CLEAN] reads the schema and its queries and reports no defect', async () => {
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
    expect(result?.schemaSource).toBe('dbmodel.sql');
    expect(result?.schema).toEqual([
      { name: 'card', columns: ['card_id', 'card_location', 'card_owner'] },
    ]);
    expect(result?.queries).toHaveLength(2);
    expect(result?.queries.every((query) => !query.interpolated)).toBe(true);
    expect(result?.phpSourcesRead).toBeGreaterThan(0);

    for (const rule of result?.rules ?? []) {
      if (rule.certainty !== 'certain') {
        expect(rule.falsePositives.length).toBeGreaterThan(0);
      }
    }
    expect(response.text).toContain('status passed');
  });

  it('[E2E-AUDIT-DATABASE-SEEDED-DEFECTS] finds exactly the seeded database defects', async () => {
    const response = await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(false);
    const diagnostics = response.structured?.diagnostics;
    expect(diagnostics?.status).toBe(expectedBroken.status);
    expect(diagnostics?.summary).toEqual(expectedBroken.summary);
    expect(diagnostics?.findings.map((finding) => finding.code)).toEqual(expectedBroken.codes);

    const undeclaredTable = diagnostics?.findings.find(
      (finding) => finding.code === 'database.table.undeclared',
    );
    expect(undeclaredTable).toMatchObject({ kind: 'issue', certainty: 'certain' });
    expect(undeclaredTable?.message).toContain("'deck'");

    const interpolated = diagnostics?.findings.find(
      (finding) => finding.code === 'database.query.interpolated',
    );
    expect(interpolated).toMatchObject({ kind: 'heuristic', certainty: 'likely' });

    expect(response.text).toContain('database.column.undeclared');
    expect(response.text).toContain('(likely)');
  });

  it('[E2E-AUDIT-DATABASE-UNAVAILABLE] never reports a clean audit it could not run', async () => {
    const response = await withServer(
      ['--project-root', oneSidedRoot],
      async (client) => await callValidate(client, { projectRoot: oneSidedRoot }),
    );

    // The readers understand this layout; the project is simply missing one
    // side of the contract, and that is reported rather than passed.
    expect(response.isError).toBe(false);
    expect(response.structured?.diagnostics.status).toBe('findings');
    expect(response.structured?.diagnostics.findings[0]?.message).toContain(
      'no readable dbmodel.sql',
    );
  });

  it('[E2E-AUDIT-DATABASE-IMMUTABLE] changes nothing in the project it audits', async () => {
    const before = await digestDirectory(brokenRoot);
    await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );
    expect(await digestDirectory(brokenRoot)).toBe(before);
  });

  it('[E2E-AUDIT-DATABASE-DETERMINISTIC] returns identical results for repeated calls', async () => {
    const [first, second] = await withServer(['--project-root', brokenRoot], async (client) => [
      await callValidate(client, { projectRoot: brokenRoot }),
      await callValidate(client, { projectRoot: brokenRoot }),
    ]);
    expect(JSON.stringify(first.structured)).toBe(JSON.stringify(second.structured));
  });

  it('[E2E-AUDIT-DATABASE-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      await expectSchemaRejections(client, 'audit_database_usage', [
        // An omitted projectRoot now means the sole configured root, so it is
        // valid input rather than malformed; the refusals are proven by the
        // default-root scenarios.
        { projectRoot: 7 },
        { projectRoot: '' },
        { root: cleanRoot },
      ]);
    });
  });

  it('[E2E-AUDIT-DATABASE-UNLISTED-ROOT] refuses a root the server was not started with', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.root.not-allowed');
    expect(JSON.stringify(response)).not.toContain(brokenRoot);
  });

  it('[E2E-AUDIT-DATABASE-MODERN-CLEAN] passes a modern project built to the documented shapes', async () => {
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
    expect(structured?.schema).toEqual([
      { name: 'card', columns: ['card_id', 'card_location', 'card_owner'] },
    ]);
  });

  it('[E2E-AUDIT-DATABASE-MODERN-DEFECTS] finds exactly the defects the modern broken fixture declares', async () => {
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
  it('[E2E-AUDIT-DATABASE-STRINGS-ONLY] counts a string as a query only where something runs it', async () => {
    const response = await withServer(
      ['--project-root', stateClassRoot],
      async (client) => await callValidate(client, { projectRoot: stateClassRoot }),
    );

    expect(response.isError).toBe(false);
    const structured = response.structured;

    // Regression, observed through the installed package: adding
    // `$example = 'SELECT imaginary_id FROM ghost';` to an otherwise clean
    // project made it count a third query and report a certain undeclared
    // table. The fixture holds that line, a comment, and an exception message.
    expect(structured?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
    expect(structured?.queries.map((query) => query.text)).toEqual([
      'SELECT token_id, token_owner FROM token',
    ]);
  });
  it('[E2E-AUDIT-DATABASE-HYBRID] reads a part-migrated project through the public boundary', async () => {
    const response = await withServer(
      ['--project-root', hybridRoot],
      async (client) => await callValidate(client, { projectRoot: hybridRoot }),
    );

    expect(response.isError).toBe(false);
    // Nothing in the hybrid fixture is a defect: its metadata, client and one
    // state are still in the older form while its game logic and another state
    // have moved, and every capability must read that as one project.
    expect(response.structured?.layout).toBe('hybrid');
    expect(response.structured?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
  });
});
