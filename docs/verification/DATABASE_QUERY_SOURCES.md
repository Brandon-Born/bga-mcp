# Database query source verification

Recorded: 2026-08-09. Covers BGA-127, the correctness owner for the database finding of the [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md).

```verification-record
{"kind":"run","capabilities":17,"scenarios":247,"claims":103,"tests":879}
```

## What the installed package got wrong

Adding one line to an otherwise clean project:

```php
$example = 'SELECT imaginary_id FROM ghost';
```

made the tool count a third query, report the certain error `database.table.undeclared` for a table that exists nowhere, and turn that into a failed pre-release check. The reader matched any quoted string starting with a SQL verb, wherever it appeared — in a comment, in an exception message, in a variable nothing ever executes.

## What the documentation says

[Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) — "All methods below are part of game class (and view class) and can be accessed using `$this->`". `DbQuery( string $sql )` "is the generic method to access the database. It can execute any type of SELECT/UPDATE/DELETE/REPLACE/INSERT query"; the specialized readers are `getUniqueValueFromDB`, `getCollectionFromDB`, `getNonEmptyCollectionFromDB`, `getObjectFromDB`, `getNonEmptyObjectFromDB`, `getObjectListFromDB` and `getDoubleKeyCollectionFromDB`. [Game database model: dbmodel.sql](https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql) declares the tables and columns a game owns.

The page's own example assigns the query first and runs it on the next line, so following one assignment is part of reading the documented style rather than an extension of it.

## What changed

- **A string is a query only where something runs it.** The reader starts from the helper call, not from the string: it finds `DbQuery` and the seven documented helpers, takes the first argument, and reads it.
- **One step of data flow.** A literal is read directly; a variable is resolved to the last literal assigned to it before the call. That covers the documented `$sql = …; $this->DbQuery($sql);` shape without pretending to know more.
- **Other forms are reported, not reconstructed (except the bounded BGA-434 prefix described below).** A concatenation, a method call, an append, or a variable assigned in another file produces one located unsupported construct, and no table or column is derived from it — so an unreadable query can never make an undeclared table certain.
- **A statement that is not SQL is reported too.** A helper called with something that does not begin `SELECT`, `INSERT`, `UPDATE`, `DELETE` or `REPLACE` is recorded as unrecognized rather than parsed for tables.

## Fixtures and scenarios

`modern-state-classes` carries the exact line from the review — plus a SQL example in a comment and one in an exception message — and declares its database audit as passing. `modern-broken` builds a query from a filter value and declares the unsupported construct beside its real undeclared-table error.

| Scenario                          | Proves                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| E2E-AUDIT-DATABASE-STRINGS-ONLY   | Three SQL-looking strings that run nothing produce no finding, and one query is read |
| E2E-AUDIT-DATABASE-MODERN-DEFECTS | An assembled query is one unsupported construct, with the real error still reported  |
| E2E-AUDIT-DATABASE-CLEAN          | The legacy project's queries are unchanged                                           |

## Open questions

- **One assignment, one file.** A query built across several statements, or assigned in a helper method, is unreadable here. Following it further would mean interpreting PHP rather than reading it.
- **`DbGetLastId` and the schema-altering statements** the page warns against (`TRUNCATE`, `DROP`) are not read as queries; the first takes no SQL, and the second is a use the documentation tells a game not to make.

## BGA-434 formatted INSERT prefix

A literal INSERT table/column list before one trailing `%s` now supplies references
at an apparent `sprintf` call, directly or via one assignment. The computed VALUES
and possible suffix still produce an unsupported finding. This exception does not
interpret the arguments, prove escaping or function resolution, or certify execution.
`E2E-DATABASE-FORMATTED-INSERT` exercises original templates through installed
public database, aggregate, pre-release and diagnostic-resource consumers. Dynamic
identifiers and every other conversion remain outside this subset. The signed rc.6
artifact and historical records are unchanged; exact-source CI is pending.

The 2026-10-03 real-project rerun leaves Dino Racer `83e2e50` unchanged.
Whole-root and the same digest-matching 18-file production selection each gain the
player INSERT and its three columns. The availability finding disappears; dynamic
VALUES and possible suffixes remain unsupported. Production pre-release counts
change from 26 passed / 1 failed / 6 unsupported / 8 manual-required to
26 / 0 / 7 / 8; whole-root counts change from 0 / 1 / 32 / 8 to 0 / 0 / 33 / 8.
These are separately identified local parser-control and changed-build artifacts,
not new signed releases. All seven tools, three resources, stable repeat, unchanged
tracked game hashes, empty stderr and process exit were observed. The control
fails four focused assertions (including the installed scenario), while the changed
reader passes all 45. Exact-source CI and framework re-admission remain pending.

The integrated local `corepack pnpm check` passes 794 tests and all 235 required
scenarios, including package, applicable conformance, safety and sealed evidence.
The installed and real-project artifact is
`sha256:8eaf0dce7d46e8469b72192e5f269b18bc47fa913aeec63599c709ae4565c994`.
Evidence records dirty source based on `85ce86c`; no clean-source CI is inferred.
Earlier new-scenario mapping failures were corrected before this passing run.
The actual framework release guard retains its stale-review hold.
