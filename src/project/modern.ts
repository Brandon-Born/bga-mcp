import {
  STATE_TYPES,
  type ParseOutcome,
  type StateDefinition,
  type UnreadableConstruct,
  type UnreadableScope,
} from './parse.js';
import {
  collectIntConstants,
  matchBracket,
  maskLiterals,
  readMethods,
  readStringLiteral,
  resolveIntExpression,
  returnExpressions,
  splitTopLevel,
  type PhpSource,
} from './php.js';
import { cancellationCheckpoint } from '../deadline.js';

/**
 * Readers for the modern BGA framework.
 *
 * The framework moved three things the older layout kept in one file each:
 * states became a class per state, the action dispatcher file was replaced by
 * autowired `act…` methods on the game class, and notifications moved from
 * `notifyAllPlayers` to `$this->bga->notify->all`. The client moved twice, from
 * `ajaxcall` to `bgaPerformAction` to `this.bga.actions.performAction`.
 *
 * Projects exist at every point in that range, so each reader accepts the older
 * form alongside the newer one rather than assuming the newest.
 *
 * Derived from the official documentation:
 * https://en.doc.boardgamearena.com/State_classes:_State_directory
 * https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide
 * https://en.doc.boardgamearena.com/Main_game_logic:_Game.php
 */

/** Constructor arguments the state-class documentation defines. */
const CONSTRUCTOR_ARGUMENTS = new Set([
  'id',
  'type',
  'name',
  'description',
  'descriptionMyTurn',
  'transitions',
  'updateGameProgression',
  'initialPrivate',
]);

export interface ModernStatesOutcome {
  readonly value: readonly StateDefinition[];
  readonly unsupported: readonly UnreadableConstruct[];
  /** State class name to identifier, for resolving `PlayerTurn::class`. */
  readonly classIds: ReadonlyMap<string, number>;
}

export type ModernStateSource = PhpSource;

const STATE_CLASS =
  /\b(?:final\s+|abstract\s+|readonly\s+)*class\s+([A-Za-z_]\w*)\s+extends\s+([\\A-Za-z_]\w*(?:\\\w+)*)/u;
