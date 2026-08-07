import type { DiagnosticFinding, DiagnosticResult } from '../../src/diagnostics.js';
import type { ProjectModel } from '../../src/project/model.js';
import type { StateDefinition } from '../../src/project/parse.js';
import {
  INITIAL_STATE_ID,
  KNOWN_STATE_TYPES,
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
    ...overrides,
  };
}

function model(
  definitions: readonly StateDefinition[],
  overrides: Partial<ProjectModel> = {},
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
  state(INITIAL_STATE_ID, { name: 'gameSetup', type: 'manager', transitions: { '': 2 } }),
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
        state(INITIAL_STATE_ID, {
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

  it('reports a missing entry state as a certain error', () => {
    const result = validateStateMachine(model([state(2, { transitions: { pass: 2 } })]), []);
    expect(codes(result)).toContain('state.initial.missing');
    expect(result.findings[0]).toMatchObject({
      kind: 'issue',
      severity: 'error',
      certainty: 'certain',
    });
  });

  it('reports a transition to an undeclared state as a certain error', () => {
    const result = validateStateMachine(
      model([
        state(INITIAL_STATE_ID, { type: 'manager', transitions: { '': 2 } }),
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

  it('reports duplicate identifiers, duplicate names, and unknown types', () => {
    const result = validateStateMachine(
      model([
        state(INITIAL_STATE_ID, { name: 'setup', type: 'manager', transitions: { '': 2 } }),
        state(2, { name: 'turn', transitions: { pass: 2 } }),
        state(2, { name: 'turn', type: 'mystery', transitions: { pass: 2 } }),
        state(3, { name: null, transitions: { pass: 2 } }),
      ]),
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

  it('reports unreachable states and dead ends', () => {
    const result = validateStateMachine(
      model([
        state(INITIAL_STATE_ID, { type: 'manager', transitions: { '': 2 } }),
        state(2, { transitions: { pass: 2 } }),
        state(7, { name: 'orphan' }),
        state(9, { name: 'ending', type: 'manager' }),
      ]),
      [],
    );
    const unreachable = result.findings.filter((entry) => entry.code === 'state.unreachable');
    expect(unreachable).toHaveLength(2);
    expect(codes(result)).toContain('state.dead-end');
    // A manager state without transitions is the normal way to end a game.
    expect(result.findings.filter((entry) => entry.code === 'state.dead-end')).toHaveLength(1);
  });

  it('reports missing handlers as heuristics that carry their limitations', () => {
    const result = validateStateMachine(
      model([
        state(INITIAL_STATE_ID, {
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
        state(INITIAL_STATE_ID, {
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
        states: {
          parsed: false,
          definitions: [],
          unsupported: ['classes'],
          source: null,
          sources: [],
        },
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
      state(INITIAL_STATE_ID, { name: 'setup', type: 'manager', transitions: { '': 5 } }),
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
