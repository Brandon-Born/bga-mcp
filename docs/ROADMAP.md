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

An initial implementation was recorded for the legacy layout on 2026-08-06 and for the modern layout on 2026-08-07 (BGA-117 through BGA-121).

Reading the official documentation for that work showed the premise behind it was too simple: BGA migration is per file, not per project. Metadata, game logic, states, player actions, and client logic each move from the legacy form to the modern one on their own schedule, and the documentation marks the older form of each as deprecated but still supported. A real project is therefore usually a mixture, and the two-template detector reports the most common mixture as `unrecognized`. BGA-122 and BGA-123 replaced the templates with per-component generations on 2026-08-07, so a part-migrated project is read in whatever form each of its files is in.

The 2026-08-08 installed-package adversarial review reopened the exit criterion. Common documented modern constructs produced false findings, and several literal acceptance cases never crossed the packaged public boundary. BGA-124 through BGA-128 own the correction; Phase 1 is not complete until they pass. BGA-124 landed the same day: the state machine is now read in whichever form the project declares it, the framework's own identifiers 1 and 99 are no longer judged as the project's, and a rule that cannot read the whole machine says so instead of guessing.

## Phase 2: Documentation

- Allowlist documentation sources and record what each one permits.
- Guard the first network path: allowlisted hosts, no private addresses, bounded responses, requests carrying only the client's query.
- Cache what a developer's own lookups return, dated and attributed.
- Return source URLs, snapshot dates, and official or community provenance.
- Add version-aware framework and file-reference lookup.
- Test retrieval quality against a maintained question set.

Exit criterion: every documentation capability passes end-to-end retrieval scenarios, and the maintained question set returns current, attributable answers without flooding the client context.

Built on 2026-08-07 (BGA-200, BGA-202 through BGA-208). The sources decided the shape of it: `en.doc.boardgamearena.com` refuses bulk AI collection and publishes no content licence, so there is no curated index to build and ship. Retrieval is one page per explicit request, cached locally with its date, quoted and attributed rather than reproduced. The original index-pipeline item was superseded before it started.

The exit criterion is not met. Every capability is `implemented`, not `verified`: the refusals, the contracts, and the scoring are proven offline, but a real retrieval needs a third party's wiki, and a commit gate that depends on someone else's uptime is not a gate. The 2026-08-08 maintained run answered only 4/9 questions and the live framework-version resource returned a forum link as a version. BGA-209 through BGA-211 own outage semantics, version extraction, and relevance evaluation; the drift monitor remains the deliberate network-dependent currency check.

## First-run experience

- Take project roots through the protocol-era-appropriate client interaction rather than requiring a command-line flag.
- Ask for a missing non-secret setting through the client, at the moment it is needed.
- Expose the setup state to the agent, not only to a terminal the agent cannot read.
- Remember the answers, if writing a configuration file survives a boundary decision.

Exit criterion: a developer installs the server, points their client at it, and is told what to do next by the agent they are already talking to — without editing a launcher configuration file by hand.

Opened on 2026-08-08 (BGA-314 through BGA-318). The 2025 push-style roots and elicitation paths are implemented. The 2026 input-required path is not: an installed-client test showed the server never asked and then blamed a client that had advertised roots. BGA-318 owns that protocol-era gap and truthful setup wording.

## Phase 3: Studio bridge

- Add SFTP connection diagnostics using SSH keys.
- Preview local-to-Studio synchronization as a structured diff.
- Add guarded, explicitly requested synchronization.
- Run every Studio adapter scenario against a dedicated, isolated BGA Studio test project.

Exit criterion: live end-to-end tests prove that every advertised Studio capability can safely preview and perform its operation, verify the exact target and result, clean up test state, and avoid exposing credentials. Capabilities without this evidence remain unreleased.

The boundary was reviewed on 2026-08-07 and the phase is now narrower than it was. Synchronization stays, now behind eight preconditions after the live project exposed BGA's default cross-developer readonly ACL (BGA-322). Test tables, player perspectives, and saved states came out: each is an authenticated web page with no documented interface, so automating them means parsing HTML on someone else's platform, which this project's own non-goals rule out. BGA has not prohibited it; this is a judgement about what can be kept working, not a permission question.

Own-account log reading went the other way. The owner accepted that trade on 2026-08-07, on the condition that no other person's data comes back. The 2026-08-08 live review established a dedicated private tutorial project but found that the current tool rejects Studio's real project-name identifier, file-backed sessions miss value redaction, preflight prints foreign actors, own-account messages can retain other credential shapes, and Private projects default to cross-developer readonly source sharing. The shared address guard and cancellation lifecycle also fail adversarial cases. BGA-319 through BGA-323 and BGA-326 through BGA-328 own those blockers. The capability remains experimental, off by default, and not live-verified (BGA-312). See the [Studio boundary review](verification/STUDIO_BOUNDARY_REVIEW.md).

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
