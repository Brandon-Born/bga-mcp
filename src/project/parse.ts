import {
  collectIntConstants,
  matchBracket,
  maskLiterals,
  readStringLiteral,
  resolveIntExpression,
  splitTopLevel,
  type PhpSource,
} from './php.js';

/**
 * Tolerant readers for the metadata and state formats BGA projects use.
 *
 * Every reader here is textual: it recognizes the documented shapes and
 * reports what it could not understand instead of guessing. A caller must
 * treat an empty result as "not proven", never as "not present".
 */

export interface ParseOutcome<T> {
  readonly value: T;
  /** Constructs the reader recognized but could not interpret. */
  readonly unsupported: readonly string[];
}

/**
 * What a construct this reader could not interpret leaves incomplete.
 *
 * The distinction decides which rules may still speak: an identifier that
 * could not be read removes a state from the machine, so nothing about
 * reachability or dangling targets can be claimed; an unreadable redirect
 * removes only an edge; an unreadable description removes neither.
 */
export type UnreadableScope = 'declaration' | 'edge' | 'detail';

export interface UnreadableConstruct {
  /** The file the construct is in, or null for the source the caller passed. */
  readonly path: string | null;
  readonly construct: string;
  readonly scope: UnreadableScope;
}

export interface StateParseOutcome {
  readonly value: readonly StateDefinition[];
  readonly unsupported: readonly UnreadableConstruct[];
}

/** Strips comments and trailing commas so BGA's JSONC metadata can be parsed. */
export function parseJsonc(source: string): unknown {
  let result = '';
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < source.length) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      result += character;
      index += 1;
      continue;
    }

    if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (character === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }

    result += character;
    index += 1;
  }

  return JSON.parse(result.replace(/,(\s*[}\]])/gu, '$1')) as unknown;
}

export interface GameMetadata {
  readonly gameName: string | null;
  readonly playerCounts: readonly number[];
}

/** Reads `gameinfos.json` or `gameinfos.jsonc`. */
export function parseModernMetadata(source: string): ParseOutcome<GameMetadata> {
  let parsed: unknown;
  try {
    parsed = parseJsonc(source);
  } catch {
    return { value: { gameName: null, playerCounts: [] }, unsupported: ['unparsable JSON object'] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { value: { gameName: null, playerCounts: [] }, unsupported: ['non-object metadata'] };
  }

  const record = parsed as { game_name?: unknown; player_numbers?: unknown; players?: unknown };
  const gameName = typeof record.game_name === 'string' ? record.game_name : null;
  const counts = record.player_numbers ?? record.players;
  const playerCounts = Array.isArray(counts)
    ? counts.filter(
        (entry): entry is number => typeof entry === 'number' && Number.isInteger(entry),
      )
    : [];
  const unsupported: string[] = [];
  if (gameName === null) {
    unsupported.push('missing or non-string game_name');
  }
  if (counts !== undefined && playerCounts.length === 0) {
    unsupported.push('unreadable player count list');
  }
  return { value: { gameName, playerCounts }, unsupported };
}

/** Reads `gameinfos.inc.php`, which is PHP source rather than data. */
export function parseLegacyMetadata(source: string): ParseOutcome<GameMetadata> {
  const unsupported: string[] = [];
  const name = /'game_name'\s*=>\s*'([^']*)'/u.exec(source)?.[1] ?? null;
  if (name === null) {
    unsupported.push("no literal 'game_name' assignment");
  }

  const playersBlock = /'players'\s*=>\s*(?:array\s*\(|\[)([^)\]]*)/u.exec(source)?.[1] ?? '';
  const playerCounts = [...playersBlock.matchAll(/\d+/gu)].map((match) => Number(match[0]));
  if (playersBlock === '') {
    unsupported.push("no literal 'players' list");
  }

  return { value: { gameName: name, playerCounts }, unsupported };
}

