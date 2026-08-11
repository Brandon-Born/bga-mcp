# Modern state semantics verification

Recorded: 2026-08-08. Covers BGA-124, the correctness owner for the state-machine findings of the [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md).

This record describes a run, so it states which one. `pnpm verify:evidence` compares every number below with the artifact that run produced, and fails when they disagree — a record that stops being true has to be updated or marked historical, not left to drift.

```verification-record
{
  "kind": "run",
  "capabilities": 16,
  "scenarios": 157,
  "claims": 90,
  "tests": 526
}
```

The review installed the packed artifact, pointed it at a project written to the state-class documentation, and got confident nonsense back. This record states what was wrong, what the documentation actually says, what changed, and what is proven by which test.

## What the installed package got wrong

| Observed                                                                                 | Why it was wrong                                                                                            |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| certain error `state.initial.missing` for a project whose `setupNewGame` returns a class | A state-class project has no state 1 to declare; the initial state is the class `setupNewGame` returns      |
| two certain `state.unreachable` warnings for valid states                                | The states were reached by handler redirects, which the reader did not read at all                          |
| `project.states.unsupported` for `id: StateConstants::STATE_PLAYER_TURN`                 | Named state constants are documented, and resolvable from the source that declares them                     |
| certain `state.type.unknown` for `StateType::PRIVATE`                                    | `PRIVATE` is one of the four documented types; the rule's list had `manager`, which the documentation drops |
| pre-release turned an unreadable state class into two failed checks and `unsupported: 0` | A check whose input could not be read has no verdict, and never a failing one                               |
| the "clean modern" fixture declared class states 1 and 99 with `StateType::MANAGER`      | That project could not exist, so it hid every defect above                                                  |

## What the documentation says

Quoted from the pages this work was built against:

- [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) — "To indicate your initial state, add `return PlayerTurn::class;` to the code of `setupNewGame` function in Game.php"; "Note: you may use any ID, even an ID greater than 100. But you cannot use 1 or 99."; "You can use 4 types of game states" (ACTIVE_PLAYER, MULTIPLE_ACTIVE_PLAYER, PRIVATE, GAME, each with the name the array notation uses); a handler may return "a class name", "a state id … It must be typed as int", or "a transition name"; "The possible actions for this states don't need to be declared as an array, they will be found with the tag `#[PossibleAction]`"; and the `StateConstants` example under "Using Named Constants for States".
- [Your game state machine: states.inc.php](https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php) — "ID=1 is reserved for the first game state and should not be used (and you must not modify it)"; "ID=99 is reserved for the last game state"; the `GameStateBuilder` chain; `1 => GameStateBuilder::gameSetup(2)->build()` with "only keep this line if your initial state is not 2"; and the `define()` constants example.
- [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) — "States 1 and 99, that must not be changed, are now optional"; "Create a State class for each state of the game (except 1 and 99 if they are still described in states.inc.php)".

## What changed

- **The entry point is read, not assumed.** `ProjectStates.initial` records the state or states the framework enters first and how that was established: the class `setupNewGame` returns, the declared state 1, or the documented default of state 2. `state.initial.missing` fires only when none of the three exists.
- **Identifiers 1 and 99 belong to the framework.** They count as declared whether or not the project declares them, and no rule about naming, typing, dead ends, or reachability judges them. The one thing worth reporting is a state class that takes one, which the new `state.id.reserved` check does.
- **Constants are resolved without running anything.** `define()` calls, class constants, and `self::` references are collected from the readable sources and used for state identifiers and transition targets in both spellings.
- **`GameStateBuilder` is read.** The fluent chain carries the same fields as the array, and the framework's own `gameSetup(N)` and `endScore()` states are marked as the framework's rather than judged as the project's.
- **Handler redirects are edges.** `return NextPlayer::class`, `return 99`, `return StateConstants::ST_END_GAME`, `return 'nextPlayer'`, and `initialPrivate` all reach a state, so reachability and dead ends see the machine the framework runs.
- **Descriptions, `getArgs`, `onEnteringState`, `zombie`, and `#[PossibleAction]` survive normalization**, including a `clienttranslate` description containing brackets or quotes: the readers mask string and comment content before counting brackets.
- **An unreadable construct silences what depends on it.** Every construct the reader cannot interpret is reported once, with the file it is in, and records whether it leaves the set of states or only an edge incomplete. `state.transition.target-exists` needs complete declarations; `state.unreachable` needs complete declarations and edges; `state.dead-end` needs the state's own edges. Nothing is derived from a machine that was only partly read.
- **Pre-release keeps unsupported.** A check whose validator reported any unreadable construct is `unsupported` with a reason, never `passed` and never `failed`.

