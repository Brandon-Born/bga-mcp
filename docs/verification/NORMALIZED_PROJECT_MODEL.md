# Internal normalized project model — BGA-101

The shared request context now retains a typed internal representation of metadata,
options, preferences, states, transitions, actions, methods, notifications,
database objects and queries, statistics, templates, styles, modules and test
files. Each source fact retains its relative source or source set and certainty;
unsupported syntax, omitted eligible files and unreadable configuration remain
explicit unknowns. The action, notification and database tools and aggregate
validators consume the same normalized trace instances. No PHP, SQL or test code
is executed.

The public version-one model and strict tool schemas remain unchanged.
`stripInternal`, already enabled in the build, removes the internal types and
helper from shipped declarations. Inspection publishes bounded
`normalized.*` records in the existing detection signals. These records report
counts, source files and unknowns; they do not expose configuration values,
SQL literals or executable source. The context uses a weak map with request
lifetime, without persistent retention.

JSON and JSONC option/preference definitions are retained as literal data.
Statistics preserve separate table/player namespaces and optional value labels.
Legacy PHP configuration remains present and explicitly unread, including when
its JSON replacement also exists. Template and stylesheet contents, module
execution and runtime test coverage remain unknown. Test-file identification is
a labeled filename heuristic; BGA-425 owns runtime evidence. Normalization is a
representation of known and unknown source facts, not proof of complete game
behavior or correctness.

The existing 200-file/262,144-byte contract budget still applies. Inspection
requests both bounded contract sets, and an oversized eligible file is omitted
with located coverage findings. A schema read failure remains isolated to the
database validator group. Cancellation continues through the existing signal
and checkpoints, and all reads stay inside the policy boundary. Existing final
redaction and output-budget enforcement apply to receipts.

`INT-NORMALIZED-PROJECT` compares declared literal facts, source locations and
unknowns against real filesystem contexts, asserts shared trace identity, and
checks source limits, schema failure isolation and pre-aborted work.
`E2E-NORMALIZED-PROJECT` installs the actual archive, starts the public command,
and compares inspection counts to public action/notification/database results
for original modern, legacy and hybrid fixtures. It also checks discovery,
repeatability, root refusal, clean shutdown and unchanged project digests.
These scenarios do not establish live Studio or runtime-game compatibility.
Integrated full-gate and exact-source CI admission remain the implementation
owner's final handoff requirements.

Sources fetched on 2026-10-07:

- [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference):
  "modules/ - additional game code"; legacy view/template files are deprecated,
  rather than removed.
- [Options and preferences](https://en.doc.boardgamearena.com/Options_and_preferences:_gameoptions.json,_gamepreferences.json):
  "you can use jsonc instead of json" and "The PHP format will continue to work".
- [Game statistics](https://en.doc.boardgamearena.com/Game_statistics:_stats.json):
  "A table statistic can have the same ID as a player statistics"; old PHP files
  remain usable.
- [Game layout](https://en.doc.boardgamearena.com/Game_layout:_view_and_template:_yourgamename.view.php_and_yourgamename_yourgamename.tpl):
  describes the retained template/view pair and generated client templates.
