/**
 * Textual readers for the PHP a BGA project is written in.
 *
 * Nothing here executes project code. Every helper reads source as text and
 * returns null when the construct is not one it can interpret, so a caller can
 * report what it could not read rather than guess at it.
 *
 * The first thing all of them need is to tell code from content: a state
 * description is a translated string that may contain any bracket or quote at
 * all, so a reader that counts brackets in raw source will lose its place.
 * `maskLiterals` blanks string and comment content while keeping every offset,
 * and the rest of this module works on the masked copy and slices the original.
 */

const CLOSERS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
const OPEN = new Set(Object.keys(CLOSERS));
const CLOSE = new Set(Object.values(CLOSERS));

function blank(text: string): string {
  // Newlines survive so that offsets and line counts both stay usable.
  return text.replace(/[^\n]/gu, ' ');
}

/**
 * Replaces the content of strings and comments with spaces, offset for offset.
 *
 * Quotes and comment markers stay, so the masked copy is still valid to scan
 * for structure, and any slice taken from the original text at masked offsets
 * is the real source.
 */
export function maskLiterals(source: string): string {
  let result = '';
  let index = 0;

  while (index < source.length) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (character === "'" || character === '"') {
      const quote = character;
      let end = index + 1;
      while (end < source.length) {
        const inner = source[end];
        if (inner === '\\' && quote === '"') {
          end += 2;
          continue;
        }
        if (
          inner === '\\' &&
          quote === "'" &&
          (source[end + 1] === '\\' || source[end + 1] === "'")
        ) {
          end += 2;
          continue;
        }
        if (inner === quote) {
          break;
        }
        end += 1;
      }
      const stop = Math.min(end, source.length);
      result += quote + blank(source.slice(index + 1, stop)) + (stop < source.length ? quote : '');
      index = stop + 1;
      continue;
    }

    // A heredoc body is content, not code, and may contain any bracket. The
    // slice only happens at a `<`, so scanning stays linear in the source.
    const heredoc =
      character === '<'
        ? /^<<<\s*(?:'([A-Za-z_]\w*)'|"?([A-Za-z_]\w*)"?)\r?\n/u.exec(source.slice(index))
        : null;
    if (heredoc !== null) {
      const label = heredoc[1] ?? heredoc[2] ?? '';
      const body = source.slice(index + heredoc[0].length);
      const closing = new RegExp(`^[ \\t]*${label}\\b`, 'mu').exec(body);
      const stop = index + heredoc[0].length + (closing === null ? body.length : closing.index);
      result += blank(source.slice(index, stop));
      index = stop;
      continue;
    }

    // `#[` opens an attribute, which is code. A lone `#` opens a comment.
    const lineComment = (character === '/' && next === '/') || (character === '#' && next !== '[');
    if (lineComment || (character === '/' && next === '*')) {
      const close = lineComment ? source.indexOf('\n', index) : source.indexOf('*/', index);
      const stop = close === -1 ? source.length : close + (lineComment ? 0 : 2);
      result += blank(source.slice(index, stop));
      index = stop;
      continue;
    }

    result += character;
    index += 1;
  }

  return result;
}

export interface BracketSpan {
  /** Offset of the opening bracket. */
  readonly start: number;
  /** Offset of the matching closing bracket. */
  readonly end: number;
}

/** Finds the bracket matching the one at `openIndex`, in masked source. */
export function matchBracket(masked: string, openIndex: number): BracketSpan | null {
  if (!OPEN.has(masked[openIndex] ?? '')) {
    return null;
  }
  let depth = 0;
  for (let index = openIndex; index < masked.length; index += 1) {
    const character = masked[index] ?? '';
    if (OPEN.has(character)) {
      depth += 1;
    } else if (CLOSE.has(character)) {
      depth -= 1;
      if (depth === 0) {
        return { start: openIndex, end: index };
      }
    }
  }
  return null;
}

/** Splits masked text on top-level separators, returning offsets into it. */
export function splitTopLevel(
  masked: string,
  from: number,
  to: number,
  separator = ',',
): { start: number; end: number }[] {
  const parts: { start: number; end: number }[] = [];
  let depth = 0;
  let start = from;
  for (let index = from; index < to; index += 1) {
    const character = masked[index] ?? '';
    if (OPEN.has(character)) {
      depth += 1;
    } else if (CLOSE.has(character)) {
      depth -= 1;
    } else if (character === separator && depth === 0) {
      parts.push({ start, end: index });
      start = index + 1;
    }
  }
  if (start < to) {
    parts.push({ start, end: to });
  }
  return parts.filter((part) => masked.slice(part.start, part.end).trim() !== '');
}

const TRANSLATION_CALL = /^(?:clienttranslate|totranslate)\s*\(([\s\S]*)\)$/u;

/**
 * Reads a literal string, including the translated form descriptions use.
 *
 * `clienttranslate('${actplayer} must play')` is the documented way to write a
 * state description, so the reader unwraps it rather than treating a
 * translated description as unreadable.
 */
export function readStringLiteral(expression: string): string | null {
  const text = expression.trim();
  const translated = TRANSLATION_CALL.exec(text);
  if (translated !== null) {
    return readStringLiteral(translated[1] ?? '');
  }
  const quoted = /^'([\s\S]*)'$/u.exec(text) ?? /^"([\s\S]*)"$/u.exec(text);
  if (quoted === null) {
    return null;
  }
  const value = quoted[1] ?? '';
  return value.includes(text[0] ?? '') ? null : value;
}

export interface PhpSource {
  readonly path: string;
  readonly text: string;
}

