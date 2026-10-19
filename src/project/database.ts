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

// Reader-owned provenance stays out of public query/table shapes and declarations.
const wildcardColumnsByTable = new WeakMap<TableDefinition, readonly string[]>();
const wildcardTablesByQuery = new WeakMap<QueryReference, readonly string[]>();

/** @internal Visible declared columns eligible for a qualified wildcard. */
export function schemaWildcardColumns(table: TableDefinition): readonly string[] {
  return wildcardColumnsByTable.get(table) ?? [];
}

/** @internal Uniquely bound wildcard tables supplied only by the actual reader. */
export function queryWildcardTables(query: QueryReference): readonly string[] {
  return wildcardTablesByQuery.get(query) ?? [];
}

type SchemaOutcome = ParseOutcome<readonly TableDefinition[]>;
const completedSchemaNamingReads = new WeakSet<SchemaOutcome>();

/** @internal Producer evidence; an empty/forged unsupported list is insufficient. */
export function schemaNamesFullyRead(outcome: SchemaOutcome): boolean {
  return completedSchemaNamingReads.has(outcome);
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

const SCHEMA_IDENTIFIER = /^(?:`([A-Za-z_]\w*)`|"([A-Za-z_]\w*)"|([A-Za-z_]\w*))(?=\s|$)/u;
const CREATE_TABLE =
  /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([A-Za-z_]\w*)`|"([A-Za-z_]\w*)"|([A-Za-z_]\w*))\s*\(/iu;

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

interface SchemaRegion {
  readonly start: number;
  readonly end: number;
}

/**
 * Preserve SQL structure without allowing quoted examples or comments to supply
 * declarations. BGA says "all CREATE/ALTER tables and views should be in
 * dbmodel.sql", but this reader only understands bounded CREATE TABLE names.
 * Sources: https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql
 * https://dev.mysql.com/doc/refman/8.0/en/comments.html
 * https://dev.mysql.com/doc/refman/8.0/en/string-literals.html
 * https://dev.mysql.com/doc/refman/8.0/en/identifiers.html
 *
 * Studio documents inline comments removing the whole column, unlike ordinary
 * MySQL parsing. Block comments and mode-dependent backslash escapes remain
 * unsupported; neither their contents nor affected declarations are guessed.
 */
function schemaStructure(sql: string, signal?: AbortSignal) {
  // Offsets are UTF-16 offsets, as used by String.slice and regular expressions.
  // Array.from would merge surrogate pairs and move subsequent declarations.
  const masked = sql.split('');
  const unsupported: string[] = [];
  const excluded: SchemaRegion[] = [];
  const exclude = (start: number, end: number) => {
    // Inline Studio comments can cover earlier comments on the same line.
    // Merge overlapping ranges so the statement reader advances once, not an
    // unbounded statements-by-comments search.
    while (excluded.length > 0 && (excluded.at(-1)?.end ?? -1) >= start) {
      cancellationCheckpoint(signal);
      const previous = excluded.pop();
      if (previous !== undefined) {
        start = Math.min(start, previous.start);
        end = Math.max(end, previous.end);
      }
    }
    excluded.push({ start, end });
  };
  let unsafeFrom = sql.length;
  let lineStart = 0;
  const blank = (start: number, end: number) => {
    for (let index = start; index < end; index += 1) {
      periodicCancellationCheckpoint(index - start, signal);
      if (sql[index] === '\n' || sql[index] === '\r') lineStart = index + 1;
      else masked[index] = ' ';
    }
  };
  for (let index = 0; index < sql.length;) {
    periodicCancellationCheckpoint(index, signal);
    const character = sql[index];
    if (character === "'" || character === '"' || character === '`') {
      const start = index;
      let closed = false;
      index += 1;
      for (; index < sql.length; index += 1) {
        periodicCancellationCheckpoint(index - start, signal);
        if (sql[index] === '\\') {
          unsupported.push('a schema quoted region with mode-dependent backslash escaping');
          unsafeFrom = Math.min(unsafeFrom, start);
          index += 1;
        } else if (sql[index] === character) {
          if (sql[index + 1] === character) index += 1;
          else {
            index += 1;
            closed = true;
            break;
          }
        }
      }
      if (!closed) {
        unsupported.push('an unterminated schema quoted region');
        unsafeFrom = Math.min(unsafeFrom, start);
      }
      if (character === '"') {
        // ANSI_QUOTES changes strings into identifiers; the project's runtime
        // SQL mode is unknown. Do not certify an affected declaration.
        unsupported.push('a double-quoted schema region with unknown ANSI_QUOTES mode');
        exclude(start, index);
      }
      const content = sql.slice(start + 1, index - 1);
      if (character === "'" || !closed || !/^[A-Za-z_]\w*$/u.test(content)) {
        blank(start + 1, index - (closed ? 1 : 0));
      }
      continue;
    }
    const dashComment =
      character === '-' &&
      sql[index + 1] === '-' &&
      (sql[index + 2] === undefined ||
        sql.charCodeAt(index + 2) <= 0x20 ||
        /\s/u.test(sql[index + 2] ?? ''));
    if (character === '#' || dashComment) {
      const start = index;
      while (index < sql.length && sql[index] !== '\n' && sql[index] !== '\r') {
        periodicCancellationCheckpoint(index - start, signal);
        index += 1;
      }
      if (sql.slice(lineStart, start).trim() !== '') {
        unsupported.push('an inline schema comment with unexamined Studio preprocessing');
        exclude(lineStart, index);
      }
      blank(start, index);
      continue;
    }
    if (character === '/' && sql[index + 1] === '*') {
      const start = index;
      const close = sql.indexOf('*/', index + 2);
      index = close === -1 ? sql.length : close + 2;
      unsupported.push('a block schema comment with unexamined execution or Studio preprocessing');
      exclude(start, index);
      if (close === -1) unsafeFrom = Math.min(unsafeFrom, start);
      blank(start, index);
      continue;
    }
    if (character === '\n' || character === '\r') lineStart = index + 1;
    index += 1;
  }
  cancellationCheckpoint(signal);
  return { text: masked.join(''), unsupported, excluded, unsafeFrom };
}

