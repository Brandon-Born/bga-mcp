# BGA-424 development evaluation plan

Prepared 2026-10-01. **Primary objective: fix/build the MCP.** Dino Racer is the
real-project test subject. The formal feature, diagnosis and review tasks have
now run against the independently verified signed rc.2 candidate. The
[observed evaluation](verification/AGENT_EVALUATION.md) records 23 calls, useful
framework traces, a game-specific miss and a new parser defect. BGA-431 blocks
candidate advancement and BGA-424 verification; its original installed-command
reproducer fails correctness assertions. Game work remains bounded to the MCP
evaluation.

The owner selected **Dino Racer**, published by Underdog Games, and confirmed
that development starts from scratch. The game will live in a separate local
repository, now initialized locally with planning documents and a PHP 8.4 test
environment and locally tested ranking/scoring, persisted round, drafting and race-result helpers. The 25-file
generated modern Studio baseline has been downloaded unchanged and inventoried;
the untouched template starts in Studio, but no playable Dino Racer implementation exists. Publisher permission remains
unconfirmed. A separate owner request authorized Studio setup; the owner submitted
the private creation form and the project's existence was observed. SFTP access
was separately authorized through the specific welcome email, used for download,
and temporary password files were removed. The installed candidate inspected both
the initial preparation folder and generated baseline through a real stdio client.
All seven local tools were called on the baseline; recorded file digests matched
around every call. Preparation exposed JSONC component false positives (BGA-426),
editor-helper pollution (BGA-427), and unsupported delegated state returns (BGA-428).
These preparation calls are not evaluated tasks. The MCP's local-only boundary
is unchanged.

## Current MCP priority

BGA-426 through BGA-428 are verified against original regressions and the same
real project with an identified development artifact. BGA-429 now owns the
working-folder source-scope correction: documented production module/root sources
supply contracts; other local source stays inventoried with explicit unknown scope.
[Source-scope decision and workflow](verification/PROJECT_SOURCE_SCOPE.md) describe
canonical-root selection without treating Git ignore or backup names as authority.
[Regression evidence](verification/GENERATED_TEMPLATE_REGRESSIONS.md) separates
these results from the subsequently executed BGA-424 task set. BGA-430 verified the replacement-version smoke correction; BGA-431 now owns the newly discovered comment-parser miss. Do not advance game features
merely to make progress when the active objective is MCP correctness.

## First development milestone

Prepare a local project with original placeholder graphics and a source-linked
implementation backlog. Establish a playable single-race development milestone,
then expand to the complete base game. Reduced development milestones must be
labeled incomplete; they are not alternate interpretations of the published rules.
Optional variants follow the base game.

Use the preserved generated Studio project to establish the actual framework layout.
Do not invent framework files or API signatures from MCP fixtures.
The official walkthrough recommends: “start the game with reduced rules and try
to complete that first.” Its licensing advice is stricter than the licensing
page's permission to start projects; record that distinction and confirm the
specific project's status before Studio setup. This plan itself authorizes no Studio
access, uploads, publisher contact, or public release; any separate owner request
must be recorded independently of the MCP evaluation.

## Executed evaluation tasks

[Frozen task definitions](verification/AGENT_EVALUATION_TASKS.md) replace the initial
proposals. Their source-backed assertions preceded production changes.

| Task      | Executed scope                                                                                                       | Observed result                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Feature   | Prepared-offer drafting, leftover movement, announcer rotation, reload and typed state/client/notification wiring.   | Local game and client assertions passed; MCP wiring traces matched reviewed framework sources.                                            |
| Diagnosis | A genuine persisted drafting representation without its required revealed offer.                                     | Frozen assertion failed before repair and passed afterward; MCP supplied structural context but did not locate this game-specific defect. |
| Review    | Frozen race-ending/scoring helper diff with finish, deck exhaustion, discard, announcer and lane/scoring assertions. | Local assertions passed; MCP review remained structurally useful and SQL-partial.                                                         |

The same agent authored and reviewed the game changes; neither task is blind.
No defect was knowingly inserted for rediscovery. The baseline checkpoint proposal
was not manufactured when the genuine reload failure provided the frozen diagnosis.
The [report and ledger](verification/AGENT_EVALUATION.md) bind actual revisions,
artifact identity and limits. BGA-431, rather than further game development, is
now the next MCP implementation item.

## Evaluation procedure

1. Select and independently verify the exact signed candidate and public command.
   Record its source commit, artifact digest, client/version, and platform.
2. Establish a nontrivial BGA project baseline. Capture its revision and working
   tree identity; preparation alone does not satisfy BGA-424.
3. Record actual agent calls and project snapshots around each MCP call. Distinguish
   unchanged project bytes during MCP calls from deliberate agent edits.
4. Record useful findings, false positives, unsupported syntax, independent misses,
   setup friction, failures, and agent decisions. Adjudicate each finding against
   official BGA sources or independently checked game assertions.
   Capture missing functionality and manual workarounds in the
   [agent wishlist](AGENT_WISHLIST.md), including the task, desired result, and
   evidence needed to show it helps. Revisit the wishes after each evaluated task;
   distinguish improvements to existing tools from new capability proposals.
5. Retain only sanitized summaries in this repository. Private source, publisher
   art, credentials, player data, paths identifying private environments, and raw
   transcripts stay out of public evidence and fixtures.
6. Give reproducible MCP defects permanent backlog owners. Extract original,
   minimal framework regressions without copying this game's implementation.
7. Record cleanup and remaining limits. Candidate changes require explicit
   carry-forward review and repetition of affected tasks.

No comparable baseline is selected. Report observed usefulness and effort without
claiming time savings. Full local gates and exact-commit CI apply to resulting MCP
behavior changes. Studio runtime verification is separate from this local MCP
evaluation, and neither connection smoke nor a local game-engine test completes it.

## Sources

- [Dino Racer official rules](https://cdn.shopify.com/s/files/1/0008/7703/5638/files/DR_Rulebook.pdf?v=1777930885): printed pages 8–15 inform the proposed task oracles. Card data and ambiguous interactions still need a complete rules inventory before implementation.
- [Publisher's rules page](https://www.underdoggames.com/pages/dr-how-to-play).
- [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference): start here and fetch each relevant construct's dedicated page before writing framework code; deprecated forms remain documented.
- [Studio walkthrough](https://en.doc.boardgamearena.com/Create_a_game_in_BGA_Studio:_Complete_Walkthrough): project generation, reduced development milestones, and licensing advice.
- [BGA licensing policy](https://en.doc.boardgamearena.com/BGA_Game_licenses): “We allow developers to start any project in the Studio.” Public release still requires BGA's license and publisher approval.
- [BGA-424 acceptance and boundaries](BACKLOG.md#bga-424--evaluate-usefulness-during-real-agent-assisted-bga-development).
