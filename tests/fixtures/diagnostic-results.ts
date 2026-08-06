import type { DiagnosticResult } from '../../src/diagnostics.js';

export const diagnosticScenarioNames = [
  'success',
  'error',
  'warning',
  'heuristic',
  'unsupported',
] as const;

export type DiagnosticScenarioName = (typeof diagnosticScenarioNames)[number];

const stateLocation = {
  uri: 'file:///project/modules/php/States/PlayerTurn.php',
  range: {
    start: { line: 12, column: 3 },
    end: { line: 12, column: 24 },
  },
} as const;

export const diagnosticScenarios: Readonly<Record<DiagnosticScenarioName, DiagnosticResult>> = {
  success: {
    schemaVersion: 1,
    status: 'passed',
    summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
    findings: [],
  },
  error: {
    schemaVersion: 1,
    status: 'findings',
    summary: { errors: 1, warnings: 0, information: 0, unsupported: 0 },
    findings: [
      {
        kind: 'issue',
        code: 'state.missing-transition',
        severity: 'error',
        certainty: 'certain',
        message: 'State 12 references transition 99, which is not declared.',
        locations: [stateLocation],
        evidence: [
          {
            kind: 'relationship',
            message: 'The transition target is absent from the declared state identifiers.',
            location: stateLocation,
          },
        ],
        suggestions: [
          {
            message: 'Declare state 99 or change the transition target.',
            location: stateLocation,
          },
        ],
      },
    ],
  },
  warning: {
    schemaVersion: 1,
    status: 'findings',
    summary: { errors: 0, warnings: 1, information: 0, unsupported: 0 },
    findings: [
      {
        kind: 'issue',
        code: 'metadata.missing-description',
        severity: 'warning',
        certainty: 'certain',
        message: 'The project metadata has no player-facing description.',
        locations: [{ uri: 'file:///project/gameinfos.jsonc' }],
        evidence: [
          {
            kind: 'source',
            message: 'No description property is present in gameinfos.jsonc.',
          },
        ],
        suggestions: [{ message: 'Add a concise description to the project metadata.' }],
      },
    ],
  },
  heuristic: {
    schemaVersion: 1,
    status: 'findings',
    summary: { errors: 0, warnings: 0, information: 1, unsupported: 0 },
    findings: [
      {
        kind: 'heuristic',
        code: 'action.possible-unused-handler',
        severity: 'information',
        certainty: 'possible',
        message: 'The action handler may not be referenced by the supported client syntax.',
        locations: [{ uri: 'file:///project/modules/php/Game.php' }],
        evidence: [
          {
            kind: 'heuristic',
            message: 'No statically recognizable client call references this handler.',
          },
        ],
        suggestions: [
          { message: 'Confirm dynamic calls manually before removing the action handler.' },
        ],
      },
    ],
  },
  unsupported: {
    schemaVersion: 1,
    status: 'unsupported',
    summary: { errors: 0, warnings: 0, information: 0, unsupported: 1 },
    findings: [
      {
        kind: 'unsupported-syntax',
        code: 'syntax.dynamic-state-definition',
        certainty: 'certain',
        message: 'The state definition is generated dynamically and was not analyzed.',
        syntax: { language: 'php', construct: 'runtime-computed array key' },
        locations: [{ uri: 'file:///project/states.inc.php' }],
        evidence: [
          {
            kind: 'source',
            message: 'The state identifier is computed from a function call.',
          },
        ],
        suggestions: [{ message: 'Review this state definition manually.' }],
      },
    ],
  },
};
