import type { ParseOutcome } from './parse.js';
import { cancellationCheckpoint, periodicCancellationCheckpoint } from '../deadline.js';

/**
 * Readers for the action contract that spans a BGA project's client and server.
 *
 * A player action crosses three files: the client calls it, an entry point
 * receives it, and a game method handles it. Nothing here executes project
 * code, so a call assembled at runtime is reported as unsupported rather than
 * guessed at.
 */

export interface ClientActionCall {
  /** The action name as the client sends it. */
  readonly action: string;
  /** Argument names sent with the call, excluding framework keys such as `lock`. */
  readonly argumentNames: readonly string[];
  /** Whether the complete argument shape is known, including a known-empty omitted object. */
  readonly argumentShape: 'known' | 'unknown';
  /**
   * The literal value of each argument the call writes as one.
   *
   * A value assembled at run time is absent rather than guessed, so a rule can
   * only judge what the source actually states.
   */
  readonly argumentValues: Readonly<Record<string, string>>;
  readonly style: 'ajaxcall' | 'performAction';
}

export interface ServerActionEntry {
  readonly action: string;
  /** Argument names the entry point reads from the request. */
  readonly argumentNames: readonly string[];
  /** The framework namespace in which this entry point is resolved. */
  readonly scope: 'legacy-dispatcher' | 'game-class' | 'state-class';
}

/**
 * Framework-owned keys a legacy `ajaxcall` sends that are never game arguments.
 *
 * They belong to that call shape only. `bgaPerformAction` takes the action name
 * as its own argument and its options as a third one, so every key in its
 * argument object is the game's — including one called `action`, which the
 * documentation's own `actChooseAction(string $action)` example expects.
 */
const AJAX_FRAMEWORK_KEYS = new Set(['lock', 'action', 'module', 'class', 'nodialog']);

/**
 * The keys an object literal sends.
 *
 * Shorthand counts: `{ tokenId }` sends `tokenId` exactly as `{ tokenId: x }`
 * does, and a modern client writes it that way most of the time.
 */
