import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  digestDirectory,
  expectSchemaRejections,
  installPackagedServer,
  readFixtureExpectations,
  withPackagedServer,
  type PackagedServer,
  type ToolResponse,
} from '../helpers/packaged.js';

interface ValidationResult {
  readonly schemaVersion: number;
  readonly layout: string;
  readonly statesRead: boolean;
  readonly statesSource: string | null;
  readonly stateCount: number;
  readonly phpSourcesRead: number;
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
let expectedModern: { status: string; summary: Record<string, number>; codes: string[] } =
  {} as never;
let expectedBroken: { status: string; summary: Record<string, number>; codes: string[] };

async function callValidate(
  client: Client,
  argument: unknown,
): Promise<ToolResponse<ValidationResult>> {
  return await callTool<ValidationResult>(client, 'validate_state_machine', argument);
}

async function withServer<T>(
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<T> {
  return (await withPackagedServer(server.cli, arguments_, use)).result;
}

beforeAll(async () => {
  server = await installPackagedServer('states', {
    cleangame: 'legacy',
    brokengame: 'legacy-broken',
    moderngame: 'modern-broken',
    moderncleangame: 'modern',
  });
  cleanRoot = server.projects.cleangame;
  brokenRoot = server.projects.brokengame;
  modernRoot = server.projects.moderngame;
  modernCleanRoot = server.projects.moderncleangame;
  expectedBroken = (
    await readFixtureExpectations<{
      stateMachine: { status: string; summary: Record<string, number>; codes: string[] };
    }>('legacy-broken')
  ).stateMachine;
  expectedModern = (
    await readFixtureExpectations<{
      stateMachine: { status: string; summary: Record<string, number>; codes: string[] };
    }>('modern-broken')
  ).stateMachine;
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('packaged validate_state_machine', () => {
  it('[E2E-VALIDATE-STATES-CLEAN] passes a valid state machine and publishes its rule catalog', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await callValidate(client, { projectRoot: cleanRoot }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    expect(result).toMatchObject({
      schemaVersion: 1,
      layout: 'legacy',
      statesRead: true,
      statesSource: 'states.inc.php',
      stateCount: 3,
    });
    expect(result?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
    expect(result?.phpSourcesRead).toBeGreaterThan(0);

    // Every rule the tool can report is published with its certainty and limits.
    expect(result?.rules.length).toBeGreaterThanOrEqual(11);
    for (const rule of result?.rules ?? []) {
      if (rule.certainty !== 'certain') {
        expect(rule.falsePositives.length).toBeGreaterThan(0);
      }
    }
    expect(response.text).toContain('status passed');
  });

  it('[E2E-VALIDATE-STATES-SEEDED-DEFECTS] finds exactly the seeded cross-file defects', async () => {
    const response = await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(false);
    const diagnostics = response.structured?.diagnostics;
    expect(diagnostics?.status).toBe(expectedBroken.status);
    expect(diagnostics?.summary).toEqual(expectedBroken.summary);
    expect(diagnostics?.findings.map((finding) => finding.code)).toEqual(expectedBroken.codes);

    const target = diagnostics?.findings.find(
      (finding) => finding.code === 'state.transition.target-exists',
    );
    expect(target).toMatchObject({ kind: 'issue', certainty: 'certain' });
    expect(target?.message).toContain('undefined state 42');

    const handler = diagnostics?.findings.find(
      (finding) => finding.code === 'state.action.handler-missing',
    );
    expect(handler).toMatchObject({ kind: 'heuristic', certainty: 'likely' });

    expect(response.text).toContain('state.transition.target-exists');
    expect(response.text).toContain('(likely)');
  });

  it('[E2E-VALIDATE-STATES-UNSUPPORTED] never reports a clean result for states it cannot read', async () => {
    const response = await withServer(
      ['--project-root', modernRoot],
      async (client) => await callValidate(client, { projectRoot: modernRoot }),
    );

    // Modern state classes are read now, so "cannot read" means a state whose
    // identifier is computed: the reader reports it rather than skipping it.
    expect(response.isError).toBe(false);
    const unsupported = response.structured?.diagnostics.findings.filter(
      (finding) => finding.kind === 'unsupported-syntax',
    );
    expect(unsupported?.length).toBeGreaterThan(0);
    expect(unsupported?.[0]?.message).toContain('non-literal id');
    expect(response.structured?.diagnostics.status).not.toBe('passed');
  });

  it('[E2E-VALIDATE-STATES-IMMUTABLE] changes nothing in the project it validates', async () => {
    const before = await digestDirectory(brokenRoot);
    await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );
    expect(await digestDirectory(brokenRoot)).toBe(before);
  });

  it('[E2E-VALIDATE-STATES-DETERMINISTIC] returns identical results for repeated calls', async () => {
    const [first, second] = await withServer(['--project-root', brokenRoot], async (client) => [
      await callValidate(client, { projectRoot: brokenRoot }),
      await callValidate(client, { projectRoot: brokenRoot }),
    ]);
    expect(JSON.stringify(first.structured)).toBe(JSON.stringify(second.structured));
  });

  it('[E2E-VALIDATE-STATES-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      await expectSchemaRejections(client, 'validate_state_machine', [
        // An omitted projectRoot now means the sole configured root, so it is
        // valid input rather than malformed; the refusals are proven by the
        // default-root scenarios.
        { projectRoot: 7 },
        { projectRoot: '' },
        { root: cleanRoot },
      ]);
    });
  });

  it('[E2E-VALIDATE-STATES-UNLISTED-ROOT] refuses a root the server was not started with', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.root.not-allowed');
    expect(JSON.stringify(response)).not.toContain(brokenRoot);
  });

  it('[E2E-VALIDATE-STATES-MODERN-CLEAN] passes a modern project built to the documented shapes', async () => {
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
    expect(structured?.statesRead).toBe(true);
    expect(structured?.stateCount).toBe(3);
  });

  it('[E2E-VALIDATE-STATES-MODERN-DEFECTS] finds exactly the defects the modern broken fixture declares', async () => {
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
