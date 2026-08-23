import type { ParseOutcome } from './parse.js';
import { matchBracket, maskLiterals, splitTopLevel as splitArguments } from './php.js';
import { cancellationCheckpoint, periodicCancellationCheckpoint } from '../deadline.js';

/**
 * Readers for a BGA project's database schema and the queries that use it.
 *
 * `dbmodel.sql` declares the tables a game owns; the PHP sources query them.
 * Neither side is executed here: the schema is read as text, and a query
 * assembled at runtime is reported rather than reconstructed.
 */

export interface TableDefinition {
  readonly name: string;
  readonly columns: readonly string[];
}

export interface QueryReference {
  /** Tables the query names in FROM, JOIN, INSERT INTO, UPDATE, or DELETE FROM. */
  readonly tables: readonly string[];
  /** Columns the query names, qualified ones resolved to `table.column`. */
  readonly columns: readonly string[];
  /** True when a PHP variable is interpolated into the query text. */
  readonly interpolated: boolean;
  /** The query with its values masked. See {@link maskSqlValues}. */
  readonly text: string;
}

/**
 * Masks the values in a query, keeping the shape that makes it fixable.
 *
 * A query is analysed for its structure and reported so a developer can find
 * it. Its values are neither: they are data that happened to be typed into
 * source, and one of them was a password in the project the 2026-08-08 review
 * ran against. The documentation puts them in exactly one place — the framework
 * escape helper "makes sure that no SQL injection will be done through the
 * string used, as long as the SQL statement uses single quotes around the
 * string. This is important!" — so a quoted run is where a value is, and
 * replacing its contents costs the reader nothing they were using.
 *
 * Interpolations survive the mask. `WHERE name='$name'` keeps `$name`, because
 * which variable reaches the query is the whole content of the interpolation
 * finding, and a variable name is not a value.
 *
 * Both quotings are read: SQL inside a double-quoted PHP string carries plain
 * `'…'`, and inside a single-quoted one the same literal arrives escaped as
 * `\'…\'`.
 *
 * Source: [Main game logic](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php).
 */
export function maskSqlValues(text: string, signal?: AbortSignal): string {
  cancellationCheckpoint(signal);
  const interpolation = /\{\s*\$[^}]*\}|\$[A-Za-z_][\w]*(?:\s*->\s*[A-Za-z_][\w]*)*/gu;
  const maskContents = (contents: string): string => {
    let masked = '';
    let index = 0;
    for (const found of contents.matchAll(interpolation)) {
      cancellationCheckpoint(signal);
      masked += (found.index > index ? '?' : '') + found[0];
      index = found.index + found[0].length;
    }
    return masked + (index < contents.length || masked === '' ? '?' : '');
  };

  return text.replace(
    /\\'[\s\S]*?\\'|\\"[\s\S]*?\\"|'[^']*'|"[^"]*"/gu,
    (literal: string): string => {
      cancellationCheckpoint(signal);
      const escaped = literal.startsWith('\\');
      const quote = escaped ? literal.slice(0, 2) : literal.slice(0, 1);
      const contents = literal.slice(quote.length, literal.length - quote.length);
      return `${quote}${maskContents(contents)}${quote}`;
    },
  );
}

