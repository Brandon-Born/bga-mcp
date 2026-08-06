# Roadmap

The roadmap is organized around useful, testable outcomes rather than a fixed calendar.

## Phase 0: Foundation

- Define project goals, non-goals, safety model, and contribution process.
- Interview or collect feedback from active BGA developers.
- Select the implementation language and MCP SDK.
- Capture representative legacy and modern BGA project fixtures.
- Define the shared diagnostic schema and compatibility matrix.

Exit criterion: the first tool contracts and fixture set are specific enough to implement without guessing at their intended behavior.

## Phase 1: Read-only local MVP

- Start a local MCP server over standard input/output.
- Discover and summarize configured BGA project roots.
- Parse state definitions and validate transition targets.
- Trace client actions to server endpoints and game methods.
- Trace server notifications to client handlers and compare payload shapes.
- Compare database definitions with common query usage.
- Implement a small, high-confidence pre-release rule set.
- Add unit, integration, and protocol conformance tests.

Exit criterion: the server finds seeded cross-file defects in representative projects, reports precise evidence, and never modifies project files.

## Phase 2: Documentation

- Build a curated BGA Studio documentation index.
- Return source URLs, snapshot dates, and official or community provenance.
- Add version-aware framework and file-reference lookup.
- Test retrieval quality against a maintained question set.

Exit criterion: common BGA development questions return current, attributable answers without flooding the client context.

## Phase 3: Studio bridge

- Add SFTP connection diagnostics using SSH keys.
- Preview local-to-Studio synchronization as a structured diff.
- Add guarded, explicitly requested synchronization.
- Retrieve and filter relevant Studio logs if a stable, permitted mechanism is available.
- Research test-table, player-perspective, and saved-state automation separately.

Exit criterion: a developer can safely preview and perform a narrow upload, verify its target, and diagnose the resulting Studio errors without exposing credentials.

## Phase 4: Public release

- Publish installation instructions for major MCP clients.
- Add a versioned tool compatibility policy.
- Complete security review and threat model.
- Publish packages and signed release artifacts.
- Establish a process for tracking BGA framework changes.

Exit criterion: a new developer can install, configure, verify, and remove the server using documented steps.

## Explicit non-goals for the first release

- Fully autonomous game implementation or release.
- Generic file editing or Git hosting operations.
- Hosting or redistributing publisher artwork.
- Scraping private projects or bypassing BGA access controls.
- Depending on undocumented Studio endpoints for core functionality.