/**
 * The state types the framework dispatches, mapped to their array-notation
 * names.
 *
 * Both state pages list exactly these four and give the array name of each:
 * "StateType::ACTIVE_PLAYER : 1 player is active and must play. ('activeplayer'
 * if using the old array notation)".
 */
export const STATE_TYPES: Readonly<Record<string, string>> = {
  ACTIVE_PLAYER: 'activeplayer',
  MULTIPLE_ACTIVE_PLAYER: 'multipleactiveplayer',
  PRIVATE: 'private',
  GAME: 'game',
};

const STATE_TYPE_CONSTANT = /^\\?(?:[A-Za-z_]\w*\\)*StateType::([A-Za-z_]\w*)$/u;

/** Reads a state type written either as a string or as a `StateType` constant. */
export function readStateType(expression: string): string | null {
  const constant = STATE_TYPE_CONSTANT.exec(expression.trim())?.[1];
  if (constant !== undefined) {
    return STATE_TYPES[constant] ?? constant.toLowerCase();
  }
  return readStringLiteral(expression);
}

/** Which documented form declared a state. */
export type StateOrigin = 'array' | 'class' | 'framework';

export interface StateDefinition {
  readonly id: number;
  readonly name: string | null;
  readonly type: string | null;
  /** The `st…` method, or `onEnteringState`, the framework calls on entry. */
  readonly action: string | null;
  /** The `arg…` method, or `getArgs`, that supplies client-side arguments. */
  readonly args: string | null;
  readonly possibleActions: readonly string[];
  readonly transitions: Readonly<Record<string, number>>;
  /**
   * Which form declared it. `framework` marks a state the framework defines
   * itself, such as `GameStateBuilder::gameSetup(2)`, whose internals are not
   * the project's to get right.
   */
  readonly origin: StateOrigin;
  readonly description: string | null;
  readonly descriptionMyTurn: string | null;
  /** The zombie handler a state class declares. */
  readonly zombie: string | null;
  /** States this one reaches other than through a named transition. */
  readonly redirects: readonly number[];
  /** False when an outgoing edge could not be read, so its targets are partial. */
  readonly edgesResolved: boolean;
}

/** The empty state, so every reader states the whole shape it produces. */
const EMPTY_STATE = {
  name: null,
  type: null,
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
} as const satisfies Omit<StateDefinition, 'id'>;

/** The fields both array spellings of a state declare, lowercased. */
const STATE_FIELDS = new Set([
  'name',
  'description',
  'descriptionmyturn',
  'type',
  'action',
  'args',
  'possibleactions',
  'transitions',
  'updategameprogression',
  'initialprivate',
  // The builder chain ends in ->build(), which is not a field.
  'build',
]);

