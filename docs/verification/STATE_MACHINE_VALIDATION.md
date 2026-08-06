# State-machine validation verification

Recorded: 2026-08-06. Covers BGA-106.

`validate_state_machine` is the first capability that judges a project rather than describing it. This record states what it checks, how certain each check is, and where it can be wrong.

## The rule catalog

Eleven rules, each published to the client in every result together with its severity, certainty, and known false positives.

### Proven from the declaration — reported as facts

| Rule                             | Severity | Catches                                                   |
| -------------------------------- | -------- | --------------------------------------------------------- |
| `state.initial.missing`          | error    | No state 1, so the game has no entry point                |
| `state.id.duplicate`             | error    | A repeated identifier silently discards the earlier state |
| `state.transition.target-exists` | error    | A transition pointing at a state that is not declared     |
| `state.name.missing`             | warning  | A state the client cannot address                         |
| `state.name.duplicate`           | warning  | Two states sharing a name, making client checks ambiguous |
| `state.type.unknown`             | warning  | A type the framework does not dispatch                    |
| `state.unreachable`              | warning  | No chain of transitions reaches the state from state 1    |
| `state.dead-end`                 | warning  | A non-manager state with no transitions                   |

### Cross-file — reported as heuristics, never as facts

| Rule                                    | Certainty | Catches                                          |
| --------------------------------------- | --------- | ------------------------------------------------ |
| `state.action.handler-missing`          | likely    | An `st…` method no readable PHP source declares  |
| `state.args.handler-missing`            | likely    | An `arg…` method no readable PHP source declares |
| `state.possible-action.handler-missing` | likely    | An `act…` method no readable PHP source declares |

These three are heuristics by construction: a method can exist without being visible to a textual reader — defined dynamically, inherited from a framework class outside the project, or in a file the listing budget skipped. Each finding carries heuristic evidence and states that limitation inline. When no PHP source could be read at all, the rules stay silent rather than reporting every handler as missing.

## Evidence

The complete gate passed on Node 22.17.1 (macOS): 132 tests across 23 files, 97.18% statement, 90.92% branch, 98.64% function, and 97.10% line coverage of `src`, plus official conformance and every verification gate.

### Fixtures

- **`legacy`** gained the handler methods its states name, so it is now a true clean baseline: validation returns `passed` with zero findings.
- **`legacy-broken`** is new. It seeds nine defects at once — a transition to state 42, a duplicate state name, an unknown state type, a dead end, two unreachable states, and three missing handlers — and declares the exact expected status, summary, and finding codes in its `expected.json`. The fixture-integrity gate requires that declaration, so a rule change cannot silently repurpose the fixture.
- **`modern`** returns `unsupported`, not `passed`.

### Packaged scenarios

| Scenario                           | Proves                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------- |
| E2E-VALIDATE-STATES-CLEAN          | A valid machine passes; the rule catalog ships with the result             |
| E2E-VALIDATE-STATES-SEEDED-DEFECTS | Exactly the nine declared defects, with facts and heuristics distinguished |
| E2E-VALIDATE-STATES-UNSUPPORTED    | A layout whose states cannot be read never returns a clean result          |
| E2E-VALIDATE-STATES-IMMUTABLE      | The project directory hash is unchanged after validation                   |
| E2E-VALIDATE-STATES-DETERMINISTIC  | Repeated calls return byte-identical results                               |
| E2E-VALIDATE-STATES-INVALID-INPUT  | Four malformed inputs are rejected by the published schema                 |
| E2E-VALIDATE-STATES-UNLISTED-ROOT  | An unlisted root is refused, with the path redacted                        |

## Deliberate limits

- **Legacy layout only.** Rules read the `states.inc.php` declaration. A modern project's class-based state definitions are recognized and reported as unsupported syntax; no transitions are inferred from them. Extending this is shared work between BGA-101 and this item.
- **Reachability is only as good as the declaration.** A state entered through a computed transition target cannot be seen, so that target is reported as unsupported syntax rather than being silently ignored.
- **No project code is executed.** Every reader is textual. That is what forces the handler rules to be heuristics, and it is the correct trade: running a game's PHP to inspect it would be a far larger risk than an occasional uncertain finding.
