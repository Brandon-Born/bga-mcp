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
): { name: string | null; value: string }[] | null {
  const call = CONSTRUCT_CALL.exec(masked);
  if (call === null) {
    return null;
  }
  const span = matchBracket(masked, call.index + call[0].length - 1);
  if (span === null) {
    return null;
  }
  return splitTopLevel(masked, span.start + 1, span.end).map((part) => {
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
): { transitions: Record<string, number>; unreadable: string[] } {
  const transitions: Record<string, number> = {};
  const unreadable: string[] = [];
  const masked = maskLiterals(expression);
  const open = masked.search(/[[(]/u);
  const span = open === -1 ? null : matchBracket(masked, open);
  if (span === null) {
    return { transitions, unreadable: [`transition map ${expression.trim()}`] };
  }

  for (const part of splitTopLevel(masked, span.start + 1, span.end)) {
    const entry = expression.slice(part.start, part.end);
    const arrow = maskLiterals(entry).indexOf('=>');
    const key = arrow === -1 ? null : readStringLiteral(entry.slice(0, arrow));
    const target =
      arrow === -1 ? null : resolveIntExpression(entry.slice(arrow + 2), constants, selfClass);
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
): StateDraft | null {
  const masked = maskLiterals(source.text);
  const declaration = STATE_CLASS.exec(masked);
  if (declaration === null || (declaration[2] ?? '').split('\\').at(-1) !== 'GameState') {
    return null;
  }
  const className = declaration[1] ?? '';
  const report = (construct: string, scope: UnreadableScope): void => {
    unsupported.push({ path: source.path, construct, scope });
  };

  const parsed = constructorArguments(source.text, masked);
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
  const id = rawId === undefined ? null : resolveIntExpression(rawId, constants, className);
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
    const text = readStringLiteral(raw);
    if (text === null) {
      report(`state class ${className} with a computed ${argument}: ${raw}`, 'detail');
    }
    return text;
  };

  const transitions = readTransitions(named.get('transitions') ?? '[]', constants, className);
  for (const construct of transitions.unreadable) {
    report(`state class ${className} with an unreadable ${construct}`, 'edge');
  }

  const methods = readMethods(source.text);
  const returned = methods
    .filter((method) => redirects(method.name))
    .flatMap((method) => returnExpressions(method.body));
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
): number | null {
  const className = CLASS_CONSTANT.exec(expression.trim())?.[1];
  if (className !== undefined) {
    return classIds.get(className) ?? null;
  }
  const transition = readStringLiteral(expression);
  if (transition !== null) {
    return draft.transitions[transition] ?? null;
  }
  return resolveIntExpression(expression, constants, draft.className);
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
): ModernStatesOutcome {
  const constants = collectIntConstants([...sources, ...supporting]);
  const unsupported: UnreadableConstruct[] = [];
  const drafts: StateDraft[] = [];

  for (const source of sources) {
    const draft = readClass(source, constants, unsupported);
    if (draft !== null) {
      drafts.push(draft);
    }
  }

  const classIds = new Map(drafts.map((draft) => [draft.className, draft.id]));
  const states: StateDefinition[] = [];

  for (const draft of drafts) {
    const targets = new Set<number>();
    let edgesResolved = draft.edgesResolved;

    const edges = [
      ...(draft.initialPrivate === null || /^null$/iu.test(draft.initialPrivate.trim())
        ? []
        : [{ expression: draft.initialPrivate, label: 'initialPrivate' }]),
      ...draft.returned.map((expression) => ({ expression, label: 'return' })),
    ];

    for (const edge of edges) {
      const target = resolveRedirect(edge.expression, draft, constants, classIds);
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

  return {
    value: states.sort((left, right) => left.id - right.id),
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
): InitialStateOutcome {
  const constants = collectIntConstants(sources);
  const declared = new Set(states.map((state) => state.id));

  for (const source of sources) {
    const setup = readMethods(source.text).find((method) => method.name === 'setupNewGame');
    const expressions = setup === undefined ? [] : returnExpressions(setup.body);
    if (setup === undefined || expressions.length === 0) {
      continue;
    }

    const ids: number[] = [];
    for (const expression of expressions) {
      const className = CLASS_CONSTANT.exec(expression.trim())?.[1];
      const target =
        className === undefined
          ? resolveIntExpression(expression, constants)
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

  return { ids: [], evidence: null, unreadable: null };
}

export interface ModernAction {
  readonly action: string;
  /** Parameter names the autowired method declares, excluding framework ones. */
  readonly argumentNames: readonly string[];
}

/** Parameters the framework supplies rather than the client. */
const FRAMEWORK_PARAMETERS = new Set(['activePlayerId', 'playerId', 'args', 'game']);

const ACTION_METHOD = /(?:#\[[^\]]*\]\s*)*public\s+function\s+(act[A-Z]\w*)\s*\(([^)]*)\)/gu;

/**
 * Reads the autowired action methods a modern game class declares.
 *
 * The modern framework matches a request parameter to a typed method parameter
 * of the same name, so the method signature is the server side of the contract
 * that `.action.php` used to hold.
 */
export function parseModernActions(php: string): ParseOutcome<readonly ModernAction[]> {
  const actions: ModernAction[] = [];
  const unsupported: string[] = [];

  for (const match of php.matchAll(ACTION_METHOD)) {
    const name = match[1];
    const parameters = match[2] ?? '';
    if (name === undefined) {
      continue;
    }
    const argumentNames: string[] = [];
    for (const parameter of parameters.split(',')) {
      const trimmed = parameter.trim();
      if (trimmed === '') {
        continue;
      }
      const variable = /\$([A-Za-z_]\w*)/u.exec(trimmed)?.[1];
      if (variable === undefined) {
        continue;
      }
      if (!/^[?\\A-Za-z]/u.test(trimmed)) {
        unsupported.push(`action ${name} declares untyped parameter $${variable}`);
      }
      if (!FRAMEWORK_PARAMETERS.has(variable)) {
        argumentNames.push(variable);
      }
    }
    actions.push({ action: name, argumentNames: argumentNames.sort() });
  }

  return { value: actions, unsupported };
}