const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z_][\w]*)[`"]?\s*\(/giu;

/** Words that begin a table constraint rather than a column definition. */
const CONSTRAINT_STARTS = new Set([
  'primary',
  'unique',
  'key',
  'index',
  'constraint',
  'foreign',
  'fulltext',
  'spatial',
  'check',
]);

/** SQL keywords a bare identifier in a query may be, rather than a column. */
const SQL_KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'and',
  'or',
  'not',
  'null',
  'is',
  'in',
  'as',
  'on',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'group',
  'by',
  'order',
  'having',
  'limit',
  'offset',
  'insert',
  'into',
  'values',
  'update',
  'set',
  'delete',
  'distinct',
  'count',
  'sum',
  'min',
  'max',
  'avg',
  'asc',
  'desc',
  'like',
  'between',
  'union',
  'all',
  'case',
  'when',
  'then',
  'else',
  'end',
  'true',
  'false',
  'default',
  'if',
  'ifnull',
  'coalesce',
  'concat',
  'now',
  'rand',
  'exists',
  'duplicate',
]);

/** Splits a CREATE TABLE body on its top-level commas. */
function splitColumns(body: string, signal?: AbortSignal): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let index = 0; index < body.length; index += 1) {
    periodicCancellationCheckpoint(index, signal);
    const character = body[index] ?? '';
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth < 0) {
        break;
      }
    }
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim() !== '') {
    parts.push(current);
  }
  return parts;
}

function tableBody(source: string, openIndex: number, signal?: AbortSignal): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    periodicCancellationCheckpoint(index - openIndex, signal);
    const character = source[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }
  return source.slice(openIndex + 1);
}

/** Reads the tables and columns `dbmodel.sql` declares. */
export function parseSchema(
  sql: string,
  signal?: AbortSignal,
): ParseOutcome<readonly TableDefinition[]> {
  cancellationCheckpoint(signal);
  const tables: TableDefinition[] = [];
  const unsupported: string[] = [];
  const withoutComments = sql.replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '');

  for (const match of withoutComments.matchAll(CREATE_TABLE)) {
    cancellationCheckpoint(signal);
    const name = match[1];
    if (name === undefined) {
      continue;
    }
    const body = tableBody(withoutComments, match.index + match[0].length - 1, signal);
    const columns: string[] = [];
    for (const entry of splitColumns(body, signal)) {
      cancellationCheckpoint(signal);
      const trimmed = entry.trim();
      if (trimmed === '') {
        continue;
      }
      const first = /^[`"]?([A-Za-z_][\w]*)[`"]?/u.exec(trimmed)?.[1];
      if (first === undefined) {
        continue;
      }
      if (CONSTRAINT_STARTS.has(first.toLowerCase())) {
        continue;
      }
      columns.push(first);
    }
    tables.push({ name, columns });
  }

  if (tables.length === 0 && /CREATE\s+TABLE/iu.test(withoutComments)) {
    unsupported.push('a CREATE TABLE statement that could not be read');
  }
  cancellationCheckpoint(signal);
  return { value: tables, unsupported };
}

/**
 * The methods that actually reach the database.
 *
 * "All methods below are part of game class (and view class) and can be
 * accessed using $this->". `DbQuery` "is the generic method to access the
 * database"; the rest are the specialized SELECT helpers the same page
 * documents. A string that never reaches one of these runs nothing.
 */
export const DATABASE_HELPERS = [
  'DbQuery',
  'getUniqueValueFromDB',
  'getCollectionFromDB',
  'getNonEmptyCollectionFromDB',
  'getObjectFromDB',
  'getNonEmptyObjectFromDB',
  'getObjectListFromDB',
  'getDoubleKeyCollectionFromDB',
] as const;

const HELPER_CALL = new RegExp(`(?:->|::)\\s*(${DATABASE_HELPERS.join('|')})\\s*\\(`, 'gu');
/** `$sql = …;`, so a query assigned before its call can be followed. */
const ASSIGNMENT = /\$([A-Za-z_]\w*)\s*(\.?=)\s*/gu;
const SQL_START = /^\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE|WITH)\b/iu;
const TABLE_CLAUSE =
  /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([`"]?)([A-Za-z_]\w*)\1/giu;
const QUALIFIED_COLUMN = /([`"]?)([A-Za-z_]\w*)\1\s*\.\s*([`"]?)([A-Za-z_]\w*|\*)\3/gu;
const INTERPOLATION = /\$[A-Za-z_][\w]*|\{\s*\$/u;

/**
 * Removes what is not a column reference: SQL string values, escaped string
 * values, and interpolated PHP variables. Without this, `WHERE location =
 * 'hand'` would report `hand` as a column of the table.
 */
function scrub(text: string): string {
  return text
    .replace(/\\'[\s\S]*?\\'/gu, ' ')
    .replace(/\\"[\s\S]*?\\"/gu, ' ')
    .replace(/'[^']*'/gu, ' ')
    .replace(/\{\s*\$[^}]*\}/gu, ' ')
    .replace(/\$[A-Za-z_][\w]*(?:\s*->\s*[A-Za-z_][\w]*)*/gu, ' ');
}