/**
 * Collects the integer constants a project declares.
 *
 * Both documented forms are read: the `define('STATE_END_GAME', 99)` calls the
 * states file uses, and the `class StateConstants { const … }` form the state
 * classes use. Class constants are keyed by their class so that two classes
 * can declare the same name.
 */
export function collectIntConstants(sources: readonly PhpSource[]): Map<string, number> {
  const constants = new Map<string, number>();

  for (const source of sources) {
    const masked = maskLiterals(source.text);

    for (const match of source.text.matchAll(
      /\bdefine\s*\(\s*['"]([A-Za-z_]\w*)['"]\s*,\s*(-?\d+)\s*\)/gu,
    )) {
      constants.set(match[1] ?? '', Number(match[2]));
    }

    const classes = [...masked.matchAll(/\b(?:class|enum|interface|trait)\s+([A-Za-z_]\w*)/gu)];
    for (const match of masked.matchAll(/\bconst\s+([A-Za-z_]\w*)\s*=\s*(-?\d+)\s*;/gu)) {
      const name = match[1] ?? '';
      const owner = classes.filter((entry) => entry.index < match.index).at(-1)?.[1];
      constants.set(owner === undefined ? name : `${owner}::${name}`, Number(match[2]));
    }
  }

  return constants;
}

/**
 * Resolves an expression that must be a state identifier.
 *
 * Returns null for anything that is not a literal or a constant this reader
 * collected, because the only other way to know its value is to run the
 * project.
 */
export function resolveIntExpression(
  expression: string,
  constants: ReadonlyMap<string, number>,
  selfClass?: string,
): number | null {
  const text = expression
    .trim()
    .replace(/^\(|\)$/gu, '')
    .trim();
  if (/^-?\d+$/u.test(text)) {
    return Number(text);
  }

  const qualified = /^\\?(?:[A-Za-z_]\w*\\)*([A-Za-z_]\w*)::([A-Za-z_]\w*)$/u.exec(text);
  if (qualified !== null) {
    const owner = qualified[1] ?? '';
    const name = qualified[2] ?? '';
    const declaring = owner === 'self' || owner === 'static' ? selfClass : owner;
    return declaring === undefined ? null : (constants.get(`${declaring}::${name}`) ?? null);
  }

  return /^[A-Za-z_]\w*$/u.test(text) ? (constants.get(text) ?? null) : null;
}

export interface PhpMethod {
  readonly name: string;
  /** Attribute text declared above the method, such as `#[PossibleAction]`. */
  readonly attributes: string;
  readonly parameters: string;
  readonly body: string;
}

const FUNCTION = /\bfunction\s+([A-Za-z_]\w*)\s*\(/gu;

/** Reads the functions a PHP source declares, with their attributes and bodies. */
export function readMethods(source: string): PhpMethod[] {
  const masked = maskLiterals(source);
  const methods: PhpMethod[] = [];

  for (const match of masked.matchAll(FUNCTION)) {
    const parameters = matchBracket(masked, match.index + match[0].length - 1);
    if (parameters === null) {
      continue;
    }

    // Everything between the signature and the body is the return type; a
    // declaration that ends in `;` instead has no body to read.
    const brace = masked.indexOf('{', parameters.end);
    const semicolon = masked.indexOf(';', parameters.end);
    const hasBody = brace !== -1 && (semicolon === -1 || brace < semicolon);
    const body = hasBody ? matchBracket(masked, brace) : null;

    methods.push({
      name: match[1] ?? '',
      attributes: attributesBefore(masked, match.index),
      parameters: source.slice(parameters.start + 1, parameters.end),
      body: body === null ? '' : source.slice(body.start + 1, body.end),
    });
  }

  return methods;
}

/** How far back a modifier list can reach from the `function` keyword. */
const MODIFIER_WINDOW = 128;

/** Reads the attribute block immediately above an offset, if any. */
function attributesBefore(masked: string, offset: number): string {
  const modifiers = /(?:(?:public|protected|private|static|final|abstract|readonly)\s+)*$/u.exec(
    masked.slice(Math.max(0, offset - MODIFIER_WINDOW), offset),
  );
  let end = offset - (modifiers?.[0].length ?? 0);
  let attributes = '';

  for (;;) {
    while (end > 0 && /\s/u.test(masked[end - 1] ?? '')) {
      end -= 1;
    }
    const close = end - 1;
    if (masked[close] !== ']') {
      return attributes;
    }
    const open = masked.lastIndexOf('#[', close);
    if (open === -1 || matchBracket(masked, open + 1)?.end !== close) {
      return attributes;
    }
    attributes = `${masked.slice(open, close + 1)} ${attributes}`.trim();
    end = open;
  }
}

/**
 * Reads the expressions a body returns.
 *
 * `return;` yields nothing, because the framework documents it as the way to
 * stay in the current state.
 */
export function returnExpressions(body: string): string[] {
  const masked = maskLiterals(body);
  const expressions: string[] = [];

  for (const match of masked.matchAll(/\breturn\b/gu)) {
    const start = match.index + match[0].length;
    let depth = 0;
    let end = start;
    while (end < masked.length) {
      const character = masked[end] ?? '';
      if (OPEN.has(character)) {
        depth += 1;
      } else if (CLOSE.has(character)) {
        depth -= 1;
      } else if (character === ';' && depth === 0) {
        break;
      }
      end += 1;
    }
    const expression = body.slice(start, end).trim();
    if (expression !== '') {
      expressions.push(expression);
    }
  }

  return expressions;
}