/** Reads the attribute token outside type/constraint expressions and quoted names. */
function hasInvisibleAttribute(definition: string, signal?: AbortSignal): boolean {
  let depth = 0;
  let nextIsName = false;
  for (const match of definition.matchAll(/`(?:``|[^`])*`|[()]|[A-Za-z_]\w*/gu)) {
    cancellationCheckpoint(signal);
    const token = match[0];
    if (token === '(') depth += 1;
    else if (token === ')') depth -= 1;
    else if (depth === 0) {
      if (nextIsName) nextIsName = false;
      else if (/^(?:CONSTRAINT|REFERENCES)$/iu.test(token)) nextIsName = true;
      else if (/^INVISIBLE$/iu.test(token)) return true;
    }
  }
  return false;
}

// Unread schema regions are never a clean inventory.
/** Reads the tables and columns `dbmodel.sql` declares. */
export function parseSchema(
  sql: string,
  signal?: AbortSignal,
): ParseOutcome<readonly TableDefinition[]> {
  cancellationCheckpoint(signal);
  const structure = schemaStructure(sql, signal);
  const tables: TableDefinition[] = [];
  const declaredNames = new Set<string>();
  const unsupported = [...structure.unsupported];
  let start = 0;
  let excludedIndex = 0;
  for (let end = 0; end <= structure.text.length; end += 1) {
    periodicCancellationCheckpoint(end, signal);
    if (end !== structure.text.length && structure.text[end] !== ';') continue;
    const raw = structure.text.slice(start, end);
    const statement = raw.trim();
    const statementStart = start + raw.length - raw.trimStart().length;
    while ((structure.excluded[excludedIndex]?.end ?? Infinity) <= statementStart) {
      cancellationCheckpoint(signal);
      excludedIndex += 1;
    }
    const excluded =
      statementStart >= structure.unsafeFrom ||
      end > structure.unsafeFrom ||
      (structure.excluded[excludedIndex]?.start ?? Infinity) < end;
    start = end + 1;
    if (statement === '' || excluded) continue;
    const header = CREATE_TABLE.exec(statement);
    if (header === null) {
      unsupported.push('a schema statement outside the supported CREATE TABLE declaration subset');
      continue;
    }
    const name = header[1] ?? header[2] ?? header[3] ?? '';
    if (/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s/iu.test(header[0]) && declaredNames.has(name)) {
      // BGA says "Always add IF NOT EXISTS". MySQL says it "Prevents an
      // error from occurring if the table exists", without verifying that
      // the existing structure matches. Keep the earlier naming witness,
      // not a second effective definition or a certain duplicate defect.
      // Sources: https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql
      // https://dev.mysql.com/doc/refman/8.0/en/create-table.html
      unsupported.push('a repeated conditional CREATE TABLE with an unverified effective schema');
      continue;
    }
    let depth = 1;
    let close = header[0].length;
    for (; close < statement.length; close += 1) {
      periodicCancellationCheckpoint(close, signal);
      if (statement[close] === '(') depth += 1;
      else if (statement[close] === ')' && --depth === 0) break;
    }
    if (depth !== 0) {
      unsupported.push('an unbalanced CREATE TABLE declaration');
      continue;
    }
    const columns: string[] = [];
    const wildcardColumns: string[] = [];
    for (const entry of splitColumns(statement.slice(header[0].length, close), signal)) {
      cancellationCheckpoint(signal);
      const trimmed = entry.trim();
      const identifier = SCHEMA_IDENTIFIER.exec(trimmed);
      const first = identifier?.[1] ?? identifier?.[2] ?? identifier?.[3];
      if (identifier === null || first === undefined) {
        unsupported.push('a CREATE TABLE entry with an unreadable column identifier');
        continue;
      }
      if (identifier[3] !== undefined && CONSTRAINT_STARTS.has(first.toLowerCase())) continue;
      if (!/^\s+[A-Za-z_]\w*(?:\s|\(|$)/u.test(trimmed.slice(identifier[0].length))) {
        unsupported.push('a CREATE TABLE entry without a readable column type');
        continue;
      }
      columns.push(first);
      // SELECT table.* excludes INVISIBLE columns. The structural schema
      // text has already masked quoted values; a default string cannot set
      // visibility. No runtime visibility or migration is inferred.
      // https://dev.mysql.com/doc/refman/8.0/en/invisible-columns.html
      if (!hasInvisibleAttribute(trimmed.slice(identifier[0].length), signal))
        wildcardColumns.push(first);
    }
    const tail = statement.slice(close + 1).trim();
    // Only the naming-neutral options in BGA's documented examples are read.
    // AS SELECT, LIKE, partitioning and other tails remain incomplete.
    if (
      !/^(?:\s*(?:ENGINE\s*=\s*[A-Za-z_]\w*|(?:DEFAULT\s+)?CHARSET\s*=\s*[A-Za-z_]\w*|AUTO_INCREMENT\s*=\s*\d+))*\s*$/iu.test(
        tail,
      )
    ) {
      unsupported.push('an unexamined CREATE TABLE suffix');
    }
    if (columns.length === 0)
      unsupported.push('a CREATE TABLE declaration without readable columns');
    const table = { name, columns };
    wildcardColumnsByTable.set(table, wildcardColumns);
    tables.push(table);
    declaredNames.add(name);
  }
  cancellationCheckpoint(signal);
  const outcome: SchemaOutcome = { value: tables, unsupported: [...new Set(unsupported)] };
  // Column names are case-insensitive; table-name casing depends on the
  // runtime. Do not attest absence for names that differ only by case.
  // https://dev.mysql.com/doc/refman/8.0/en/identifier-case-sensitivity.html
  let namesUnambiguous = true;
  const tableNames = new Set<string>();
  for (const table of tables) {
    cancellationCheckpoint(signal);
    const name = table.name.toLowerCase();
    if (tableNames.has(name)) namesUnambiguous = false;
    tableNames.add(name);
    const columnNames = new Set<string>();
    for (const column of table.columns) {
      cancellationCheckpoint(signal);
      const name = column.toLowerCase();
      if (columnNames.has(name)) namesUnambiguous = false;
      columnNames.add(name);
    }
  }
  // The entire lexical/statement walk completed, every declaration supplied
  // names, and no unexamined region remains. This witnesses only non-empty
  // CREATE naming coverage, not type validity or the runtime database state.
  // BGA puts CREATE/ALTER declarations in dbmodel.sql; MySQL defines column
  // declarations separately from keys/constraints in CREATE TABLE.
  // Sources: https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql
  // https://dev.mysql.com/doc/refman/8.0/en/create-table.html
  // Keep this new independent witness narrower than the general reader:
  // non-ASCII or other control bytes require a separate lexical review.
  if (
    tables.length > 0 &&
    namesUnambiguous &&
    unsupported.length === 0 &&
    /^[\t\r\n\x20-\x7e]*$/u.test(sql)
  )
    completedSchemaNamingReads.add(outcome);
  return outcome;
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
  readonly qualifiers: ReadonlySet<string>;
  readonly referenceCount: number;
  readonly unsupported: readonly string[];
}

/** Reads underlying tables and their explicit or implicit aliases. */
function queryStructure(text: string, signal?: AbortSignal): QueryStructure {
  const tables: string[] = [];
  const aliases = new Map<string, string>();
  const qualifiers = new Set<string>();
  const firstQualifier = new Map<string, string>();
  const unsupported: string[] = [];
  let referenceCount = 0;
  for (const clause of text.matchAll(TABLE_CLAUSE)) {
    cancellationCheckpoint(signal);
    const table = clause[2];
    if (table === undefined) continue;
    referenceCount += 1;
    if (!tables.includes(table)) tables.push(table);
    const alias = /^\s+(?:AS\s+)?([`"]?)([A-Za-z_]\w*)\1/iu.exec(
      text.slice(clause.index + clause[0].length),
    )?.[2];
    // A table reference supplies either its explicit/implicit alias or its
    // unaliased name. Do not let a later physical table overwrite an alias.
    // MySQL: tbl_name [[AS] alias]; alias casing depends on target settings.
    // https://dev.mysql.com/doc/refman/8.0/en/join.html
    // https://dev.mysql.com/doc/refman/8.0/en/identifier-case-sensitivity.html
    const name = alias !== undefined && !SQL_KEYWORDS.has(alias.toLowerCase()) ? alias : table;
    qualifiers.add(name);
    const folded = name.toLowerCase();
    const previous = firstQualifier.get(folded);
    if (previous !== undefined) {
      aliases.delete(previous);
      aliases.delete(name);
      unsupported.push(
        'ambiguous table qualifier bindings repeat a reference name or differ only by case; no owner or runtime alias setting was inferred',
      );
    } else {
      firstQualifier.set(folded, name);
      aliases.set(name, table);
    }
  }
  return { tables, aliases, qualifiers, referenceCount, unsupported };
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
      table: structure.referenceCount === 1 ? (structure.tables[0] ?? null) : null,
      column,
    };
  }
  return { table: structure.aliases.get(qualifier) ?? null, column };
}

