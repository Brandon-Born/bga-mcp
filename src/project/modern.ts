import type { ParseOutcome, StateDefinition } from './parse.js';

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
 * https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php
 */

/** The state types the modern framework declares, mapped to their legacy names. */
const STATE_TYPES: Readonly<Record<string, string>> = {
  ACTIVE_PLAYER: 'activeplayer',
  MULTIPLE_ACTIVE_PLAYER: 'multipleactiveplayer',
  GAME: 'game',
  MANAGER: 'manager',
  PRIVATE: 'private',
};

const CLASS_NAME = /(?:final\s+|abstract\s+)?class\s+([A-Za-z_]\w*)\s+extends\s+([A-Za-z_\\]\w*)/u;
const CONSTRUCT_CALL = /parent::__construct\s*\(/u;
const NAMED_ARGUMENT = /\b([A-Za-z_]\w*)\s*:\s*/gu;

function balanced(source: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(' || character === '[') {
      depth += 1;
    } else if (character === ')' || character === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }
  return '';
}

/** Reads a named argument's raw text from a `parent::__construct` call. */
function namedArgument(call: string, name: string): string | null {
  for (const match of call.matchAll(NAMED_ARGUMENT)) {
    if (match[1] !== name) {
      continue;
    }
    const start = match.index + match[0].length;
    let depth = 0;
    for (let index = start; index < call.length; index += 1) {
      const character = call[index];
      if (character === '(' || character === '[') {
        depth += 1;
      } else if (character === ')' || character === ']') {
        depth -= 1;
      } else if (character === ',' && depth === 0) {
        return call.slice(start, index).trim();
      }
    }
    return call.slice(start).trim();
  }
  return null;
}

function stringLiteral(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const match = /^(?:'([^']*)'|"([^"]*)")$/u.exec(value.trim());
  return match === null ? null : (match[1] ?? match[2] ?? null);
}

export interface ModernStateSource {
  readonly path: string;
  readonly text: string;
}

/**
 * Reads state classes into the same shape the legacy declaration produces.
 *
 * A state's name defaults to its class name, as the framework does. A type,
 * identifier, or transition target that is not a literal is reported rather
 * than guessed, so a computed state machine never looks complete.
 */
export function parseModernStates(
  sources: readonly ModernStateSource[],
): ParseOutcome<readonly StateDefinition[]> {
  const states: StateDefinition[] = [];
  const unsupported: string[] = [];

  for (const source of sources) {
    const classMatch = CLASS_NAME.exec(source.text);
    if (classMatch === null) {
      continue;
    }
    const className = classMatch[1] ?? '';
    if (!(classMatch[2] ?? '').endsWith('GameState')) {
      continue;
    }

    const constructMatch = CONSTRUCT_CALL.exec(source.text);
    if (constructMatch === null) {
      unsupported.push(`state class ${className} without a literal parent::__construct call`);
      continue;
    }
    const call = balanced(source.text, constructMatch.index + constructMatch[0].length - 1);

    const rawId = namedArgument(call, 'id');
    if (rawId === null || !/^\d+$/u.test(rawId)) {
      unsupported.push(`state class ${className} with a non-literal id`);
      continue;
    }

    const rawType = namedArgument(call, 'type');
    const typeName = /StateType::([A-Z_]+)/u.exec(rawType ?? '')?.[1];
    const type = typeName === undefined ? null : (STATE_TYPES[typeName] ?? typeName.toLowerCase());
    if (rawType !== null && typeName === undefined) {
      unsupported.push(`state class ${className} with a computed type`);
    }

    const transitions: Record<string, number> = {};
    const rawTransitions = namedArgument(call, 'transitions') ?? '';
    for (const entry of rawTransitions.matchAll(/'([^']*)'\s*=>\s*(\d+)/gu)) {
      transitions[entry[1] ?? ''] = Number(entry[2]);
    }
    if (/=>\s*[A-Za-z_$]/u.test(rawTransitions)) {
      unsupported.push(`state class ${className} with a non-literal transition target`);
    }

    // Actions a state allows are its act… methods, with or without the
    // #[PossibleAction] attribute the state-class documentation shows.
    const possibleActions = [
      ...new Set(
        [...source.text.matchAll(/function\s+(act[A-Z]\w*)\s*\(/gu)].map((match) => match[1] ?? ''),
      ),
    ];

    states.push({
      id: Number(rawId),
      name: stringLiteral(namedArgument(call, 'name')) ?? className,
      type,
      action: /function\s+onEnteringState\s*\(/u.test(source.text) ? 'onEnteringState' : null,
      args: /function\s+getArgs\s*\(/u.test(source.text) ? 'getArgs' : null,
      possibleActions,
      transitions,
    });
  }

  return { value: states.sort((left, right) => left.id - right.id), unsupported };
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
