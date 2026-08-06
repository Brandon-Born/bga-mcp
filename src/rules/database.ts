import type { DiagnosticFinding, DiagnosticResult, DiagnosticSeverity } from '../diagnostics.js';
import {
  parseQueries,
  parseSchema,
  type QueryReference,
  type TableDefinition,
} from '../project/database.js';

export interface DatabaseRule {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly certainty: 'certain' | 'likely' | 'possible';
  readonly summary: string;
  readonly falsePositives: readonly string[];
}

export const DATABASE_RULES: readonly DatabaseRule[] = [
  {
    code: 'database.audit.unavailable',
    severity: 'information',
    certainty: 'certain',
    summary: 'The audit could not run because the schema or the queries could not be read.',
    falsePositives: [],
  },
  {
    code: 'database.table.duplicate',
    severity: 'error',
    certainty: 'certain',
    summary: 'The schema declares one table more than once.',
    falsePositives: [],
  },
  {
    code: 'database.column.duplicate',
    severity: 'error',
    certainty: 'certain',
    summary: 'A table declares one column more than once.',
    falsePositives: [],
  },
  {
    code: 'database.table.undeclared',
    severity: 'error',
    certainty: 'certain',
    summary: 'A query names a table the schema does not declare.',
    falsePositives: [
      'A table created by the framework rather than by dbmodel.sql is legitimate; the framework owns player, global, stats, and gamelog.',
    ],
  },
  {
    code: 'database.column.undeclared',
    severity: 'warning',
    certainty: 'likely',
    summary: 'A query names a column its table does not declare.',
    falsePositives: [
      'A column alias, a computed expression, or a function this reader does not recognize can look like a column reference.',
      'A column added by a later migration rather than by dbmodel.sql will not be found.',
    ],
  },
  {
    code: 'database.column.unused',
    severity: 'information',
    certainty: 'possible',
    summary: 'The schema declares a column no readable query names.',
    falsePositives: [
      'A query built at runtime, or one outside the read budget, cannot be seen by this rule.',
      'A column read through SELECT * is used without being named.',
    ],
  },
  {
    code: 'database.query.interpolated',
    severity: 'warning',
    certainty: 'likely',
    summary: 'A query interpolates a PHP value into its text rather than escaping it.',
    falsePositives: [
      'A value already escaped with the framework helper, or one that is provably an integer, is safe despite being interpolated.',
    ],
  },
];

/** Tables the framework owns; a project never declares them in dbmodel.sql. */
export const FRAMEWORK_TABLES = new Set(['player', 'global', 'stats', 'gamelog', 'gamestatus']);

const RULES_BY_CODE = new Map(DATABASE_RULES.map((rule) => [rule.code, rule]));

function definition(code: string): DatabaseRule {
  const rule = RULES_BY_CODE.get(code);
  if (rule === undefined) {
    throw new Error(`Unknown database rule: ${code}`);
  }
  return rule;
}

function certainFinding(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  return {
    kind: 'issue',
    code,
    severity: definition(code).severity,
    certainty: 'certain',
    message,
    locations: uri === null ? [] : [{ uri }],
    evidence: [{ kind: 'relationship', message: evidence }],
    suggestions: [{ message: suggestion }],
  };
}

function heuristicFinding(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  const rule = definition(code);
  return {
    kind: 'heuristic',
    code,
    severity: rule.severity,
    certainty: rule.certainty === 'certain' ? 'likely' : rule.certainty,
    message,
    locations: uri === null ? [] : [{ uri }],
    evidence: [
      { kind: 'heuristic', message: evidence },
      { kind: 'source', message: `Known limitation: ${rule.falsePositives.join(' ')}` },
    ],
    suggestions: [{ message: suggestion }],
  };
}

function unsupportedFinding(construct: string, uri: string, language: string): DiagnosticFinding {
  return {
    kind: 'unsupported-syntax',
    code: 'database.unsupported-syntax',
    certainty: 'certain',
    message: `Part of the database usage could not be read: ${construct}.`,
    locations: [{ uri }],
    evidence: [{ kind: 'source', message: `Unsupported construct: ${construct}` }],
    suggestions: [
      { message: 'Use a single literal query string, or confirm the dynamic form is intended.' },
    ],
    syntax: { language, construct },
  };
}

function order(findings: readonly DiagnosticFinding[]): DiagnosticFinding[] {
  return [...findings].sort((left, right) => {
    const byCode = left.code.localeCompare(right.code);
    if (byCode !== 0) {
      return byCode;
    }
    const byLocation = (left.locations[0]?.uri ?? '').localeCompare(right.locations[0]?.uri ?? '');
    return byLocation === 0 ? left.message.localeCompare(right.message) : byLocation;
  });
}

function summarize(findings: readonly DiagnosticFinding[]): DiagnosticResult {
  const summary = { errors: 0, warnings: 0, information: 0, unsupported: 0 };
  for (const finding of findings) {
    if (finding.kind === 'unsupported-syntax') {
      summary.unsupported += 1;
    } else if (finding.severity === 'error') {
      summary.errors += 1;
    } else if (finding.severity === 'warning') {
      summary.warnings += 1;
    } else {
      summary.information += 1;
    }
  }
  const status =
    findings.length === 0
      ? 'passed'
      : summary.unsupported === findings.length
        ? 'unsupported'
        : 'findings';
  return { schemaVersion: 1, status, summary, findings: order(findings) };
}

