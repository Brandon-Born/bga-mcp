import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

/**
 * A scenario is declared by prefixing a test title with one or more bracketed
 * identifiers, for example:
 *
 *   it('[INT-POLICY-TIMEOUT] aborts a slow operation', …)
 *
 * The declaration is what links an executable test to a manifest entry, a
 * threat-model mitigation, or a compatibility claim. It proves the test exists
 * and runs in `pnpm check`; the test run itself proves it passes.
 *
 * Which is why a declaration has to be a test, and has to be one that runs.
 * The identifier alone means nothing: the same characters in fixture data, in a
 * comment, or in the title of a skipped test would otherwise satisfy the
 * existence gate while nothing was ever asserted. So only the title argument of
 * a runnable test call counts, and a suite or case that is skipped, todo, or
 * marked `.failing` is recorded as declared-but-not-runnable rather than as
 * evidence.
 */

/** Modifiers that stop a case from running, or from having to pass. */
const INERT_MODIFIER = /\.(?:skip|todo|failing|skipIf|runIf)\b/u;

/** A test call and its modifier chain, up to the opening bracket. */
const TEST_CALL = /\b(?:it|test)((?:\.[A-Za-z]+)*)\s*\(/gu;
/** A `describe` block, so a skipped suite disables the cases inside it. */
const DESCRIBE_CALL = /\bdescribe((?:\.[A-Za-z]+)*)\s*\(/gu;
/** A title made only of bracketed identifiers, at the very start. */
const TITLE = /^\s*['"`]((?:\[[A-Z0-9]+(?:-[A-Z0-9]+)+\])+)/u;

const IDENTIFIER = /\[([A-Z0-9]+(?:-[A-Z0-9]+)+)\]/gu;

/** After these, a `/` opens a regular expression rather than dividing. */
const BEFORE_REGEX = /[([{,;:=!&|?+\-*%~^]$|\b(?:return|typeof|case|in|of|new|delete|void)$/u;

/**
 * Blanks string, comment, and regular-expression content, offset for offset.
 *
 * Bracket counting has to happen on something that cannot be thrown off by a
 * bracket inside a title, a URL, or a commented-out test — and a commented-out
 * test is exactly the kind of thing that must not count as evidence. Regular
 * expressions matter for the same reason: this repository has patterns holding
 * an unpaired quote, such as `["'][^"']{8,}`, which would otherwise open a
 * string that never closes.
 */
function maskSource(source: string): string {
  const blank = (text: string): string => text.replace(/[^\n]/gu, ' ');
  let result = '';
  let index = 0;
  /** The last code character seen, used to tell a regex from a division. */
  let previous = '';

  const keep = (text: string): void => {
    result += text;
    const trimmed = text.trimEnd();
    previous = trimmed === '' ? previous : trimmed;
  };

  while (index < source.length) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (character === "'" || character === '"' || character === '`') {
      let end = index + 1;
      while (end < source.length && source[end] !== character) {
        end += source[end] === '\\' ? 2 : 1;
      }
      const stop = Math.min(end, source.length);
      result += character + blank(source.slice(index + 1, stop));
      if (stop < source.length) {
        result += character;
      }
      index = stop + 1;
      previous = character;
      continue;
    }

    if (character === '/' && (next === '/' || next === '*')) {
      const close = next === '/' ? source.indexOf('\n', index) : source.indexOf('*/', index);
      const stop = close === -1 ? source.length : close + (next === '/' ? 0 : 2);
      result += blank(source.slice(index, stop));
      index = stop;
      continue;
    }

    if (character === '/' && BEFORE_REGEX.test(previous)) {
      let end = index + 1;
      let inClass = false;
      while (end < source.length && source[end] !== '\n') {
        const inner = source[end];
        if (inner === '\\') {
          end += 2;
          continue;
        }
        if (inner === '[') {
          inClass = true;
        } else if (inner === ']') {
          inClass = false;
        } else if (inner === '/' && !inClass) {
          break;
        }
        end += 1;
      }
      const stop = Math.min(end, source.length);
      result += `/${blank(source.slice(index + 1, stop))}`;
      if (source[stop] === '/') {
        result += '/';
      }
      index = stop + 1;
      previous = '/';
      continue;
    }

    keep(character);
    index += 1;
  }

  return result;
}

/** Finds the bracket matching the one at `open`, in masked source. */
function matchBracket(masked: string, open: number): number {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    const character = masked[index];
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
    } else if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

export interface ScenarioDeclaration {
  readonly id: string;
  /** Repository-relative file the declaration is in. */
  readonly file: string;
  /** False when the test, or a suite containing it, cannot run or cannot fail. */
  readonly runnable: boolean;
  /** Why it is not runnable, for the gate's message. */
  readonly reason?: string;
}

export async function listFiles(directory: string, suffix = '.ts'): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return await listFiles(path, suffix);
      }
      return path.endsWith(suffix) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

/** The spans of every suite that cannot run, with the modifier that stops it. */
function inertSuites(masked: string): { start: number; end: number; label: string }[] {
  const suites: { start: number; end: number; label: string }[] = [];
  for (const match of masked.matchAll(DESCRIBE_CALL)) {
    const modifiers = match[1] ?? '';
    if (!INERT_MODIFIER.test(modifiers)) {
      continue;
    }
    // A suite governs exactly its own argument list, which is where its
    // callback — and so every case it contains — lives.
    const open = match.index + match[0].length - 1;
    const close = matchBracket(masked, open);
    suites.push({
      start: open,
      end: close === -1 ? masked.length : close,
      label: `describe${modifiers}`,
    });
  }
  return suites;
}

/**
 * Reads the title argument of a test call, in either shape.
 *
 * `it('[ID] …')` puts the title first. `it.each(table)('[ID] …')` puts it in a
 * second argument list, after the table, so the first list is stepped over.
 */
function titleAfter(masked: string, source: string, open: number): string | null {
  const direct = TITLE.exec(source.slice(open + 1, matchBracket(masked, open)));
  if (direct !== null) {
    return direct[1] ?? null;
  }
  const close = matchBracket(masked, open);
  if (close === -1) {
    return null;
  }
  const second = /^\s*\(/u.exec(masked.slice(close + 1));
  if (second === null) {
    return null;
  }
  const secondOpen = close + second[0].length;
  const secondClose = matchBracket(masked, secondOpen);
  return (
    TITLE.exec(source.slice(secondOpen + 1, secondClose === -1 ? undefined : secondClose))?.[1] ??
    null
  );
}

/** Every scenario declaration in the test tree, runnable or not. */
export async function collectDeclarations(testsRoot: string): Promise<ScenarioDeclaration[]> {
  const declarations: ScenarioDeclaration[] = [];

  for (const file of await listFiles(testsRoot)) {
    const source = await readFile(file, 'utf8');
    const masked = maskSource(source);
    const location = relative(testsRoot, file).split(sep).join('/');
    const suites = inertSuites(masked);

    for (const call of masked.matchAll(TEST_CALL)) {
      const open = call.index + call[0].length - 1;
      const title = titleAfter(masked, source, open);
      if (title === null) {
        continue;
      }

      const modifiers = call[1] ?? '';
      const inert = INERT_MODIFIER.test(modifiers)
        ? `it${modifiers}`
        : (suites.find((suite) => suite.start < call.index && call.index < suite.end)?.label ??
          null);

      for (const identifier of title.matchAll(IDENTIFIER)) {
        const id = identifier[1];
        if (id === undefined) {
          continue;
        }
        declarations.push({
          id,
          file: location,
          runnable: inert === null,
          ...(inert === null ? {} : { reason: `declares it inside ${inert}` }),
        });
      }
    }
  }

  return declarations;
}

/**
 * Maps every runnable scenario declaration to the test files that declare it.
 *
 * A declaration that cannot run is deliberately absent: to this map, a skipped
 * test and no test at all are the same thing.
 */
export async function collectDeclaredScenarios(testsRoot: string): Promise<Map<string, string[]>> {
  const declared = new Map<string, string[]>();
  for (const declaration of await collectDeclarations(testsRoot)) {
    if (!declaration.runnable) {
      continue;
    }
    declared.set(declaration.id, [...(declared.get(declaration.id) ?? []), declaration.file]);
  }
  return declared;
}
