# Documentation relevance implementation

```verification-record
{"kind":"review","scope":"BGA-211 bounded development documentation relevance, selected-excerpt cache binding and current captured/live evaluations; historical replay acceptance remains open"}
```

BGA-211, reviewed 2026-10-02. Engineering evidence remains separate from documentation release admission.

The installed development MCP previously reused a URL's excerpt for a different question. Retrieval now binds an excerpt to its question, character limit and final source identity. All selections share the bounded, in-memory LRU; forgetting a URL drops its selections. A failed fetch may return only a matching dated stale selection, never another question's answer. No full page text, project content or persistent index is stored. The subsequent [reader lifecycle implementation](DOCUMENTATION_CACHE_LIFECYCLE.md) consults exact final-page selections before fetching; redirect aliases still fetch to establish ownership.

Reviewed location and overview hints select complete source paragraphs or sections. They retain the migration condition and legacy wording. Hidden script/template/comment content is removed before selecting a paragraph. Navigation is excluded by observed markup, with the reviewed file-reference contents list retained as a source quotation; unknown markup falls back to heuristic ranking. Search no longer adds every topic keyword to every question. The current linked Game.php and Game.js URLs replace the old topic paths. Narrow instruction-shaped local requests produce no documentation answers; this heuristic is not a general prompt-injection detector. Both readers enforce 1,200 characters after redaction, including warm results.

The source review starts at the [official file reference](https://en.doc.boardgamearena.com/Studio_file_reference) and follows its game, client, state, migration, Studio and Cookbook links. The source says “When all classes are migrated, you can remove the states.inc.php file”; the reader preserves that condition. A location hint never authorizes deleting legacy files or assumes the whole project migrated together.

## Reproducible evidence

- `UNIT-DOC-QUERY-CACHE`: question/budget/source separation, matching stale fallback, refusal of unmatched fallback, bounded eviction and whole-URL invalidation.
- `UNIT-DOC-RELEVANCE-ORACLE`: all nine original questions and seven fixed topics, unchanged thresholds, capture digests, minimal quotation budgets, exact-page/required/forbidden passage scoring, and refusal-aware no-answer scoring.
- `E2E-DOC-RELEVANCE-CAPTURES`: discovered installed MCP search/resources pass the maintained question and topic oracles. Captures are excluded from the package.
- `E2E-DOC-QUERY-CACHE`: the same installed live client answers two original synthetic questions about one page and caches only the matching selection.
- `E2E-DOC-EXCERPT-BUDGET`: cold/warm search and resources keep redacted synthetic excerpts within 1,200 characters.
- `E2E-DOC-RELEVANCE-MUTATION`: atomic replacement of an installed module removes navigation/passage selection; the unchanged oracle fails. Restoration does not edit pnpm hardlinked peers.

The reviewed [captures and expectations](../../tests/fixtures/docs/relevance/expectations.json) contain at most 25 quoted words per page, with canonical URL, authority, source policy, date, revision and digest. HTML wrappers retain a bounded selection example; omitted prose and real API ranking are not reconstructed. No real game, art or credential is used. `config/doc-evaluation.json` and its thresholds remain unchanged. Captures refresh only after explicit official-page review; neither evaluation nor drift detection rewrites them.

The live driver installs a tarball and exercises the same MCP/oracle for all nine questions and seven topics, records its artifact digest and harness source state, closes the client, waits for process exit and removes its temporary installation. `--artifact PATH` can select original retained bytes; `--output PATH` retains the observation. A refusal, malformed response or degraded lookup cannot pass a no-answer case. An installed partial-page failure proves that the driver does not turn unavailable documentation into a genuine empty answer. The live command is deliberately outside `pnpm check`. Ranking outcomes and source-review metadata are separate; a missing answer alone is never asserted to be source drift.

## Before/after and remaining scope

The unmodified `795d4526429e3e69bba23c6628c201a56172809c` package reproduces a below-threshold result against these current minimal captures: 4/9 answered, 6/9 attributed, with failures for game-class-location, migration-states, file-reference, software-versions and adversarial-instruction; game-logic, file-reference and studio topics also fail. The baseline tarball digest is `sha256:8364970f9376267cd04c4544c1ad2b018665428315a60dca1451361dc4658c2b`. The external source supplies original empty API envelopes and scripted old-name redirects. This is actual installed baseline behavior under those stated conditions, not the historical live wiki's ranking.

The initial affected suites pass 45 tests before the budget/visibility corrections. The final affected suites pass 47 tests and the complete local `pnpm check` passes all 760 tests / 229 required scenarios on the corrected implementation. Its runtime, coverage, package, applicable conformance and safety stages pass; final evidence verification initially refused this document’s missing review marker. Those scoped gates completed the initial handoff; the later visibility/file-list correction passes a complete integrated `pnpm check` with exit zero. An initial deliberate installed live run passes 9/9 questions and 7/7 topics on artifact `sha256:d14a2371463da1a7eeaedb1b6d3ac34e3647778e4ac66babc3c0384b280c3f6f`; this predates integrated manifest/evidence changes and is preparation evidence, not final-source CI. The final retained tarball `sha256:d3e2699f6900780bd68100b9a9872af9ef1d022d0c5a17c091e95c946af46639` passes the strengthened current capture oracle (9/9 questions, 7/7 topics) and a fresh installed live run (9/9, 7/7). Public MCP inspection of clean Dino Racer `83e2e50` reports modern layout, no errors/warnings and one explicit unsupported source-scope finding for 23 non-production local files; the project remains Git-clean with empty server stderr. This is inspection, not gameplay or BGA-424 completion. The [bounded evaluation receipt](bga211-source-evaluation.json) preserves before/after conditions, both live observations, dirty preparation source and scoped local gate completion. [Exact-source CI 37049613335](https://github.com/Brandon-Born/bga-mcp/actions/runs/37049613335) passes all six jobs at clean `6f1d01d`, with independently validated sealed records. This covers the relevance implementation and later harness correction; subsequent lifecycle implementation requires its own evidence.

**The exact historical five-question/three-topic A/B acceptance is not established.** The live 2026-08-08/13 observations had different source revisions and API rankings; these minimal current captures do not reproduce that exact failure set. Keep that requirement open rather than constructing a fake historical response or changing the maintained questions. BGA-211 remains implemented, not verified. Documentation capabilities remain implemented and excluded from the public command. Framework freshness, original candidate/signing/security/client approvals, Studio and publication readiness are separate gates.

## Sources

- [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference)
- [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php)
- [Game interface logic: Game.js](https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js)
- [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory)
- [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide)
- [Studio software versions](https://en.doc.boardgamearena.com/Studio#Software_Versions)
- [BGA Studio Cookbook](https://en.doc.boardgamearena.com/BGA_Studio_Cookbook), community edited, not official guidance.

The subsequent evaluation-harness check also rejects a genuine installed degraded lookup for the no-answer question. All seven focused tests, lint and types pass after this harness correction; the same exact-source CI passed the entire integrated handoff. This correction does not change package bytes.
