# Test fixtures

These fixtures are original, minimal structural examples created for `bga-mcp` tests. They contain no publisher artwork, private BGA source, credentials, or production data.

- `projects/modern` represents the current namespaced `modules/php/Game.php`, state-class, ES-module client, and JSON configuration layout described by the official BGA Studio migration guide.
- `projects/legacy` represents the still-encountered root-level game, action, view, template, `states.inc.php`, and PHP configuration layout described as legacy by that guide.

Sources checked on 2026-08-05:

- <https://en.doc.boardgamearena.com/Studio>
- <https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide>

`expected.json` is the declared structural baseline. Fixture-integrity tests hash every file before and after use, scan for banned secret/artifact patterns, and compare the actual file list to that baseline.