export interface DatabaseSource {
  readonly path: string;
  readonly text: string;
}

export interface DatabaseAudit {
  readonly tables: readonly TableDefinition[];
  readonly queries: readonly (QueryReference & { readonly source: string })[];
  readonly diagnostics: DiagnosticResult;
}

/**
 * Compares the declared schema with the queries that use it.
 *
 * A table a query names but the schema never declares is provable and reported
 * as a fact. Column-level claims are heuristics: aliases, expressions, and
 * `SELECT *` all make a textual reader's view of columns incomplete.
 */
export function auditDatabaseUsage(
  schemaSource: DatabaseSource | null,
  phpSources: readonly DatabaseSource[],
): DatabaseAudit {
  const findings: DiagnosticFinding[] = [];

  const schema =
    schemaSource === null ? { value: [], unsupported: [] } : parseSchema(schemaSource.text);
  for (const construct of schema.unsupported) {
    findings.push(unsupportedFinding(construct, schemaSource?.path ?? 'dbmodel.sql', 'sql'));
  }

  const tables = schema.value;
  const tablesByName = new Map<string, TableDefinition>();
  for (const table of tables) {
    if (tablesByName.has(table.name)) {
      findings.push(
        certainFinding(
          'database.table.duplicate',
          `The schema declares table '${table.name}' more than once.`,
          'Two CREATE TABLE statements use the same name.',
          schemaSource?.path ?? null,
          'Remove or rename the duplicate declaration.',
        ),
      );
    }
    tablesByName.set(table.name, table);

    const seen = new Set<string>();
    for (const column of table.columns) {
      if (seen.has(column)) {
        findings.push(
          certainFinding(
            'database.column.duplicate',
            `Table '${table.name}' declares column '${column}' more than once.`,
            'Two column definitions in one table use the same name.',
            schemaSource?.path ?? null,
            'Remove or rename the duplicate column.',
          ),
        );
      }
      seen.add(column);
    }
  }

  const queries: (QueryReference & { source: string })[] = [];
  for (const source of phpSources) {
    const outcome = parseQueries(source.text);
    for (const query of outcome.value) {
      queries.push({ ...query, source: source.path });
    }
    for (const construct of outcome.unsupported) {
      findings.push(unsupportedFinding(construct, source.path, 'php'));
    }
  }

  if (schemaSource === null || queries.length === 0) {
    const missing = [
      schemaSource === null ? 'no readable dbmodel.sql' : null,
      queries.length === 0 ? 'no readable query' : null,
    ].filter((side): side is string => side !== null);
    findings.push(
      certainFinding(
        'database.audit.unavailable',
        `Database usage could not be audited: ${missing.join(', ')}.`,
        'The schema, the queries, or both could not be read.',
        null,
        'Confirm the project declares its schema in dbmodel.sql and queries it from readable PHP.',
      ),
    );
    return { tables, queries, diagnostics: summarize(findings) };
  }

  const usedColumns = new Set<string>();
  for (const query of queries) {
    for (const table of query.tables) {
      if (!tablesByName.has(table) && !FRAMEWORK_TABLES.has(table)) {
        findings.push(
          certainFinding(
            'database.table.undeclared',
            `A query names table '${table}', which the schema does not declare.`,
            `No CREATE TABLE statement declares '${table}', and it is not a framework-owned table.`,
            query.source,
            `Declare '${table}' in dbmodel.sql, or correct the query.`,
          ),
        );
      }
    }

    for (const reference of query.columns) {
      const [tableName, columnName] = reference.split('.');
      if (tableName === undefined || columnName === undefined) {
        continue;
      }
      usedColumns.add(reference);
      const table = tablesByName.get(tableName);
      if (table === undefined || table.columns.includes(columnName)) {
        continue;
      }
      findings.push(
        heuristicFinding(
          'database.column.undeclared',
          `A query names '${columnName}' on table '${tableName}', which declares no such column.`,
          `Table '${tableName}' declares ${table.columns.join(', ')}.`,
          query.source,
          `Add '${columnName}' to '${tableName}' in dbmodel.sql, or correct the query.`,
        ),
      );
    }

    if (query.interpolated) {
      findings.push(
        heuristicFinding(
          'database.query.interpolated',
          `A query interpolates a PHP value into its text: ${query.text.slice(0, 60)}.`,
          'The query string contains a PHP variable rather than an escaped value.',
          query.source,
          'Escape the value with the framework helper, or confirm it is provably safe.',
        ),
      );
    }
  }

  const selectsEverything = queries.some((query) => /\bSELECT\s+\*/iu.test(query.text));
  if (!selectsEverything) {
    for (const table of tables) {
      for (const column of table.columns) {
        if (!usedColumns.has(`${table.name}.${column}`)) {
          findings.push(
            heuristicFinding(
              'database.column.unused',
              `The schema declares '${table.name}.${column}', which no readable query names.`,
              'No query in the readable PHP sources references the column.',
              schemaSource.path,
              'Use the column, or remove it from the schema.',
            ),
          );
        }
      }
    }
  }

  return { tables, queries, diagnostics: summarize(findings) };
}