/** The literal value assigned to each variable, by offset of the assignment. */
function assignments(
  php: string,
  masked: string,
  signal?: AbortSignal,
): { name: string; end: number; value: string }[] {
  const found: { name: string; end: number; value: string }[] = [];
  for (const match of masked.matchAll(ASSIGNMENT)) {
    cancellationCheckpoint(signal);
    const start = match.index + match[0].length;
    let depth = 0;
    let end = start;
    while (end < masked.length) {
      periodicCancellationCheckpoint(end - start, signal);
      const character = masked[end] ?? '';
      if (character === '(' || character === '[') {
        depth += 1;
      } else if (character === ')' || character === ']') {
        depth -= 1;
      } else if (character === ';' && depth === 0) {
        break;
      }
      end += 1;
    }
    found.push({
      name: match[1] ?? '',
      end,
      // An appending assignment is never a whole query on its own.
      value: match[2] === '=' ? php.slice(start, end).trim() : '',
    });
  }
  return found;
}

/**
 * A short quotation of source, masked before it is cut.
 *
 * Cutting first would leave half a literal — and half a password is still a
 * published password.
 */
function snippet(source: string, length = 60, signal?: AbortSignal): string {
  return maskSqlValues(source, signal).replace(/\s+/gu, ' ').trim().slice(0, length);
}

interface QueryStructure {
  readonly tables: readonly string[];
  readonly aliases: ReadonlyMap<string, string>;
}

