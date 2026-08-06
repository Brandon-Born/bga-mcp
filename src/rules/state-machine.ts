import type { DiagnosticFinding, DiagnosticResult, DiagnosticSeverity } from '../diagnostics.js';
import type { ProjectModel } from '../project/model.js';
import type { StateDefinition } from '../project/parse.js';

/**
 * State-machine rule catalog.
 *
 * Each rule records what it proves, how certain that proof is, and where it can
 * be wrong. A rule that cannot prove its claim from the source must be a
 * heuristic: it carries heuristic evidence and reduced certainty, and it is
 * never reported as a fact.
 */
export interface StateMachineRule {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly certainty: 'certain' | 'likely' | 'possible';
  readonly summary: string;
  /** Known ways this rule can be wrong. Empty only for rules proven from the parsed source. */
  readonly falsePositives: readonly string[];
}

/** The state types the BGA framework dispatches. */
export const KNOWN_STATE_TYPES = [
  'activeplayer',
  'multipleactiveplayer',
  'game',
  'manager',
] as const;

/** The identifier the framework enters first. */
export const INITIAL_STATE_ID = 1;

export const STATE_MACHINE_RULES: readonly StateMachineRule[] = [
  {
    code: 'state.initial.missing',
    severity: 'error',
    certainty: 'certain',
    summary: `The framework enters state ${String(INITIAL_STATE_ID)} first, so it must be declared.`,
    falsePositives: [],
  },
  {
    code: 'state.id.duplicate',
    severity: 'error',
    certainty: 'certain',
    summary: 'A repeated state identifier silently discards the earlier definition.',
    falsePositives: [],
  },
  {
    code: 'state.transition.target-exists',
    severity: 'error',
    certainty: 'certain',
    summary: 'Every transition must target a declared state.',
    falsePositives: [],
  },
  {
    code: 'state.name.missing',
    severity: 'warning',
    certainty: 'certain',
    summary: 'A state without a name cannot be addressed by the client.',
    falsePositives: [],
  },
  {
    code: 'state.name.duplicate',
    severity: 'warning',
    certainty: 'certain',
    summary: 'Two states sharing a name make client-side state checks ambiguous.',
    falsePositives: [],
  },
  {
    code: 'state.type.unknown',
    severity: 'warning',
    certainty: 'certain',
    summary: `A state type outside ${KNOWN_STATE_TYPES.join(', ')} is not dispatched by the framework.`,
    falsePositives: ['A future framework release could add a state type this list does not know.'],
  },
  {
    code: 'state.unreachable',
    severity: 'warning',
    certainty: 'certain',
    summary: `No chain of declared transitions reaches this state from state ${String(INITIAL_STATE_ID)}.`,
    falsePositives: [
      'A state entered only through a computed or non-literal transition target cannot be seen by this rule; that transition is reported as unsupported syntax instead.',
    ],
  },
  {
    code: 'state.dead-end',
    severity: 'warning',
    certainty: 'certain',
    summary: 'A player-facing or game state with no transitions cannot hand control back.',
    falsePositives: [
      'A game that ends inside such a state deliberately would be flagged; the end state is normally type manager, which this rule skips.',
    ],
  },
  {
    code: 'state.action.handler-missing',
    severity: 'warning',
    certainty: 'likely',
    summary: 'The state names an action method that no readable PHP source declares.',
    falsePositives: [
      'The method may be defined dynamically, inherited from a parent class outside the project, or declared in a file the listing budget skipped.',
    ],
  },
  {
    code: 'state.args.handler-missing',
    severity: 'warning',
    certainty: 'likely',
    summary: 'The state names an args method that no readable PHP source declares.',
    falsePositives: [
      'The method may be defined dynamically, inherited from a parent class outside the project, or declared in a file the listing budget skipped.',
    ],
  },
  {
    code: 'state.possible-action.handler-missing',
    severity: 'warning',
    certainty: 'likely',
    summary: 'A possible action names a method that no readable PHP source declares.',
    falsePositives: [
      'Legacy projects may route the action through a dispatcher rather than a method of the same name, and modern projects may declare it with an attribute this reader does not interpret.',
    ],
  },
];

const RULES_BY_CODE = new Map(STATE_MACHINE_RULES.map((rule) => [rule.code, rule]));

