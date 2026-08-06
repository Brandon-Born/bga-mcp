# BGA Studio developer workflow catalog

- **Snapshot date:** 2026-08-05
- **Backlog:** BGA-001
- **Authority rule:** Official BGA documentation defines platform behavior. Community reports are used only to identify friction and candidate assistance.

This catalog records what is known, what remains uncertain, and where an MCP capability could help. It does not turn community convention or an undocumented endpoint into a supported BGA contract.

## Evidence sources

Official:

- Studio overview and current file reference: <https://en.doc.boardgamearena.com/Studio>
- First project and SFTP setup: <https://en.doc.boardgamearena.com/First_steps_with_BGA_Studio>
- File synchronization, player switching, save/restore, database access, and input/output debugging: <https://en.doc.boardgamearena.com/Tools_and_tips_of_BGA_Studio>
- Testing guidance: <https://en.doc.boardgamearena.com/Testing_by_developer>
- Studio logs: <https://en.doc.boardgamearena.com/Studio_logs>
- Pre-release review: <https://en.doc.boardgamearena.com/Pre-release_checklist>
- Replay behavior: <https://en.doc.boardgamearena.com/Game_replay>

Community feedback considered:

- A 2026 BGA agent-skill proof identified documentation context, SFTP sync semantics, and an automated test harness as the next gaps: <https://www.reddit.com/r/boardgamearena/comments/1slnd48/bga_game_dev_agent_skill/>
- A developer who tested an agentic workflow across several games reported that automated test loops caught defects, while author questions and human testing coordination remained bottlenecks: <https://www.reddit.com/r/ClaudeCode/comments/1t3zxu2/i_built_a_claude_code_skill_for_board_game_arena/>

Community observations are not proof that a BGA API or workflow is supported.

## WF-01 — Create or obtain a Studio project

- **Current behavior:** A developer account is separate from the normal BGA player account. Projects are created and managed from the Studio control panel. Read-only access to many existing projects can be requested from the Studio projects page.
- **Pain points:** Account identities, project names, and read-only versus writable access can be confused before any code is edited.
- **Security boundary:** Project discovery must not enumerate or access projects beyond the authenticated developer's permissions.
- **Candidate MCP assistance:** Diagnose local configuration and explain required manual steps. Do not create projects until BGA exposes a stable, permitted automation boundary.
- **Confidence:** Officially documented.

## WF-02 — Download and continuously synchronize source

- **Current behavior:** BGA provides SFTP credentials and uses port 2022. The documentation recommends automated synchronization rather than manual uploads and describes one-way sync options.
- **Pain points:** A one-way push can overwrite remote work; developers need to understand ignores, target mapping, and whether a tool performs push, pull, or merge.
- **Security boundary:** Credentials, remote project roots, publisher artwork, ignored files, and deletion behavior require explicit protection.
- **Candidate MCP assistance:** Read-only connection diagnostics, exact diff preview, allowlisted target confirmation, and guarded synchronization. No credential values in tool arguments or results.
- **Confidence:** Connection and sync behavior are official; desired diff/merge semantics are a community requirement and remain a product decision.

## WF-03 — Edit, build, upload, and refresh

- **Current behavior:** Developers edit locally, sync files to Studio, and refresh or restart appropriate Studio state depending on the changed file. Some assets require a hard refresh; database and option changes require specific control-panel actions or game restarts.
- **Pain points:** The feedback loop varies by file type, and a successful upload does not prove Studio accepted or exercised the change.
- **Security boundary:** Local inspection should remain network-off. Upload and Studio actions must be separate, explicit operations.
- **Candidate MCP assistance:** Detect file generations, explain the required refresh/restart action, preview deployment, then correlate the change with diagnostics.
- **Confidence:** Officially documented; no assumption is made that upload alone is deployment verification.

## WF-04 — Develop the state machine and server actions

- **Current behavior:** BGA games define state-machine behavior and server-side game logic across framework-specific PHP files or modern state classes. Client actions and server notifications connect the PHP and JavaScript sides.
- **Pain points:** Missing transition targets, mismatched action names, and notification payload drift are cross-file defects that generic linters do not understand.
- **Security boundary:** Analysis must parse source without executing project PHP or JavaScript.
- **Candidate MCP assistance:** Normalize supported layouts and provide evidence-backed state, action, and notification validation with explicit uncertainty for dynamic constructs.
- **Confidence:** The file roles are official. Individual validation rules still require rule-specific evidence and fixtures.

