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

This is a narrow absence witness, not schema completeness detection. The current
schema reader can skip mixed unrecognized statements or executable comments;
its empty unsupported list cannot justify a partial-group pass. The witness
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
