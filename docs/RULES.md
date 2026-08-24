# Pre-release rule catalog

Catalog version 1.6.0. Updated 2026-08-23. Backlog items: BGA-110, BGA-124 through BGA-127, BGA-417 through BGA-420.

[`config/rule-catalog.json`](../config/rule-catalog.json) is the machine-readable source of truth; this file is its human-readable view. `pnpm verify:rule-catalog` fails when a rule is implemented but not catalogued, catalogued but not implemented, catalogued with a severity or certainty its implementation does not use, missing a fixture or a source, or missing from this file.

## What a check records

Every automated check names the rule that implements it, the tool that runs it, its severity and certainty, the fixtures that prove both outcomes, and where the requirement comes from. Source kinds are deliberate:

- **framework-behavior** — the BGA framework will not work otherwise. These are the strongest claims.
- **community-convention** — a widely followed practice rather than a hard requirement, reported at a lower severity.
- **project-inference** — inferred by comparing two parts of a project. Useful, but not a documented rule, and never reported as certain.
- **official-documentation** — cited BGA Studio documentation. The check records the sentence it rests on and the page it came from. The state-machine and action checks that could be traced to a sentence claim this kind; the rest stay framework-behavior, because they are derived from how the framework runs a project rather than stated on a page.

A check with a `failing` fixture is proven in both directions: the valid fixture must not produce it, and the failing fixture must. The gate cross-checks that against the fixture's own declared findings.

## State machine

Run by `validate_state_machine`. Implemented in [`src/rules/state-machine.ts`](../src/rules/state-machine.ts).

| Check                                   | Severity | Certainty | Source kind            | Failing fixture |
| --------------------------------------- | -------- | --------- | ---------------------- | --------------- |
| `state.action.handler-missing`          | warning  | likely    | framework-behavior     | yes             |
| `state.args.handler-missing`            | warning  | likely    | framework-behavior     | yes             |
| `state.dead-end`                        | warning  | certain   | framework-behavior     | yes             |
| `state.id.duplicate`                    | error    | certain   | official-documentation | no              |
| `state.id.reserved`                     | warning  | certain   | official-documentation | modern only     |
| `state.initial.missing`                 | error    | certain   | official-documentation | no              |
| `state.name.duplicate`                  | warning  | certain   | official-documentation | yes             |
| `state.name.missing`                    | warning  | certain   | official-documentation | no              |
| `state.possible-action.handler-missing` | warning  | likely    | framework-behavior     | no              |
| `state.transition.target-exists`        | error    | certain   | official-documentation | yes             |
| `state.type.unknown`                    | warning  | certain   | official-documentation | yes             |
| `state.unreachable`                     | warning  | certain   | framework-behavior     | yes             |

Two of these are about the framework's own states rather than the project's. Identifiers 1 and 99 are reserved, exist whether or not a project declares them, and must not be modified, so no rule judges them — except `state.id.reserved`, which reports a state class that takes one, because the documentation says a class "cannot use 1 or 99". Where the game starts is read from whichever form the project uses to declare it: the class `setupNewGame` returns, the declared state 1, or the documented default of state 2.

A rule that depends on reading the whole machine — `state.transition.target-exists` and `state.unreachable` — reports nothing when part of it could not be read. The unreadable construct is reported instead, with the file it is in. This is why a fixture of deliberately unreadable syntax may declare no certain finding at all.

## Action contracts

Run by `validate_action_contracts`. Implemented in [`src/rules/action-contracts.ts`](../src/rules/action-contracts.ts).

| Check                          | Severity    | Certainty | Source kind            | Failing fixture |
| ------------------------------ | ----------- | --------- | ---------------------- | --------------- |
| `action.argument.invalid`      | error       | certain   | official-documentation | modern only     |
| `action.argument.mismatch`     | warning     | likely    | official-documentation | yes             |
| `action.call.not-declared`     | warning     | likely    | official-documentation | yes             |
| `action.declared.not-called`   | information | possible  | project-inference      | no              |
| `action.entry-point.duplicate` | error       | certain   | framework-behavior     | no              |
| `action.entry-point.missing`   | warning     | likely    | official-documentation | yes             |
| `action.game-method.missing`   | warning     | likely    | framework-behavior     | yes             |
| `action.name.convention`       | information | certain   | community-convention   | yes             |
| `action.trace.unavailable`     | information | certain   | framework-behavior     | no              |

An action reaches the server by one of three documented routes, and a real project uses more than one at a time: the legacy `<game>.action.php` dispatcher, which wins wherever it declares the action; an autowired `act…` method on the game class, which the framework checks "for actions that can be triggered at any state"; and a `#[PossibleAction]` method on a state class, which is that state's action. An action the game class declares is therefore never reported as one no state allows.

Those scopes stay distinct. Equal names in separate state classes are not duplicates. When static client source cannot identify which state-local signature receives a call, differing signatures produce unsupported syntax rather than a comparison against the first file enumerated. Private and protected helpers in a legacy dispatcher are not public entry points. Computed client argument objects likewise remain unknown; only a known literal shape is compared.

The client sends what the parameter names, not what the variable is called: `#[IntParam(name: 'id')] int $cardId` expects `id`. The framework fills `$args`, `$activePlayerId`/`$active_player_id`, `$activePlayerNo`, `$currentPlayerId`/`$current_player_id`, and `$currentPlayerNo` itself, so none of them is an argument the client is missing. Where a parameter attribute declares a check and the client writes the value out as a literal, `action.argument.invalid` compares the two.

