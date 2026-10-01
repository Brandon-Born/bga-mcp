# BGA-424 development evaluation plan

Prepared 2026-10-01. **Primary objective: fix/build the MCP.** Dino Racer is the
real-project test subject. Formal feature/diagnosis/review tasks have not run;
preparation exposed MCP defects, and BGA-426 through BGA-428 now own their fixes
and the same-project regression rerun. Game work is limited to what the MCP
evaluation needs.

The owner selected **Dino Racer**, published by Underdog Games, and confirmed
that development starts from scratch. The game will live in a separate local
repository, now initialized locally with planning documents and a PHP 8.4 test
environment and a locally tested standalone ranking/scoring core. The 25-file
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

Close the three observed reader gaps and rerun the same real project with an
identified changed artifact. Treat mixed working-folder backup pollution as a
separate BGA-429 source-scope limitation; an explicitly exported tracked snapshot
can isolate the unchanged canonical sources but cannot erase that limitation.
[Regression evidence](verification/GENERATED_TEMPLATE_REGRESSIONS.md) separates
these results from the still-pending BGA-424 task set. Do not advance game features
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

## Proposed evaluation tasks

Freeze concrete tasks, acceptance assertions, starting revisions, and independent
oracles before each task. These proposals are not yet an accepted task set.

| Task      | Proposed scope                                                                                             | Evidence needed                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Feature   | Implement drafting, leftover-card movement, and announcer rotation in the real game project.               | Game assertions and a runnable scenario, actual agent MCP calls, framework-source adjudication, and the resulting change. |
| Diagnosis | Investigate a checkpoint-resolution defect observed in development or supplied independently by the owner. | A reproducible failure, independently established expected behavior, diagnosis, and a passing regression after the fix.   |
| Review    | Review an actual race-ending/scoring change, including finishing-position ties and finish-line effects.    | The frozen diff, independent assertions, observed findings, misses, and resulting decisions.                              |

An agent knowingly inserting and then rediscovering its own bug does not establish
independent diagnostic usefulness. Disclose reviewer familiarity with the change.
Do not claim that MCP framework checks validate game-specific scoring or gameplay.

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