export interface PhpSource {
  readonly path: string;
  readonly text: string;
}

function rule(code: string): StateMachineRule {
  const found = RULES_BY_CODE.get(code);
  if (found === undefined) {
    throw new Error(`Unknown state-machine rule: ${code}`);
  }
  return found;
}

function certainFinding(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  const definition = rule(code);
  return {
    kind: 'issue',
    code,
    severity: definition.severity,
    certainty: 'certain',
    message,
    locations: uri === null ? [] : [{ uri }],
    evidence: [{ kind: 'relationship', message: evidence }],
    suggestions: [{ message: suggestion }],
  };
}

function heuristicFinding(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  const definition = rule(code);
  return {
    kind: 'heuristic',
    code,
    severity: definition.severity,
    certainty: definition.certainty === 'certain' ? 'likely' : definition.certainty,
    message,
    locations: uri === null ? [] : [{ uri }],
    evidence: [
      { kind: 'heuristic', message: evidence },
      {
        kind: 'source',
        message: `Known limitation: ${definition.falsePositives.join(' ')}`,
      },
    ],
    suggestions: [{ message: suggestion }],
  };
}

function declaresMethod(sources: readonly PhpSource[], method: string): boolean {
  const pattern = new RegExp(`function\\s+${method}\\s*\\(`, 'u');
  return sources.some((source) => pattern.test(source.text));
}

function reachable(states: readonly StateDefinition[]): Set<number> {
  const byId = new Map(states.map((state) => [state.id, state]));
  const seen = new Set<number>();
  const queue: number[] = byId.has(INITIAL_STATE_ID) ? [INITIAL_STATE_ID] : [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const target of Object.values(byId.get(current)?.transitions ?? {})) {
      if (!seen.has(target)) {
        queue.push(target);
      }
    }
  }
  return seen;
}

/** Deterministic ordering: by code, then location, then message. */
function order(findings: readonly DiagnosticFinding[]): DiagnosticFinding[] {
  return [...findings].sort((left, right) => {
    const byCode = left.code.localeCompare(right.code);
    if (byCode !== 0) {
      return byCode;
    }
    const byLocation = (left.locations[0]?.uri ?? '').localeCompare(right.locations[0]?.uri ?? '');
    return byLocation === 0 ? left.message.localeCompare(right.message) : byLocation;
  });
}

function summarize(findings: readonly DiagnosticFinding[]): DiagnosticResult {
  const summary = { errors: 0, warnings: 0, information: 0, unsupported: 0 };
  for (const finding of findings) {
    if (finding.kind === 'unsupported-syntax') {
      summary.unsupported += 1;
    } else if (finding.severity === 'error') {
      summary.errors += 1;
    } else if (finding.severity === 'warning') {
      summary.warnings += 1;
    } else {
      summary.information += 1;
    }
  }
  const status =
    findings.length === 0
      ? 'passed'
      : summary.unsupported === findings.length
        ? 'unsupported'
        : 'findings';
  return { schemaVersion: 1, status, summary, findings: order(findings) };
}

/**
 * Validates the state machine across its declaration and its PHP sources.
 *
 * Structural rules are proven from the parsed declaration and are reported as
 * certain. Handler rules cross-check method names against readable PHP source
 * and are reported as heuristics, because a method can exist without being
 * visible to a textual reader.
 *
 * Unsupported syntax is carried through unchanged, so a project the reader
 * cannot fully interpret never produces a clean result.
 */
