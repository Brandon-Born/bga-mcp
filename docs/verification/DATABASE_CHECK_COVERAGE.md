# Independent database-check evidence — BGA-439

```verification-record
{"kind":"review","scope":"BGA-439 independent availability and inert-schema duplicate absence; retained unknown SQL, private attribution and publication boundaries"}
```

The database runner can establish three bounded facts independently of an
unreadable query tail. It passes private evidence to the pre-release consumer;
public diagnostics, traces, schemas and aggregate statuses are unchanged.

| Existing check               | Independent evidence under partial group coverage                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database.audit.unavailable` | The runner successfully read the schema file and obtained at least one query reference. This certifies availability, not complete SQL or execution. |
| `database.table.duplicate`   | The fully read schema contains only blank lines and ordinary `--` line comments, so no game-table declarations can be duplicated.                   |
| `database.column.duplicate`  | The same inert schema contains no game-column declarations to duplicate.                                                                            |

Every other check keeps its original conservative group coverage decision.
An invariant INSERT target cannot rule out more identifiers, statements, values
or unsafe escaping supplied by runtime-built text. Four query-dependent checks
therefore remain unsupported on Dino Racer's production selection. Unknown
outside source and omitted PHP still hold those checks on a complete repository.

The original BGA-439 witness is a narrow inert-schema proof, not schema completeness detection. At that initial checkpoint the reader could skip unrecognized statements or executable comments. BGA-441 subsequently added explicit naming-coverage refusals; the bounded BGA-438 follow-up below uses actual producer completion rather than a caller-supplied empty unsupported list. The witness
accepts only ASCII spaces/tabs, CR/LF line boundaries, and complete lines beginning
with `--` followed by a space or tab. It refuses every other schema spelling,
including all SQL, hash comments, ordinary/executable block comments, ambiguous
prefixes and non-whitespace double-dash forms. These refusals apply only to the
new independent witness; existing fully covered behavior is not broadened.

Failed, skipped and unrequested groups cannot provide a verdict. Missing or
refused schema reads provide no independent evidence. A readable reference is
required for availability; a target read from an apparent formatter is not a
claim that the formatter or query executes. Real findings outrank pass evidence,
and only codes without a finding in the owning untruncated result are attested.
Aggregate truncation cannot turn a hidden duplicate defect into an attested pass.

The three codes are explicitly allowlisted only for the database group and its
database tool. Private evidence is absent from the exported group/type schemas
and serialized diagnostic results. Existing `reason` fields on bounded passes
explain their scope. Query-dependent reasons retain actual group blockers.
Root confinement, read limits, cancellation, redaction and output refusal remain
the final boundaries. The server neither writes project files nor executes SQL/PHP.

Official sources were fetched before implementation: [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference),
[database model](https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql),
[main logic](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php), and
[MySQL comments](https://dev.mysql.com/doc/refman/8.0/en/comments.html).
The model says all CREATE/ALTER tables and views belong in `dbmodel.sql`, while
initialization belongs in `setupNewGame`. MySQL line comments end at their line
boundary and require whitespace/control after the second dash. Its executable
block-comment variants contain SQL; those cannot be treated as an inert schema.
Unknown runtime strings do not acquire semantics from these sources.

`UNIT-DATABASE-INDEPENDENT-COVERAGE` supplies original positive and refusal controls.
`E2E-DATABASE-INDEPENDENT-CHECKS` / `E2E-DATABASE-INDEPENDENT-REFUSAL` exercise the
installed public executable across modern, legacy and hybrid fixtures. The
[bounded receipt](bga439-source-ci.json) records the original-runtime control,
complete gate, exact-source CI, actual admission and unchanged-Dino rerun as
collected; it does not promote an original signed candidate or game publication.

## BGA-438 conditional-declaration correction — 2026-10-12

The unmodified main implementation at `64f64f8` fails the installed conditional-repeat assertion: database diagnostics contain a duplicate or absence finding where conditional execution cannot justify one. The original affected run fails 2 tests and passes 33; the isolated installed run fails 1 and passes 2. After the correction, all 79 affected unit and installed tests pass. The regression uses original synthetic schema text and the actual packed public executable; no game source is changed.

A later conditional repeat retains the first naming witness and reports an unverified effective schema. It does not certify which columns exist or permit absence-based conclusions. A later unconditional CREATE still reports duplicate declarations, and unrelated definite duplicates remain visible. The installed scenario also retains all three layouts, repeats, root refusal, output refusal, aggregate/resource propagation and unchanged fixture bytes. Public schemas and dependencies are unchanged. The clean integrated `pnpm check` at `4dc4886` passes 977/977 tests in 122 files, 266/266 required scenarios, 106 retained claims, 17 capabilities, package checks, applicable official 2025 conformance and safety. Its installed artifact digest is `sha256:14845975f9ce150de31b0f27f39e6bbcc71f45f889522e57d184304e9954d123`; a fresh archive reproduces those whole bytes. Fresh installs of unmodified main `64f64f8` and that archive produce deeply equal results across all seven tools and three resources on unchanged Dino Racer `83e2e50` (159 non-Git files) and frozen `27f8273` (84 files). Both roots retain 3 passed / 0 failed / 30 unsupported / 8 manual-required and one readable query, with unchanged digests, repeats, root refusal, clean stderr and exited processes. Exact-source platform CI and framework admission remain pending; original signed rc.7 release evidence is unchanged.

Sources read before implementation: [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference), [database model](https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql) and [MySQL CREATE TABLE](https://dev.mysql.com/doc/refman/8.0/en/create-table.html). BGA recommends IF NOT EXISTS; MySQL distinguishes prevention of an existing-table error from verification of matching structure. The implementation does not execute SQL, merge conditional column sets or assume runtime database contents.

## BGA-438 schema-only naming evidence — 2026-10-12

Merged main `50a945e` leaves duplicate-table and duplicate-column absence unsupported for a fully readable populated schema beside runtime-built VALUES. The original installed regression fails those two verdict assertions. The follow-up grants producer evidence only after the actual schema reader completes its whole bounded lexical/statement walk, produces at least one named declaration, stays within the reviewed ASCII/space/tab/CR/LF witness subset and encounters no unexamined region. Its private weak identity transfers to the audit constructed from that reader; copied or fabricated empty outcomes cannot provide it. The public exports from `src/index.ts`, output schemas, group fields and parsed table/query contents remain unchanged.

Only the two existing schema duplicate checks may use this evidence. Their reasons describe supported declaration naming, not column-type validity, the effective live schema, execution, values or escaping. The existing inert witness stays intact. Query-dependent checks retain unresolved VALUES, source-scope and omitted-read holds. Inputs outside the ASCII/space/tab/CR/LF witness subset and folded table/column-name collisions also refuse the new attribution. Repeated conditional CREATE declarations still report unknown effective schema under PR31 and receive no witness. ALTER/VIEW, uncertain quoting, unexamined blocks or Studio preprocessing, unreadable declarations and missing/refused schema reads also refuse it. Actual duplicate findings cannot be filtered or truncated into an attested pass.

This explicitly extends BGA-439's original inert-only restriction for a reviewed non-empty naming subset; it does not silently reinterpret its historical receipt. `UNIT-DATABASE-INDEPENDENT-COVERAGE` proves genuine reader/audit ownership, copied/forged refusal, scope and conflicting/truncated defects. `E2E-DATABASE-SCHEMA-INDEPENDENT` exercises all three installed public layouts, retained partial diagnostics and query verdicts, private-value/output minimization, repeats, root refusal, immutable project bytes and process cleanup. The affected four suites pass 59 tests, including the conditional-CREATE controls. Integrated full-gate and exact-source/admission results are retained separately in the existing BGA-439 receipt's additive follow-up; no signed candidate is changed.

Sources fetched and read before implementation: [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference), [database model](https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql), [MySQL CREATE TABLE](https://dev.mysql.com/doc/refman/8.0/en/create-table.html). BGA places declarations in dbmodel.sql while query initialization is separate. MySQL's CREATE grammar distinguishes named column definitions from keys and constraints. That establishes the structural naming scope; it does not establish arbitrary runtime tuple values, SQL validity or the current contents of a live database.

[MySQL identifier case sensitivity](https://dev.mysql.com/doc/refman/8.0/en/identifier-case-sensitivity.html) was also read before the folded-name guard: column names are case-insensitive, while table casing depends on platform and settings. The guard withholds new pass evidence on collisions, without extending general comparison diagnostics or inferring the target SQL mode.
