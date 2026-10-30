import type { DiagnosticFinding, DiagnosticResult, DiagnosticSeverity } from '../diagnostics.js';
import { cancellationCheckpoint, periodicCancellationCheckpoint } from '../deadline.js';
import type { ProjectModel } from '../project/model.js';
import type { StateDefinition } from '../project/parse.js';
import {
  certainFinding,
  heuristicFinding,
  summarizeFindings,
  unsupportedSyntaxFinding,
} from './uncertainty.js';
import { maskComments, matchBracket, readPhpCode } from '../project/php.js';

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

const HANDLER_TRANSITION_RULE: StateMachineRule = {
  code: 'state.transition.name-undeclared',
  severity: 'warning',
  certainty: 'likely',
  summary: 'An automatic state handler calls a transition name its state does not declare.',
  falsePositives: [
    'This is a static relationship, not control-flow execution: the call may be unreachable or follow a runtime state change.',
  ],
};

const NEXT_STATE =
  /(?<![$>])\$this\s*->\s*gamestate\s*->\s*[nN][eE][xX][tT][sS][tT][aA][tT][eE]\s*\(/gu;

export const STATE_MACHINE_RULES: readonly StateMachineRule[] = [
  HANDLER_TRANSITION_RULE,
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
  const name = method.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(`function\\s+${name}\\s*\\(`, 'iu');
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
    if (
      finding.kind === 'unsupported-syntax' &&
      (finding.code.startsWith('project.states.') || finding.code.startsWith('project.source.'))
    ) {
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
  const searchable =
    sources.length > 0 &&
    !model.diagnostics.findings.some(
      (finding) =>
        finding.code === 'project.source.read-limit' &&
        finding.kind === 'unsupported-syntax' &&
        finding.syntax.language === 'php',
    );
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
  return summarizeFindings(
    [...findings, ...validateHandlerTransitions(model, sources, signal)],
    signal,
  );
}

interface AutomaticHandler {
  readonly source: PhpSource;
  readonly method: { name: string; body: string; bodyOffset: number; callable: boolean };
}

/** Read only direct methods of the expected game class in its documented main file. */
function readAutomaticHandlers(
  model: ProjectModel,
  sources: readonly PhpSource[],
  signal?: AbortSignal,
): AutomaticHandler[] {
  const handlers: AutomaticHandler[] = [];
  const mainPaths = new Set([
    'modules/php/Game.php',
    ...(model.gameKey === null ? [] : [`${model.gameKey}.game.php`]),
  ]);
  // Having both main files is ambiguous for this check; do not guess precedence.
  const mains = sources.filter((source) => mainPaths.has(source.path));
  if (mains.length !== 1) return handlers;
  const source = mains[0];
  if (source === undefined) return handlers;
  const syntax = readPhpCode(source.text, signal);
  if (syntax.unsupported.length > 0) return handlers;
  const expected = source.path === 'modules/php/Game.php' ? 'game' : model.gameKey?.toLowerCase();
  const classes = [...syntax.value.matchAll(/\bclass\s+([A-Za-z_]\w*)[^{};]*\{/giu)].filter(
    (entry) => entry[1]?.toLowerCase() === expected,
  );
  if (classes.length !== 1) return handlers;
  const declaration = classes[0];
  if (declaration === undefined) return handlers;
  let classDepth = 0;
  for (let index = 0; index < declaration.index; index += 1) {
    periodicCancellationCheckpoint(index, signal);
    if (syntax.value[index] === '{') classDepth += 1;
    else if (syntax.value[index] === '}') classDepth -= 1;
  }
  const namespace = /\bnamespace\s+[A-Za-z_\\][\w\\]*\s*\{/iu.exec(syntax.value);
  const namespaceBounds =
    namespace === null
      ? null
      : matchBracket(syntax.value, namespace.index + namespace[0].length - 1, signal);
  if (
    classDepth !== 0 &&
    !(
      classDepth === 1 &&
      namespaceBounds !== null &&
      namespaceBounds.start < declaration.index &&
      namespaceBounds.end > declaration.index
    )
  )
    return handlers;
  const bounds = matchBracket(syntax.value, declaration.index + declaration[0].length - 1, signal);
  if (bounds === null) return handlers;
  const pattern =
    /\b(?:(?:public|protected|private|static|final|abstract|readonly)\s+)*function\s+&?\s*([A-Za-z_]\w*)\s*\(/giu;
  const body = syntax.value.slice(bounds.start + 1, bounds.end);
  let cursor = 0;
  let depth = 0;
  for (const match of body.matchAll(pattern)) {
    cancellationCheckpoint(signal);
    // Walk each intervening character once; nested classes/functions are not game methods.
    for (; cursor < match.index; cursor += 1) {
      periodicCancellationCheckpoint(cursor, signal);
      if (body[cursor] === '{') depth += 1;
      else if (body[cursor] === '}') depth -= 1;
    }
    if (depth !== 0) continue;
    const parameters = matchBracket(body, match.index + match[0].length - 1, signal);
    if (parameters === null) continue;
    const open = body.indexOf('{', parameters.end);
    const semicolon = body.indexOf(';', parameters.end);
    if (open === -1 || (semicolon !== -1 && semicolon < open)) continue;
    const methodBody = matchBracket(body, open, signal);
    if (methodBody === null) continue;
    const bodyOffset = bounds.start + 1 + methodBody.start + 1;
    handlers.push({
      source,
      method: {
        name: match[1] ?? '',
        body: source.text.slice(bodyOffset, bounds.start + 1 + methodBody.end),
        bodyOffset,
        callable: !/\b(?:static|private|protected|abstract)\b/iu.test(match[0]),
      },
    });
  }
  return handlers;
}

/**
 * Official states.inc.php documentation: nextPlayer is "the name of the
 * transition, and NOT the name of the target game state". The page also shows
 * nextState() with one empty-name transition. State-class imperative nextState
 * has conflicting official wording (BGA-419); it deliberately stays outside
 * this array-declared, automatic-handler check.
 * https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php
 */
function validateHandlerTransitions(
  model: ProjectModel,
  sources: readonly PhpSource[],
  signal?: AbortSignal,
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const automaticStates = model.states.definitions.filter(
    (state) =>
      state.origin === 'array' &&
      state.type === 'game' &&
      state.action !== null &&
      state.id !== 1 &&
      state.id !== 99 &&
      state.edgesResolved,
  );
  if (automaticStates.length === 0) return findings;
  const mainPaths = [
    'modules/php/Game.php',
    ...(model.gameKey === null ? [] : [`${model.gameKey}.game.php`]),
  ];
  const hiddenMain = [...model.unreadablePaths, ...model.skippedLinks].some((path) =>
    mainPaths.some((main) => main === path || main.startsWith(`${path.replace(/\/$/u, '')}/`)),
  );
  if (model.truncated || hiddenMain) {
    return [
      unsupportedSyntaxFinding({
        code: 'state.transition.call-unresolved',
        language: 'php',
        construct:
          'automatic handler ownership is uncertain because the project inventory is incomplete',
        uri: model.states.source,
        suggestion:
          'Inspect a complete readable project inventory before relying on automatic-handler transition checks.',
      }),
    ];
  }
  // A skipped source could contain another definition; do not infer unique binding.
  if (
    model.diagnostics.findings.some(
      (finding) =>
        finding.kind === 'unsupported-syntax' && finding.code.startsWith('project.source.'),
    )
  )
    return findings;

  // File ownership and direct class scope are both required: a same-name
  // utility method is not the callback on the game object.
  const methods = readAutomaticHandlers(model, sources, signal);

  for (const state of automaticStates) {
    cancellationCheckpoint(signal);
    const candidates = methods.filter(
      ({ method }) => method.name.toLowerCase() === state.action?.toLowerCase(),
    );
    if (candidates.length === 0) {
      findings.push(
        unsupportedSyntaxFinding({
          code: 'state.transition.call-unresolved',
          language: 'php',
          construct: `state ${String(state.id)} automatic handler binding`,
          uri: model.states.source,
          suggestion:
            'Inspect the main game class or inherited handler; this check only reads directly declared automatic callbacks.',
        }),
      );
      continue;
    }
    const candidate = candidates[0];
    if (candidate === undefined) continue;
    const { source, method } = candidate;
    const syntax = readPhpCode(method.body, signal);
    const calls = [...syntax.value.matchAll(NEXT_STATE)];
    if (!method.callable) {
      findings.push(
        unsupportedSyntaxFinding({
          code: 'state.transition.call-unresolved',
          language: 'php',
          construct: `state ${String(state.id)} automatic handler is static or non-public`,
          uri: source.path,
        }),
      );
      continue;
    }
    const unresolved = (reason: string): void => {
      findings.push(
        unsupportedSyntaxFinding({
          code: 'state.transition.call-unresolved',
          language: 'php',
          construct: `state ${String(state.id)} handler ${method.name}: ${reason}`,
          uri: source.path,
          suggestion:
            'Inspect the handler and its state transitions directly; this reader cannot establish the call-to-state relationship.',
        }),
      );
    };
    if (
      candidates.length !== 1 ||
      model.states.definitions.filter(
        (entry) => entry.action?.toLowerCase() === method.name.toLowerCase(),
      ).length !== 1
    ) {
      unresolved('shared or ambiguous handler binding');
      continue;
    }
    if (calls.length === 0) continue;
    // A deferred closure/function is not the automatic handler's own call.
    if (/\b(?:function|fn|class)\b/iu.test(syntax.value) || syntax.unsupported.length > 0) {
      unresolved('nested or unreadable executable context');
      continue;
    }
    const values = maskComments(method.body, signal);
    for (const call of calls) {
      cancellationCheckpoint(signal);
      // PHP allows a dynamic property named by $this, with intervening comments
      // or spaces. That is a different receiver, not the game's own $this.
      if (/(?:->|::|\$)$/u.test(syntax.value.slice(0, call.index).trimEnd())) continue;
      const span = matchBracket(syntax.value, call.index + call[0].length - 1, signal);
      const argument = span === null ? null : values.slice(span.start + 1, span.end).trim();
      // Escapes, interpolation, constants, named arguments and expressions are not evaluated.
      const literal = argument === null ? null : /^(['"])([^'"\\$]*)\1$/u.exec(argument);
      const name = argument === '' ? '' : literal?.[2];
      if (name === undefined) {
        unresolved('computed or unsupported nextState argument');
        continue;
      }
      if (
        Object.hasOwn(state.transitions, name) ||
        (name === '' && Object.keys(state.transitions).length === 1)
      )
        continue;
      const declared = Object.keys(state.transitions).sort();
      const finding = heuristicFinding(HANDLER_TRANSITION_RULE, {
        code: HANDLER_TRANSITION_RULE.code,
        message: `State ${String(state.id)} (${state.name ?? 'unnamed'}) handler ${method.name} calls nextState(${JSON.stringify(name)}), but that state declares no matching transition.`,
        evidence: `State declaration: ${model.states.source ?? 'unknown source'}. Declared transition names: ${JSON.stringify(declared)}. The argument names a transition, not its target state.`,
        uri: source.path,
        suggestion: `Use a declared transition name ${JSON.stringify(declared)}, or add the intended named transition to state ${String(state.id)}. Check runtime state changes before editing.`,
      });
      const offset = method.bodyOffset + call.index;
      const prefix = source.text.slice(0, offset);
      const line = prefix.split('\n').length;
      const column = offset - prefix.lastIndexOf('\n');
      findings.push({
        ...finding,
        locations: [
          { uri: source.path, range: { start: { line, column } } },
          ...(model.states.source === null ? [] : [{ uri: model.states.source }]),
        ],
      });
    }
  }
  return findings;
}
