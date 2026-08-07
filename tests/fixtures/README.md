# Test fixtures

These fixtures are original, minimal structural examples created for `bga-mcp` tests. They contain no publisher artwork, private BGA source, credentials, or production data.

- `projects/modern` represents the current namespaced `modules/php/Game.php`, state-class, ES-module client, and JSON configuration layout described by the official BGA Studio migration guide.
- `projects/legacy` represents the still-encountered root-level game, action, view, template, `states.inc.php`, and PHP configuration layout described as legacy by that guide.
- `projects/hybrid` represents a project part-way through that migration, which is what most real projects are: PHP metadata and a flat dojo client alongside `modules/php/Game.php` with autowired actions, and a state machine whose second state has moved to `modules/php/States` while the rest is still in `states.inc.php`. Nothing in it is a defect, so every validator must pass it.

Sources checked on 2026-08-05, and again on 2026-08-07 for the hybrid fixture:

- <https://en.doc.boardgamearena.com/Studio>
- <https://en.doc.boardgamearena.com/Studio_file_reference>
- <https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide>
- <https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php>
- <https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js>

`expected.json` is the declared structural baseline. Fixture-integrity tests hash every file before and after use, scan for banned secret/artifact patterns, and compare the actual file list to that baseline.
