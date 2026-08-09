import type { DiagnosticFinding, DiagnosticResult } from '../../src/diagnostics.js';
import type { ProjectModel, ProjectStates } from '../../src/project/model.js';
import type { StateDefinition } from '../../src/project/parse.js';
import {
  KNOWN_STATE_TYPES,
  RESERVED_STATE_IDS,
  STATE_MACHINE_RULES,
  validateStateMachine,
  type PhpSource,
} from '../../src/rules/state-machine.js';

function state(id: number, overrides: Partial<StateDefinition> = {}): StateDefinition {
  return {
    id,
    name: `state${String(id)}`,
    type: 'activeplayer',
    action: null,
    args: null,
    possibleActions: [],
    transitions: {},
    origin: 'array',
    description: null,
    descriptionMyTurn: null,
    zombie: null,
    redirects: [],
    edgesResolved: true,
    ...overrides,
  };
}

/** The entry point the framework resolves for a legacy machine with state 1. */
function fromStateOne(definitions: readonly StateDefinition[]): ProjectStates['initial'] {
  return definitions.some((entry) => entry.id === 1)
    ? { ids: [1], origin: 'state-1', evidence: 'State 1 is declared.' }
    : { ids: [], origin: 'unresolved', evidence: 'Nothing names an entry point.' };
}

function model(
  definitions: readonly StateDefinition[],
  overrides: Partial<ProjectModel> = {},
  states: Partial<ProjectStates> = {},
): ProjectModel {
  return {
    schemaVersion: 1,
    layout: 'legacy',
    gameKey: 'fixture',
    detection: {
      layout: 'legacy',
      gameKey: 'fixture',
      certainty: 'certain',
      reason: 'test model',
      components: [],
      signals: [],
    },
    metadata: { gameName: 'Fixture', playerCounts: [2], source: 'gameinfos.inc.php' },
    components: [],
    states: {
      parsed: definitions.length > 0,
      definitions,
      unsupported: [],
      source: 'states.inc.php',
      sources: ['states.inc.php'],
      complete: { declarations: true, edges: true },
      duplicateIds: [],
      initial: fromStateOne(definitions),
      ...states,
    },
    fileCount: definitions.length,
    truncated: false,
    skippedLinks: [],
    diagnostics: {
      schemaVersion: 1,
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    },
    ...overrides,
  };
}

/** A minimal machine that every structural rule accepts. */
const VALID_STATES = [
  state(1, { name: 'gameSetup', type: 'manager', transitions: { '': 2 } }),
  state(2, { name: 'playerTurn', transitions: { pass: 99 } }),
  state(99, { name: 'gameEnd', type: 'manager' }),
];

function codes(result: DiagnosticResult): string[] {
  return result.findings.map((finding) => finding.code);
}

