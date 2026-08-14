import type { DiagnosticFinding, DiagnosticResult, DiagnosticSeverity } from '../diagnostics.js';
import { cancellationCheckpoint } from '../deadline.js';
import { parseModernActions, type ActionParameter } from '../project/modern.js';
import {
  parseClientActionCalls,
  parsePhpMethodNames,
  parseServerActionEntries,
  type ClientActionCall,
  type ServerActionEntry,
} from '../project/actions.js';
import type { ProjectModel } from '../project/model.js';
import {
  certainFinding,
  heuristicFinding,
  summarizeFindings,
  unsupportedSyntaxFinding,
} from './uncertainty.js';

export interface ActionContractRule {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly certainty: 'certain' | 'likely' | 'possible';
  readonly summary: string;
  readonly falsePositives: readonly string[];
}

/** Modern BGA requires player action methods to start with `act`. */
const ACTION_PREFIX = /^act[A-Z0-9_]/u;

export const ACTION_CONTRACT_RULES: readonly ActionContractRule[] = [
  {
    code: 'action.trace.unavailable',
    severity: 'information',
    certainty: 'certain',
    summary: 'The contract could not be traced because one side of it could not be read.',
    falsePositives: [],
  },
  {
    code: 'action.entry-point.duplicate',
    severity: 'error',
    certainty: 'certain',
    summary: 'Two entry points in the action class share a name.',
    falsePositives: [],
  },
  {
    code: 'action.name.convention',
    severity: 'information',
    certainty: 'certain',
    summary: 'A player action the client calls should be named act… so the framework routes it.',
    falsePositives: [],
  },
  {
    code: 'action.call.not-declared',
    severity: 'warning',
    certainty: 'likely',
    summary: 'The client calls an action that no state lists as a possible action.',
    falsePositives: [
      'A state declared with computed keys or targets cannot be read, and its possible actions are invisible to this rule; that state is reported as unsupported syntax instead.',
      'A project whose states enumerate no possible actions gives this rule nothing to compare against, so it stays silent rather than reporting every call.',
    ],
  },
  {
    code: 'action.declared.not-called',
    severity: 'information',
    certainty: 'possible',
    summary: 'A state declares a possible action that no readable client source calls.',
    falsePositives: [
      'The client may build the call name at runtime, route it through a shared helper, or live in a file outside the read budget.',
      'The action may be intended for a client that is not part of this project.',
    ],
  },
  {
    code: 'action.entry-point.missing',
    severity: 'warning',
    certainty: 'likely',
    summary:
      'An action the client calls is declared by no action class, game class, or state class.',
    falsePositives: [
      'A project may dispatch every action through one generic entry point, or inherit entry points from a framework class outside the project.',
    ],
  },
  {
    code: 'action.argument.invalid',
    severity: 'error',
    certainty: 'certain',
    summary:
      'A literal argument the client sends fails the check its parameter attribute declares.',
    falsePositives: [],
  },
  {
    code: 'action.game-method.missing',
    severity: 'warning',
    certainty: 'likely',
    summary: 'An action has an entry point but no game method of the same name.',
    falsePositives: [
      'The game method may be defined dynamically, inherited from a framework class, or named differently by deliberate indirection.',
    ],
  },
  {
    code: 'action.argument.mismatch',
    severity: 'warning',
    certainty: 'likely',
    summary: 'The client and the entry point disagree about an action argument.',
    falsePositives: [
      'Arguments assembled at runtime cannot be compared; such a call is reported as unsupported syntax instead.',
      'An entry point may read an argument through a helper this reader does not recognize.',
    ],
  },
];

const RULES_BY_CODE = new Map(ACTION_CONTRACT_RULES.map((rule) => [rule.code, rule]));

