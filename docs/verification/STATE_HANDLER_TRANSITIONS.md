# Automatic state-handler transition diagnosis — BGA-460

> Historical evidence only.

This feature handoff and its numerical block are preserved from the reviewed
`46a1521f9dae2010e1a788ec36c7731513f2bc15` source. Its [fresh premerge recheck](https://github.com/Brandon-Born/bga-mcp/actions/runs/41112146247)
passed all six jobs at 1,061 tests / 280 scenarios / 108 claims. The actual
subsequent main failure and current test-oracle correction belong to
[CANCELLATION_PUBLICATION_ORDER.md](CANCELLATION_PUBLICATION_ORDER.md); the prior
passing run is not approval of a failed later run. Original local source and
artifact identities below remain unchanged.

```verification-record
{ "kind": "run", "capabilities": 17, "scenarios": 280, "claims": 108, "tests": 1061 }
```

This is the current feature handoff record; its numerical block is checked against the actual full-gate artifact. It does not relabel any earlier run or release candidate. The complete local gate passed on October30 at 15:10 UTC: 1,061/1,061 tests, 280/280 required scenarios, 108 claims, package/safety checks and applicable official conformance. Exact-head draft-PR CI remains pending at this checkpoint.

The original turn/round example calls `nextState("endRound")` from an automatic `roundEnd` handler whose state offers `nextRound` and `finish`. Existing target-ID checks miss this relationship. The new heuristic locates the PHP call and state declaration, lists the names and suggests a correction. A caller's same-root edit to `nextRound` removes it and changes the audit check from failed to passed. The MCP executes no PHP and writes no game files.

Only a direct public/default-public, non-static method of the expected game class in one documented main file supplies the callback. Shared, ambiguous, inherited/missing, private/protected/static and nested contexts remain unknown, as do computed arguments and incomplete inventories that might hide a main file. PHP keyword/method casing does not make a differently cased receiver or property equivalent. The warning is a static relationship heuristic; unreachable calls, runtime state changes, player actions, delegates and gameplay correctness remain outside its proof. State-class imperative calls preserve BGA-419's uncertainty.

`E2E-STATE-HANDLER-TRANSITIONS` installs the shared ordinary development tarball and uses a real SDK over public stdio. Assertions cover all four validation consumers, legacy and hybrid typo/repair roots, repeated results, project hashes, root refusal, literal/unnamed transitions, unrelated receivers/owners and explicit computed/shared/nested uncertainty. Separate assertions remove the checker only in a disposable installed copy, prove the diagnostic oracle fails, restore the original module, exercise the actual 5,000-entry listing cap and preserve state-class imperative uncertainty. The original tarball is unchanged.

Independent review's 41 actual-model adversarial probes approved source SHA256 `890c0545eefc95aab733f0247dcbaf7304b0f8198de81be44a7f356bc7c1be85`. Its report SHA256 is `4b1844f261038360c0b0ad2ec0b2ebe7dc836af74bbbcca63c8badb0a362deb6`. The review found and reproduced false receiver/class/casing bindings and incomplete-inventory coverage before the corrections; those findings became regression controls. This review is development evidence, not merge or release authorization.

Retained failures are scoped honestly: the initial full run passed 1,042/1,044; failures exposed the stale audit count and unintended generated-declaration change. Keeping the reader private in the existing module restored the unchanged shipped-declaration and public-contract comparison. A later run passed all 1,056 tests and applicable conformance, then the evidence verifier refused stale current tally blocks. Those six numerical blocks are now preserved verbatim with independently validated PR50 baseline provenance, per TESTING.md's historical-record policy. New current evidence belongs here. A setup-only missing directory in the expanded fixture was also corrected; no production deadline, retry, gate or assertion was relaxed.

Current source preparation depends on unmerged PR50. Its draft PR targets that branch, so its diff contains only BGA-460. No candidate, tag, signing, publication, deployment, credentials or private game modification is part of this task. Public schemas, declarations, discovery metadata and the frozen contract snapshot remain unchanged; runtime rule discovery exposes the additional bounded check.

Official sources read October30: [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference), [state action/transitions](https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php) and [main game logic](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php). The state page distinguishes a transition name from a target state's name and retains deprecated array definitions. The code records its short exact wording and the modern imperative-call limitation.

The retained local evidence reports base commit `a751b9b287159235454ff0357ea3fac91757c869` with `clean: false`, Node `v22.17.1`, pnpm `11.28.5` and development tarball `sha256:d45405e1823becfb57c073591fd68262e1c7e0933843f114ef6e25f972e9dce8`. It is the actual integrated dirty-tree run, not a relabeled clean commit or original release candidate. Independent delta review preserved each old tally and confirmed no remaining source finding; any later CI must bind its own real source/tree.