/** Reads underlying tables and their explicit or implicit aliases. */
function queryStructure(text: string, signal?: AbortSignal): QueryStructure {
  const tables: string[] = [];
  const aliases = new Map<string, string>();
  for (const clause of text.matchAll(TABLE_CLAUSE)) {
    cancellationCheckpoint(signal);
    const table = clause[2];
    if (table === undefined) continue;
    if (!tables.includes(table)) tables.push(table);
    aliases.set(table, table);
    const alias = /^\s+(?:AS\s+)?([`"]?)([A-Za-z_]\w*)\1/iu.exec(
      text.slice(clause.index + clause[0].length),
    )?.[2];
    if (alias !== undefined && !SQL_KEYWORDS.has(alias.toLowerCase())) aliases.set(alias, table);
  }
  return { tables, aliases };
}

function simpleColumn(
  expression: string,
  structure: QueryStructure,
): { table: string | null; column: string } | null {
  const match = /^\s*(?:([`"]?)([A-Za-z_]\w*)\1\s*\.\s*)?([`"]?)([A-Za-z_]\w*)\3\s*$/u.exec(
    expression,
  );
  if (match === null) return null;
  const qualifier = match[2];
  const column = match[4];
  if (column === undefined) return null;
  if (qualifier === undefined) {
    return {
      table: structure.tables.length === 1 ? (structure.tables[0] ?? null) : null,
      column,
    };
  }
  return { table: structure.aliases.get(qualifier) ?? null, column };
}

interface SelectListReading {
  readonly columns: readonly string[];
  readonly unsupported: readonly string[];
  readonly withoutList: string;
}

/** Reads SELECT expressions without treating result aliases as schema columns. */
function readSelectList(
  text: string,
  structure: QueryStructure,
  signal?: AbortSignal,
): SelectListReading {
  const select = /\bSELECT\b/iu.exec(text);
  const afterSelect = select === null ? 0 : select.index + select[0].length;
  const from = /\bFROM\b/iu.exec(text.slice(afterSelect));
  if (select === null || from === null) {
    return {
      columns: [],
      unsupported: ['a SELECT statement without a readable FROM clause'],
      withoutList: text,
    };
  }
  const start = afterSelect;
  const end = start + from.index;
  const list = text.slice(start, end).replace(/^\s*DISTINCT\b/iu, ' ');
  const columns = new Set<string>();
  const unsupported: string[] = [];

  for (const rawItem of splitColumns(list, signal)) {
    cancellationCheckpoint(signal);
    const item = rawItem.trim();
    if (item === '' || item === '*') continue;
    const alias = /^(.*?)(?:\s+AS\s+|\s+)([`"]?)([A-Za-z_]\w*)\2\s*$/iu.exec(item);
    const expression = (alias?.[1] ?? item).trim();
    if (/^(?:([`"]?)[A-Za-z_]\w*\1\s*\.\s*)?\*$/u.test(expression)) continue;

    const direct = simpleColumn(expression, structure);
    if (direct?.table !== null && direct !== null) {
      columns.add(`${direct.table}.${direct.column}`);
      continue;
    }

    const aggregate = /^(?:COUNT|SUM|MIN|MAX|AVG)\s*\(\s*([\s\S]+)\s*\)$/iu.exec(expression);
    const aggregateExpression = aggregate?.[1];
    const aggregateColumn =
      aggregateExpression === undefined || aggregateExpression === '*'
        ? null
        : simpleColumn(aggregateExpression, structure);
    if (aggregate !== null && aggregateColumn?.table !== null) {
      if (aggregateColumn !== null) {
        columns.add(`${aggregateColumn.table}.${aggregateColumn.column}`);
      }
      continue;
    }

    unsupported.push(
      `SELECT expression whose column provenance is unclear: ${snippet(item, 40, signal)}`,
    );
  }

  return {
    columns: [...columns],
    unsupported,
    withoutList: `${text.slice(0, start)}${' '.repeat(Math.max(0, end - start))}${text.slice(end)}`,
  };
}

/**
 * Resolves the SQL an argument carries, or says why it could not.
 *
 * A string is only a query when data flow puts it in a helper call, so the
 * argument is followed one step: a literal is read, a variable is resolved to
 * the last literal assigned to it before the call, and anything else — a
 * concatenation, a method call, a value from elsewhere — is left unresolved
 * rather than reconstructed.
 */
function resolveQueryText(
  argument: string,
  callIndex: number,
  php: string,
  masked: string,
  signal?: AbortSignal,
): { text: string } | { unreadable: string } {
  cancellationCheckpoint(signal);
  const literal = /^\s*(["'])([\s\S]*)\1\s*$/u.exec(argument);
  if (literal !== null) {
    return { text: literal[2] ?? '' };
  }

  const variable = /^\s*\$([A-Za-z_]\w*)\s*$/u.exec(argument);
  if (variable === null) {
    return {
      unreadable: `a query argument this reader cannot follow: ${snippet(argument, 60, signal)}`,
    };
  }

  const name = variable[1] ?? '';
  const assigned = assignments(php, masked, signal)
    .filter((entry) => entry.name === name && entry.end < callIndex)
    .at(-1);
  if (assigned === undefined) {
    return { unreadable: `a query in $${name}, which is assigned outside this file` };
  }
  const assignedLiteral = /^\s*(["'])([\s\S]*)\1\s*$/u.exec(assigned.value);
  if (assignedLiteral === null) {
    return {
      unreadable: `a query assembled into $${name}: ${snippet(assigned.value, 60, signal)}`,
    };
  }
  return { text: assignedLiteral[2] ?? '' };
}

/**
 * Reads the SQL a PHP source runs.
 *
 * A quoted string is a query only when it reaches one of the framework's
 * documented database methods. An example in a comment, a message in an
 * exception, a template, or a variable nothing ever executes is not a query,
 * however much it looks like one — and treating it as one is how an
 * imaginary table becomes a certain finding about a real project.
 */
export function parseQueries(
  php: string,
  signal?: AbortSignal,
): ParseOutcome<readonly QueryReference[]> {
  const queries: QueryReference[] = [];
  const unsupported: string[] = [];
  const masked = maskLiterals(php, signal);

  for (const call of masked.matchAll(HELPER_CALL)) {
    cancellationCheckpoint(signal);
    const helper = call[1] ?? '';
    const span = matchBracket(masked, call.index + call[0].length - 1, signal);
    if (span === null) {
      continue;
    }
    const first = splitArguments(masked, span.start + 1, span.end, ',', signal)[0];
    if (first === undefined) {
      unsupported.push(`${helper} called with no query`);
      continue;
    }

    const resolved = resolveQueryText(
      php.slice(first.start, first.end),
      call.index,
      php,
      masked,
      signal,
    );
    if ('unreadable' in resolved) {
      unsupported.push(`${helper} runs ${resolved.unreadable}`);
      continue;
    }
    const text = resolved.text;
    if (!SQL_START.test(text)) {
      unsupported.push(
        `${helper} runs a statement this reader does not recognize: ${snippet(text, 60, signal)}`,
      );
      continue;
    }

    if (/^\s*WITH\b/iu.test(text) || /\(\s*SELECT\b/iu.test(scrub(text))) {
      unsupported.push(
        `query uses a CTE or subquery outside the supported SQL subset: ${snippet(text, 40, signal)}`,
      );
      queries.push({
        tables: [],
        columns: [],
        interpolated: INTERPOLATION.test(text),
        text: maskSqlValues(text.replace(/\s+/gu, ' ').trim(), signal),
      });
      continue;
    }

    const structure = queryStructure(text, signal);
    const tables = structure.tables;
    const columns = new Set<string>();
    let referenceText = text;
    if (/^\s*SELECT\b/iu.test(text)) {
      const selected = readSelectList(text, structure, signal);
      referenceText = selected.withoutList;
      for (const column of selected.columns) columns.add(column);
      unsupported.push(...selected.unsupported);
    }

    for (const qualified of referenceText.matchAll(QUALIFIED_COLUMN)) {
      cancellationCheckpoint(signal);
      const qualifier = qualified[2];
      const column = qualified[4];
      if (qualifier === undefined || column === undefined || column === '*') continue;
      const table = structure.aliases.get(qualifier);
      if (table === undefined) {
        unsupported.push(`qualified column ${qualifier}.${column} uses an unknown table alias`);
      } else {
        columns.add(`${table}.${column}`);
      }
    }

    // Bare identifiers can only be attributed to a table when the query names
    // exactly one. Anything else stays unattributed rather than guessed.
    const singleTable = tables.length === 1 ? tables[0] : undefined;
    const withoutQualified = scrub(referenceText).replace(QUALIFIED_COLUMN, ' ');
    const bare: string[] = [];
    for (const identifier of withoutQualified.matchAll(/[`"]?\b([A-Za-z_]\w*)\b[`"]?\s*(\()?/gu)) {
      cancellationCheckpoint(signal);
      const name = identifier[1];
      if (
        name === undefined ||
        identifier[2] !== undefined ||
        SQL_KEYWORDS.has(name.toLowerCase()) ||
        structure.aliases.has(name) ||
        tables.includes(name)
      ) {
        continue;
      }
      bare.push(name);
    }
    if (singleTable !== undefined) {
      for (const name of bare) columns.add(`${singleTable}.${name}`);
    } else if (tables.length > 1 && bare.length > 0) {
      unsupported.push(
        `bare columns of a multi-table query could not be attributed: ${snippet(text, 40, signal)}`,
      );
    }

    queries.push({
      tables,
      columns: [...columns].sort(),
      interpolated: INTERPOLATION.test(text),
      // Masked here rather than at the tool: the analysis above is the only
      // reader that needs the values, and it has already finished with them.
      text: maskSqlValues(text.replace(/\s+/gu, ' ').trim(), signal),
    });
  }

  cancellationCheckpoint(signal);
  return { value: queries, unsupported };
}
