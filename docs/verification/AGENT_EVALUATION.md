# BGA-424 real development evaluation

```verification-record
{
  "kind": "review",
  "scope": "BGA-424 actual development tasks against signed rc.2, limited usefulness and BGA-431 failing installed regression"
}
```

Current handoff: the rc.2 observations below are historical and remain unchanged
for those bytes. BGA-431 is corrected in independently verified signed rc.3, and
[explicit frozen-task carry-forward](AGENT_EVALUATION_CARRY_FORWARD.md) repeats
all 23 calls and independent checks. BGA-424 is now verified for that bounded
sample. Use the [rc.3 ledger](agent-evaluation-v1.0.0-rc.3.json) for the current
artifact and observed differences; no productivity or game-correctness claim is
added.

## Historical rc.2 observation

Observed 2026-10-01 locally / 2026-10-02 UTC. **Conclusion: useful for bounded
framework wiring, limited for diagnosis and gameplay review. Release is blocked
by BGA-431.** The three development tasks ran; this evaluation remains
`implemented` until the extracted parser regression passes and affected tasks
are repeated against an explicitly identified replacement candidate.

The [frozen task definitions](AGENT_EVALUATION_TASKS.md) preceded evaluated
production edits. The [sanitized machine ledger](agent-evaluation-v1.0.0-rc.2.json)
records 23 actual calls, revisions, source selection, diagnostic counts and
private-receipt digests. Preparation, consumer smoke and the original reproducer
are additional evidence, excluded from that 23-call total.

## Evaluated artifact and client

The independently downloaded and cryptographically verified original
`v1.0.0-rc.2` tarball has SHA-256
`f8d589613396222078578784dc4c5f71f69107709704c1dcc629506ab02d3c82`, source
`f5f5297c6d98fd0d0aadc3ce98ca01536ed75c74`. The
[candidate receipt](release-candidate-v1.0.0-rc.2.json) and
[signing receipt](release-signing-v1.0.0-rc.2.json) identify producer, signer,
original bytes, six-platform source CI and independent consumers. Rc.1 is
unchanged; results here apply to rc.2 only. Signing establishes integrity and
identity; the newly discovered defect prevents this candidate advancing.

The actual owner-directed Codex desktop agent chose calls while developing the
authorized private project. An explicit bridge used the real `codex-cli 0.159.2`
app-server MCP stack on macOS arm64 / Node 22.17.1. It started no additional
inference turn. This demonstrates agent use of that stack, not GUI discovery,
blind diagnosis, another client's behavior, or autonomous tool selection inside
the CLI process. Client binary, bridge and driver digests are retained.

For each call, the caller selected all tracked `modules/` files and recognized
root framework files into a separate canonical root. Working source and selected
snapshot digests matched before and after every call. Source counts grew from
17 to 18 to 20 as the game changed. These are identified selected roots, not clean
verdicts on the mixed working folder. User configuration was unchanged; every
native app-server session and descendant MCP server exited. Raw results, paths,
source and publisher references remain in ignored game-private storage.

## Task results

| Task      | Frozen input and resulting revision                                                                                                                  | Actual calls                                                                                                                                                                      | Independent result and MCP contribution                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnosis | Existing round at `532ff8a5e00aa7c59c83040c2a6796452e60a3d5`; repair `10d9f2b98e53db87284a068e0a5072454942afec`                                      | Before: `inspect_project`, `validate_project`, `validate_action_contracts`, `validate_notifications`, `audit_database_usage`. After: project, action and notification validators. | A persisted two-player snapshot claiming drafting without an offer was wrongly accepted. The frozen negative assertion failed before the fix and passed afterward. PHP suite grew from 27 tests / 58 assertions to 28 / 59. MCP diagnostics did not locate this game-specific defect and did not change after the repair.                                                                       |
| Feature   | Repaired round at `10d9f2b`; drafting slice committed as `e14116b8bfa38b5fa439b95d3c31cc09cd6a2a17`                                                  | Before: state, action and notification validators. After: inspection, state, action, notification and project validators.                                                         | Explicit assertions cover natural player order, one pick each, leftover movement/discard, announcer wraparound, reload and rejected selections without mutation. 34 PHP tests / 94 assertions and two JavaScript tests passed. MCP traced the typed `cardId` client argument, omitted magic active-player argument, readable state redirects and public `draftUpdated` payload/handler.         |
| Review    | Frozen diff `e14116b8` → `8b5f6286a2fbd763c516d789c5865bbe2b4998a9`; diff SHA-256 `f81486c0a759c87ab84db26740a9803ae5fb6ca32f49ec12df0d61b4c2b58cd5` | All seven local tools.                                                                                                                                                            | A pure race-ending/scoring helper was checked against independent printed-rule assertions: finish, exhaustion, discarded undrafted cards, retained announcer, lane ties and the 13-point example. 39 PHP tests / 105 assertions passed; the two unchanged client tests also passed. MCP supplied structural context and partial database coverage, but did not verify these gameplay decisions. |

Diagnosis ran first, before feature edits. Its starting tree was dirty only with
the new frozen negative assertion; production was unchanged. Later call roots
were clean committed game revisions. The same agent authored the foundation and
reviewed its own changes. Assertions were established from source rules before
production changes, but neither diagnosis nor review was blind. No defect was
deliberately inserted for rediscovery. There is no comparable effort baseline,
so no measured time savings or causal productivity claim follows.

