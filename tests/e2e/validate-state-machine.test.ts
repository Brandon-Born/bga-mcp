import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
  readonly initialState: { ids: number[]; origin: string; evidence: string };
  readonly complete: { declarations: boolean; edges: boolean };
  readonly rules: { code: string; certainty: string; falsePositives: string[] }[];
  readonly diagnostics: {
    status: string;
    summary: Record<string, number>;
    findings: { kind: string; code: string; certainty: string; message: string }[];
  };
}

let server: PackagedServer<
  | 'cleangame'
  | 'brokengame'
  | 'moderngame'
  | 'moderncleangame'
  | 'stateclassgame'
  | 'unreadablegame'
  | 'hybridgame'
>;
let cleanRoot: string;
let brokenRoot: string;
let modernRoot: string;
let modernCleanRoot: string;
let hybridRoot: string;
let stateClassRoot: string;
let unreadableRoot: string;
let ruleCoverageRoot: string;
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
    hybridgame: 'hybrid',
    stateclassgame: 'modern-state-classes',
    unreadablegame: 'modern-unreadable',
  });
  cleanRoot = server.projects.cleangame;
  brokenRoot = server.projects.brokengame;
  modernRoot = server.projects.moderngame;
  modernCleanRoot = server.projects.moderncleangame;
  hybridRoot = server.projects.hybridgame;
  stateClassRoot = server.projects.stateclassgame;
  unreadableRoot = server.projects.unreadablegame;
  expectedBroken = (
    await readFixtureExpectations<{
      stateMachine: { status: string; summary: Record<string, number>; codes: string[] };
    }>('legacy-broken')
  ).stateMachine;
  ruleCoverageRoot = resolve(server.temporaryRoot, 'projects', 'rulecoverage');
  await mkdir(resolve(ruleCoverageRoot), { recursive: true });
  await writeFile(
    resolve(ruleCoverageRoot, 'gameinfos.inc.php'),
    "<?php\n$gameinfos = ['game_name' => 'RuleCoverage', 'players' => [2]];\n",
  );
  await writeFile(
    resolve(ruleCoverageRoot, 'rulecoverage.game.php'),
    '<?php\nclass RuleCoverage extends Table {}\n',
  );
  // No state 1, no state 2 and no setupNewGame, so nothing names an entry
  // point; state 7 is declared twice, and the later entry is the one PHP keeps;
  // state 8 has no name; state 7 allows an action no PHP source declares.
  await writeFile(
    resolve(ruleCoverageRoot, 'states.inc.php'),
    `<?php
$machinestates = [
    7 => ['name' => 'first', 'type' => 'activeplayer', 'possibleactions' => ['actNowhere'], 'transitions' => ['next' => 8]],
    7 => ['name' => 'second', 'type' => 'activeplayer', 'possibleactions' => ['actNowhere'], 'transitions' => ['next' => 8]],
    8 => ['type' => 'game', 'action' => 'stSomething', 'transitions' => ['back' => 7]],
];
`,
  );

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

  it('[E2E-VALIDATE-STATES-UNSUPPORTED] never reports a clean result for states it cannot read, and derives nothing from them', async () => {
    const response = await withServer(
      ['--project-root', unreadableRoot],
      async (client) => await callValidate(client, { projectRoot: unreadableRoot }),
    );

    expect(response.isError).toBe(false);
    const findings = response.structured?.diagnostics.findings ?? [];
    expect(response.structured?.diagnostics.status).toBe('unsupported');
    expect(findings.every((finding) => finding.kind === 'unsupported-syntax')).toBe(true);
    expect(findings.map((finding) => finding.message).join('\n')).toContain('non-literal id');

    // The reader says what it could not read, and the rules that depend on
    // reading all of it stay silent: state 40 is the identifier the computed
    // class means to declare, so the transition to it is not a dangling target
    // and nothing is called unreachable.
    expect(response.structured?.complete).toEqual({ declarations: false, edges: false });
    expect(findings.map((finding) => finding.code)).not.toContain('state.transition.target-exists');
    expect(findings.map((finding) => finding.code)).not.toContain('state.unreachable');
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
    expect(structured?.stateCount).toBe(2);

    // Regression, observed through the installed package before this fixture
    // existed: a documented setupNewGame returning a class produced a certain
    // state.initial.missing and two certain state.unreachable findings.
    expect(structured?.initialState).toMatchObject({ ids: [2], origin: 'setup-new-game' });
    expect(structured?.initialState.evidence).toContain('PlayerTurn::class');
    expect(structured?.complete).toEqual({ declarations: true, edges: true });
  });

  it('[E2E-VALIDATE-STATES-MODERN-CONSTRUCTS] reads every documented state-class construct without a false finding', async () => {
    const response = await withServer(
      ['--project-root', stateClassRoot],
      async (client) => await callValidate(client, { projectRoot: stateClassRoot }),
    );

    expect(response.isError).toBe(false);
    const structured = response.structured;
    // Each of these produced a false or unsupported result in the installed
    // package: identifiers written as StateConstants members, StateType::PRIVATE,
    // a #[PossibleAction] handler, and class, identifier and transition redirects.
    expect(structured?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
    expect(structured?.stateCount).toBe(4);
    expect(structured?.initialState).toMatchObject({ ids: [10], origin: 'setup-new-game' });
    expect(structured?.complete).toEqual({ declarations: true, edges: true });
    expect(response.text).toContain('status passed');
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
  it('[E2E-VALIDATE-STATES-HYBRID] reads a part-migrated project through the public boundary', async () => {
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
  it('[E2E-VALIDATE-STATES-RULE-COVERAGE] reports the entry point, duplicate, nameless and unbacked-action defects', async () => {
    const response = await withServer(
      ['--project-root', ruleCoverageRoot],
      async (client) => await callValidate(client, { projectRoot: ruleCoverageRoot }),
    );

    expect(response.isError).toBe(false);
    const codes = response.structured?.diagnostics.findings.map((finding) => finding.code) ?? [];

    // The four rules that had no failing fixture, each proven through the
    // installed server rather than by construction in a unit test.
    expect(codes).toContain('state.initial.missing');
    expect(codes).toContain('state.id.duplicate');
    expect(codes).toContain('state.name.missing');
    expect(codes).toContain('state.possible-action.handler-missing');
    expect(response.structured?.initialState.origin).toBe('unresolved');

    const handler = response.structured?.diagnostics.findings.find(
      (finding) => finding.code === 'state.possible-action.handler-missing',
    );
    // A cross-file claim stays a heuristic even when it is right.
    expect(handler?.kind).toBe('heuristic');
  });
});
