# BGA-424 frozen development tasks

Defined 2026-10-01 before evaluated edits. The primary deliverable is MCP
usefulness evidence; Dino Racer is the authorized private test project.

## Candidate and client

- Candidate: `v1.0.0-rc.2`, source `f5f5297c6d98fd0d0aadc3ce98ca01536ed75c74`.
- Original tarball: SHA-256 `f8d589613396222078578784dc4c5f71f69107709704c1dcc629506ab02d3c82`.
- [Candidate receipt](release-candidate-v1.0.0-rc.2.json) binds production,
  reconstruction, independent download and six-platform CI. Signing is pending;
  evaluated calls begin only after independent signature verification.
- Actual agent: the owner-directed Codex desktop agent selecting calls during
  this development session. Calls use the actual `codex-cli 0.159.2` app-server
  MCP stack through the controlled bridge, on macOS arm64 / Node 22.17.1.
  The bridge starts no additional inference turn. This does not test GUI tool
  discovery, another client's behavior, or autonomous model selection within
  the CLI process. Private receipts record binary and bridge digests.
- Source selection: each call gets a caller-prepared snapshot containing all
  tracked `modules/` files and recognized root framework files. Record selected
  paths and digests privately; compare the working source and selected snapshot
  around every call. The snapshot is not a clean verdict on the mixed folder.

## Feature

Starting game revision: `532ff8a5e00aa7c59c83040c2a6796452e60a3d5`.
The foundation contains generated BGA wiring, a tested persistable round model,
ordinary reveal movement, and standalone ranking/scoring. It is not a playable
base game. Setup and consumer smoke are excluded from evaluated tasks.

Implement a drafting development slice from a prepared, already revealed offer:

1. Begin with the announcer and follow the preserved natural player order.
2. Each player selects one available card exactly once; reject another actor,
   unknown or already selected card without changing the original state.
3. After the last selection, advance the leftover Dino one space, discard that
   card, and rotate the announcer one place, including wraparound.
4. Save and restore the full offer, selections, field, active drafter and announcer.
5. Wire a typed BGA state action, active-player transition, public notification,
   reload data and client click. Test game-owned behavior locally and compare
   state/action/notification diagnostics before and after the change.

Independent oracle: official rulebook printed p. 8 and ordinary movement on p. 6.
Tests assert card conservation and explicit player/card examples rather than
calling the implementation to calculate expected results. A prepared offer and
demo reset are development controls, not a complete deck or checkpoint system.
Local doubles do not establish BGA runtime authorization or Studio gameplay.

## Diagnosis

Investigate a real failure exposed by a new source-backed persistence/reload
assertion against the round implementation. Freeze its exact failing input,
starting revision, expected result and MCP calls before repairing it. Do not
insert a defect for the evaluation. If no genuine failure can be established,
record that the diagnosis task remains unmet rather than manufacture one.

The oracle is round/card conservation under printed p. 8 and the documented
persistence contract. Record whether MCP diagnostics locate the cause, merely
provide structural context, or leave this game-specific defect undetected.

## Review

Review a real change adding a race-ending decision and per-player scoring helper.
Freeze the diff before requesting MCP review. Independent assertions cover:

1. Reaching the configured finish ends the race; an unfinished field does not.
2. Deck exhaustion ends and scores the current race.
3. Undrafted revealed cards are discarded and earn no collected-card points.
4. The announcer is retained when no drafting occurred.
5. Distance ranks first, current lane breaks ties, and only the first three score.
6. The printed scoring example yields 13 points; fourth/fifth-place cards score zero.

Oracles: official rulebook printed pp. 8, 10, 11, 13 and 14, read independently of
the change. Reviewer and author are the same agent; disclose that familiarity.
MCP framework checks cannot establish these gameplay assertions. No checkpoint
inventory, complete game victory rule, hidden variant or live Studio claim follows.

## Results and limits

Retain actual call identities, decisions, independent assertions, false positives,
misses, unsupported syntax, setup errors and cleanup. New parser defects receive
permanent owners and original minimal regressions. Update the
[wishlist](../AGENT_WISHLIST.md) after each task. There is no comparable effort
baseline, so report observations without attributing time savings to the MCP.

## Sources

- [Official Dino Racer rules](https://cdn.shopify.com/s/files/1/0008/7703/5638/files/DR_Rulebook.pdf?v=1777930885), downloaded official reference read locally; web PDF rendering failed. Relevant printed diagrams were rendered and checked.
- [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference), fetched before dedicated framework pages.
- [State classes](https://en.doc.boardgamearena.com/State_classes:_State_directory): a returned class name redirects to that state.
- [Main game logic](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php): globals are "stored as a JSON"; "The autowiring also triggers the checkAction". Natural player order, notifications and active-player transitions were checked.
- [Game interface logic](https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js): promise notifications "Auto-detect all notifications declared on the game object". Actions must respond to a user's interface action; magic player parameters are not client arguments.