describe('state-machine rule catalog', () => {
  it('publishes unique codes, and every heuristic rule records its false positives', () => {
    const declared = STATE_MACHINE_RULES.map((entry) => entry.code);
    expect(new Set(declared).size).toBe(declared.length);
    for (const entry of STATE_MACHINE_RULES) {
      expect(entry.code).toMatch(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
      expect(entry.summary.length).toBeGreaterThan(10);
      if (entry.certainty !== 'certain') {
        expect(entry.falsePositives.length).toBeGreaterThan(0);
      }
    }
  });

  it('accepts a valid machine with every handler declared', () => {
    const sources: PhpSource[] = [
      { path: 'game.php', text: '<?php function stGameSetup() {} function stGameEnd() {}' },
    ];
    const result = validateStateMachine(
      model([
        state(1, {
          name: 'gameSetup',
          type: 'manager',
          action: 'stGameSetup',
          transitions: { '': 2 },
        }),
        state(2, { name: 'playerTurn', transitions: { pass: 99 } }),
        state(99, { name: 'gameEnd', type: 'manager', action: 'stGameEnd' }),
      ]),
      sources,
    );
    expect(result.status).toBe('passed');
    expect(result.findings).toEqual([]);
  });

  it('reports a machine with no entry point at all as a certain error', () => {
    const result = validateStateMachine(
      model(
        [state(7, { transitions: { pass: 7 } })],
        {},
        {
          initial: { ids: [], origin: 'unresolved', evidence: 'Nothing names an entry point.' },
        },
      ),
      [],
    );
    expect(codes(result)).toContain('state.initial.missing');
    expect(result.findings[0]).toMatchObject({
      kind: 'issue',
      severity: 'error',
      certainty: 'certain',
    });
  });

  it('accepts a modern machine whose entry point comes from setupNewGame', () => {
    // Regression: the installed package reported state.initial.missing and two
    // false state.unreachable findings for a documented state-class project
    // whose setupNewGame returns PlayerTurn::class and which has no state 1.
    const result = validateStateMachine(
      model(
        [
          state(2, {
            name: 'PlayerTurn',
            origin: 'class',
            transitions: { pass: 20 },
          }),
          state(20, { name: 'NextPlayer', type: 'game', origin: 'class', redirects: [2, 99] }),
        ],
        {},
        {
          initial: {
            ids: [2],
            origin: 'setup-new-game',
            evidence: 'setupNewGame returns PlayerTurn::class',
          },
        },
      ),
      [],
    );
    expect(result.status).toBe('passed');
    expect(codes(result)).toEqual([]);
  });

  it('reports a state class that takes a reserved identifier', () => {
    const result = validateStateMachine(
      model(
        [
          state(2, { name: 'PlayerTurn', origin: 'class', transitions: { pass: 99 } }),
          state(99, { name: 'GameEnd', type: 'game', origin: 'class' }),
        ],
        {},
        { initial: { ids: [2], origin: 'setup-new-game', evidence: 'setupNewGame' } },
      ),
      [],
    );
    expect(codes(result)).toEqual(['state.id.reserved']);
    expect(RESERVED_STATE_IDS).toEqual([1, 99]);
  });

  it('reports a transition to an undeclared state as a certain error', () => {
    const result = validateStateMachine(
      model([
        state(1, { type: 'manager', transitions: { '': 2 } }),
        state(2, { transitions: { pass: 42 } }),
      ]),
      [],
    );
    const finding = result.findings.find(
      (entry) => entry.code === 'state.transition.target-exists',
    );
    expect(finding).toMatchObject({ kind: 'issue', severity: 'error', certainty: 'certain' });
    expect(finding?.message).toContain('undefined state 42');
    expect(result.summary.errors).toBe(1);
  });

  it('treats the reserved identifiers as declared, whether or not the project declares them', () => {
    const result = validateStateMachine(
      model(
        [state(2, { name: 'PlayerTurn', origin: 'class', transitions: { pass: 99 } })],
        {},
        { initial: { ids: [2], origin: 'setup-new-game', evidence: 'setupNewGame' } },
      ),
      [],
    );
    expect(codes(result)).toEqual([]);
  });

  it('reports duplicate identifiers, duplicate names, and unknown types', () => {
    const result = validateStateMachine(
      model(
        [
          state(1, { name: 'setup', type: 'manager', transitions: { '': 2 } }),
          state(2, { name: 'turn', type: 'mystery', transitions: { pass: 2 } }),
          state(3, { name: null, transitions: { pass: 2 } }),
          state(4, { name: 'turn', transitions: { pass: 2 } }),
        ],
        {},
        { duplicateIds: [2] },
      ),
      [],
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        'state.id.duplicate',
        'state.name.duplicate',
        'state.name.missing',
        'state.type.unknown',
      ]),
    );
    expect(KNOWN_STATE_TYPES).not.toContain('mystery');
  });

  it('accepts every state type the framework documents, including private', () => {
    // Regression: StateType::PRIVATE produced a certain state.type.unknown.
    const result = validateStateMachine(
      model(
        [
          state(10, {
            name: 'master',
            type: 'multipleactiveplayer',
            transitions: { startPlay: 20 },
            redirects: [11],
          }),
          state(11, { name: 'chooseFirst', type: 'private' }),
          state(20, { name: 'turn', type: 'activeplayer', transitions: { next: 30 } }),
          state(30, { name: 'between', type: 'game', redirects: [20] }),
        ],
        {},
        { initial: { ids: [10], origin: 'setup-new-game', evidence: 'setupNewGame' } },
      ),
      [],
    );
    expect(codes(result)).toEqual([]);
    expect([...KNOWN_STATE_TYPES]).toEqual([
      'activeplayer',
      'multipleactiveplayer',
      'private',
      'game',
    ]);
  });

  it('reports unreachable states and dead ends, and never the framework’s own', () => {
    const result = validateStateMachine(
      model([
        state(1, { type: 'manager', transitions: { '': 2 } }),
        state(2, { transitions: { pass: 2 } }),
        state(7, { name: 'orphan' }),
        state(9, { name: 'ending', type: 'manager' }),
        state(99, { name: 'gameEnd', type: 'manager' }),
      ]),
      [],
    );
    // State 99 is unreachable too, and is never reported: the framework ends
    // the game there whatever the project's own transitions say.
    const unreachable = result.findings.filter((entry) => entry.code === 'state.unreachable');
    expect(unreachable.map((entry) => /State (\d+)/u.exec(entry.message)?.[1])).toEqual(['7', '9']);
    expect(codes(result)).toContain('state.dead-end');
    // A manager state without transitions is the normal way to end a game.
    expect(result.findings.filter((entry) => entry.code === 'state.dead-end')).toHaveLength(1);
  });

  it('counts a handler redirect as a way out of a state', () => {
    const result = validateStateMachine(
      model(
        [
          state(2, { name: 'PlayerTurn', origin: 'class', transitions: { pass: 20 } }),
          // No transitions at all: onEnteringState returns PlayerTurn::class.
          state(20, { name: 'NextPlayer', type: 'game', origin: 'class', redirects: [2] }),
        ],
        {},
        { initial: { ids: [2], origin: 'setup-new-game', evidence: 'setupNewGame' } },
      ),
      [],
    );
    expect(codes(result)).toEqual([]);
  });

  it('stays silent about the whole machine when part of it could not be read', () => {
    // The identifier of one state could not be read, so a transition to it is
    // not a dangling target and the states it would reach are not orphans.
    const unsupported = {
      kind: 'unsupported-syntax',
      code: 'project.states.unsupported',
      certainty: 'certain',
      message: 'Part of the state machine could not be read: non-literal id.',
      locations: [{ uri: 'modules/php/States/Computed.php' }],
      evidence: [{ kind: 'source', message: 'Unsupported construct: non-literal id' }],
      suggestions: [{ message: 'Report the construct.' }],
      syntax: { language: 'php', construct: 'non-literal id' },
    } satisfies DiagnosticFinding;

    const result = validateStateMachine(
      model(
        [state(2, { name: 'PlayerTurn', origin: 'class', transitions: { pass: 40 } })],
        {
          diagnostics: {
            schemaVersion: 1,
            status: 'unsupported',
            summary: { errors: 0, warnings: 0, information: 0, unsupported: 1 },
            findings: [unsupported],
          },
        },
        {
          complete: { declarations: false, edges: false },
          initial: { ids: [2], origin: 'setup-new-game', evidence: 'setupNewGame' },
        },
      ),
      [],
    );

    expect(result.status).toBe('unsupported');
    expect(codes(result)).toEqual(['project.states.unsupported']);
  });

  it('reports missing handlers as heuristics that carry their limitations', () => {
    const result = validateStateMachine(
      model([
        state(1, {
          type: 'manager',
          action: 'stMissing',
          args: 'argMissing',
          possibleActions: ['actMissing'],
          transitions: { '': 1 },
        }),
      ]),
      [{ path: 'game.php', text: '<?php class Game {}' }],
    );

    const heuristics = result.findings.filter((finding) => finding.kind === 'heuristic');
    expect(heuristics.map((finding) => finding.code).sort()).toEqual([
      'state.action.handler-missing',
      'state.args.handler-missing',
      'state.possible-action.handler-missing',
    ]);
    for (const finding of heuristics) {
      expect(finding.certainty).toBe('likely');
      expect(finding.evidence.some((entry) => entry.kind === 'heuristic')).toBe(true);
      expect(finding.evidence.some((entry) => entry.message.includes('Known limitation'))).toBe(
        true,
      );
    }
  });

  it('does not guess about handlers when no PHP source could be read', () => {
    const result = validateStateMachine(
      model([
        state(1, {
          type: 'manager',
          action: 'stMissing',
          transitions: { '': 1 },
        }),
      ]),
      [],
    );
    expect(codes(result)).not.toContain('state.action.handler-missing');
  });

  it('never reports a clean result when the states could not be read', () => {
    const unsupported = {
      kind: 'unsupported-syntax',
      code: 'project.states.modern-classes',
      certainty: 'certain',
      message: 'Modern state classes are not interpreted.',
      locations: [],
      evidence: [{ kind: 'source', message: 'Unsupported construct: class-based states' }],
      suggestions: [{ message: 'Report the construct.' }],
      syntax: { language: 'php', construct: 'class-based states' },
    } satisfies DiagnosticFinding;

    const result = validateStateMachine(
      model([], {
        layout: 'modern',
        diagnostics: {
          schemaVersion: 1,
          status: 'unsupported',
          summary: { errors: 0, warnings: 0, information: 0, unsupported: 1 },
          findings: [unsupported],
        },
      }),
      [],
    );

    expect(result.status).toBe('unsupported');
    expect(codes(result)).toEqual(['project.states.modern-classes']);

    const empty = validateStateMachine(model([]), []);
    expect(empty.status).toBe('findings');
    expect(codes(empty)).toEqual(['state.initial.missing']);
  });

  it('orders findings deterministically', () => {
    const machine = model([
      state(1, { name: 'setup', type: 'manager', transitions: { '': 5 } }),
      state(2, { name: 'zeta', type: 'mystery', transitions: { pass: 404 } }),
      state(5, { name: 'alpha', transitions: { pass: 2 } }),
    ]);
    const first = validateStateMachine(machine, []);
    const second = validateStateMachine(machine, []);
    expect(codes(first)).toEqual(codes(second));
    expect(codes(first)).toEqual([...codes(first)].sort());
    expect(VALID_STATES).toHaveLength(3);
  });
});