export function validateStateMachine(
  model: ProjectModel,
  sources: readonly PhpSource[],
): DiagnosticResult {
  const findings: DiagnosticFinding[] = [];
  const source = model.states.source;

  // Anything the reader could not interpret stays visible in this result.
  for (const finding of model.diagnostics.findings) {
    if (finding.kind === 'unsupported-syntax' && finding.code.startsWith('project.states.')) {
      findings.push(finding);
    }
  }

  if (model.states.definitions.length === 0) {
    if (findings.length === 0) {
      findings.push(
        certainFinding(
          'state.initial.missing',
          'No state definitions could be read, so the state machine cannot be validated.',
          'The project declares no readable states.',
          source,
          'Declare the state machine for this layout, or report the syntax that could not be read.',
        ),
      );
    }
    return summarize(findings);
  }

  const states = model.states.definitions;
  const declared = new Set(states.map((state) => state.id));

  if (!declared.has(INITIAL_STATE_ID)) {
    findings.push(
      certainFinding(
        'state.initial.missing',
        `State ${String(INITIAL_STATE_ID)} is not declared, so the game has no entry point.`,
        `No state declares identifier ${String(INITIAL_STATE_ID)}.`,
        source,
        `Declare state ${String(INITIAL_STATE_ID)} as the setup state.`,
      ),
    );
  }

  const seenIds = new Set<number>();
  const seenNames = new Map<string, number>();
  for (const state of states) {
    if (seenIds.has(state.id)) {
      findings.push(
        certainFinding(
          'state.id.duplicate',
          `State ${String(state.id)} is declared more than once.`,
          'A later entry with the same key replaces the earlier one.',
          source,
          'Give each state a unique identifier.',
        ),
      );
    }
    seenIds.add(state.id);

    if (state.name === null || state.name === '') {
      findings.push(
        certainFinding(
          'state.name.missing',
          `State ${String(state.id)} has no name.`,
          'The state entry declares no literal name.',
          source,
          'Add a name so the client can address the state.',
        ),
      );
    } else {
      const previous = seenNames.get(state.name);
      if (previous !== undefined) {
        findings.push(
          certainFinding(
            'state.name.duplicate',
            `States ${String(previous)} and ${String(state.id)} share the name '${state.name}'.`,
            'Two state entries declare the same name.',
            source,
            'Rename one of the states so client-side checks stay unambiguous.',
          ),
        );
      }
      seenNames.set(state.name, state.id);
    }

    if (state.type !== null && !KNOWN_STATE_TYPES.includes(state.type as never)) {
      findings.push(
        certainFinding(
          'state.type.unknown',
          `State ${String(state.id)} declares unknown type '${state.type}'.`,
          `The framework dispatches only ${KNOWN_STATE_TYPES.join(', ')}.`,
          source,
          `Use one of ${KNOWN_STATE_TYPES.join(', ')}.`,
        ),
      );
    }

    for (const [name, target] of Object.entries(state.transitions)) {
      if (!declared.has(target)) {
        findings.push(
          certainFinding(
            'state.transition.target-exists',
            `Transition '${name}' of state ${String(state.id)} targets undefined state ${String(target)}.`,
            `State ${String(target)} is not declared.`,
            source,
            `Declare state ${String(target)} or change the transition target.`,
          ),
        );
      }
    }

    if (Object.keys(state.transitions).length === 0 && state.type !== 'manager') {
      findings.push(
        certainFinding(
          'state.dead-end',
          `State ${String(state.id)} has no transitions and cannot hand control back.`,
          'The state declares an empty or absent transition map and is not a manager state.',
          source,
          'Add a transition, or use the manager type if this state ends the game.',
        ),
      );
    }
  }

  const reachableIds = reachable(states);
  for (const state of states) {
    if (!reachableIds.has(state.id)) {
      findings.push(
        certainFinding(
          'state.unreachable',
          `State ${String(state.id)} cannot be reached from state ${String(INITIAL_STATE_ID)}.`,
          'No chain of declared transitions leads to this state.',
          source,
          'Add a transition that reaches it, or remove the state.',
        ),
      );
    }
  }

  // Cross-file handler checks. These are heuristics by construction.
  const searchable = sources.length > 0;
  for (const state of states) {
    const checks: { method: string | null; code: string; label: string }[] = [
      { method: state.action, code: 'state.action.handler-missing', label: 'action' },
      { method: state.args, code: 'state.args.handler-missing', label: 'args' },
      ...state.possibleActions.map((action) => ({
        method: action,
        code: 'state.possible-action.handler-missing',
        label: 'possible action',
      })),
    ];

    for (const check of checks) {
      if (check.method === null || check.method === '' || !searchable) {
        continue;
      }
      if (declaresMethod(sources, check.method)) {
        continue;
      }
      findings.push(
        heuristicFinding(
          check.code,
          `State ${String(state.id)} names ${check.label} method '${check.method}', which no readable PHP source declares.`,
          `No 'function ${check.method}(' was found in ${String(sources.length)} readable PHP source files.`,
          source,
          `Declare ${check.method}() in the game class, or confirm it is provided dynamically.`,
        ),
      );
    }
  }

  return summarize(findings);
}
