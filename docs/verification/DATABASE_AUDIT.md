# Database audit verification

> [!CAUTION]
> Historical evidence only. The [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md) reopened the associated backlog and manifest claims. Do not treat this record as current release verification.

Recorded: 2026-08-06. Covers BGA-109, and completes the validator set BGA-112 will aggregate.

`audit_database_usage` compares what `dbmodel.sql` declares with what the PHP sources actually query. It is the fourth validator and the one with the widest gap between what can be proven and what can only be suspected, so the certainty split matters more here than anywhere else.

## What it reads

- **The schema** — tables and columns from `CREATE TABLE` statements, skipping constraints (`PRIMARY KEY`, `KEY`, `FOREIGN KEY`) and comments.
- **The queries** — SQL string literals in PHP. Tables come from `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, and `DELETE FROM`. Qualified columns (`card.card_id`) are always attributed; bare columns are attributed **only when the query names exactly one table**, because there is no honest way to assign them otherwise.

Both the parsed schema and every query read are returned in the result, so the tool's reasoning can be checked.

## The rule catalog

### Proven from the text — reported as facts

| Rule                         | Severity    | Catches                                          |
| ---------------------------- | ----------- | ------------------------------------------------ |
| `database.table.undeclared`  | error       | A query naming a table the schema never declares |
| `database.table.duplicate`   | error       | Two `CREATE TABLE` statements with one name      |
| `database.column.duplicate`  | error       | One table declaring a column twice               |
| `database.audit.unavailable` | information | No readable schema, or no readable query         |

### Heuristics

| Rule                          | Certainty | Catches                                                     |
| ----------------------------- | --------- | ----------------------------------------------------------- |
| `database.column.undeclared`  | likely    | A query naming a column its table does not declare          |
| `database.query.interpolated` | likely    | A PHP value interpolated into query text instead of escaped |
| `database.column.unused`      | possible  | A declared column no readable query names                   |

`database.column.unused` is suppressed entirely when any query uses `SELECT *`, because such a query uses every column without naming one. `database.query.interpolated` is a heuristic rather than a fact because a value already escaped by the framework helper, or provably an integer, is safe despite being interpolated.

Framework-owned tables (`player`, `global`, `stats`, `gamelog`, `gamestatus`) are never reported as undeclared: a project does not declare them in `dbmodel.sql`.

## A false positive caught during development

The first implementation reported `hand` and `discard` as undeclared columns of the `card` table. They were SQL string _values_ — `WHERE card_location = 'hand'` — and PHP variables interpolated into the query. The clean fixture, which should have passed, produced two warnings.

Both are now stripped before column extraction: SQL string literals, escaped string literals, and `$variable` / `{$variable}` interpolations. A tool whose clean case is not clean trains its user to ignore it, which is worse than not having the rule.

## Evidence

The complete gate passed on Node 22.17.1 (macOS): 212 tests across 32 files, 92.84% statement, 86.90% branch, 92.76% function, and 92.64% line coverage of `src`, plus official conformance and every verification gate.

### Fixtures

- **`legacy`** — declares a `card` table with three columns and runs two queries that use all three. The audit returns `passed`.
- **`legacy-broken`** — seeds four defects: a query naming an undeclared table (`deck`), a query naming an undeclared column (`card_colour`), a declared column nothing uses (`card_unused`), and a query interpolating `$playerId` into its text. Four findings, declared in its `expected.json`.

### Packaged scenarios

| Scenario                          | Proves                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| E2E-AUDIT-DATABASE-CLEAN          | A sound schema and its queries produce no finding                     |
| E2E-AUDIT-DATABASE-SEEDED-DEFECTS | Exactly the four declared defects, facts and heuristics distinguished |
| E2E-AUDIT-DATABASE-UNAVAILABLE    | An audit that cannot run never returns clean                          |
| E2E-AUDIT-DATABASE-IMMUTABLE      | The project directory hash is unchanged                               |
| E2E-AUDIT-DATABASE-DETERMINISTIC  | Repeated calls return byte-identical results                          |
| E2E-AUDIT-DATABASE-INVALID-INPUT  | Four malformed inputs are rejected by the published schema            |
| E2E-AUDIT-DATABASE-UNLISTED-ROOT  | An unlisted root is refused, with the path redacted                   |

The scenario-coverage gate also proved itself here: the suite was scaffolded from the notification suite and one identifier arrived as `…-UNTRACEABLE` while the manifest required `…-UNAVAILABLE`. The gate failed the build on both halves of the mismatch before any of it could be committed.

## Deliberate limits

- **Bare columns need a single-table query.** A multi-table query keeps only its qualified columns; the rest is reported as unsupported rather than attributed to a guess.
- **A concatenated query is not reconstructed.** `"SELECT … " . $filter` is reported as unreadable.
- **No SQL dialect parsing.** The reader recognizes shapes, not grammar, which is why every column-level claim is a heuristic.
- **Legacy layout only**, in line with the other validators. A modern project reports `database.audit.unavailable`.
