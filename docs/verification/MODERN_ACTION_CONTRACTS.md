# Modern action contract verification

Recorded: 2026-08-09. Covers BGA-125, the correctness owner for the action findings of the [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md).

```verification-record
{
  "kind": "run",
  "capabilities": 16,
  "scenarios": 157,
  "claims": 90,
  "tests": 526
}
```

## What the installed package got wrong

| Observed                                                                                                               | Why it was wrong                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `action.entry-point.missing` for `#[PossibleAction] actPlay(int $cardId, int $active_player_id, int $currentPlayerId)` | Entry points were read from `.action.php` and `Game.php` only, so a state class's own actions were invisible |
| `action.call.not-declared` for a valid game-class `actPass`                                                            | The framework checks Game.php "for actions that can be triggered at any state", so no state has to list it   |
| Both player identifiers exposed as client arguments                                                                    | They are magic parameters the framework fills, in camel and snake case                                       |
| `#[IntParam]` skipped entirely                                                                                         | The attribute decides the name the client sends and the check the framework runs before calling              |

## What the documentation says

- [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) — "Every normal function should have a `#[PossibleAction]` attribute on top of it to indicate the front it's a normal action for the player"; the magic parameters `array $args`, `int $activePlayerId` (or `int $active_player_id`), `int $activePlayerNo`, `int $currentPlayerId` (or `int $current_player_id`), `int $currentPlayerNo`; and "If you trigger an action from the front, and it's not declared in this state, the framework will check if the function exists in the Game.php file (for actions that can be triggered at any state)."
- [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) — "The query param from the front request will be matched with the PHP variable of the same name, and it needs to be properly typed"; "(Note: if you also declare the function in the action.php, it will be used instead of the autowiring)"; the attributes `BoolParam`, `IntParam`, `FloatParam`, `StringParam`, `IntArrayParam` and `JsonParam`, each with the check it runs — `IntParam(min: 1)` "will trigger an exception if param is < 1", `StringParam(enum: […])` "will trigger an exception if the parameter doesn't match a value in the enum"; and the note that autowired actions do **not** support `$playerId`.

## What changed

- **Three routes, read together.** `.action.php` still wins where it declares an action, the game class's autowired `act…` methods are entry points, and a state class's `#[PossibleAction]` methods are the entry points of that state. An `act…` method in a state class without the attribute is a method, not an advertised action.
- **The game class answers for any state.** An action it declares is never reported as one no state allows. The legacy dispatcher does not get that exemption, because `possibleactions` is what constrains it.
- **The framework's parameters are not the client's.** Every documented alias, camel and snake case, is excluded from the contract; `$playerId` is not among them, exactly as documented.
- **The attribute names the argument.** `#[IntParam(name: 'id')] int $cardId` expects `id` from the client, so the comparison is made against what the framework will actually look for.
- **The attribute's check is compared with the literal the client sends.** Where the client writes the value out — `{ gold: 0 }` against `#[IntParam(min: 1)]` — the new `action.argument.invalid` reports the call that cannot work. A computed value states nothing and is not judged.
- **Shorthand counts.** `{ tokenId }` sends `tokenId`, and the `action` key is framework-owned only in a legacy `ajaxcall`, not in `bgaPerformAction` — where the documentation's own example expects a parameter called `action`.

## Fixtures and scenarios

`modern-state-classes` now declares its action contract as passing: it carries `#[PossibleAction]` handlers with injected parameters, a game-class action no state lists, and shorthand client calls. `modern-broken` sends `{ cardId: 9 }` to a parameter declared `#[IntParam(min: 1, max: 5)]` and declares the resulting error.

| Scenario                            | Proves                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| E2E-VALIDATE-ACTIONS-STATE-CLASSES  | State-class entry points, injected aliases, and the game-class fallback produce no finding |
| E2E-VALIDATE-ACTIONS-MODERN-DEFECTS | The attribute violation is reported as a certain error, with the entry point it belongs to |
| E2E-VALIDATE-ACTIONS-MODERN-CLEAN   | A game-class project keeps its clean trace                                                 |
| E2E-VALIDATE-ACTIONS-CLEAN          | The legacy `.action.php` route is unchanged                                                |

## Open questions

- **`#[CheckAction(false)]`** marks an action that runs outside the player's turn. It is read as an ordinary entry point; whether an action carrying it should be exempt from any state-related rule is not something the documentation settles.
- **`JsonParam(class: …)`** maps a payload onto a class. The attribute is recognized and its name honoured, but the shape of the mapped object is not compared with what the client sends.
