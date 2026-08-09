# Action contract verification

> [!CAUTION]
> Historical evidence only. The [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md) reopened the associated backlog and manifest claims. Do not treat this record as current release verification.

Recorded: 2026-08-06. Covers BGA-107.

`validate_action_contracts` is the first capability that reads both sides of a BGA project. A player action crosses three files in two languages — the client calls it, an entry point receives it, a game method handles it — and nothing in the framework complains when they drift apart. This record states what the tool proves, what it only suspects, and where it stays silent.

## What it traces

For every action it can read:

1. **The client call** — legacy `this.ajaxcall('/game/game/actPass.html', {…})` or modern `this.bgaPerformAction('actPass', {…})`, including the argument names sent.
2. **The entry point** — a method of the action class, including the request arguments it reads through `getArg` or straight from `$_POST` / `$args`.
3. **The game method** — a method of the same name declared outside the action class.

The trace itself is returned, not just the findings: client calls, entry points, declared actions, and game methods all appear in the result so a developer can check the tool's reasoning.

## The rule catalog

### Proven from the text — reported as facts

| Rule                           | Severity    | Catches                                                           |
| ------------------------------ | ----------- | ----------------------------------------------------------------- |
| `action.entry-point.duplicate` | error       | Two entry points in the action class sharing a name               |
| `action.name.convention`       | information | A called action that does not follow the `act…` naming convention |
| `action.trace.unavailable`     | information | One side of the contract could not be read at all                 |

### Cross-file — reported as heuristics

| Rule                         | Certainty | Catches                                                                   |
| ---------------------------- | --------- | ------------------------------------------------------------------------- |
| `action.call.not-declared`   | likely    | The client calls an action no state lists                                 |
| `action.entry-point.missing` | likely    | A called action with no entry point of that name                          |
| `action.game-method.missing` | likely    | An entry point with no game method of that name                           |
| `action.argument.mismatch`   | likely    | An argument one side sends and the other never reads, in either direction |
| `action.declared.not-called` | possible  | A declared possible action no readable client source calls                |

`action.declared.not-called` is deliberately the weakest claim in the project: a client can build a call name at runtime, route through a helper, or live outside the read budget, so it is `possible` rather than `likely` and carries two recorded limitations.

## Not guessing

Three behaviors keep the tool honest:

- **A call it cannot read becomes unsupported syntax.** `ajaxcall('/g/g/' + name + '.html')` or `bgaPerformAction(actionName)` is reported as an unreadable construct — never resolved, never ignored.
- **A missing side makes the whole result inconclusive.** With no readable client source, action class, or state machine, the result is `action.trace.unavailable` rather than `passed`. A modern project hits this today.
- **No project code is executed.** Every reader is textual, which is exactly why the cross-file rules are heuristics rather than facts.

## Evidence

The complete gate passed on Node 22.17.1 (macOS): 160 tests across 26 files, 97.03% statement, 89.96% branch, 98.89% function, and 96.95% line coverage of `src`, plus official conformance and every verification gate.

### Fixtures

Both legacy fixtures gained real action wiring, so the contract is traced against something a BGA developer would recognize:

- **`legacy`** — client sends `actPass` with a `comment` argument; the entry point reads `comment` and calls the game method of the same name. Validation returns `passed`.
- **`legacy-broken`** — seeds four defects: an argument the client sends but the entry point ignores (`cardId`), an argument the entry point reads but the client never sends (`comment`), an action no state allows and no entry point receives (`actGhost`), and an action that breaks the naming convention (`passTurn`). Eight findings in total, declared in its `expected.json`.

Adding a real `actPass` entry point also removed one heuristic from the BGA-106 state-machine result, because the action class now genuinely declares that method. The broken fixture's declared state-machine expectations were updated from nine findings to eight to match — the rule did not change, the fixture became more realistic.

### Packaged scenarios

| Scenario                            | Proves                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| E2E-VALIDATE-ACTIONS-CLEAN          | A healthy contract passes and the full trace is returned               |
| E2E-VALIDATE-ACTIONS-SEEDED-DEFECTS | Exactly the eight declared defects, facts and heuristics distinguished |
| E2E-VALIDATE-ACTIONS-UNTRACEABLE    | A contract that cannot be traced never returns clean                   |
| E2E-VALIDATE-ACTIONS-IMMUTABLE      | The project directory hash is unchanged                                |
| E2E-VALIDATE-ACTIONS-DETERMINISTIC  | Repeated calls return byte-identical results                           |
| E2E-VALIDATE-ACTIONS-INVALID-INPUT  | Four malformed inputs are rejected by the published schema             |
| E2E-VALIDATE-ACTIONS-UNLISTED-ROOT  | An unlisted root is refused, with the path redacted                    |

## Deliberate limits

- **Legacy client and action class only.** A modern project's attribute-based entry points are not read yet, so it reports `action.trace.unavailable`. That reader is shared work with BGA-101.
- **One naming convention.** The `act…` rule matches the modern framework requirement. A legacy project using another convention will see an information-level finding, which is why it is information and not a warning.
- **Arguments are compared by name, not type.** Type agreement would need the `AT_…` validators and the game method signature; that is a candidate for BGA-110's rule catalog, not a silent extension here.