## Fixtures

| Fixture                | Is                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modern`               | Replaced. No state 1 or 99 class; `setupNewGame` returns `PlayerTurn::class`; `StateConstants` identifiers; class and identifier redirects           |
| `modern-state-classes` | New. Every documented state type including `PRIVATE` behind `initialPrivate`, `#[PossibleAction]` handlers, `zombie`, all three redirect forms       |
| `modern-unreadable`    | New. A computed identifier and a computed redirect, and nothing else: the reader must report both and derive nothing                                 |
| `modern-broken`        | Readable defects only: a dangling target, an undocumented type, a duplicate name, a dead end, an unreachable state, and a class taking identifier 99 |
| `hybrid`               | Now uses `GameStateBuilder` with `define()` constants, declares neither reserved state, and still crosses both sources in each direction             |
| `legacy`               | Unchanged: the array form with states 1, 2 and 99, which the framework still reads                                                                   |

The fixture-integrity gate learned the third kind of fixture: one named `-unreadable` must declare `unsupported` status and only unsupported codes, so the moment a rule derives a certain finding from a machine it could not read, the gate fails.

## Packaged scenarios

| Scenario                              | Proves                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| E2E-VALIDATE-STATES-MODERN-CLEAN      | The documented `setupNewGame` project passes, with the entry point and its evidence in the public result      |
| E2E-VALIDATE-STATES-MODERN-CONSTRUCTS | Constants, every documented type, `#[PossibleAction]`, and all three redirect forms produce no finding at all |
| E2E-VALIDATE-STATES-MODERN-DEFECTS    | The readable defects are found exactly, including the reserved identifier a class took                        |
| E2E-VALIDATE-STATES-UNSUPPORTED       | Both unreadable constructs are reported with their files, and no dangling-target or unreachable claim is made |
| E2E-PRE-RELEASE-UNSUPPORTED-PRESERVED | Unreadable syntax leaves every state check `unsupported` with a reason, and fails none of them                |
| E2E-INSPECT-PROJECT-MODERN            | The entry point, origins, and descriptions cross the public schema                                            |
| E2E-INSPECT-PROJECT-HYBRID            | The `GameStateBuilder` half and the class half are read as one machine                                        |

Unit and integration coverage sits under each of those: `tests/unit/project-modern.test.ts` for the reader, `tests/unit/project-parse.test.ts` for the array and builder spellings, `tests/unit/state-machine-rules.test.ts` for the rules, and `tests/integration/project-model.test.ts` and `tests/integration/state-machine-validation.test.ts` for the fixtures.

## Corrected false negatives and positives elsewhere

- `state.id.duplicate` could not fire: merging states by identifier hid the duplicate. Duplicates are now detected per source, before the merge, and reported.
- `state.unreachable` no longer reports state 99 in a legacy project whose only path to it is broken. The framework ends the game there, so the claim was not the reader's to make; `legacy-broken` declares one unreachable state instead of two.

## Open questions

Recorded rather than guessed at:

- **`manager` is not in the current documentation.** Older project skeletons typed the reserved states 1 and 99 `manager`, and real projects still contain it. Those two identifiers are not judged, so the value is accepted there; on any other state it is reported as an undocumented type. Whether the framework still dispatches `manager` at all is not stated on any page found.
- **The default entry point of a state-class project.** The state-class page says "If you don't return anything its state 2 (\*to be confirmed\*)". The reader uses state 2 and says so in its evidence string; the documentation's own uncertainty is not resolved here.
- **A transition target written as a class name.** `initialPrivate` accepts `PlaceCard::class` and so do several `gamestate` methods, but the `transitions` map is documented with identifiers only. A class name there is reported as unreadable rather than assumed to work.
- **`GameStateBuilder::endScore()`.** Documented as calling `stEndScore`, with nothing said about its transitions. It is marked as the framework's own state, and no rule judges it.
