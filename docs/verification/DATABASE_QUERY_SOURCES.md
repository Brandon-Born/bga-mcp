# Database query source verification

Recorded: 2026-08-09. Covers BGA-127, the correctness owner for the database finding of the [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md).

```verification-record
{
  "kind": "run",
  "capabilities": 16,
  "scenarios": 154,
  "claims": 85,
  "tests": 503
}
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
- **Anything else is reported, not reconstructed.** A concatenation, a method call, an append, or a variable assigned in another file produces one located unsupported construct, and no table or column is derived from it — so an unreadable query can never make an undeclared table certain.
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