const MACHINE_STATES = /\$machinestates\s*=\s*(?:array\s*\(|\[)/u;
const BUILDER = /^\s*GameStateBuilder::([A-Za-z_]\w*)\s*\(/u;
const CHAIN_STEP = /^\s*->\s*([A-Za-z_]\w*)\s*\(/u;

/** Reads `'key' => value` pairs in declaration order. */
function readKeyedEntries(
  text: string,
  masked: string,
  from: number,
  to: number,
): Map<string, string> {
  const entries = new Map<string, string>();
  for (const part of splitTopLevel(masked, from, to)) {
    const entry = text.slice(part.start, part.end);
    const arrow = maskLiterals(entry).indexOf('=>');
    const key = arrow === -1 ? null : readStringLiteral(entry.slice(0, arrow));
    if (key !== null) {
      entries.set(key, entry.slice(arrow + 2).trim());
    }
  }
  return entries;
}

/** Field names are matched case-insensitively; transition names never are. */
function lowercaseKeys(entries: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...entries].map(([key, value]) => [key.toLowerCase(), value]));
}

/** Reads the arguments of a `->name(value)` builder chain, in call order. */
function readBuilderChain(
  text: string,
  masked: string,
  from: number,
  to: number,
): { calls: Map<string, string>; complete: boolean } {
  const calls = new Map<string, string>();
  let index = from;

  for (;;) {
    const step = CHAIN_STEP.exec(masked.slice(index, to));
    if (step === null) {
      return { calls, complete: masked.slice(index, to).trim() === '' };
    }
    const open = index + step[0].length - 1;
    const span = matchBracket(masked, open);
    if (span === null) {
      return { calls, complete: false };
    }
    calls.set((step[1] ?? '').toLowerCase(), text.slice(span.start + 1, span.end).trim());
    index = span.end + 1;
  }
}

function readTransitionMap(
  expression: string,
  constants: ReadonlyMap<string, number>,
): { transitions: Record<string, number>; unreadable: string[] } {
  const transitions: Record<string, number> = {};
  const unreadable: string[] = [];
  const masked = maskLiterals(expression);
  const open = masked.search(/[[(]/u);
  const span = open === -1 ? null : matchBracket(masked, open);
  if (span === null) {
    return { transitions, unreadable: [`transition map ${expression.trim()}`] };
  }

  for (const [key, value] of readKeyedEntries(expression, masked, span.start + 1, span.end)) {
    const target = resolveIntExpression(value, constants);
    if (target === null) {
      unreadable.push(`transition target ${key} => ${value}`);
      continue;
    }
    transitions[key] = target;
  }
  return { transitions, unreadable };
}

function readStringList(expression: string): string[] {
  const masked = maskLiterals(expression);
  const open = masked.search(/[[(]/u);
  const span = open === -1 ? null : matchBracket(masked, open);
  if (span === null) {
    return [];
  }
  return splitTopLevel(masked, span.start + 1, span.end)
    .map((part) => readStringLiteral(expression.slice(part.start, part.end)))
    .filter((entry): entry is string => entry !== null);
}

/**
 * Builds one state from the fields both array notations share.
 *
 * `states.inc.php` has two documented spellings — the associative array and
 * the `GameStateBuilder` chain the migration guide recommends in its place —
 * and they carry exactly the same fields, so both are read here.
 */
function stateFromFields(
  id: number,
  fields: ReadonlyMap<string, string>,
  constants: ReadonlyMap<string, number>,
  report: (construct: string, scope: UnreadableScope) => void,
): StateDefinition {
  const read = (key: string, reader: (raw: string) => string | null): string | null => {
    const raw = fields.get(key);
    if (raw === undefined) {
      return null;
    }
    const value = reader(raw);
    if (value === null) {
      report(`computed ${key} in state ${String(id)}: ${raw}`, 'detail');
    }
    return value;
  };
  const literal = (key: string): string | null => read(key, readStringLiteral);

  for (const key of fields.keys()) {
    if (!STATE_FIELDS.has(key)) {
      report(`unknown field '${key}' in state ${String(id)}`, 'detail');
    }
  }

  const transitions = readTransitionMap(fields.get('transitions') ?? '[]', constants);
  for (const construct of transitions.unreadable) {
    report(`unreadable ${construct} in state ${String(id)}`, 'edge');
  }

  const redirects: number[] = [];
  const initialPrivate = fields.get('initialprivate');
  let edgesResolved = transitions.unreadable.length === 0;
  if (initialPrivate !== undefined && !/^null$/iu.test(initialPrivate.trim())) {
    const target = resolveIntExpression(initialPrivate, constants);
    if (target === null) {
      report(`unreadable initialprivate in state ${String(id)}: ${initialPrivate}`, 'edge');
      edgesResolved = false;
    } else {
      redirects.push(target);
    }
  }

  return {
    id,
    ...EMPTY_STATE,
    name: literal('name'),
    type: read('type', readStateType),
    action: literal('action'),
    args: literal('args'),
    description: literal('description'),
    descriptionMyTurn: literal('descriptionmyturn'),
    possibleActions: readStringList(fields.get('possibleactions') ?? '[]'),
    transitions: transitions.transitions,
    redirects,
    edgesResolved,
  };
}

/**
 * Reads the `$machinestates` array from `states.inc.php`.
 *
 * The array is PHP source, so this reader recognizes the documented
 * declarations and reports every entry it cannot interpret. Identifiers
 * written as constants are resolved from the `define()` calls the
 * documentation shows beside them, and from the class constants a project may
 * share with its state classes; anything else is reported rather than dropped.
 */
export function parseLegacyStates(
  source: string,
  supporting: readonly PhpSource[] = [],
): StateParseOutcome {
  const unsupported: UnreadableConstruct[] = [];
  const report = (construct: string, scope: UnreadableScope): void => {
    unsupported.push({ path: null, construct, scope });
  };

  const masked = maskLiterals(source);
  const start = MACHINE_STATES.exec(masked);
  if (start === null) {
    report('no literal $machinestates assignment', 'declaration');
    return { value: [], unsupported };
  }
  const span = matchBracket(masked, start.index + start[0].length - 1);
  if (span === null) {
    report('unterminated $machinestates assignment', 'declaration');
    return { value: [], unsupported };
  }

  const constants = collectIntConstants([{ path: 'states.inc.php', text: source }, ...supporting]);
  const states: StateDefinition[] = [];

  for (const part of splitTopLevel(masked, span.start + 1, span.end)) {
    const entry = source.slice(part.start, part.end);
    // The key is read from the masked copy, where a comment above the entry is
    // blanked. Reading it from the source would make the comment part of it.
    const maskedEntry = masked.slice(part.start, part.end);
    const arrow = maskedEntry.indexOf('=>');
    if (arrow === -1) {
      report(`state entry without an identifier: ${entry.trim()}`, 'declaration');
      continue;
    }

    const key = maskedEntry.slice(0, arrow);
    const id = resolveIntExpression(key, constants);
    if (id === null) {
      report(`non-literal state key ${key.trim()}`, 'declaration');
      continue;
    }

    const value = entry.slice(arrow + 2);
    const state = readStateEntry(id, value, constants, report);
    if (state !== null) {
      states.push(state);
    }
  }

  if (states.length === 0 && unsupported.length === 0) {
    report('no literal state entries', 'declaration');
  }
  return { value: states, unsupported };
}

/** Reads one entry, in either the array or the `GameStateBuilder` spelling. */
function readStateEntry(
  id: number,
  value: string,
  constants: ReadonlyMap<string, number>,
  report: (construct: string, scope: UnreadableScope) => void,
): StateDefinition | null {
  const masked = maskLiterals(value);
  const builder = BUILDER.exec(masked);

  if (builder !== null) {
    const factory = (builder[1] ?? '').toLowerCase();
    const span = matchBracket(masked, builder.index + builder[0].length - 1);
    if (span === null) {
      report(`unreadable GameStateBuilder call in state ${String(id)}`, 'declaration');
      return null;
    }
    const chain = readBuilderChain(value, masked, span.end + 1, value.length);
    if (factory === 'create') {
      if (!chain.complete) {
        report(`unreadable GameStateBuilder chain in state ${String(id)}`, 'declaration');
        return null;
      }
      return stateFromFields(id, chain.calls, constants, report);
    }

    // The framework's own states. `gameSetup(2)` is documented as the line to
    // keep "if your initial state is not 2", so its argument is where setup
    // goes; the rest of a framework state is not the project's to declare.
    const target =
      factory === 'gamesetup'
        ? resolveIntExpression(value.slice(span.start + 1, span.end), constants)
        : null;
    return { id, ...EMPTY_STATE, origin: 'framework', redirects: target === null ? [] : [target] };
  }

  const array = /^\s*(?:array\s*\(|\[)/u.exec(masked);
  const span = array === null ? null : matchBracket(masked, array[0].length - 1);
  if (span === null) {
    report(`unreadable declaration for state ${String(id)}: ${value.trim()}`, 'declaration');
    return null;
  }
  return stateFromFields(
    id,
    lowercaseKeys(readKeyedEntries(value, masked, span.start + 1, span.end)),
    constants,
    report,
  );
}
