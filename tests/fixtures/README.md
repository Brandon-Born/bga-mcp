# Test fixtures

These fixtures are original, minimal structural examples created for `bga-mcp` tests. They contain no publisher artwork, private BGA source, credentials, or production data.

- `projects/modern` represents the current namespaced `modules/php/Game.php`, state-class, ES-module client, and JSON configuration layout described by the official BGA Studio migration guide. It declares no state 1 or 99, because the framework reserves both: `setupNewGame` returns the first state class, and the state identifiers are `StateConstants` members.
- `projects/modern-state-classes` carries the rest of the documented state-class surface: every state type including a `PRIVATE` state reached through `initialPrivate`, `#[PossibleAction]` handlers, `zombie`, and the three documented redirect forms. It declares only its state-machine expectation, because action tracing and notifications for state classes are owned by BGA-125 and BGA-126.
- `projects/modern-unreadable` is deliberately unreadable: a computed state identifier and a computed redirect. It exists to prove the reader reports both and derives nothing from them — no dangling target, no unreachable state.
- `projects/legacy` represents the still-encountered root-level game, action, view, template, `states.inc.php`, and PHP configuration layout described as legacy by that guide.
- `projects/hybrid` represents a project part-way through that migration, which is what most real projects are: PHP metadata and a flat dojo client alongside `modules/php/Game.php` with autowired actions, and a state machine whose second state has moved to `modules/php/States` while the rest is still in `states.inc.php`, in the `GameStateBuilder` form the guide recommends for whatever stays there. Nothing in it is a defect, so every validator must pass it.
- `projects/legacy-broken` and `projects/modern-broken` seed defects, and declare exactly which findings they expect.

Sources checked on 2026-08-05, again on 2026-08-07 for the hybrid fixture, and again on 2026-08-08 for the state-machine fixtures:

- <https://en.doc.boardgamearena.com/Studio>
- <https://en.doc.boardgamearena.com/Studio_file_reference>
- <https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide>
- <https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php>
- <https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js>
- <https://en.doc.boardgamearena.com/State_classes:_State_directory>
- <https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php>

`expected.json` is the declared structural baseline. Fixture-integrity tests hash every file before and after use, scan for banned secret/artifact patterns, and compare the actual file list to that baseline. A fixture's name says what it must declare: `-broken` declares findings for all four validators, `-unreadable` declares unsupported status and unsupported codes only, and anything else declares passes.