Local game integration doubles exercise actual game/state methods and JSON
save/restore. JavaScript tests use controlled BGA and DOM doubles. Neither proves
BGA permissions, rendering, database transactions, multiplayer runtime or Studio
gameplay. The feature uses a prepared ordinary-card offer and a development UI.
The race-result helper is not connected to a complete race lifecycle. Checkpoints,
the full deck, multi-race victory and optional variants remain incomplete. No
game source was uploaded or game release performed in this evaluation.

## Findings and decisions

**Useful:** The feature's state/action/notification traces matched the reviewed
framework documentation and provided a concrete wiring check. The agent used
those results to retain the typed action and payload connection. The generated
sample's unmatched `pass` warning was adjudicated as a real missing sample
handler; replacing the sample feature removed that send. This did not establish
the correctness of unrelated game rules.

**MCP miss, BGA-431:** Before the feature, a comment-only notification example was
reported as a live handler, hiding the missing-handler warning for another real
sample send. Actual JavaScript prototype inspection showed no notification
methods. The action trace also listed a PHP method present only in a comment.
An independently authored [two-file reproducer](../../tests/fixtures/projects/comment-contract-reproduction)
uses generic marker names and contains no game source. The
[installed-command correctness probe](../../scripts/reproduce-bga431.ts) reproduced
both phantom declarations and the suppressed warning against rc.2. It exits
nonzero because correctness assertions fail, after four tool calls, two resource
reads, unchanged-project checks and process cleanup. Reproducing a failure is
not a passing support scenario. [BGA-431](../BACKLOG.md#bga-431--exclude-inert-comment-examples-from-runtime-contracts)
owns repair, controls for real executable forms, packaged regressions and the
replacement-candidate carry-forward review.

**Game-specific miss:** The reload representation defect was found by the agent's
game assertion, not an MCP finding. Framework validators do not promise to
validate card conservation or scoring. Keep running independent game tests;
BGA-425 owns research into whether reading such evidence would help the agent.

**Unsupported:** The generated computed setup SQL remains unreadable. After the
feature, aggregate diagnostics have zero errors/warnings, one information finding
and one unsupported construct. The pre-release audit reports **26 passed,
1 failed, 6 unsupported, 8 manual-required**. Its failed check is information-level
`database.audit.unavailable`, not a game SQL defect established by this run. Six
SQL-dependent checks have no verdict. It is not a clean release audit.

**Workarounds and setup friction:** Canonical-source preparation, digest binding,
before/after comparison, documentation retrieval and test-result interpretation
were manual agent work. An initial bridge file used the wrong module extension
and failed before connecting; the corrected module ran. A local integration
double initially tried to call a protected method directly; the harness was
corrected without widening production visibility. A sandbox prevented the manual
reproducer's launcher pipe; the authorized execution context then reproduced the
defect. These are recorded setup/harness failures, not MCP server failures.
Candidate preparation also exposed the hardcoded version smoke defect fixed
and verified under BGA-430.

The [wishlist](../AGENT_WISHLIST.md) now distinguishes these observations from
proposed capabilities. Existing tools already expose action relationships;
improve correctness and explanation before adding another trace API.

## Reproduction and completion boundary

Use an independently verified installation of the recorded rc.2 original and run:

```sh
corepack pnpm exec tsx scripts/reproduce-bga431.ts /path/to/install/node_modules/.bin/bga-mcp
```

The script copies only the original repository-owned fixture into a disposable
root, checks actual JavaScript method existence, records results in ignored
`.artifacts/bga431-reproduction.json`, closes the server and removes the root.
Against rc.2 it must fail the three recorded correctness assertions. The full
passing suite currently lacks this repaired-case coverage; do not interpret its
passing result as closure of BGA-431. The separately retained observation receipt
binds fixture, runner and evaluated artifact digests.

Next: implement BGA-431 against official lexical/framework sources, add affected
capability/compatibility/scenario evidence, pass the full gate and exact-source
CI, then produce and verify replacement bytes. Repeat the affected baseline and
feature/review checks against their frozen source sets and record explicit
carry-forward limits. Only then reconsider `verified` for BGA-424 and advance to
BGA-411. Existing signed candidates and historical observations remain immutable.

## Sources

- [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference), fetched before framework edits.
- [State classes](https://en.doc.boardgamearena.com/State_classes:_State_directory), typed actions, returned class redirects and zombie delegation.
- [Main game logic](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php), persisted globals, player order, active-player transitions, notifications and autowiring authorization.
- [Game interface logic](https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js): promise registration auto-detects notification methods declared on the game object; magic player arguments are not client arguments.
- [ECMAScript comments](https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-comments): “Comments behave like white space and are discarded”.
- [PHP comments](https://www.php.net/manual/en/language.basic-syntax.comments.php), single-line and block-comment syntax.
- [Official Dino Racer rules](https://cdn.shopify.com/s/files/1/0008/7703/5638/files/DR_Rulebook.pdf?v=1777930885), read from the existing official local reference after web PDF fetching failed. Printed pp. 6, 8, 10, 11, 13 and 14 supply the frozen assertions; relevant diagrams were inspected. Private publisher material is not included here.