interface SelectListReading {
  readonly wildcardTables: readonly string[];
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
      wildcardTables: [],
      columns: [],
      unsupported: ['a SELECT statement without a readable FROM clause'],
      withoutList: text,
    };
  }
  const start = afterSelect;
  const end = start + from.index;
  const list = text.slice(start, end).replace(/^\s*DISTINCT\b/iu, ' ');
  const columns = new Set<string>();
  const wildcardTables = new Set<string>();
  const unsupported: string[] = [];

  for (const rawItem of splitColumns(list, signal)) {
    cancellationCheckpoint(signal);
    const item = rawItem.trim();
    if (item === '') continue;
    const alias = /^(.*?)(?:\s+AS\s+|\s+)([`"]?)([A-Za-z_]\w*)\2\s*$/iu.exec(item);
    const expression = (alias?.[1] ?? item).trim();
    const wildcard = /^(?:([`"]?)([A-Za-z_]\w*)\1\s*\.\s*)?\*$/u.exec(expression);
    if (wildcard !== null) {
      const qualifier = wildcard[2];
      const table = qualifier === undefined ? undefined : structure.aliases.get(qualifier);
      if (alias !== null) {
        unsupported.push('a SELECT wildcard with an unsupported result alias');
      } else if (qualifier !== undefined && table === undefined) {
        unsupported.push(
          `SELECT wildcard uses an unknown or ambiguous table qualifier '${qualifier}'`,
        );
      } else if (qualifier === undefined) {
        if (list.trim() !== '*') {
          unsupported.push('an unqualified SELECT wildcard mixed with other expressions');
        } else {
          // A single unqualified * selects the visible columns of this query's
          // FROM/JOIN tables, not every table declared anywhere in the schema.
          // https://dev.mysql.com/doc/refman/8.0/en/select.html
          for (const name of structure.tables) {
            cancellationCheckpoint(signal);
            wildcardTables.add(name);
          }
        }
      } else if (table !== undefined) {
        // MySQL SELECT: tbl_name.* selects the named table's visible columns.
        // Retain table provenance, not invented explicit column references.
        // https://dev.mysql.com/doc/refman/8.0/en/select.html
        wildcardTables.add(table);
      }
      continue;
    }

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
    wildcardTables: [...wildcardTables],
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
): { text: string } | { unreadable: string } | { partial: QueryReference; limitation: string } {
  cancellationCheckpoint(signal);
  const formatted = readFormattedInsert(argument, signal);
  if (formatted !== null) return formatted;
  const concatenated = readInsertPrefix(argument, signal);
  if (concatenated !== null) return concatenated;
  const literal = /^\s*(["'])([\s\S]*)\1\s*$/u.exec(argument);
  if (literal !== null && isSingleQuotedToken(argument, signal)) {
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
  if (assignedLiteral === null || !isSingleQuotedToken(assigned.value, signal)) {
    const formattedAssignment = readFormattedInsert(assigned.value, signal);
    if (formattedAssignment !== null) return formattedAssignment;
    const concatenatedAssignment = readInsertPrefix(assigned.value, signal);
    if (concatenatedAssignment !== null) return concatenatedAssignment;
    return {
      unreadable: `a query assembled into $${name}: ${snippet(assigned.value, 60, signal)}`,
    };
  }
  return { text: assignedLiteral[2] ?? '' };
}

function isSingleQuotedToken(expression: string, signal?: AbortSignal): boolean {
  return /^(?:"\s*"|'\s*')$/u.test(maskLiterals(expression, signal).trim());
}

/**
 * PHP's . operator "returns the concatenation of its right and left arguments".
 * Read one literal INSERT head plus a variable or fully delimited function call;
 * refusing outer operators avoids PHP-version-dependent grouping or a ternary
 * replacing the entire query. MySQL places explicit target names before VALUES.
 * The opaque tail may contain any SQL; none of it is evaluated or retained.
 * Sources (2026-10-07): https://www.php.net/manual/en/language.operators.string.php
 * https://www.php.net/manual/en/language.operators.precedence.php
 * https://www.php.net/manual/en/language.types.string.php
 * https://dev.mysql.com/doc/refman/8.0/en/insert.html
 */
function readInsertPrefix(
  argument: string,
  signal?: AbortSignal,
): { partial: QueryReference; limitation: string } | null {
  const masked = maskLiterals(argument, signal);
  const head = /^\s*(?:"\s*"|'\s*')\s*\.\s*/u.exec(masked);
  if (head === null) return null;
  const dot = head[0].lastIndexOf('.');
  const text = argument.slice(0, dot).trim().slice(1, -1);
  if (/[\\$]/u.test(text)) return null;
  const tail = masked.slice(head[0].length).trim();
  if (!/^\$[A-Za-z_]\w*$/u.test(tail)) {
    const call = /^\\?[A-Za-z_]\w*\s*\(/u.exec(tail);
    if (call === null) return null;
    // Match bracket kinds, not just depth. The whole remainder must be this call.
    const stack: string[] = [];
    const closing: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
    for (let index = call[0].length - 1; index < tail.length; index += 1) {
      periodicCancellationCheckpoint(index, signal);
      const character = tail[index] ?? '';
      if (closing[character] !== undefined) stack.push(closing[character] ?? '');
      else if (character === ')' || character === ']' || character === '}') {
        if (stack.pop() !== character) return null;
        if (stack.length === 0 && index !== tail.length - 1) return null;
      }
    }
    if (stack.length !== 0 || !tail.endsWith(')')) return null;
  }
  const identifier = '(?:`[A-Za-z_]\\w*`|[A-Za-z_]\\w*)';
  const shape = new RegExp(
    `^\\s*INSERT\\s+INTO\\s+(${identifier})\\s*\\(\\s*(${identifier}(?:\\s*,\\s*${identifier})*)\\s*\\)\\s+VALUES\\s+$`,
    'iu',
  ).exec(text);
  if (shape === null) return null;
  const table = (shape[1] ?? '').replaceAll('`', '');
  const columns = (shape[2] ?? '')
    .split(',')
    .map((column) => `${table}.${column.trim().replaceAll('`', '')}`);
  cancellationCheckpoint(signal);
  return {
    partial: {
      tables: [table],
      columns: [...new Set(columns)].sort(),
      interpolated: false,
      text: text.replace(/\s+/gu, ' ').trim() + ' [unresolved]',
    },
    limitation:
      'a concatenated INSERT with a readable target but unresolved VALUES and possible SQL suffix; argument values and escaping were not analyzed',
  };
}

/**
 * Read only the invariant INSERT target of a literal sprintf template. PHP's
 * sprintf documentation says ordinary characters are copied to the result;
 * MySQL's INSERT grammar places the table/column list before VALUES. A trailing
 * %s may supply arbitrary SQL, so the values/suffix ALWAYS remain unsupported.
 * No argument is evaluated, substituted, retained or declared safely escaped.
 * Sources: https://www.php.net/manual/en/function.sprintf.php and
 * https://dev.mysql.com/doc/refman/8.0/en/insert.html (2026-10-03).
 */
function readFormattedInsert(
  argument: string,
  signal?: AbortSignal,
): { partial: QueryReference; limitation: string } | null {
  const masked = maskLiterals(argument, signal);
  const call = /^\s*\\?sprintf\s*\(/u.exec(masked);
  if (call === null) return null;
  const span = matchBracket(masked, call[0].length - 1, signal);
  if (span === null || masked.slice(span.end + 1).trim() !== '') return null;
  const args = splitArguments(masked, span.start + 1, span.end, ',', signal);
  // Only one ordinary %s, with exactly one supplied non-unpacked argument.
  if (args.length !== 2) return null;
  const format = args[0];
  const values = args[1];
  if (format === undefined || values === undefined) return null;
  if (/^\s*(?:\.\.\.|[A-Za-z_]\w*\s*:)/u.test(masked.slice(values.start, values.end))) {
    return null;
  }
  const literal = argument.slice(format.start, format.end).trim();
  // A single quoted token, not concatenation or embedded escaped/interpolated
  // PHP. Restricting escapes also avoids decoding identifiers speculatively.
  if (!/^(?:"[\s]*"|'[\s]*')$/u.test(masked.slice(format.start, format.end).trim())) {
    return null;
  }
  const text = literal.slice(1, -1);
  if (/[\\$]/u.test(text)) return null;
  const identifier = '(?:`[A-Za-z_]\\w*`|[A-Za-z_]\\w*)';
  const shape = new RegExp(
    `^\\s*INSERT\\s+INTO\\s+(${identifier})\\s*\\(\\s*(${identifier}(?:\\s*,\\s*${identifier})*)\\s*\\)\\s+VALUES\\s+%s\\s*$`,
    'iu',
  ).exec(text);
  if (shape === null) return null;
  const table = (shape[1] ?? '').replaceAll('`', '');
  const columns = (shape[2] ?? '')
    .split(',')
    .map((column) => `${table}.${column.trim().replaceAll('`', '')}`);
  cancellationCheckpoint(signal);
  return {
    partial: {
      tables: [table],
      columns: [...new Set(columns)].sort(),
      interpolated: false,
      text: text.replace(/\s+/gu, ' ').trim(),
    },
    limitation:
      'a formatted INSERT with a readable target but unresolved VALUES and possible SQL suffix; argument values and escaping were not analyzed',
  };
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
    if ('partial' in resolved) {
      queries.push(resolved.partial);
      unsupported.push(`${helper} runs ${resolved.limitation}`);
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

    // Literal values cannot introduce table references or qualifier bindings.
    const structure = queryStructure(scrub(text), signal);
    unsupported.push(...structure.unsupported);
    const tables = structure.tables;
    const columns = new Set<string>();
    let wildcardTables: readonly string[] = [];
    let referenceText = text;
    if (/^\s*SELECT\b/iu.test(text)) {
      const selected = readSelectList(text, structure, signal);
      referenceText = selected.withoutList;
      wildcardTables = selected.wildcardTables;
      for (const column of selected.columns) columns.add(column);
      unsupported.push(...selected.unsupported);
    }

    for (const qualified of scrub(referenceText).matchAll(QUALIFIED_COLUMN)) {
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
    const singleTable = structure.referenceCount === 1 ? tables[0] : undefined;
    const withoutQualified = scrub(referenceText).replace(QUALIFIED_COLUMN, ' ');
    const bare: string[] = [];
    for (const identifier of withoutQualified.matchAll(/[`"]?\b([A-Za-z_]\w*)\b[`"]?\s*(\()?/gu)) {
      cancellationCheckpoint(signal);
      const name = identifier[1];
      if (
        name === undefined ||
        identifier[2] !== undefined ||
        SQL_KEYWORDS.has(name.toLowerCase()) ||
        structure.qualifiers.has(name) ||
        tables.includes(name)
      ) {
        continue;
      }
      bare.push(name);
    }
    if (singleTable !== undefined) {
      for (const name of bare) columns.add(`${singleTable}.${name}`);
    } else if (structure.referenceCount > 1 && bare.length > 0) {
      unsupported.push(
        `bare columns of a multi-table query could not be attributed: ${snippet(text, 40, signal)}`,
      );
    }

    const query = {
      tables,
      columns: [...columns].sort(),
      interpolated: INTERPOLATION.test(text),
      // Masked here rather than at the tool: the analysis above is the only
      // reader that needs the values, and it has already finished with them.
      text: maskSqlValues(text.replace(/\s+/gu, ' ').trim(), signal),
    };
    wildcardTablesByQuery.set(query, wildcardTables);
    queries.push(query);
  }

  cancellationCheckpoint(signal);
  return { value: queries, unsupported };
}
