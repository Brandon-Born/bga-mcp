import type { ParseOutcome } from './parse.js';
import { matchBracket, maskLiterals, splitTopLevel as splitArguments } from './php.js';

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
  readonly text: string;
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
function splitColumns(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of body) {
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

function tableBody(source: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
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
export function parseSchema(sql: string): ParseOutcome<readonly TableDefinition[]> {
  const tables: TableDefinition[] = [];
  const unsupported: string[] = [];
  const withoutComments = sql.replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '');

  for (const match of withoutComments.matchAll(CREATE_TABLE)) {
    const name = match[1];
    if (name === undefined) {
      continue;
    }
    const body = tableBody(withoutComments, match.index + match[0].length - 1);
    const columns: string[] = [];
    for (const entry of splitColumns(body)) {
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
const SQL_START = /^\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/iu;
const TABLE_CLAUSE =
  /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`"]?([A-Za-z_][\w]*)[`"]?/giu;
const QUALIFIED_COLUMN = /\b([A-Za-z_][\w]*)\s*\.\s*([A-Za-z_][\w]*)\b/gu;
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
function assignments(php: string, masked: string): { name: string; end: number; value: string }[] {
  const found: { name: string; end: number; value: string }[] = [];
  for (const match of masked.matchAll(ASSIGNMENT)) {
    const start = match.index + match[0].length;
    let depth = 0;
    let end = start;
    while (end < masked.length) {
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
): { text: string } | { unreadable: string } {
  const literal = /^\s*(["'])([\s\S]*)\1\s*$/u.exec(argument);
  if (literal !== null) {
    return { text: literal[2] ?? '' };
  }

  const variable = /^\s*\$([A-Za-z_]\w*)\s*$/u.exec(argument);
  if (variable === null) {
    return {
      unreadable: `a query argument this reader cannot follow: ${argument.trim().slice(0, 60)}`,
    };
  }

  const name = variable[1] ?? '';
  const assigned = assignments(php, masked)
    .filter((entry) => entry.name === name && entry.end < callIndex)
    .at(-1);
  if (assigned === undefined) {
    return { unreadable: `a query in $${name}, which is assigned outside this file` };
  }
  const assignedLiteral = /^\s*(["'])([\s\S]*)\1\s*$/u.exec(assigned.value);
  if (assignedLiteral === null) {
    return {
      unreadable: `a query assembled into $${name}: ${assigned.value.replace(/\s+/gu, ' ').trim().slice(0, 60)}`,
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
export function parseQueries(php: string): ParseOutcome<readonly QueryReference[]> {
  const queries: QueryReference[] = [];
  const unsupported: string[] = [];
  const masked = maskLiterals(php);

  for (const call of masked.matchAll(HELPER_CALL)) {
    const helper = call[1] ?? '';
    const span = matchBracket(masked, call.index + call[0].length - 1);
    if (span === null) {
      continue;
    }
    const first = splitArguments(masked, span.start + 1, span.end)[0];
    if (first === undefined) {
      unsupported.push(`${helper} called with no query`);
      continue;
    }

    const resolved = resolveQueryText(php.slice(first.start, first.end), call.index, php, masked);
    if ('unreadable' in resolved) {
      unsupported.push(`${helper} runs ${resolved.unreadable}`);
      continue;
    }
    const text = resolved.text;
    if (!SQL_START.test(text)) {
      unsupported.push(
        `${helper} runs a statement this reader does not recognize: ${text.replace(/\s+/gu, ' ').trim().slice(0, 60)}`,
      );
      continue;
    }

    const tables = [
      ...new Set(
        [...text.matchAll(TABLE_CLAUSE)]
          .map((clause) => clause[1])
          .filter((name): name is string => name !== undefined),
      ),
    ];
    const columns = new Set<string>();
    for (const qualified of text.matchAll(QUALIFIED_COLUMN)) {
      const table = qualified[1];
      const column = qualified[2];
      if (table !== undefined && column !== undefined) {
        columns.add(`${table}.${column}`);
      }
    }

    // Bare identifiers can only be attributed to a table when the query names
    // exactly one. Anything else stays unattributed rather than guessed.
    const singleTable = tables.length === 1 ? tables[0] : undefined;
    if (singleTable !== undefined) {
      const withoutQualified = scrub(text).replace(QUALIFIED_COLUMN, ' ');
      for (const identifier of withoutQualified.matchAll(
        /[`"]?\b([A-Za-z_][\w]*)\b[`"]?\s*(\()?/gu,
      )) {
        const name = identifier[1];
        if (
          name === undefined ||
          identifier[2] !== undefined ||
          SQL_KEYWORDS.has(name.toLowerCase()) ||
          name === singleTable
        ) {
          continue;
        }
        columns.add(`${singleTable}.${name}`);
      }
    } else if (tables.length > 1) {
      unsupported.push(
        `columns of a multi-table query could not be attributed: ${text.slice(0, 40)}`,
      );
    }

    queries.push({
      tables,
      columns: [...columns].sort(),
      interpolated: INTERPOLATION.test(text),
      text: text.replace(/\s+/gu, ' ').trim(),
    });
  }

  return { value: queries, unsupported };
}