function definition(code: string): ActionContractRule {
  const found = RULES_BY_CODE.get(code);
  if (found === undefined) {
    throw new Error(`Unknown action-contract rule: ${code}`);
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
  return certainFinding(definition(code), { code, message, evidence, uri, suggestion });
}

function heuristic(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  return heuristicFinding(definition(code), { code, message, evidence, uri, suggestion });
}

function unsupported(construct: string, uri: string | null): DiagnosticFinding {
  return unsupportedSyntaxFinding({
    code: 'action.unsupported-syntax',
    construct,
    language: 'javascript',
    uri,
    message: `Part of the action contract could not be read: ${construct}.`,
    suggestion:
      'Use a literal action name and argument list, or confirm the dynamic call is intended.',
  });
}

export interface ActionContractSource {
  readonly path: string;
  readonly text: string;
}

/**
 * Why a literal client value fails its parameter attribute, or null.
 *
 * The attributes state their own checks — "will trigger an exception if param
 * is < 1", "will trigger an exception if the parameter doesn't match a value in
 * the enum" — so a literal that fails one is a call that cannot work, not a
 * matter of taste.
 */
function violation(parameter: ActionParameter, literal: string): string | null {
  const quoted = /^'([\s\S]*)'$|^"([\s\S]*)"$/u.exec(literal);
  const text = quoted === null ? literal : (quoted[1] ?? quoted[2] ?? '');
  const { min, max, enum: choices, alphanum } = parameter.constraints;

  if (choices !== undefined && quoted !== null && !choices.includes(text)) {
    return `the attribute's enum does not list (accepted: ${choices.join(', ')})`;
  }
  if (alphanum === true && quoted !== null && !/^[A-Za-z0-9]*$/u.test(text)) {
    return 'the attribute requires an alphanumeric value';
  }
  if (quoted === null && /^-?\d+(?:\.\d+)?$/u.test(text)) {
    const value = Number(text);
    if (min !== undefined && value < min) {
      return `is below the declared minimum of ${String(min)}`;
    }
    if (max !== undefined && value > max) {
      return `is above the declared maximum of ${String(max)}`;
    }
  }
  return null;
}

export interface ActionContractTrace {
  readonly clientCalls: readonly (ClientActionCall & { readonly source: string })[];
  readonly entryPoints: readonly (ServerActionEntry & { readonly source: string })[];
  readonly gameMethods: readonly string[];
  readonly declaredActions: readonly string[];
  readonly diagnostics: DiagnosticResult;
}

/**
 * Traces every player action from the client call to the entry point to the
 * game method, and reports where the three disagree.
 *
 * Only two claims are provable from the text alone: a duplicated entry point
 * and a name that breaks the act… convention. Everything else depends on code
 * this reader cannot see, so it is reported as a heuristic that carries its
 * limitation.
 */
export function validateActionContracts(
  model: ProjectModel,
  clientSources: readonly ActionContractSource[],
  phpSources: readonly ActionContractSource[],
  signal?: AbortSignal,
): ActionContractTrace {
  const findings: DiagnosticFinding[] = [];

  const clientCalls: (ClientActionCall & { source: string })[] = [];
  for (const source of clientSources) {
    cancellationCheckpoint(signal);
    const outcome = parseClientActionCalls(source.text, signal);
    for (const call of outcome.value) {
      cancellationCheckpoint(signal);
      clientCalls.push({ ...call, source: source.path });
    }
    for (const construct of outcome.unsupported) {
      cancellationCheckpoint(signal);
      findings.push(unsupported(construct, source.path));
    }
  }

  // An action reaches the server by one of three documented routes, and a real
  // project can use more than one at a time.
  //
  //  - `<game>.action.php`, the legacy dispatcher: "if you also declare the
  //    function in the action.php, it will be used instead of the autowiring".
  //  - An autowired `act…` method on the game class, which the framework checks
  //    "for actions that can be triggered at any state".
  //  - A `#[PossibleAction]` method on a state class, which is the action of
  //    that state.
  const actionClassSources = phpSources.filter((source) => source.path.endsWith('.action.php'));
  const entryPoints: (ServerActionEntry & {
    source: string;
    parameters?: readonly ActionParameter[];
  })[] = [];
  for (const source of actionClassSources) {
    cancellationCheckpoint(signal);
    const outcome = parseServerActionEntries(source.text, signal);
    for (const entry of outcome.value) {
      cancellationCheckpoint(signal);
      entryPoints.push({ ...entry, source: source.path });
    }
    for (const construct of outcome.unsupported) {
      cancellationCheckpoint(signal);
      findings.push(unsupported(construct, source.path));
    }
  }

  const declaredByActionClass = new Set(entryPoints.map((entry) => entry.action));
  const gameClassSources = phpSources.filter((source) => /(?:^|\/)Game\.php$/u.test(source.path));
  const stateClassSources = phpSources.filter((source) =>
    /(?:^|\/)modules\/php\/States\//u.test(source.path),
  );
  const autowiredSources = [...gameClassSources, ...stateClassSources];

  for (const source of autowiredSources) {
    cancellationCheckpoint(signal);
    const outcome = parseModernActions(source.text, {
      requireAttribute: stateClassSources.includes(source),
      declaredIn: stateClassSources.includes(source) ? 'state-class' : 'game-class',
      ...(signal === undefined ? {} : { signal }),
    });
    for (const action of outcome.value) {
      cancellationCheckpoint(signal);
      // The legacy dispatcher wins where both exist, so it is not a duplicate.
      if (declaredByActionClass.has(action.action)) {
        continue;
      }
      entryPoints.push({
        action: action.action,
        argumentNames: [...action.argumentNames],
        parameters: action.parameters,
        source: source.path,
      });
    }
    for (const construct of outcome.unsupported) {
      cancellationCheckpoint(signal);
      findings.push(unsupported(construct, source.path));
    }
  }

  // An action the game class declares can run from any state, so a client call
  // to it is not "not declared" merely because the current state omits it.
  // This is the game class only: the legacy `.action.php` dispatcher still
  // checks the state's possible actions.
  const gameClassPaths = new Set(gameClassSources.map((source) => source.path));
  const frameworkWideActions = new Set(
    entryPoints.filter((entry) => gameClassPaths.has(entry.source)).map((entry) => entry.action),
  );

  const gameMethods = new Set(
    phpSources
      .filter((source) => !source.path.endsWith('.action.php'))
      .flatMap((source) => parsePhpMethodNames(source.text, signal)),
  );

  const declaredActions = new Set(
    model.states.definitions.flatMap((state) => state.possibleActions),
  );

  const statesReadable = model.states.parsed;
  const clientReadable = clientSources.length > 0;
  const entryPointsReadable = actionClassSources.length > 0 || autowiredSources.length > 0;

  // A side that could not be read makes the whole trace inconclusive. Say so
  // rather than returning a clean result nobody should trust.
  const missingSides = [
    clientReadable ? null : 'no readable client source',
    entryPointsReadable ? null : 'no readable action class',
    statesReadable ? null : 'no readable state machine',
  ].filter((side): side is string => side !== null);
  if (missingSides.length > 0) {
    findings.push(
      certain(
        'action.trace.unavailable',
        `The action contract could not be traced: ${missingSides.join(', ')}.`,
        'One or more sides of the client-to-server contract could not be read.',
        null,
        'Confirm the project layout is supported, or report the sources that could not be read.',
      ),
    );
  }

  const seenEntryPoints = new Set<string>();
  for (const entry of entryPoints) {
    cancellationCheckpoint(signal);
    if (seenEntryPoints.has(entry.action)) {
      findings.push(
        certain(
          'action.entry-point.duplicate',
          `Entry point '${entry.action}' is declared more than once.`,
          'Two methods of the action class share a name.',
          entry.source,
          'Remove or rename the duplicate entry point.',
        ),
      );
    }
    seenEntryPoints.add(entry.action);
  }

  for (const call of clientCalls) {
    cancellationCheckpoint(signal);
    if (!ACTION_PREFIX.test(call.action)) {
      findings.push(
        certain(
          'action.name.convention',
          `The client calls '${call.action}', which does not follow the act… naming convention.`,
          'A player action name should start with act followed by an uppercase letter.',
          call.source,
          `Rename the action to act${call.action.charAt(0).toUpperCase()}${call.action.slice(1)} on both sides.`,
        ),
      );
    }

    // The rule only has an authority to compare against when some state
    // actually enumerates its possible actions. A modern project declares its
    // actions as autowired methods instead, so an empty set means "unknown",
    // not "nothing is allowed". An action the game class declares is available
    // in any state, so no state has to list it.
    if (
      statesReadable &&
      declaredActions.size > 0 &&
      !declaredActions.has(call.action) &&
      !frameworkWideActions.has(call.action)
    ) {
      findings.push(
        heuristic(
          'action.call.not-declared',
          `The client calls '${call.action}', which no state lists as a possible action.`,
          `No state in the readable state machine declares '${call.action}'.`,
          call.source,
          `Add '${call.action}' to the possible actions of the state that allows it, or remove the call.`,
        ),
      );
    }

    if (entryPointsReadable && !seenEntryPoints.has(call.action)) {
      findings.push(
        heuristic(
          'action.entry-point.missing',
          `The client calls '${call.action}', but the action class declares no entry point of that name.`,
          `No method named '${call.action}' was found in ${String(actionClassSources.length + autowiredSources.length)} readable action source file(s).`,
          call.source,
          `Declare ${call.action}() in the action class, or confirm a generic dispatcher handles it.`,
        ),
      );
    }

    const entry = entryPoints.find((candidate) => candidate.action === call.action);
    if (entry !== undefined) {
      const sent = new Set(call.argumentNames);
      const read = new Set(entry.argumentNames);
      for (const argument of [...sent].filter((name) => !read.has(name)).sort()) {
        cancellationCheckpoint(signal);
        findings.push(
          heuristic(
            'action.argument.mismatch',
            `The client sends argument '${argument}' to '${call.action}', which its entry point does not read.`,
            `'${argument}' appears in the client call but in no request read of the entry point.`,
            entry.source,
            `Read '${argument}' in ${call.action}(), or stop sending it.`,
          ),
        );
      }
      for (const argument of [...read].filter((name) => !sent.has(name)).sort()) {
        cancellationCheckpoint(signal);
        findings.push(
          heuristic(
            'action.argument.mismatch',
            `The entry point for '${call.action}' reads argument '${argument}', which the client does not send.`,
            `'${argument}' is read by the entry point but absent from the client call.`,
            call.source,
            `Send '${argument}' from the client, or stop reading it.`,
          ),
        );
      }

      // A parameter attribute states what the framework checks before calling.
      // Where the client writes the value out, the two can be compared here
      // rather than at a player's expense.
      for (const parameter of entry.parameters ?? []) {
        cancellationCheckpoint(signal);
        const value = call.argumentValues[parameter.name] ?? null;
        const failure = value === null ? null : violation(parameter, value);
        if (failure === null || value === null) {
          continue;
        }
        findings.push(
          certain(
            'action.argument.invalid',
            `The client sends ${value} for '${parameter.name}' of '${call.action}', which ${failure}.`,
            `#[${parameter.attribute ?? 'Param'}] on $${parameter.variable} declares the check the framework runs before calling the action.`,
            call.source,
            'Send a value the attribute accepts, or widen the attribute to accept this one.',
          ),
        );
      }
    }
  }

  const autowired = new Set(autowiredSources.map((source) => source.path));
  for (const entry of entryPoints) {
    cancellationCheckpoint(signal);
    if (autowired.has(entry.source)) {
      // An autowired action is its own game method; there is no second hop.
      continue;
    }
    if (!gameMethods.has(entry.action) && gameMethods.size > 0) {
      findings.push(
        heuristic(
          'action.game-method.missing',
          `Entry point '${entry.action}' has no game method of the same name.`,
          `No 'function ${entry.action}(' was found outside the action class.`,
          entry.source,
          `Declare ${entry.action}() in the game class, or confirm the entry point calls a differently named method.`,
        ),
      );
    }
  }

  if (statesReadable && clientReadable && declaredActions.size > 0) {
    const called = new Set(clientCalls.map((call) => call.action));
    for (const action of [...declaredActions].sort()) {
      cancellationCheckpoint(signal);
      if (!called.has(action)) {
        findings.push(
          heuristic(
            'action.declared.not-called',
            `Possible action '${action}' is declared by a state but no readable client source calls it.`,
            `'${action}' appears in the state machine but in no client call.`,
            model.states.source,
            `Call '${action}' from the client, or remove it from the state's possible actions.`,
          ),
        );
      }
    }
  }

  cancellationCheckpoint(signal);
  return {
    clientCalls,
    entryPoints,
    gameMethods: [...gameMethods].sort(),
    declaredActions: [...declaredActions].sort(),
    diagnostics: summarizeFindings(findings, signal),
  };
}
