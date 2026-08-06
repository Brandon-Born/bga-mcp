import type { ParseOutcome } from './parse.js';

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

function splitTopLevel(body: string): string[] {
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
    for (const entry of splitTopLevel(body)) {
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

const QUERY_STRING = /(["'])((?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b[\s\S]*?)\1/giu;
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

/**
 * Reads the SQL a PHP source runs.
 *
 * Recognizes query strings passed to the framework's database helpers. A
 * query whose text is concatenated from variables cannot be read as a whole
 * and is reported through its interpolation flag.
 */
export function parseQueries(php: string): ParseOutcome<readonly QueryReference[]> {
  const queries: QueryReference[] = [];
  const unsupported: string[] = [];

  for (const match of php.matchAll(QUERY_STRING)) {
    const text = match[2];
    if (text === undefined) {
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

  // A query assembled outside a single string cannot be read at all.
  for (const concatenated of php.matchAll(
    /(["'])(?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*\1\s*\./giu,
  )) {
    unsupported.push(
      `a query concatenated from more than one expression: ${concatenated[0].slice(0, 40)}`,
    );
  }

  return { value: queries, unsupported };
}
