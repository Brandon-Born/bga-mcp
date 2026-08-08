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

Reached for the legacy layout on 2026-08-06 and for the modern layout on 2026-08-07 (BGA-117 through BGA-121).

Reading the official documentation for that work showed the premise behind it was too simple: BGA migration is per file, not per project. Metadata, game logic, states, player actions, and client logic each move from the legacy form to the modern one on their own schedule, and the documentation marks the older form of each as deprecated but still supported. A real project is therefore usually a mixture, and the two-template detector reports the most common mixture as `unrecognized`. BGA-122 and BGA-123 replaced the templates with per-component generations on 2026-08-07, so a part-migrated project is read in whatever form each of its files is in.

Exit criterion reached on 2026-08-07.

## Phase 2: Documentation

- Allowlist documentation sources and record what each one permits.
- Guard the first network path: allowlisted hosts, no private addresses, bounded responses, requests carrying only the client's query.
- Cache what a developer's own lookups return, dated and attributed.
- Return source URLs, snapshot dates, and official or community provenance.
- Add version-aware framework and file-reference lookup.
- Test retrieval quality against a maintained question set.

Exit criterion: every documentation capability passes end-to-end retrieval scenarios, and the maintained question set returns current, attributable answers without flooding the client context.

Built on 2026-08-07 (BGA-200, BGA-202 through BGA-208). The sources decided the shape of it: `en.doc.boardgamearena.com` refuses bulk AI collection and publishes no content licence, so there is no curated index to build and ship. Retrieval is one page per explicit request, cached locally with its date, quoted and attributed rather than reproduced. The original index-pipeline item was superseded before it started.

The exit criterion is not met. Every capability is `implemented`, not `verified`: the refusals, the contracts, and the scoring are proven offline, but a real retrieval needs a third party's wiki, and a commit gate that depends on someone else's uptime is not a gate. The maintained question set (`pnpm test:docs-eval`) and the drift monitor (`pnpm docs:drift`) are the deliberate, network-dependent runs that close it, before a documentation release rather than on every commit.

## Phase 3: Studio bridge

- Add SFTP connection diagnostics using SSH keys.
- Preview local-to-Studio synchronization as a structured diff.
- Add guarded, explicitly requested synchronization.
- Run every Studio adapter scenario against a dedicated, isolated BGA Studio test project.

Exit criterion: live end-to-end tests prove that every advertised Studio capability can safely preview and perform its operation, verify the exact target and result, clean up test state, and avoid exposing credentials. Capabilities without this evidence remain unreleased.

The boundary was reviewed on 2026-08-07 and the phase is now narrower than it was. Synchronization stays, behind seven preconditions. Log retrieval, test tables, player perspectives, and saved states came out, because each is an authenticated web page with no documented interface — automating them means parsing HTML on someone else's platform, which this project's own non-goals rule out. BGA has not prohibited it; this is a judgement about what can be kept working, not a permission question. Player data is a separate and narrower concern that applies to production errors, not to a developer's own test tables. See the [Studio boundary review](verification/STUDIO_BOUNDARY_REVIEW.md); the items stay in the backlog in case BGA publishes an API.

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