const CONSTRUCT_CALL = /\bparent::__construct\s*\(/u;
/** `name: value`, but never the `::` of a class constant. */
const NAMED_ARGUMENT = /^\s*([A-Za-z_]\w*)\s*:(?!:)([\s\S]*)$/u;
const CLASS_CONSTANT = /^\\?(?:[A-Za-z_]\w*\\)*([A-Za-z_]\w*)::class$/u;

interface StateDraft extends StateDefinition {
  readonly path: string;
  readonly className: string;
  /** Raw expressions the redirect-capable handlers return. */
  readonly returned: readonly string[];
  /** Raw `initialPrivate` expression, which is an edge into a private state. */
  readonly initialPrivate: string | null;
}

/** Reads the arguments of the `parent::__construct` call, in order. */
function constructorArguments(
  text: string,
  masked: string,
  signal?: AbortSignal,
): { name: string | null; value: string }[] | null {
  cancellationCheckpoint(signal);
  const call = CONSTRUCT_CALL.exec(masked);
  if (call === null) {
    return null;
  }
  const span = matchBracket(masked, call.index + call[0].length - 1, signal);
  if (span === null) {
    return null;
  }
  return splitTopLevel(masked, span.start + 1, span.end, ',', signal).map((part) => {
    cancellationCheckpoint(signal);
    const raw = text.slice(part.start, part.end);
    const named = NAMED_ARGUMENT.exec(masked.slice(part.start, part.end));
    return named === null
      ? { name: null, value: raw.trim() }
      : { name: named[1] ?? '', value: raw.slice(raw.length - (named[2] ?? '').length).trim() };
  });
}

/** Reads a `'name' => target` transition map, resolving constant targets. */
function readTransitions(
  expression: string,
  constants: ReadonlyMap<string, number>,
  selfClass: string,
  signal?: AbortSignal,
): { transitions: Record<string, number>; unreadable: string[] } {
  const transitions: Record<string, number> = {};
  const unreadable: string[] = [];
  const masked = maskLiterals(expression, signal);
  const open = masked.search(/[[(]/u);
  const span = open === -1 ? null : matchBracket(masked, open, signal);
  if (span === null) {
    return { transitions, unreadable: [`transition map ${expression.trim()}`] };
  }

  for (const part of splitTopLevel(masked, span.start + 1, span.end, ',', signal)) {
    cancellationCheckpoint(signal);
    const entry = expression.slice(part.start, part.end);
    const arrow = maskLiterals(entry, signal).indexOf('=>');
    const key = arrow === -1 ? null : readStringLiteral(entry.slice(0, arrow), signal);
    const target =
      arrow === -1
        ? null
        : resolveIntExpression(entry.slice(arrow + 2), constants, selfClass, signal);
    if (key === null || target === null) {
      unreadable.push(`transition entry ${entry.trim()}`);
      continue;
    }
    transitions[key] = target;
  }

  return { transitions, unreadable };
}

/** The handlers the documentation says may redirect by returning a state. */
function redirects(name: string): boolean {
  return name === 'onEnteringState' || name === 'zombie' || /^act[A-Z]/u.test(name);
}

function readClass(
  source: ModernStateSource,
  constants: ReadonlyMap<string, number>,
  unsupported: UnreadableConstruct[],
  signal?: AbortSignal,
): StateDraft | null {
  const masked = maskLiterals(source.text, signal);
  const declaration = STATE_CLASS.exec(masked);
  if (declaration === null || (declaration[2] ?? '').split('\\').at(-1) !== 'GameState') {
    return null;
  }
  const className = declaration[1] ?? '';
  const report = (construct: string, scope: UnreadableScope): void => {
    unsupported.push({ path: source.path, construct, scope });
  };

  const parsed = constructorArguments(source.text, masked, signal);
  if (parsed === null) {
    report(`state class ${className} without a literal parent::__construct call`, 'declaration');
    return null;
  }

  // The first argument is the game instance the example passes positionally;
  // every other one is named. A class that names none of them is one
  // unreadable declaration, not one report per argument.
  if (parsed.slice(1).some((argument) => argument.name === null)) {
    report(`state class ${className} passes constructor arguments positionally`, 'declaration');
    return null;
  }

  const named = new Map<string, string>();
  for (const argument of parsed) {
    cancellationCheckpoint(signal);
    if (argument.name === null) {
      continue;
    }
    if (CONSTRUCTOR_ARGUMENTS.has(argument.name)) {
      named.set(argument.name, argument.value);
    } else {
      report(`state class ${className} declares unknown argument ${argument.name}:`, 'detail');
    }
  }

  const rawId = named.get('id');
  const id = rawId === undefined ? null : resolveIntExpression(rawId, constants, className, signal);
  if (id === null) {
    report(
      `state class ${className} with a non-literal id: ${rawId ?? '(no id argument)'}`,
      'declaration',
    );
    return null;
  }

  const rawType = named.get('type')?.trim();
  const typeName = /^\\?(?:[A-Za-z_]\w*\\)*StateType::([A-Za-z_]\w*)$/u.exec(rawType ?? '')?.[1];
  if (rawType !== undefined && typeName === undefined) {
    report(`state class ${className} with a computed type: ${rawType}`, 'detail');
  }

  const literal = (argument: string): string | null => {
    const raw = named.get(argument);
    if (raw === undefined) {
      return null;
    }
    const text = readStringLiteral(raw, signal);
    if (text === null) {
      report(`state class ${className} with a computed ${argument}: ${raw}`, 'detail');
    }
    return text;
  };

  const transitions = readTransitions(
    named.get('transitions') ?? '[]',
    constants,
    className,
    signal,
  );
  for (const construct of transitions.unreadable) {
    cancellationCheckpoint(signal);
    report(`state class ${className} with an unreadable ${construct}`, 'edge');
  }

  const methods = readMethods(source.text, signal);
  const returned = methods
    .filter((method) => redirects(method.name))
    .flatMap((method) => returnExpressions(method.body, signal));
  const declares = (name: string): string | null =>
    methods.some((method) => method.name === name) ? name : null;

  return {
    path: source.path,
    className,
    id,
    name: named.has('name') ? (literal('name') ?? className) : className,
    type: typeName === undefined ? null : (STATE_TYPES[typeName] ?? typeName.toLowerCase()),
    action: declares('onEnteringState'),
    args: declares('getArgs'),
    zombie: declares('zombie'),
    // The migration guide says possible actions "will be found with the tag
    // #[PossibleAction] over each possible action", so an act… method without
    // the attribute is a method, not an advertised action.
    possibleActions: methods
      .filter(
        (method) => /^act[A-Z]/u.test(method.name) && method.attributes.includes('PossibleAction'),
      )
      .map((method) => method.name),
    transitions: transitions.transitions,
    origin: 'class',
    description: literal('description'),
    descriptionMyTurn: literal('descriptionMyTurn'),
    redirects: [],
    edgesResolved: transitions.unreadable.length === 0,
    returned,
    initialPrivate: named.get('initialPrivate') ?? null,
  };
}

/**
 * Resolves what a handler's `return` reaches.
 *
 * The documentation gives three forms: "a class name will redirect to the
 * state declared in that class", "a state id will redirect to the state of
 * that id … return StateConstants::ST_END_GAME; or return 99;", and "a
 * transition name will redirect to the transition of that name".
 */
function resolveRedirect(
  expression: string,
  draft: StateDraft,
  constants: ReadonlyMap<string, number>,
  classIds: ReadonlyMap<string, number>,
  signal?: AbortSignal,
): number | null {
  cancellationCheckpoint(signal);
  const className = CLASS_CONSTANT.exec(expression.trim())?.[1];
  if (className !== undefined) {
    return classIds.get(className) ?? null;
  }
  const transition = readStringLiteral(expression, signal);
  if (transition !== null) {
    return draft.transitions[transition] ?? null;
  }
  return resolveIntExpression(expression, constants, draft.className, signal);
}

/**
 * Reads state classes into the same shape the array declaration produces.
 *
 * A state's name defaults to its class name, as the framework does. Nothing is
 * guessed: an identifier, type, transition target, or redirect that is not a
 * literal or a constant this reader collected is reported with the file it is
 * in, and what it leaves incomplete is recorded, so no rule downstream can
 * turn a partial machine into a certain finding.
 */
export function parseModernStates(
  sources: readonly ModernStateSource[],
  supporting: readonly PhpSource[] = [],
  signal?: AbortSignal,
): ModernStatesOutcome {
  cancellationCheckpoint(signal);
  const constants = collectIntConstants([...sources, ...supporting], signal);
  const unsupported: UnreadableConstruct[] = [];
  const drafts: StateDraft[] = [];

  for (const source of sources) {
    cancellationCheckpoint(signal);
    const draft = readClass(source, constants, unsupported, signal);
    if (draft !== null) {
      drafts.push(draft);
    }
  }

  const classIds = new Map(drafts.map((draft) => [draft.className, draft.id]));
  const states: StateDefinition[] = [];

  for (const draft of drafts) {
    cancellationCheckpoint(signal);
    const targets = new Set<number>();
    let edgesResolved = draft.edgesResolved;

    const edges = [
      ...(draft.initialPrivate === null || /^null$/iu.test(draft.initialPrivate.trim())
        ? []
        : [{ expression: draft.initialPrivate, label: 'initialPrivate' }]),
      ...draft.returned.map((expression) => ({ expression, label: 'return' })),
    ];

    for (const edge of edges) {
      cancellationCheckpoint(signal);
      const target = resolveRedirect(edge.expression, draft, constants, classIds, signal);
      if (target === null) {
        unsupported.push({
          path: draft.path,
          construct: `state class ${draft.className} names a state this reader cannot resolve: ${edge.label} ${edge.expression}`,
          scope: 'edge',
        });
        edgesResolved = false;
        continue;
      }
      targets.add(target);
    }

    states.push({
      id: draft.id,
      name: draft.name,
      type: draft.type,
      action: draft.action,
      args: draft.args,
      possibleActions: draft.possibleActions,
      transitions: draft.transitions,
      origin: 'class',
      description: draft.description,
      descriptionMyTurn: draft.descriptionMyTurn,
      zombie: draft.zombie,
      redirects: [...targets].sort((left, right) => left - right),
      edgesResolved,
    });
  }

  const ordered = states.sort((left, right) => left.id - right.id);
  cancellationCheckpoint(signal);
  return {
    value: ordered,
    unsupported,
    classIds,
  };
}

export interface InitialStateOutcome {
  /** Every state `setupNewGame` was seen to return. */
  readonly ids: readonly number[];
  /** How the initial state was named, for the evidence a caller reports. */
  readonly evidence: string | null;
  /** Set when a returned value could not be resolved to a declared state. */
  readonly unreadable: UnreadableConstruct | null;
}

/**
 * Reads the initial state a modern project declares.
 *
 * The state-class page says: "To indicate your initial state, add `return
 * PlayerTurn::class;` to the code of `setupNewGame` function in Game.php". The
 * same forms as a redirect are accepted, so a project that returns an
 * identifier or a constant is read too.
 */
export function readInitialState(
  sources: readonly PhpSource[],
  states: readonly StateDefinition[],
  classIds: ReadonlyMap<string, number>,
  signal?: AbortSignal,
): InitialStateOutcome {
  cancellationCheckpoint(signal);
  const constants = collectIntConstants(sources, signal);
  const declared = new Set(states.map((state) => state.id));

  for (const source of sources) {
    cancellationCheckpoint(signal);
    const setup = readMethods(source.text, signal).find((method) => method.name === 'setupNewGame');
    const expressions = setup === undefined ? [] : returnExpressions(setup.body, signal);
    if (setup === undefined || expressions.length === 0) {
      continue;
    }

    const ids: number[] = [];
    for (const expression of expressions) {
      cancellationCheckpoint(signal);
      const className = CLASS_CONSTANT.exec(expression.trim())?.[1];
      const target =
        className === undefined
          ? resolveIntExpression(expression, constants, undefined, signal)
          : (classIds.get(className) ?? null);
      if (target === null || !declared.has(target)) {
        return {
          ids: [],
          evidence: null,
          unreadable: {
            path: source.path,
            construct: `setupNewGame names an initial state this reader cannot resolve: return ${expression};`,
            scope: 'edge',
          },
        };
      }
      ids.push(target);
    }

    return {
      ids: [...new Set(ids)].sort((left, right) => left - right),
      evidence: `setupNewGame in ${source.path} returns ${expressions.join(', ')}`,
      unreadable: null,
    };
  }

  cancellationCheckpoint(signal);
  return { ids: [], evidence: null, unreadable: null };
}

/** A parameter of an action, as the client-to-server contract sees it. */
export interface ActionParameter {
  /** The name the client sends: the attribute's, or the variable's. */
  readonly name: string;
  readonly variable: string;
  readonly type: string | null;
  /** The attribute that declares the parameter's type and checks, if any. */
  readonly attribute: string | null;
  /** Checks the framework runs before calling, from the attribute. */
  readonly constraints: {
    readonly min?: number;
    readonly max?: number;
    readonly enum?: readonly string[];
    readonly alphanum?: boolean;
  };
}

export interface ModernAction {
  readonly action: string;
  /** Which form declares it, since the two differ in where they can run. */
  readonly declaredIn: 'game-class' | 'state-class';
  /** Parameter names the client sends, excluding the framework's own. */
  readonly argumentNames: readonly string[];
  readonly parameters: readonly ActionParameter[];
}

/**
 * Parameters the framework fills rather than the client.
 *
 * Both pages list the same set for an `act…` method, in camel and snake case.
 * `$playerId` is deliberately absent: "unlike getArgs(), autowired actions do
 * NOT support magic parameters int $playerId/int $player_id to refer to the
 * current player."
 */
export const INJECTED_ACTION_PARAMETERS = [
  'args',
  'activePlayerId',
  'active_player_id',
  'activePlayerNo',
  'active_player_no',
  'currentPlayerId',
  'current_player_id',
  'currentPlayerNo',
  'current_player_no',
] as const;

const INJECTED = new Set<string>(INJECTED_ACTION_PARAMETERS);

/** The parameter attributes the framework documents, and what each declares. */
const PARAMETER_ATTRIBUTES = new Set([
  'BoolParam',
  'IntParam',
  'FloatParam',
  'StringParam',
  'IntArrayParam',
  'JsonParam',
]);

const ACTION_METHOD = /\bfunction\s+(act[A-Z]\w*)\s*\(/gu;
const ATTRIBUTE = /#\[\s*\\?(?:[A-Za-z_]\w*\\)*([A-Za-z_]\w*)\s*(\()?/u;

/** Reads a named argument of an attribute, such as `min: 1` or `name: 'id'`. */
function attributeArguments(text: string, signal?: AbortSignal): Map<string, string> {
  const values = new Map<string, string>();
  const masked = maskLiterals(text, signal);
  const open = masked.indexOf('(');
  const span = open === -1 ? null : matchBracket(masked, open, signal);
  if (span === null) {
    return values;
  }
  for (const part of splitTopLevel(masked, span.start + 1, span.end, ',', signal)) {
    cancellationCheckpoint(signal);
    const argument = text.slice(part.start, part.end);
    const named = /^\s*([A-Za-z_]\w*)\s*:(?!:)([\s\S]*)$/u.exec(maskLiterals(argument, signal));
    if (named !== null) {
      values.set(named[1] ?? '', argument.slice(argument.length - (named[2] ?? '').length).trim());
    }
  }
  return values;
}

function readParameter(text: string, signal?: AbortSignal): ActionParameter | null {
  cancellationCheckpoint(signal);
  const variable = /\$([A-Za-z_]\w*)/u.exec(text)?.[1];
  if (variable === undefined) {
    return null;
  }

  const attributeMatch = ATTRIBUTE.exec(text);
  const attribute =
    attributeMatch !== null && PARAMETER_ATTRIBUTES.has(attributeMatch[1] ?? '')
      ? (attributeMatch[1] ?? null)
      : null;
  const values =
    attribute === null
      ? new Map<string, string>()
      : attributeArguments(text.slice(ATTRIBUTE.exec(text)?.index ?? 0), signal);

  const number = (key: string): number | null => {
    const raw = values.get(key);
    return raw !== undefined && /^-?\d+$/u.test(raw.trim()) ? Number(raw) : null;
  };
  const bound = (key: 'min' | 'max'): Record<string, number> => {
    const value = number(key);
    return value === null ? {} : { [key]: value };
  };
  const list = values.get('enum');
  const choices =
    list === undefined
      ? undefined
      : [...list.matchAll(/'([^']*)'|"([^"]*)"/gu)].map((entry) => entry[1] ?? entry[2] ?? '');

  // The type sits between the attribute and the variable.
  const declaration = text.slice(
    attribute === null ? 0 : maskLiterals(text, signal).indexOf(']') + 1 || 0,
    text.indexOf(`$${variable}`),
  );
  const type = /(\??[\\A-Za-z_]\w*)\s*$/u.exec(declaration.trim())?.[1] ?? null;

  return {
    name: readStringLiteral(values.get('name') ?? '', signal) ?? variable,
    variable,
    type,
    attribute,
    constraints: {
      ...bound('min'),
      ...bound('max'),
      ...(choices === undefined ? {} : { enum: choices }),
      ...(values.has('alphanum') ? { alphanum: values.get('alphanum')?.trim() === 'true' } : {}),
    },
  };
}

export interface ActionReadOptions {
  /**
   * True for a state class, where "every normal function should have a
   * `#[PossibleAction]` attribute on top of it to indicate the front it's a
   * normal action for the player".
   */
  readonly requireAttribute: boolean;
  readonly declaredIn: ModernAction['declaredIn'];
  /** Stops large textual scans when the enclosing MCP request expires. */
  readonly signal?: AbortSignal;
}

/**
 * Reads the `act…` methods that receive player actions.
 *
 * The framework autowires them: "The query param from the front request will be
 * matched with the PHP variable of the same name", unless a parameter attribute
 * renames it. So the signature is the server side of the contract that
 * `.action.php` used to hold, and the attribute — not the variable — decides
 * what the client is expected to send.
 */
export function parseModernActions(
  php: string,
  options: ActionReadOptions = { requireAttribute: false, declaredIn: 'game-class' },
): ParseOutcome<readonly ModernAction[]> {
  cancellationCheckpoint(options.signal);
  const actions: ModernAction[] = [];
  const unsupported: string[] = [];
  const masked = maskLiterals(php, options.signal);
  const methods = readMethods(php, options.signal);

  for (const match of masked.matchAll(ACTION_METHOD)) {
    cancellationCheckpoint(options.signal);
    const name = match[1] ?? '';
    const method = methods.find((entry) => entry.name === name);
    if (method === undefined) {
      continue;
    }
    if (options.requireAttribute && !method.attributes.includes('PossibleAction')) {
      continue;
    }
    // A method the front can reach must be public; the framework calls it from
    // outside the class.
    if (/\b(?:private|protected)\s+(?:static\s+)?$/u.test(masked.slice(0, match.index))) {
      continue;
    }

    const parameters: ActionParameter[] = [];
    const bounds = { start: 0, end: method.parameters.length };
    for (const part of splitTopLevel(
      maskLiterals(method.parameters, options.signal),
      bounds.start,
      bounds.end,
      ',',
      options.signal,
    )) {
      cancellationCheckpoint(options.signal);
      const text = method.parameters.slice(part.start, part.end);
      const parameter = readParameter(text, options.signal);
      if (parameter === null) {
        continue;
      }
      if (parameter.type === null && parameter.attribute === null) {
        unsupported.push(`action ${name} declares untyped parameter $${parameter.variable}`);
      }
      parameters.push(parameter);
    }

    const client = parameters.filter((parameter) => !INJECTED.has(parameter.variable));
    actions.push({
      action: name,
      declaredIn: options.declaredIn,
      argumentNames: client.map((parameter) => parameter.name).sort(),
      parameters,
    });
  }

  cancellationCheckpoint(options.signal);
  return { value: actions, unsupported };
}
