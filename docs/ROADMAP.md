# Roadmap

The roadmap is organized around useful, testable outcomes rather than a fixed calendar.

Individual deliverables, dependencies, acceptance criteria, and verification requirements are maintained in the [implementation backlog](BACKLOG.md). The backlog is the executable source of truth and must be updated when this roadmap changes.

## Phase 0: Foundation

- Define project goals, non-goals, safety model, and contribution process.
- Interview or collect feedback from active BGA developers.
- Select the implementation language and MCP SDK.
- Capture representative legacy and modern BGA project fixtures.
- Define the shared diagnostic schema and compatibility matrix.
- Define the capability-to-end-to-end-test manifest and verification evidence format.
- Complete the threat model and implement the policy, error, redaction, and secret-scanning boundaries it requires.

Exit criterion: the first tool contracts, fixtures, and executable acceptance scenarios are specific enough to implement without guessing at their intended behavior.

## Phase 1: Read-only local MVP

- Start a local MCP server over standard input/output.
- Discover and summarize configured BGA project roots.
- Parse state definitions and validate transition targets.
- Trace client actions to server endpoints and game methods.
- Trace server notifications to client handlers and compare payload shapes.
- Compare database definitions with common query usage.
- Implement a small, high-confidence pre-release rule set.
- Add unit and integration tests for fault isolation.
- Add protocol conformance checks and packaged-server end-to-end tests for every advertised capability.

Exit criterion: every advertised local capability passes its mapped end-to-end scenarios through a real MCP client; the server finds seeded cross-file defects, reports precise evidence, and never modifies project files.

## Phase 2: Documentation

- Build a curated BGA Studio documentation index.
- Return source URLs, snapshot dates, and official or community provenance.
- Add version-aware framework and file-reference lookup.
- Test retrieval quality against a maintained question set.

Exit criterion: every documentation capability passes end-to-end retrieval scenarios, and the maintained question set returns current, attributable answers without flooding the client context.

## Phase 3: Studio bridge

- Add SFTP connection diagnostics using SSH keys.
- Preview local-to-Studio synchronization as a structured diff.
- Add guarded, explicitly requested synchronization.
- Retrieve and filter relevant Studio logs if a stable, permitted mechanism is available.
- Research test-table, player-perspective, and saved-state automation separately.
- Run every Studio adapter scenario against a dedicated, isolated BGA Studio test project.

Exit criterion: live end-to-end tests prove that every advertised Studio capability can safely preview and perform its operation, verify the exact target and result, clean up test state, and avoid exposing credentials. Capabilities without this evidence remain unreleased.

## Phase 4: Public release

- Publish installation instructions for major MCP clients.
- Add a versioned tool compatibility policy.
- Complete security review and threat model.
- Publish packages and signed release artifacts.
- Establish a process for tracking BGA framework changes.
- Publish a test-evidence artifact that maps every public capability to a passing end-to-end scenario.

Exit criterion: a new developer can install, configure, verify, and remove the server using documented steps, and the release has no public capability missing current end-to-end evidence.

## Explicit non-goals for the first release

- Fully autonomous game implementation or release.
- Generic file editing or Git hosting operations.
- Hosting or redistributing publisher artwork.
- Scraping private projects or bypassing BGA access controls.
- Depending on undocumented Studio endpoints for core functionality.
