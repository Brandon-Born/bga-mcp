import type { ParseOutcome } from './parse.js';

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
  readonly style: 'ajaxcall' | 'performAction';
}

export interface ServerActionEntry {
  readonly action: string;
  /** Argument names the entry point reads from the request. */
  readonly argumentNames: readonly string[];
}

/** Framework-owned keys a client sends that are never game arguments. */
const FRAMEWORK_KEYS = new Set(['lock', 'action', 'module', 'class', 'nodialog']);

function objectKeys(literal: string): string[] {
  const keys: string[] = [];
  for (const match of literal.matchAll(
    /(?:^|[,{])\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/gu,
  )) {
    const key = match[1] ?? match[2] ?? match[3];
    if (key !== undefined && !FRAMEWORK_KEYS.has(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/** Extracts the balanced object literal that starts at `start`, or null. */
function objectLiteralAt(source: string, start: number): string | null {
  if (source[start] !== '{') {
    return null;
  }
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return null;
}

function nextNonSpace(source: string, from: number): number {
  let index = from;
  while (index < source.length && /\s/u.test(source[index] ?? '')) {
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
export function parseClientActionCalls(source: string): ParseOutcome<readonly ClientActionCall[]> {
  const calls: ClientActionCall[] = [];
  const unsupported: string[] = [];

  for (const match of source.matchAll(AJAXCALL)) {
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
    const argumentsStart = nextNonSpace(source, match.index + match[0].length);
    const literalObject = objectLiteralAt(source, argumentsStart);
    calls.push({
      action,
      argumentNames: literalObject === null ? [] : objectKeys(literalObject),
      style: 'ajaxcall',
    });
    if (literalObject === null) {
      unsupported.push(`ajaxcall to ${action} with computed arguments`);
    }
  }

  for (const match of source.matchAll(PERFORM_ACTION)) {
    const literal = match[1] ?? match[2];
    if (literal === undefined) {
      unsupported.push(
        `bgaPerformAction with a computed name: ${(match[3] ?? '').trim().slice(0, 40)}`,
      );
      continue;
    }
    const argumentsStart = nextNonSpace(source, match.index + match[0].length);
    const literalObject = objectLiteralAt(source, argumentsStart);
    calls.push({
      action: literal,
      argumentNames: literalObject === null ? [] : objectKeys(literalObject),
      style: 'performAction',
    });
  }

  return { value: calls, unsupported };
}

const PHP_FUNCTION =
  /(?:public\s+|protected\s+|private\s+|static\s+)*function\s+([A-Za-z_]\w*)\s*\(/gu;
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
): ParseOutcome<readonly ServerActionEntry[]> {
  const entries: ServerActionEntry[] = [];
  const unsupported: string[] = [];
  const matches = [...source.matchAll(PHP_FUNCTION)];

  for (const [index, match] of matches.entries()) {
    const name = match[1];
    if (name === undefined || name === '__construct') {
      continue;
    }
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    const body = source.slice(start, end);

    const argumentNames = new Set<string>();
    for (const argument of body.matchAll(GET_ARG)) {
      const argumentName = argument[1] ?? argument[2];
      if (argumentName !== undefined) {
        argumentNames.add(argumentName);
      }
    }
    for (const argument of body.matchAll(REQUEST_ARG)) {
      const argumentName = argument[1] ?? argument[2];
      if (argumentName !== undefined) {
        argumentNames.add(argumentName);
      }
    }
    if (/getArg\s*\(\s*\$/u.test(body)) {
      unsupported.push(`entry point ${name} reads a computed argument name`);
    }

    entries.push({ action: name, argumentNames: [...argumentNames].sort() });
  }

  return { value: entries, unsupported };
}

/** Names of the methods a PHP source declares. */
export function parsePhpMethodNames(source: string): readonly string[] {
  return [...source.matchAll(PHP_FUNCTION)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}