## Notifications

Run by `validate_notifications`. Implemented in [`src/rules/notifications.ts`](../src/rules/notifications.ts).

| Check                                 | Severity    | Certainty | Source kind            | Failing fixture |
| ------------------------------------- | ----------- | --------- | ---------------------- | --------------- |
| `notification.handled.not-sent`       | information | possible  | project-inference      | yes             |
| `notification.payload.mismatch`       | warning     | likely    | official-documentation | yes             |
| `notification.sent.not-handled`       | warning     | likely    | official-documentation | yes             |
| `notification.subscription.duplicate` | warning     | certain   | framework-behavior     | yes             |
| `notification.trace.unavailable`      | information | certain   | framework-behavior     | no              |

A send is read in any of its documented spellings: legacy `notifyAllPlayers`/`notifyPlayer`, `$this->bga->notify->all`/`->player` on the game class, and the state-class shortcut `$this->notif->all`, which the migration guide describes as reaching the same sub-object "without needing to pass through the game variable".

A `notif_…` method is a handler only once something registers it. `setupPromiseNotifications` "auto-detect[s] all notifications declared on the game object (functions starting with `notif_`)", so its `prefix` decides what counts and its `ignoreNotifications` list removes names entirely — for those, "you'll need to subscribe to it manually", and a manual `dojo.subscribe` binds them again. A method nothing registers is reported as what it is: the send that reaches it lands nowhere.

The types the framework predefines — `message`, `tableWindow`, `simplePause` — need no handler, and sending one is never reported as unhandled.

An omitted payload is known empty. A payload assembled in a variable, helper, or spread is unknown: its independently readable notification name remains in the trace, but payload-key comparison is suppressed and the validator reports unsupported syntax.

## Database usage

Run by `audit_database_usage`. Implemented in [`src/rules/database.ts`](../src/rules/database.ts).

| Check                         | Severity    | Certainty | Source kind            | Failing fixture |
| ----------------------------- | ----------- | --------- | ---------------------- | --------------- |
| `database.audit.unavailable`  | information | certain   | framework-behavior     | no              |
| `database.column.duplicate`   | error       | certain   | framework-behavior     | no              |
| `database.column.undeclared`  | warning     | likely    | official-documentation | yes             |
| `database.column.unused`      | information | possible  | project-inference      | yes             |
| `database.query.interpolated` | warning     | likely    | community-convention   | yes             |
| `database.table.duplicate`    | error       | certain   | framework-behavior     | no              |
| `database.table.undeclared`   | error       | certain   | official-documentation | yes             |

A quoted string becomes a query only where data flow puts it in one of the framework's documented database methods: `DbQuery`, which "is the generic method to access the database", or one of the specialized SELECT helpers — `getUniqueValueFromDB`, `getCollectionFromDB`, `getNonEmptyCollectionFromDB`, `getObjectFromDB`, `getNonEmptyObjectFromDB`, `getObjectListFromDB`, `getDoubleKeyCollectionFromDB`. A literal argument is read, and a variable is followed to the last literal assigned to it before the call.

Anything else — an example in a comment, a message in an exception, a string assigned and never run, a query concatenated from a value only the running game has — is not a query. Where such an argument reaches a helper, it is reported as one located unsupported construct, and no table or column is reconstructed from it.

Within a readable `SELECT`, explicit and implicit result aliases are output names rather than schema columns. Explicit and implicit table aliases resolve qualified columns back to the underlying table. Expressions, subqueries, and CTEs outside the supported subset remain located unsupported constructs, and an incomplete query suppresses the inferred unused-column check.

A reported query carries its shape, not its values. `escapeStringForDB` "makes sure that no SQL injection will be done through the string used, as long as the SQL statement uses single quotes around the string", so a quoted run is where a value sits, and `WHERE card_location = 'hand'` is published as `WHERE card_location = '?'` — in the query text, in the findings that quote it, and in the messages that report an unreadable statement. An interpolation survives the mask, because which variable reaches a query is the whole content of `database.query.interpolated`. What a developer needs to fix a query is which table, which column, and where; what the value was is data, and one of those values was a password in the project the 2026-08-08 review ran against.

## Manual-only checks

These are part of a BGA pre-release review and cannot be automated. `run_pre_release_audit` reports them as manual-required; it never counts them as passed.

| Check                         | Why it cannot be automated                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| `manual.artwork.rights`       | A tool cannot judge provenance or licensing of a binary asset.     |
| `manual.rules.fidelity`       | Requires reading the physical rulebook against the implementation. |
| `manual.translation.strings`  | Judging whether a string reads naturally is a human decision.      |
| `manual.tutorial.quality`     | Quality of explanation cannot be measured statically.              |
| `manual.accessibility.colour` | Requires visual inspection of the rendered interface.              |
| `manual.multiplayer.testing`  | Requires running real tables with real players.                    |
| `manual.spectator.replay`     | Requires observing a live table and its replay.                    |
| `manual.performance.table`    | Requires measuring a live table.                                   |

## Changing the catalog

1. Implement or change the rule, with its severity and certainty.
2. Update the catalog entry and, where the outcome changes, the fixture that declares it.
3. Update this file.
4. Run `pnpm check`. A rule and its catalogue entry cannot drift apart without failing the build.