## WF-05 — Start a test table and switch perspectives

- **Current behavior:** Studio supports express-start testing and test-user perspectives. Developers can open another test player's view to exercise multiplayer behavior.
- **Pain points:** Reproducing an exact multi-user sequence manually is slow and can leave tables running after a failed test.
- **Security boundary:** Automation must be limited to dedicated Studio test accounts and projects; it must not impersonate real players or retain sessions.
- **Candidate MCP assistance:** Initially provide documented guidance. Automated table and perspective tools require separate feasibility decisions and live cleanup tests.
- **Confidence:** Manual behavior is official; a stable automation interface is unverified.

## WF-06 — Save and restore difficult game states

- **Current behavior:** Studio provides a limited number of save/restore slots for a table. Restores are table-specific and have lifecycle limitations.
- **Pain points:** Developers repeatedly recreate rare positions and can confuse saved states across test runs.
- **Security boundary:** Restore is mutating and must never target a different table or non-test project.
- **Candidate MCP assistance:** Preserve the manual workflow now. Any future tool requires an approved interface, unique test markers, exact-state assertions, and cleanup.
- **Confidence:** Manual behavior is official; automation is unverified.

## WF-07 — Diagnose requests, SQL, notifications, and exceptions

- **Current behavior:** Studio exposes request/SQL logs, unexpected-exception logs, production issue views, and an input/output debugging section. Logs can include table, user, request, SQL, timing, and stack information.
- **Pain points:** Logs are verbose, spread across views, and may expose player or session-related data when copied into an agent.
- **Security boundary:** Retrieval must be permitted, project-confined, bounded, and redacted. Undocumented endpoints cannot become a core dependency.
- **Candidate MCP assistance:** Filter and structure permitted logs by project, test marker, table, severity, and time while removing sensitive values.
- **Confidence:** Manual access is official; programmatic access remains a feasibility decision.

## WF-08 — Run local and automated tests

- **Current behavior:** BGA documents local PHP and JavaScript/TypeScript testing approaches while emphasizing manual testing on Studio for framework behavior.
- **Pain points:** Local stubs can diverge from the hosted framework, and mocked tests can be mistaken for proof of Studio compatibility.
- **Security boundary:** Fixtures must not contain private game source or publisher art; live tests require isolated credentials and state.
- **Candidate MCP assistance:** Run deterministic local checks, distinguish unit/integration evidence from live Studio evidence, and refuse to label remote behavior verified without a live test.
- **Confidence:** Official testing guidance plus the repository's stricter verification policy.

## WF-09 — Verify replay, refresh, mobile, zombie, and edge behavior

- **Current behavior:** Replay depends on notifications and archived static files. BGA's pre-release guidance covers behavior that is easy to miss during the happy path, including refresh and multi-client concerns.
- **Pain points:** A game can appear playable while failing replay, refresh, mobile, accessibility, zombie, or unusual turn sequences.
- **Security boundary:** Automated checks must report manual-only coverage honestly instead of manufacturing a pass.
- **Candidate MCP assistance:** Maintain a source-backed rule catalog, automate only provable checks, and return manual-required items separately.
- **Confidence:** Officially documented at the checklist level; automation varies per rule.

## WF-10 — Commit, review, and advance through release phases

- **Current behavior:** Studio has its own commit/release lifecycle, while the documentation also recommends external version control. Alpha, beta, and production transitions include manual BGA review and testing.
- **Pain points:** Local Git state, synchronized Studio files, Studio revisions, and release readiness can diverge.
- **Security boundary:** This MCP does not replace Git hosting or bypass BGA's review and authorization steps.
- **Candidate MCP assistance:** Report evidence and readiness, but leave Git publication and BGA phase transitions to their authorized workflows.
- **Confidence:** Official lifecycle behavior; exact current review timing is outside this project's control.

## Unresolved developer-validation questions

These questions remain open and must be revisited before Studio mutation tools are designed:

1. Do active teams treat local source or Studio source as authoritative during multi-developer work?
2. Which modern and legacy layouts are still actively maintained?
3. What ignore and deletion semantics are safest for real SFTP projects?
4. Which log filters save the most time without exposing unrelated player data?
5. Which pre-release failures are both frequent and statically provable?
6. What dedicated Studio project/account arrangement is acceptable for repeatable live E2E?

Until answered with evidence, these are research questions, not product assumptions.
