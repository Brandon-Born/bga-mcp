import type { DiagnosticFinding, DiagnosticResult, DiagnosticSeverity } from '../diagnostics.js';
import { cancellationCheckpoint } from '../deadline.js';
import type { ProjectModel } from '../project/model.js';
import type { StateDefinition } from '../project/parse.js';
import { certainFinding, heuristicFinding, summarizeFindings } from './uncertainty.js';

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

/**
 * The state types the BGA framework dispatches.
 *
 * Both state pages list the same four and no others: "You can use 4 types of
 * game states: StateType::ACTIVE_PLAYER … MULTIPLE_ACTIVE_PLAYER … PRIVATE …
 * GAME", each with the name the array notation uses.
 */
export const KNOWN_STATE_TYPES = [
  'activeplayer',
  'multipleactiveplayer',
  'private',
  'game',
] as const;

/**
 * Identifiers the framework keeps for itself.
 *
 * "ID=1 is reserved for the first game state and should not be used (and you
 * must not modify it). ID=99 is reserved for the last game state (end of the
 * game)". They exist whether or not a project declares them — "States 1 and
 * 99, that must not be changed, are now optional" — so they are always valid
 * transition targets, and nothing a project could get wrong about them is the
 * project's to fix.
 */
export const RESERVED_STATE_IDS = [1, 99] as const;

const RESERVED = new Set<number>(RESERVED_STATE_IDS);

/** Whether the rules that judge an authored state apply to this one. */
function authored(state: StateDefinition): boolean {
  return !RESERVED.has(state.id) && state.origin !== 'framework';
}