function objectKeys(
  literal: string,
  framework: ReadonlySet<string>,
  signal?: AbortSignal,
): string[] {
  const keys: string[] = [];
  for (const match of literal.matchAll(
    /(?:^|[,{])\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*(?::|(?=[,}]))/gu,
  )) {
    cancellationCheckpoint(signal);
    const key = match[1] ?? match[2] ?? match[3];
    if (key !== undefined && !framework.has(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Reads the literal values an object literal states.
 *
 * Only a value the source writes out is recorded: `{ gold: 0 }` states its
 * value, `{ gold: this.chosen }` does not, and the difference is what keeps a
 * rule about values from guessing at one.
 */
function objectValues(
  literal: string,
  framework: ReadonlySet<string>,
  signal?: AbortSignal,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of literal.matchAll(
    /(?:^|[,{])\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*('[^']*'|"[^"]*"|-?\d+(?:\.\d+)?|true|false)\s*(?=[,}])/gu,
  )) {
    cancellationCheckpoint(signal);
    const key = match[1] ?? match[2] ?? match[3];
    const value = match[4];
    if (key !== undefined && value !== undefined && !framework.has(key)) {
      values[key] = value;
    }
  }
  return values;
}

/** Extracts the balanced object literal that starts at `start`, or null. */
function objectLiteralAt(source: string, start: number, signal?: AbortSignal): string | null {
  cancellationCheckpoint(signal);
  if (source[start] !== '{') {
    return null;
  }
  let depth = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote: string | null = null;
  for (let index = start; index < source.length; index += 1) {
    periodicCancellationCheckpoint(index - start, signal);
    const character = source[index];
    if (quote !== null) {
      if (character === quote && source[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return parentheses === 0 && brackets === 0 ? source.slice(start, index + 1) : null;
      }
    } else if (character === '(') {
      parentheses += 1;
    } else if (character === ')') {
      if (parentheses === 0) return null;
      parentheses -= 1;
    } else if (character === '[') {
      brackets += 1;
    } else if (character === ']') {
      if (brackets === 0) return null;
      brackets -= 1;
    }
  }
  return null;
}

/** Object spread makes a literal only partially readable, never known-empty or complete. */
function hasSpread(literal: string): boolean {
  return literal.includes('...');
}

function nextNonSpace(source: string, from: number, signal?: AbortSignal): number {
  let index = from;
  while (index < source.length && /\s/u.test(source[index] ?? '')) {
    periodicCancellationCheckpoint(index - from, signal);
    index += 1;
  }
  return index;
}

const AJAXCALL = /ajaxcall\s*\(\s*(?:'([^']*)'|"([^"]*)"|([^,]+))\s*,\s*/gu;
// The client moved twice: ajaxcall, then bgaPerformAction, then
// this.bga.actions.performAction. Projects exist at every point, so all three
// are read. https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide
const PERFORM_ACTION =
  /(?:bga\.actions\.performAction|bgaPerformAction)\s*\(\s*(?:'([^']*)'|"([^"]*)"|([^,)]+))\s*(,\s*)?/gu;
const AJAX_URL = /^\/[^/]+\/[^/]+\/([A-Za-z_][\w]*)\.html$/u;

/**
 * Reads the action calls a client makes.
 *
 * Recognizes legacy `ajaxcall` URLs and modern `bgaPerformAction` names. A call
 * whose action is not a literal is reported as unsupported.
 */
export function parseClientActionCalls(
  source: string,
  signal?: AbortSignal,
): ParseOutcome<readonly ClientActionCall[]> {
  cancellationCheckpoint(signal);
  const calls: ClientActionCall[] = [];
  const unsupported: string[] = [];

  for (const match of source.matchAll(AJAXCALL)) {
    cancellationCheckpoint(signal);
    const literal = match[1] ?? match[2];
    if (literal === undefined) {
      unsupported.push(`ajaxcall with a computed URL: ${(match[3] ?? '').trim().slice(0, 40)}`);
      continue;
    }
    const action = AJAX_URL.exec(literal)?.[1];
    if (action === undefined) {
      unsupported.push(`ajaxcall URL that does not name an action: ${literal}`);
      continue;
    }
    const argumentsStart = nextNonSpace(source, match.index + match[0].length, signal);
    const literalObject = objectLiteralAt(source, argumentsStart, signal);
    const argumentShape = literalObject !== null && !hasSpread(literalObject) ? 'known' : 'unknown';
    calls.push({
      action,
      argumentNames:
        literalObject === null ? [] : objectKeys(literalObject, AJAX_FRAMEWORK_KEYS, signal),
      argumentValues:
        literalObject === null ? {} : objectValues(literalObject, AJAX_FRAMEWORK_KEYS, signal),
      argumentShape,
      style: 'ajaxcall',
    });
    if (argumentShape === 'unknown') {
      unsupported.push(`ajaxcall to ${action} with computed arguments`);
    }
  }

  for (const match of source.matchAll(PERFORM_ACTION)) {
    cancellationCheckpoint(signal);
    const literal = match[1] ?? match[2];
    if (literal === undefined) {
      unsupported.push(
        `bgaPerformAction with a computed name: ${(match[3] ?? '').trim().slice(0, 40)}`,
      );
      continue;
    }
    const argumentsStart = nextNonSpace(source, match.index + match[0].length, signal);
    const omitted = match[4] === undefined;
    const literalObject = omitted ? null : objectLiteralAt(source, argumentsStart, signal);
    const argumentShape =
      omitted || (literalObject !== null && !hasSpread(literalObject)) ? 'known' : 'unknown';
    calls.push({
      action: literal,
      argumentNames: literalObject === null ? [] : objectKeys(literalObject, new Set(), signal),
      argumentValues: literalObject === null ? {} : objectValues(literalObject, new Set(), signal),
      argumentShape,
      style: 'performAction',
    });
    if (argumentShape === 'unknown') {
      unsupported.push(`bgaPerformAction to ${literal} with computed arguments`);
    }
  }

  cancellationCheckpoint(signal);
  return { value: calls, unsupported };
}

const PHP_FUNCTION =
  /((?:(?:public|protected|private|static|final|abstract)\s+)*)function\s+([A-Za-z_]\w*)\s*\(/gu;
const GET_ARG = /getArg\s*\(\s*(?:'([^']+)'|"([^"]+)")/gu;
const REQUEST_ARG = /\$(?:_POST|_GET|args)\s*\[\s*(?:'([^']+)'|"([^"]+)")\s*\]/gu;

/**
 * Reads the server entry points that receive player actions.
 *
 * An entry point is a method of the action class. Its argument names are the
 * request values it reads, so a client and server that disagree can be
 * compared without executing either side.
 */
export function parseServerActionEntries(
  source: string,
  signal?: AbortSignal,
): ParseOutcome<readonly ServerActionEntry[]> {
  cancellationCheckpoint(signal);
  const entries: ServerActionEntry[] = [];
  const unsupported: string[] = [];
  const matches = [...source.matchAll(PHP_FUNCTION)];

  for (const [index, match] of matches.entries()) {
    cancellationCheckpoint(signal);
    const modifiers = match[1] ?? '';
    const name = match[2];
    if (name === undefined || name === '__construct') {
      continue;
    }
    // The legacy action file is a public request dispatcher. Private and
    // protected helpers are not player entry points merely because they are
    // methods of the same class.
    if (/\b(?:private|protected)\b/u.test(modifiers)) {
      continue;
    }
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    const body = source.slice(start, end);

    const argumentNames = new Set<string>();
    for (const argument of body.matchAll(GET_ARG)) {
      cancellationCheckpoint(signal);
      const argumentName = argument[1] ?? argument[2];
      if (argumentName !== undefined) {
        argumentNames.add(argumentName);
      }
    }
    for (const argument of body.matchAll(REQUEST_ARG)) {
      cancellationCheckpoint(signal);
      const argumentName = argument[1] ?? argument[2];
      if (argumentName !== undefined) {
        argumentNames.add(argumentName);
      }
    }
    if (/getArg\s*\(\s*\$/u.test(body)) {
      unsupported.push(`entry point ${name} reads a computed argument name`);
    }

    entries.push({
      action: name,
      argumentNames: [...argumentNames].sort(),
      scope: 'legacy-dispatcher',
    });
  }

  cancellationCheckpoint(signal);
  return { value: entries, unsupported };
}

/** Names of the methods a PHP source declares. */
export function parsePhpMethodNames(source: string, signal?: AbortSignal): readonly string[] {
  cancellationCheckpoint(signal);
  const names: string[] = [];
  for (const match of source.matchAll(PHP_FUNCTION)) {
    cancellationCheckpoint(signal);
    const name = match[2];
    if (name !== undefined) {
      names.push(name);
    }
  }
  cancellationCheckpoint(signal);
  return names;
}