export const STATE_MACHINE_RULES: readonly StateMachineRule[] = [
  {
    code: 'state.initial.missing',
    severity: 'error',
    certainty: 'certain',
    summary:
      'Nothing names where the game starts: no setupNewGame return value, no state 1, and no state 2.',
    falsePositives: [],
  },
  {
    code: 'state.id.reserved',
    severity: 'warning',
    certainty: 'certain',
    summary: 'A state class may not take identifier 1 or 99, which the framework reserves.',
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
    summary: `A state type outside ${KNOWN_STATE_TYPES.join(', ')} is not one of the four the framework documents.`,
    falsePositives: [
      'A future framework release could add a state type this list does not know.',
      "Older project skeletons gave the reserved states 1 and 99 the type 'manager', which the current documentation does not list; this rule does not judge those two identifiers.",
    ],
  },
  {
    code: 'state.unreachable',
    severity: 'warning',
    certainty: 'certain',
    summary:
      'No chain of transitions or handler redirects reaches this state from the entry point.',
    falsePositives: [
      'A state entered only through a computed or non-literal transition target cannot be seen by this rule; that transition is reported as unsupported syntax instead, and the rule then stays silent for the whole machine.',
    ],
  },
  {
    code: 'state.dead-end',
    severity: 'warning',
    certainty: 'certain',
    summary:
      'A player-facing or game state with no transition and no handler redirect cannot hand control back.',
    falsePositives: [
      'The reserved states, the states older skeletons typed manager, and private parallel states are not judged, because control leaves them by a route that is not their own transition.',
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

/** Positional wrappers over the shared finding builders. */
function certain(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  return certainFinding(rule(code), { code, message, evidence, uri, suggestion });
}

function heuristic(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  return heuristicFinding(rule(code), { code, message, evidence, uri, suggestion });
}

function declaresMethod(
  sources: readonly PhpSource[],
  method: string,
  signal?: AbortSignal,
): boolean {
  const pattern = new RegExp(`function\\s+${method}\\s*\\(`, 'u');
  for (const source of sources) {
    cancellationCheckpoint(signal);
    if (pattern.test(source.text)) {
      return true;
    }
  }
  return false;
}

/** Every state an entry point leads to, by transition or by handler redirect. */
function reachable(
  states: readonly StateDefinition[],
  from: readonly number[],
  signal?: AbortSignal,
): Set<number> {
  const byId = new Map(states.map((state) => [state.id, state]));
  const seen = new Set<number>();
  const queue = [...from];

  while (queue.length > 0) {
    cancellationCheckpoint(signal);
    const current = queue.shift();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    const state = byId.get(current);
    for (const target of [
      ...Object.values(state?.transitions ?? {}),
      ...(state?.redirects ?? []),
    ]) {
      cancellationCheckpoint(signal);
      if (!seen.has(target)) {
        queue.push(target);
      }
    }
  }
  return seen;
}

/** Every state this one hands control to. */
function outgoing(state: StateDefinition): number[] {
  return [...Object.values(state.transitions), ...state.redirects];
}

/** Deterministic ordering: by code, then location, then message. */

/**
 * Validates the state machine across its declaration and its PHP sources.
 *
 * Structural rules are proven from the parsed declaration and are reported as
 * certain. Handler rules cross-check method names against readable PHP source
 * and are reported as heuristics, because a method can exist without being
 * visible to a textual reader.
 *
 * Two things keep those certain rules honest. The framework's own states are
 * not judged: identifiers 1 and 99 are reserved, exist whether or not the
 * project declares them, and must not be modified. And a rule that depends on
 * the whole machine stays silent when the reader could not read all of it —
 * unsupported syntax is carried through instead, so a project the reader
 * cannot fully interpret never produces a clean result and never produces a
 * fabricated one.
 */
export function validateStateMachine(
  model: ProjectModel,
  sources: readonly PhpSource[],
  signal?: AbortSignal,
): DiagnosticResult {
  const findings: DiagnosticFinding[] = [];
  const source = model.states.source;
  const { complete, initial } = model.states;

  // Anything the reader could not interpret stays visible in this result.
  for (const finding of model.diagnostics.findings) {
    cancellationCheckpoint(signal);
    if (finding.kind === 'unsupported-syntax' && finding.code.startsWith('project.states.')) {
      findings.push(finding);
    }
  }

  if (model.states.definitions.length === 0) {
    if (findings.length === 0) {
      findings.push(
        certain(
          'state.initial.missing',
          'No state definitions could be read, so the state machine cannot be validated.',
          'The project declares no readable states.',
          source,
          'Declare the state machine for this layout, or report the syntax that could not be read.',
        ),
      );
    }
    return summarizeFindings(findings, signal);
  }

  const states = model.states.definitions;
  // The reserved identifiers are always valid targets: the framework provides
  // them, and a migrated project is told to stop declaring them.
  const declared = new Set([...states.map((state) => state.id), ...RESERVED_STATE_IDS]);

  if (initial.origin === 'unresolved' && complete.declarations && complete.edges) {
    findings.push(
      certain(
        'state.initial.missing',
        'The state machine has no entry point.',
        initial.evidence,
        source,
        'Return the first state class from setupNewGame, or declare the state the framework enters first.',
      ),
    );
  }

  for (const id of model.states.duplicateIds) {
    cancellationCheckpoint(signal);
    findings.push(
      certain(
        'state.id.duplicate',
        `State ${String(id)} is declared more than once in the same source.`,
        'A later entry with the same key replaces the earlier one.',
        source,
        'Give each state a unique identifier.',
      ),
    );
  }

  const seenNames = new Map<string, number>();
  for (const state of states) {
    cancellationCheckpoint(signal);
    // A class that takes a reserved identifier is the one thing worth saying
    // about a reserved state, because the mistake is the project's.
    if (state.origin === 'class' && RESERVED.has(state.id)) {
      findings.push(
        certain(
          'state.id.reserved',
          `State class ${state.name ?? String(state.id)} takes reserved identifier ${String(state.id)}.`,
          'The framework reserves 1 for the first game state and 99 for the end of the game, and documents that a state class cannot use either.',
          source,
          'Give the class an identifier of its own and leave 1 and 99 to the framework.',
        ),
      );
    }

    if (!authored(state)) {
      continue;
    }

    if (state.name === null || state.name === '') {
      findings.push(
        certain(
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
          certain(
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
        certain(
          'state.type.unknown',
          `State ${String(state.id)} declares unknown type '${state.type}'.`,
          `The framework documents only ${KNOWN_STATE_TYPES.join(', ')}.`,
          source,
          `Use one of ${KNOWN_STATE_TYPES.join(', ')}.`,
        ),
      );
    }

    // A state whose own edges were all read is a dead end when it has none.
    // Three kinds of state are not: the reserved ones, which the framework
    // ends the game through; the ones older skeletons typed 'manager' for the
    // same reason; and private parallel states, which a player leaves when the
    // master multiactive state deactivates them rather than by transition.
    if (
      outgoing(state).length === 0 &&
      state.edgesResolved &&
      state.type !== 'manager' &&
      state.type !== 'private'
    ) {
      findings.push(
        certain(
          'state.dead-end',
          `State ${String(state.id)} has no transitions and cannot hand control back.`,
          'The state declares no transition and no handler that redirects to another state.',
          source,
          'Add a transition, or redirect from a handler, or let the game end through state 99.',
        ),
      );
    }
  }

  if (complete.declarations) {
    for (const state of states) {
      cancellationCheckpoint(signal);
      for (const [name, target] of Object.entries(state.transitions)) {
        cancellationCheckpoint(signal);
        if (!declared.has(target)) {
          findings.push(
            certain(
              'state.transition.target-exists',
              `Transition '${name}' of state ${String(state.id)} targets undefined state ${String(target)}.`,
              `State ${String(target)} is not declared.`,
              source,
              `Declare state ${String(target)} or change the transition target.`,
            ),
          );
        }
      }
    }
  }

  // Reachability is a claim about every edge in the machine, so it is made
  // only when every state and every edge was read, and only from an entry
  // point that is known rather than assumed.
  if (complete.declarations && complete.edges && initial.ids.length > 0) {
    const reachableIds = reachable(states, initial.ids, signal);
    for (const state of states) {
      cancellationCheckpoint(signal);
      if (authored(state) && !reachableIds.has(state.id)) {
        findings.push(
          certain(
            'state.unreachable',
            `State ${String(state.id)} cannot be reached from ${initial.ids.length === 1 ? `state ${String(initial.ids[0])}` : `states ${initial.ids.join(', ')}`}.`,
            `No chain of transitions or handler redirects leads to this state. ${initial.evidence}`,
            source,
            'Add a transition that reaches it, or remove the state.',
          ),
        );
      }
    }
  }

  // Cross-file handler checks. These are heuristics by construction.
  const searchable = sources.length > 0;
  for (const state of states) {
    cancellationCheckpoint(signal);
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
      cancellationCheckpoint(signal);
      if (check.method === null || check.method === '' || !searchable) {
        continue;
      }
      if (declaresMethod(sources, check.method, signal)) {
        continue;
      }
      findings.push(
        heuristic(
          check.code,
          `State ${String(state.id)} names ${check.label} method '${check.method}', which no readable PHP source declares.`,
          `No 'function ${check.method}(' was found in ${String(sources.length)} readable PHP source files.`,
          source,
          `Declare ${check.method}() in the game class, or confirm it is provided dynamically.`,
        ),
      );
    }
  }

  cancellationCheckpoint(signal);
  return summarizeFindings(findings, signal);
}
