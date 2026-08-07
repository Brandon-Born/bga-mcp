# Implementation Backlog

This is the executable source of truth for work planned in `bga-mcp`. The roadmap explains direction; this backlog preserves the individual deliverables required to get there.

## Change-control rules

- Backlog IDs are permanent and are never reused.
- An item is never silently deleted. Mark it `verified`, `superseded`, or `rejected` and record the evidence or replacement ID.
- New or changed public behavior must add or update its capability-manifest entry and end-to-end scenarios in the same change.
- A roadmap, architecture, security, or testing-policy change must update this backlog when it creates, removes, or changes implementation work.
- `verified` requires the evidence defined in [TESTING.md](TESTING.md). Source code, mocks, a build, or a manual spot check is not enough.
- Studio-backed work cannot become `verified` without a passing live test against the dedicated Studio test project.
- Completed items remain in this file until a documented archival process preserves their IDs, acceptance criteria, dependencies, and evidence links.

## Status and priority

Statuses:

- `planned` — captured but not ready to start.
- `ready` — dependencies are satisfied and acceptance criteria are defined.
- `in-progress` — actively being implemented.
- `blocked` — cannot proceed; the blocking condition must be recorded.
- `implemented` — code exists, but one or more verification gates have not passed.
- `verified` — all acceptance criteria and required verification gates have passed.
- `superseded` — replaced by another permanent backlog ID.
- `rejected` — deliberately declined with a recorded reason.

Priorities:

- `P0` — required foundation or release blocker.
- `P1` — required for the first useful local release.
- `P2` — required for documentation or Studio integration releases.
- `P3` — follow-up capability after the core product is verified.

## Definition of done

An implementation item is not done until:

1. Its acceptance criteria are satisfied.
2. Formatting, linting, static checks, unit tests, and integration tests pass where applicable.
3. Every affected public capability passes packaged-server end-to-end tests through a real MCP client.
4. MCP conformance passes for every affected supported transport and protocol version.
5. Studio-backed behavior passes live end-to-end tests in the isolated Studio test project.
6. Capability-manifest coverage, secret scanning, and artifact-redaction gates pass.
7. Documentation, compatibility data, and machine-readable verification evidence are updated.

## Execution order

The first dependency chain is:

`BGA-001` and `BGA-002` → `BGA-003` → `BGA-004` and `BGA-005` → `BGA-006` through `BGA-012` → local capabilities beginning with `BGA-100`.

Phase 1 delivered every local capability against the legacy layout, and `BGA-117` through `BGA-121` added the modern one. Research against the official documentation on 2026-08-07 then showed that "legacy" and "modern" are not two templates but the two ends of a per-file migration: metadata, game logic, states, player actions, and client logic each move independently, so a real project is usually part-way between. `BGA-122` and `BGA-123` closed that gap on 2026-08-07, for the same reason the modern readers did: a capability that refuses the shape most projects are actually in is not finished. Phase 1 is complete; `BGA-116` remains as a usability follow-up and Phase 2 documentation work may begin.

Phase 2 begins at `BGA-207`, the first network path in the server. `BGA-201` was superseded before it started: reading the sources under `BGA-200` showed a crawl-and-ship index is not something they permit.

Studio work begins only after `BGA-300` establishes a safe live test environment. Public release work begins only after all capabilities included in that release are verified.

## Phase 0 — Foundation

### BGA-001 — Capture representative developer workflows

- **Status:** verified
- **Priority:** P0
- **Depends on:** none
- **Deliverable:** An evidence-backed workflow catalog covering project setup, local editing, SFTP sync, state-machine development, multi-player testing, saved states, logs, and pre-release review across modern and legacy BGA projects.
- **Acceptance:** Each workflow records its source, current BGA behavior, pain points, security boundary, and candidate MCP assistance. Unsupported assumptions are labeled rather than normalized into requirements.
- **Verification:** Review against current official BGA documentation and feedback from active BGA developers; no E2E applies until a public capability is derived from the catalog.
- **Evidence:** [BGA Studio workflow catalog](workflows/BGA_STUDIO_WORKFLOWS.md) and [foundation verification](verification/FOUNDATION_MILESTONE.md), reviewed 2026-08-05.

### BGA-002 — Select and record the implementation stack

- **Status:** verified
- **Priority:** P0
- **Depends on:** none
- **Deliverable:** An architecture decision record selecting the language, supported runtime versions, official MCP SDK, package manager, test runner, schema library, and build output.
- **Acceptance:** The decision compares viable options, verifies current maintenance and compatibility from primary sources, pins supported versions, and records why the chosen stack supports subprocess E2E and distributable packages.
- **Verification:** A disposable proof starts a minimal server, connects with a real MCP client, lists one test capability, and shuts down cleanly on every proposed supported runtime.
- **Evidence:** `tests/integration/stack-proof.test.ts` passed through a real stdio client on Node 22.17.1 and Node 24.19.0; see [ADR 0001](adr/0001-implementation-stack.md).

### BGA-003 — Scaffold the distributable server package

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-002
- **Deliverable:** Package metadata, source layout, build output, executable entry point, configuration entry point, and clean install/uninstall path.
- **Acceptance:** A fresh checkout can install, build, pack, install the packed artifact into an isolated directory, start it over stdio, and remove it without undeclared global state.
- **Verification:** Packaged-artifact E2E performs the complete install → start → initialize → shutdown → uninstall flow.
- **Evidence:** `tests/e2e/packaged-server.test.ts` performs the isolated tarball lifecycle on both supported Node lines.

### BGA-004 — Establish deterministic local quality gates

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-002, BGA-003
- **Deliverable:** Formatting, linting, static typing, unit-test, integration-test, build, and dependency-integrity commands.
- **Acceptance:** Commands are documented, non-interactive, deterministic from the lockfile, and fail on warnings designated as release-blocking.
- **Verification:** Seeded formatting, typing, and test failures are each detected by the corresponding gate in an isolated verification job.
- **Evidence:** `scripts/verify-quality-gates.ts` rejects all three seeded failures; the normal full gate passes.

### BGA-005 — Establish continuous integration

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-004
- **Deliverable:** Required CI workflows for supported operating systems and runtime versions, with concurrency control and least-privilege permissions.
- **Acceptance:** CI runs every applicable gate from a clean checkout, uses locked dependencies, retains non-secret evidence, and cannot publish or mutate Studio state from untrusted contributions.
- **Verification:** A controlled failing branch proves each required check blocks completion; a clean branch proves the full matrix passes.
- **Evidence:** `.github/workflows/ci.yml` defines the least-privilege macOS/Linux/Windows and Node 22/24 matrix with immutable current Action pins. [CI run 31098519365](https://github.com/Brandon-Born/bga-mcp/actions/runs/31098519365) proves the clean six-job matrix passes. The [controlled failure proof](verification/CI_FAILURE_PROOF.md) records one isolated hosted rejection for every command in the enforced CI chain.

### BGA-006 — Define the machine-readable capability manifest

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-002
- **Deliverable:** A versioned schema and manifest for every tool, resource, prompt, transport, adapter, stability level, compatibility claim, and required scenario.
- **Acceptance:** Runtime discovery and the manifest can be compared automatically; duplicate names, missing scenarios, unsupported stability values, and stale capability entries fail validation.
- **Verification:** Manifest-gate E2E starts the packaged server, discovers capabilities, and proves exact agreement with the manifest, including seeded mismatch failures.
- **Evidence:** The packed `config/capabilities.json` and schema pass runtime comparison in packaged E2E; `tests/unit/manifest.test.ts` proves seeded schema, duplicate, and stale entries fail.

### BGA-007 — Define the shared diagnostic contract

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-002
- **Deliverable:** Versioned schemas for findings, locations, evidence, severity, certainty, suggestions, unsupported syntax, and aggregate results.
- **Acceptance:** Facts and suggestions are distinct; heuristic findings expose uncertainty; schemas support human-readable content plus stable machine fields.
- **Verification:** Contract tests serialize and validate representative success, error, warning, heuristic, and unsupported findings through an MCP tool response.
- **Evidence:** The version 1 runtime schemas and generated `config/diagnostics.schema.json` are exercised by strict negative contract tests, a real stdio MCP serialization proof, and installed-package E2E. [CI run 31101182339](https://github.com/Brandon-Born/bga-mcp/actions/runs/31101182339) passes all six supported OS/runtime jobs at implementation commit `efcaa6dfbe38d6e2f1672f3e64e60327fa9666aa`.

### BGA-008 — Build the representative fixture corpus

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-001, BGA-002
- **Deliverable:** Minimal legal fixtures for supported modern and legacy BGA layouts, plus deliberately malformed variants for every validation rule.
- **Acceptance:** Fixtures contain no private source or publisher artwork, identify the BGA behavior they represent, and include expected normalized models and diagnostics.
- **Verification:** Fixture-integrity tests prove every fixture is immutable during tests, contains no banned secrets/assets, and produces its declared baseline result.
- **Evidence:** `tests/fixture-integrity.test.ts` passes for the original modern and legacy fixture layouts documented in `tests/fixtures/README.md`.

### BGA-009 — Publish the compatibility matrix

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-001, BGA-008
- **Deliverable:** Machine-readable and human-readable matrices for BGA layouts, file generations, runtimes, MCP versions, transports, and clients.
- **Acceptance:** Every support claim maps to a fixture and passing scenario; unknown and unsupported combinations are explicit.
- **Verification:** CI fails when a support claim lacks a fixture or passing evidence and when runtime behavior claims support outside the matrix.
- **Evidence:** [`config/compatibility.json`](../config/compatibility.json) and [COMPATIBILITY.md](COMPATIBILITY.md) hold 18 claims. See the [safety and compatibility milestone](verification/SAFETY_MILESTONE.md). `pnpm verify:compatibility` seeds a missing fixture, an undocumented claim, and a protocol claim beyond `SUPPORTED_PROTOCOL_VERSIONS`, and fails on each before passing the real matrix. `GATE-COMPATIBILITY-MATRIX` proves runtime discovery stays inside the matrix; `pnpm verify:scenarios` proves every claimed scenario exists.

### BGA-010 — Build the packaged-server E2E harness

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-003, BGA-006, BGA-008
- **Deliverable:** A harness that installs or uses the packed artifact, launches it as a subprocess, connects through a real MCP client, discovers capabilities, invokes scenarios, and guarantees teardown.
- **Acceptance:** The harness uses only the public MCP boundary, isolated temporary roots, deterministic timeouts, structured assertions, and cleanup that also runs after failure.
- **Verification:** Self-tests prove the harness detects seeded startup, handshake, schema, response, side-effect, timeout, and cleanup failures.
- **Evidence:** `tests/e2e/harness-self-test.test.ts` detects every named seeded fault; packaged E2E proves the real artifact lifecycle and exact discovery agreement.

### BGA-011 — Integrate official MCP conformance testing

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-003, BGA-005
- **Deliverable:** Pinned conformance tests for every supported MCP protocol version and transport.
- **Acceptance:** Unsupported versions are rejected clearly; supported versions pass in CI against the packaged artifact; conformance dependency updates are reviewed rather than silently floated.
- **Verification:** A seeded protocol violation fails conformance, while the release candidate passes the complete claimed matrix.
- **Evidence:** `pnpm test:conformance` rejects a malformed initialize response, then runs the frozen `--requirements 2025-11-25` set — 33 scenarios — against the packaged binary over its real transport, and passes with a reviewed baseline of 26 scenarios that a narrow product server cannot pass: capabilities it does not advertise, scenarios needing the suite's reference fixture, and Streamable HTTP semantics it does not ship. The baseline is enforced in both directions, so an unlisted failure is a regression and a listed scenario that starts passing is a stale entry. See [CONFORMANCE.md](CONFORMANCE.md).
- **Note:** Two things changed on 2026-08-07 and one did not. The suite now reaches the real artifact: [`tests/fixtures/conformance-stdio-proxy.ts`](../tests/fixtures/conformance-stdio-proxy.ts) spawns `dist/cli.js` per session and relays frames, replacing an in-process adapter that measured a factory and, because it held one session for the whole process, answered every scenario after the first with `Session not found`. The pin moved to `0.2.0-alpha.11`, a deliberate prerelease adoption for its frozen requirement sets. What did not change: the official server suite cannot measure `2026-07-28` for a stdio product, because that revision's scenarios test stateless Streamable HTTP semantics belonging to the transport rather than the server. That revision is recorded as not-applicable, with its reason, in the verification evidence. This item stays `implemented` because one claimed version still lacks the evidence it asks for; it becomes `verified` when the suite gains a stdio server mode or separates transport semantics from server behaviour at 2026-07-28.

### BGA-012 — Define and emit verification evidence

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-005, BGA-006, BGA-010, BGA-011
- **Deliverable:** A machine-readable evidence schema and CI artifact containing commit, package version, lock digest, environment, protocol version, scenario results, and timestamps.
- **Acceptance:** Evidence maps every manifest capability to current results, is reproducible, and contains no credentials or private BGA data.
- **Verification:** Schema validation, manifest coverage, tamper checks, and artifact redaction all run as release gates.
- **Evidence:** See the [verification evidence record](verification/VERIFICATION_EVIDENCE.md). [`config/evidence.schema.json`](../config/evidence.schema.json) describes the document; `pnpm evidence` writes `.artifacts/verification-evidence.json` at the end of `pnpm check` and `pnpm verify:evidence` checks it, both wired into the complete gate and the CI artifact upload. The document records the commit and whether the tree was clean, the package version and lock digest, the Node version and platform, the supported protocol versions and every conformance check, and each manifest capability with the result of every scenario it requires, down to the test file and title. A scenario with no test in the run is recorded as `missing` rather than omitted, and a capability advertised as `verified` whose evidence is anything less fails the gate. `integrity` seals the document with a digest over a canonical serialization, so a later edit is detectable. The emitter refuses to write a document containing a known credential format and the gate scans it again. `pnpm verify:evidence` builds five defective documents — wrong schema version, dropped capability, scenario that did not run, field edited after sealing, credential in a test title — and requires itself to reject each before reporting on the real artifact. `GATE-EVIDENCE-COVERAGE`, `GATE-EVIDENCE-TAMPER`, and `GATE-EVIDENCE-REDACTION` cover the same properties as executable tests, owned by the new `AC-FALSE-VERIFICATION` abuse case and by `TM-ARTIFACT-SCAN`.
- **Note:** BGA-011 remains `implemented` rather than `verified`. The first version of this artifact handled that badly: it listed both claimed protocol versions beside a single conformance run under one `passed`, which reads as if both had been exercised. Conformance coverage is now recorded per claimed version, `partial` is a distinct outcome, and the gate rejects a document whose overall word is stronger than its per-version results. The current run records `2025-11-25: passed` and `2026-07-28: not-run`. Signing and per-release publication are BGA-404 and BGA-407.

### BGA-013 — Complete the initial threat model

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-001, BGA-002
- **Deliverable:** A threat model covering local file access, symlinks and traversal, tool arguments, subprocesses, documentation content, SFTP, browser sessions, logs, credentials, supply chain, and MCP-client trust.
- **Acceptance:** Assets, actors, trust boundaries, abuse cases, mitigations, residual risk, and test requirements are recorded. Networked and mutating capabilities cannot start before their boundary is reviewed.
- **Verification:** Each required mitigation maps to an automated negative or security scenario, or to an explicit manual control with an owner.
- **Evidence:** [THREAT_MODEL.md](THREAT_MODEL.md) and [`config/threat-model.json`](../config/threat-model.json) record 15 abuse cases, 24 mitigations, and 5 residual risks across 7 trust boundaries. See the [safety and compatibility milestone](verification/SAFETY_MILESTONE.md). `pnpm verify:threat-model` seeds an unknown mitigation reference, a manual control without an owner, an adapter advertised across the unreviewed Studio boundary, and an undocumented control, and fails on each before passing the real model. TB-DOCS-NETWORK and TB-STUDIO remain unreviewed, so no networked or mutating capability can be advertised.

### BGA-014 — Add secret and artifact safety gates

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-004, BGA-005, BGA-013
- **Deliverable:** Secret scanning, publisher-artwork checks where practical, log redaction tests, and CI artifact inspection.
- **Acceptance:** Known credential formats and seeded sensitive values are blocked or redacted; scans never upload the sensitive fixture itself as an artifact.
- **Verification:** Seeded secrets in source, tool output, logs, and evidence each fail the appropriate gate without revealing the complete value.
- **Evidence:** See the [safety and compatibility milestone](verification/SAFETY_MILESTONE.md). `pnpm verify:safety-gates` writes a seeded credential outside the repository, proves the scanner detects it in artifact content and in a log line, proves the printed finding is masked, then scans the repository and every retained artifact directory. `GATE-SECRET-SCAN-SOURCE`, `GATE-SECRET-SCAN-ARTIFACT`, `GATE-LOG-REDACTION`, and `GATE-FIXTURE-SAFETY` cover each rule, artifact output, stderr redaction, and fixture asset safety. CI runs the scan before the upload step and skips the upload when it fails.

### BGA-015 — Implement the policy boundary

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-003, BGA-013
- **Deliverable:** Central enforcement for configured project roots, remote project allowlists, operation timeouts, network policy, mutation intent, and output limits.
- **Acceptance:** Capabilities cannot bypass policy through alternate paths; configuration is explicit and fails closed; defaults are local, read-only, and network-off.
- **Verification:** Packaged-server E2E covers traversal, symlink escape, unlisted roots, unlisted remotes, missing mutation confirmation, timeout, and oversized output.
- **Evidence:** [`src/policy.ts`](../src/policy.ts) is the single gate for roots, traversal, symlink escape, remote allowlist, network, mutation intent, timeouts, and output budget, and an ESLint rule plus `GATE-POLICY-IMPORT-BOUNDARY` prevent any other module from importing filesystem, network, or subprocess APIs. `INT-POLICY-*` scenarios cover every decision against a real filesystem, and `E2E-POLICY-CONFIG-FAILS-CLOSED` and `E2E-POLICY-ROOT-UNAVAILABLE` prove the packaged artifact refuses unsafe configuration at startup. BGA-102 added packaged tool-call evidence for five of the seven required decisions: traversal, symlink escape, unlisted roots, timeout, and oversized output all fail through `inspect_project` against the installed artifact. Unlisted remotes and missing mutation confirmation remain covered only by integration scenarios, because no capability reaches a remote target or mutates anything yet. This item stays `implemented` until BGA-304 supplies the mutating capability that can prove those two.

### BGA-016 — Implement shared error handling and redaction

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-007, BGA-013, BGA-015
- **Deliverable:** Stable public errors and redaction utilities for paths, credentials, sessions, connection strings, player data, and internal failures.
- **Acceptance:** Errors remain actionable without stack-trace leakage or secrets; unexpected failures receive stable codes and safe context.
- **Verification:** Every public capability inherits negative E2E scenarios seeded with sensitive values and proves they are absent from results and evidence.
- **Evidence:** [`src/errors.ts`](../src/errors.ts) publishes the versioned public error contract with stable codes, and [`src/redaction.ts`](../src/redaction.ts) removes private keys, tokens, sessions, connection credentials, player data, and out-of-root paths. `UNIT-REDACTION-CREDENTIALS`, `UNIT-REDACTION-PATHS`, `UNIT-REDACTION-PLAYER-DATA`, `UNIT-ERROR-UNEXPECTED-COLLAPSE`, and `GATE-LOG-REDACTION` prove seeded values never survive a published error or a log line. BGA-102 supplies the inherited negative scenarios: `E2E-INSPECT-PROJECT-REDACTION` proves a refusal carries a redacted path rather than an absolute one, and `E2E-INSPECT-PROJECT-SYMLINK-ESCAPE` proves seeded key material behind a link never reaches a result. Every future capability inherits the same requirement through its manifest entry.

## Phase 1 — Read-only local MVP

### BGA-100 — Detect BGA project layouts

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-008, BGA-009, BGA-015
- **Deliverable:** Capability-based discovery for supported modern and legacy project layouts.
- **Acceptance:** Detection identifies present components without assuming a template, reports ambiguous or partial layouts, and never reads outside the configured root.
- **Verification:** E2E runs every fixture plus empty, partial, ambiguous, nested, traversal, and symlink cases through the packaged server.
- **Evidence:** [`src/project/layout.ts`](../src/project/layout.ts) scores nine independent signals instead of matching one template. A project matching both templates or neither stays `unrecognized`, and a partial match is reported as `likely` rather than `certain`. Unit scenarios cover modern, legacy, ambiguous, partial, empty, non-project, and Windows-style roots; `E2E-INSPECT-PROJECT-MODERN`, `E2E-INSPECT-PROJECT-LEGACY`, `E2E-INSPECT-PROJECT-UNRECOGNIZED`, `E2E-INSPECT-PROJECT-TRAVERSAL`, and `E2E-INSPECT-PROJECT-SYMLINK-ESCAPE` prove the same behavior through the packaged server.

### BGA-101 — Build the normalized project model

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-100
- **Deliverable:** A normalized representation of metadata, options, states, transitions, actions, methods, notifications, database objects, statistics, templates, styles, modules, and tests.
- **Acceptance:** Source locations and certainty survive normalization; unsupported constructs are retained as explicit unknowns; parsers do not execute project code.
- **Verification:** Integration tests compare fixtures to declared models; public E2E proves the same model drives observable inspection and validation results.
- **Evidence:** [`src/project/model.ts`](../src/project/model.ts) normalizes layout, metadata, twelve components, and legacy state definitions with their source locations, and [`src/project/parse.ts`](../src/project/parse.ts) reads JSONC and PHP literals without executing project code. Every construct it cannot interpret becomes an explicit `unsupported-syntax` finding: computed state keys, non-literal transition targets, and modern class-based states are reported, never dropped. Integration scenarios compare both fixtures to declared models; the same model drives `inspect_project` through the packaged server.
- **Scope note:** Action contracts, notifications, database objects, and test files are represented as absent rather than empty, because their parsers belong to BGA-107, BGA-108, and BGA-109. This item stays `implemented` until those parsers extend the model and the E2E scenarios that prove them exist.

### BGA-102 — Implement `inspect_project`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-006, BGA-007, BGA-100, BGA-101
- **Deliverable:** A read-only tool that explains the detected layout, components, capabilities, missing expected files, and uncertainty.
- **Acceptance:** The schema is stable, paths are safe and relative, results are concise but complete, and no file changes occur.
- **Verification:** Manifest-mapped E2E covers success for every layout plus invalid root, non-project, ambiguous syntax, traversal, permission failure, and proof of filesystem immutability.
- **Evidence:** The first advertised capability. Eleven manifest-mapped scenarios run against the packed and installed artifact through a real MCP client: both supported layouts, an unrecognized project, schema rejection for four malformed inputs, an unlisted root, an unconfigured server, traversal, symlink escape, redaction of a seeded secret and of absolute paths, deadline expiry, and output-budget refusal. Both success scenarios hash the project directory before and after the call and prove it unchanged. See the [first capability verification](verification/FIRST_CAPABILITY.md).

### BGA-103 — Implement `bga://project/summary`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-006, BGA-101, BGA-102
- **Deliverable:** A resource exposing the normalized project summary without triggering mutation or network access.
- **Acceptance:** Resource content matches `inspect_project` semantics, declares media type and version, and remains bounded for large projects.
- **Verification:** Resource E2E lists, reads, validates, and compares the resource against the fixture baseline, including missing-root and oversized-project failures.
- **Evidence:** [`src/resources/project-resources.ts`](../src/resources/project-resources.ts) serves the normalized model from `bga://project/summary` as JSON, through the same policy boundary, timeout, and output budget the tools use. `E2E-RESOURCE-SUMMARY` reads it from the packaged artifact and checks the layout, metadata, and component set; `E2E-RESOURCE-IMMUTABLE` hashes the project before and after reading all three resources. See the [project resource verification](verification/PROJECT_RESOURCES.md).
- **Scope note:** A resource takes no arguments, so it describes the single configured project root. With no root, or more than one, it refuses with a stable code rather than choosing; the tools remain available for a project named explicitly.

### BGA-104 — Implement `bga://project/states`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-006, BGA-101, BGA-106
- **Deliverable:** A resource exposing normalized states, transitions, handlers, locations, and uncertainty.
- **Acceptance:** Legacy and modern representations produce one documented shape without inventing missing relationships.
- **Verification:** Resource E2E covers each fixture generation, malformed state data, unsupported constructs, and output limits.
- **Evidence:** `bga://project/states` serves the state definitions with their transitions, handlers, source location, unsupported constructs, and the full state-machine validation, so uncertainty travels with the data. `E2E-RESOURCE-STATES` reads it from the packaged artifact and checks all of them. See the [project resource verification](verification/PROJECT_RESOURCES.md).
- **Scope note:** A resource takes no arguments, so it describes the single configured project root. With no root, or more than one, it refuses with a stable code rather than choosing; the tools remain available for a project named explicitly.

### BGA-105 — Implement `bga://project/diagnostics`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-006, BGA-007, BGA-112
- **Deliverable:** A resource exposing current aggregate validation findings.
- **Acceptance:** Results are deterministic for unchanged files, include rule and evidence versions, and do not imply unsupported checks passed.
- **Verification:** Resource E2E seeds known findings, validates ordering and schema, modifies an isolated fixture, and proves refresh behavior without stale results.
- **Evidence:** `bga://project/diagnostics` serves the same aggregate `validate_project` produces, including the per-group breakdown and any group that could not run. `E2E-RESOURCE-DIAGNOSTICS` reads it from the packaged artifact for both a clean and a defective project. See the [project resource verification](verification/PROJECT_RESOURCES.md).
- **Scope note:** A resource takes no arguments, so it describes the single configured project root. With no root, or more than one, it refuses with a stable code rather than choosing; the tools remain available for a project named explicitly.

### BGA-106 — Implement `validate_state_machine`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Cross-file validation for state identifiers, types, transitions, targets, handlers, reachability where provable, and supported BGA state conventions.
- **Acceptance:** Every rule has documented evidence, valid and invalid fixtures, certainty, severity, and false-positive notes. Heuristics are never reported as facts.
- **Verification:** Tool E2E covers every rule's positive and negative fixture plus invalid input, unsupported syntax, path confinement, deterministic ordering, and immutability.
- **Evidence:** Eleven rules in [`src/rules/state-machine.ts`](../src/rules/state-machine.ts), each carrying its severity, certainty, and known false positives, published to the client in every result. Structural rules are proven from the parsed declaration and reported as facts; the three cross-file handler rules are heuristics with `likely` certainty and heuristic evidence, and they stay silent when no PHP source could be read. A new `legacy-broken` fixture seeds nine defects and declares them in its `expected.json`, so a rule change cannot silently repurpose it; the `legacy` fixture gained its handler methods so it is a true clean baseline. Seven packaged scenarios prove the behavior through a real MCP client. See the [state-machine validation verification](verification/STATE_MACHINE_VALIDATION.md).
- **Scope note:** Rules apply to the legacy `states.inc.php` declaration. A modern project returns an `unsupported` result rather than a clean one, because class-based state definitions are not yet interpreted; BGA-118 delivered that reader on 2026-08-07; modern state classes are read.

### BGA-107 — Implement `validate_action_contracts`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Trace client action calls to server endpoints, argument validation, and game methods for supported layouts.
- **Acceptance:** Missing endpoints, mismatched names, unsupported arguments, and broken handler links produce evidence-backed findings with exact locations.
- **Verification:** Tool E2E exercises every supported action pattern, seeded mismatch, dynamic or uncertain pattern, invalid input, and non-execution of project code.
- **Evidence:** [`src/project/actions.ts`](../src/project/actions.ts) reads legacy `ajaxcall` URLs, modern `bgaPerformAction` names, and the request arguments an entry point consumes; [`src/rules/action-contracts.ts`](../src/rules/action-contracts.ts) traces each action from client call to entry point to game method. Eight rules: a duplicated entry point and a broken `act…` name are facts, every cross-file claim is a heuristic carrying its limitations, and a call assembled at runtime becomes unsupported syntax rather than a guess. When a side of the contract cannot be read the result says so instead of passing. Both fixtures gained real action wiring, and `legacy-broken` declares its eight expected contract findings. Seven packaged scenarios prove it through a real MCP client. See the [action contract verification](verification/ACTION_CONTRACTS.md).
- **Scope note:** Tracing covers the legacy client and action class. A modern project reports `action.trace.unavailable` because its attribute-based entry points are not yet read; BGA-119 delivered that reader on 2026-08-07; autowired actions are traced.

### BGA-108 — Implement `validate_notifications`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Trace server notifications to client subscriptions and compare supported payload shapes and handler use.
- **Acceptance:** Missing handlers, name mismatches, and provable payload incompatibilities are distinguished from dynamic or uncertain behavior.
- **Verification:** Tool E2E covers valid, missing, mismatched, extra, dynamic, and malformed notification fixtures with stable evidence.
- **Evidence:** [`src/project/notifications.ts`](../src/project/notifications.ts) reads `notifyAllPlayers` and `notifyPlayer` sends with their payload keys, and the client handlers bound by `dojo.subscribe` or the `notif_<name>` method convention with the keys each reads. [`src/rules/notifications.ts`](../src/rules/notifications.ts) compares the two sides. Five rules: a duplicate subscription and an untraceable contract are facts; sent-but-unhandled, handled-but-unsent, and payload disagreement in either direction are heuristics carrying their limitations. A send with a computed name or payload becomes unsupported syntax. Both fixtures gained notification wiring, and `legacy-broken` declares its five expected findings. Seven packaged scenarios prove it through a real MCP client. See the [notification contract verification](verification/NOTIFICATIONS.md).
- **Scope note:** Tracing covers the legacy client and PHP sources. A modern project reports `notification.trace.unavailable`, as does any project where neither side mentions a notification, so an unreadable contract never returns a clean result.

### BGA-109 — Implement `audit_database_usage`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Compare `dbmodel.sql` with supported query usage and detect high-confidence schema, reference, and unsafe-pattern findings.
- **Acceptance:** SQL is parsed without connecting to or executing against a database; dialect limits are explicit; no rule claims more certainty than the parser supports.
- **Verification:** Tool E2E covers valid schema usage, missing objects/columns, supported unsafe patterns, dynamic SQL uncertainty, malformed SQL, and zero network/database access.
- **Evidence:** [`src/project/database.ts`](../src/project/database.ts) reads the tables and columns `dbmodel.sql` declares and the queries the PHP sources run, attributing bare columns only when a query names exactly one table. [`src/rules/database.ts`](../src/rules/database.ts) compares them. Seven rules: undeclared tables and duplicate declarations are facts; undeclared columns, unused columns, and interpolated queries are heuristics carrying their limitations. Framework-owned tables are never reported as undeclared. Both fixtures gained a real schema and queries, and `legacy-broken` declares its four expected findings. Seven packaged scenarios prove it through a real MCP client. See the [database audit verification](verification/DATABASE_AUDIT.md).
- **Scope note:** Column attribution needs a single-table query; a multi-table query keeps only its qualified columns and reports the rest as unsupported. A query concatenated from several expressions is reported rather than reconstructed.

### BGA-110 — Define the pre-release rule catalog

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-001, BGA-007, BGA-008
- **Deliverable:** A versioned catalog mapping automatable BGA pre-release checks to official sources, rule implementations, fixtures, severities, and limitations.
- **Acceptance:** Manual-only checklist items remain explicit; community conventions are labeled; every automated rule has valid and failing fixtures.
- **Verification:** Catalog validation proves every automated rule has sources, implementation ownership, fixtures, and scenario IDs.
- **Evidence:** [`config/rule-catalog.json`](../config/rule-catalog.json) and [RULES.md](RULES.md) hold 31 automated checks and 8 manual-only ones. Each automated check names the rule that implements it, its severity and certainty, the fixtures that prove both outcomes, and its source kind; each manual check records why it cannot be automated. `pnpm verify:rule-catalog` fails when a rule is implemented but not catalogued or catalogued but not implemented, when a catalogued severity or certainty differs from the implementation, when a claimed failing fixture does not declare that finding, or when a check is missing from the documentation, and it seeds each of those defects to prove it fails on them.

### BGA-111 — Implement `run_pre_release_audit`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-102, BGA-106, BGA-107, BGA-108, BGA-109, BGA-110
- **Deliverable:** A read-only audit that runs supported pre-release rules and returns passed, failed, unsupported, and manual-required checks separately.
- **Acceptance:** The tool never converts an unimplemented or manual check into a pass and identifies the rule-catalog version used.
- **Verification:** Tool E2E covers clean, failing, partial-support, malformed, and manual-required projects and proves no project mutation.
- **Evidence:** [`src/rules/pre-release.ts`](../src/rules/pre-release.ts) turns validator output into a verdict per catalogued check. A check passes only when the validator that owns it ran and produced no finding for it; a validator that failed, was skipped, or could not read what the check examines leaves it `unsupported`, and a manual check is always `manual-required`. The tool reports the catalog version it applied, read from the catalog the package ships. Seven packaged scenarios cover a clean project, a defective one, a partially supported one, the manual checks, the catalog version, malformed input, and immutability.

### BGA-112 — Implement `validate_project`

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-106, BGA-107, BGA-108, BGA-109
- **Deliverable:** A deterministic aggregator for project validations with selectable rule groups and bounded results.
- **Acceptance:** Aggregation preserves underlying evidence and certainty, reports skipped and unsupported groups, and cannot hide a failed validator.
- **Verification:** Tool E2E compares aggregate results with individual tools, covers selection and limits, and seeds one validator failure to prove safe partial-failure reporting.
- **Evidence:** [`src/rules/aggregate.ts`](../src/rules/aggregate.ts) runs the four validators and combines them under three guarantees: a validator that throws is reported as `failed` with its public error code and makes the whole run `incomplete`; findings keep the evidence, certainty, and locations their validator produced, so aggregation reorders but never rewrites; and a bounded result drops the least severe findings first and reports how many were omitted, while the per-group breakdown still reports full counts. `E2E-VALIDATE-PROJECT-MATCHES-PARTS` calls all four tools individually in the same connection and proves the aggregate agrees with each of them, finding for finding. `E2E-VALIDATE-PROJECT-PARTIAL-FAILURE` seeds a schema larger than the read budget so exactly one validator fails, and proves the other three still run. See the [aggregate validation verification](verification/AGGREGATE_VALIDATION.md).

### BGA-113 — Implement explicit unknown-syntax handling

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-007, BGA-101
- **Deliverable:** Shared behavior for syntax that cannot be parsed or relationships that cannot be proven.
- **Acceptance:** Unknown syntax produces an `unsupported` or `uncertain` result with a location and reason, never an implicit pass or fabricated relationship.
- **Verification:** Every parser and public validation E2E suite includes at least one unknown construct and asserts the explicit uncertainty result.
- **Evidence:** [`src/rules/uncertainty.ts`](../src/rules/uncertainty.ts) is the shared behavior every rule module now builds its findings with: a proven claim is a fact, a claim depending on unseen code is a heuristic carrying the rule's recorded false positives, and a construct the reader cannot interpret is unsupported syntax with its location and reason. A result made entirely of unsupported syntax reports `unsupported`, never `passed`. The four rule modules previously duplicated these builders; the refactor left every existing test passing unchanged. `tests/unit/uncertainty.test.ts` asserts the three shapes, that every non-certain rule records how it can be wrong, and that all seven parsers report a construct they cannot read rather than dropping it. Each validator's packaged suite already asserts the explicit unsupported result for a project it cannot fully read.

### BGA-114 — Enforce local read-only and network-off behavior

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-015, BGA-102 through BGA-113
- **Deliverable:** Technical enforcement and evidence that local inspection, resources, and validation cannot mutate source or initiate network access.
- **Acceptance:** The policy applies regardless of tool inputs and detects attempted adapter or dependency escape.
- **Verification:** E2E runs local capabilities in a network-denied environment, snapshots filesystem metadata/content, and fails on any outbound connection or mutation.
- **Evidence:** `tests/e2e/network-denied.ts` replaces every network primitive — `net`, `tls`, `http`, `https`, `dns`, `dns/promises`, `dgram`, `fetch`, and `net.Socket.prototype.connect` — with functions that throw and record the attempt, and is loaded before the packaged server starts. `E2E-READ-ONLY-NETWORK-DENIED` runs every advertised tool and all three resources under that denial: all complete, the attempt log stays empty, and the project is unchanged by content digest and by per-file size and modification time. `E2E-READ-ONLY-NETWORK-HARNESS` proves the denial itself works by making an outbound connection fail and appear in the log, so the first scenario's empty log is evidence rather than an artifact of a harness that does nothing. `E2E-READ-ONLY-INPUT-CANNOT-ESCAPE` proves the policy holds whatever the client sends: an outside root, a traversal, and the filesystem root are all refused while a legitimate call succeeds, and a file outside the root is untouched.

### BGA-115 — Read the modern project layout

- **Status:** superseded
- **Priority:** P1
- **Superseded by:** BGA-117, BGA-118, BGA-119, BGA-120, BGA-121
- **Reason:** Research against the official BGA Studio documentation on 2026-08-07 showed this is four separable readers plus a fixture prerequisite, with different sources and different amounts of work. Splitting them keeps each one's evidence honest. The original deliverable and the scope notes that pointed here are preserved by the replacement items.

### BGA-117 — Capture a representative modern fixture pair

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-008
- **Deliverable:** Original modern fixtures matching the current framework — a valid one and a defective variant — replacing the minimal stub that only proves layout detection.
- **Acceptance:** The fixtures use the constructs the official documentation describes: state classes extending `Bga\GameFramework\States\GameState`, autowired `act…` methods, the `bga->notify` API, and the modern client API. The defective variant declares its expected findings the way `legacy-broken` does. No fixture copies a real published game.
- **Verification:** Fixture integrity passes for the new pair, and every modern reader item below is proven against it.
- **Evidence:** `tests/fixtures/projects/modern` and `modern-broken` are original fixtures built to the documented shapes: state classes extending `GameState` with named constructor arguments, autowired `act…` methods, `$this->bga->notify->all`, and `this.bga.actions.performAction`. The defective variant seeds a transition to an undeclared state, an unknown state type, an unreachable dead end, an action the game class never declares, a notification nobody handles, a payload mismatch, an undeclared table, and a state whose identifier is computed and therefore unreadable. Both declare their expected findings the way the legacy pair does.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory), [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide), [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php).

### BGA-118 — Read modern state classes

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-101, BGA-106, BGA-117
- **Deliverable:** A reader for state classes under `modules/php/States`, extracting the identifier, type, description, transitions, and action methods from the `parent::__construct` call and the class body, plus the `GameStateBuilder` form.
- **Acceptance:** The state machine validator produces real findings for a modern project. A state's name defaults to its class name as the framework does; `StateType::ACTIVE_PLAYER` and its siblings map to the same rule outcomes as the legacy type strings; `getArgs`, `onEnteringState`, and `zombie` are recognised as the handlers they are. Anything the reader cannot interpret stays unsupported syntax.
- **Verification:** The state-machine suite gains modern scenarios mirroring its legacy ones, including a seeded defect set, and the compatibility matrix claims modern support only once they pass.
- **Evidence:** [`src/project/modern.ts`](../src/project/modern.ts) reads state classes into the same shape the legacy declaration produces: identifier, type mapped from `StateType`, name defaulting to the class name as the framework does, transitions, and the `getArgs` and `onEnteringState` handlers. A computed identifier, type, or transition target is reported as unsupported syntax rather than guessed. Every state-machine rule now applies to both layouts, proven by `E2E-VALIDATE-STATES-MODERN-CLEAN` and `E2E-VALIDATE-STATES-MODERN-DEFECTS`.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory).

### BGA-119 — Read modern action autowiring and the modern client action API

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-107, BGA-117, BGA-118
- **Deliverable:** Action-contract tracing for projects with no `.action.php`: autowired public `act…` methods on the game class as the server side, and `this.bga.actions.performAction` alongside the existing `bgaPerformAction` and `ajaxcall` on the client side.
- **Acceptance:** A modern project no longer reports `action.trace.unavailable` merely for lacking an action class, and the absent file is never itself reported as a defect. Parameter names are compared through the framework's typed autowiring rather than request reads, and `#[IntParam]`-style attributes are read where present.
- **Verification:** The action-contract suite gains modern scenarios mirroring its legacy ones, including a seeded mismatch, and proves the legacy path is unchanged.
- **Evidence:** Action tracing now accepts a project with no `.action.php`: autowired public `act…` methods on the game class are the entry point, their typed parameters are the contract, and an autowired action is its own game method rather than a missing second hop. The client reader accepts `this.bga.actions.performAction` alongside `bgaPerformAction` and `ajaxcall`. The rule comparing calls against a state's declared actions now stays silent when no state enumerates any, because an empty set means unknown rather than nothing-allowed; that limitation is recorded on the rule.
- **Sources:** [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide), [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php).

### BGA-120 — Read the modern notification API

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-108, BGA-117
- **Deliverable:** Notification reading for `$this->bga->notify->all` and `$this->bga->notify->player`, and for the promise-based client setup that replaces `dojo.subscribe`.
- **Acceptance:** A modern project's notifications are compared in both directions. The legacy `notifyAllPlayers` and `notifyPlayer` forms keep working, since the documentation marks them superseded rather than removed, and a project mixing both is read correctly.
- **Verification:** The notification suite gains modern scenarios mirroring its legacy ones, including a seeded payload mismatch and a notification with no handler.
- **Evidence:** The notification reader accepts `$this->bga->notify->all` and `->player` alongside the legacy `notifyAllPlayers` and `notifyPlayer`, and recognises class-method handlers such as `async notif_playerPassed(notif)` alongside the object-literal form. A project mixing both is read correctly, which matters because the documentation marks the legacy form superseded rather than removed.
- **Sources:** [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php), [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide).

### BGA-121 — Confirm the database audit on the modern layout

- **Status:** verified
- **Priority:** P2
- **Depends on:** BGA-109, BGA-117
- **Deliverable:** Evidence that the database audit already works for modern projects, or the changes needed if it does not.
- **Acceptance:** `dbmodel.sql`, `DbQuery`, and `getObjectListFromDB` are documented as unchanged between layouts, so this item is expected to need fixtures and scenarios rather than new reading. Any difference found is recorded rather than assumed away.
- **Verification:** The database suite gains modern scenarios mirroring its legacy ones, and the compatibility matrix claims modern support for database auditing only once they pass.
- **Evidence:** Confirmed: the database audit needed no new reading. `dbmodel.sql`, `DbQuery`, and `getObjectListFromDB` are unchanged between layouts, and the modern fixtures exercise the same rules, including an undeclared table in the defective variant.
- **Sources:** [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php).

### BGA-122 — Model the project layout as independent per-file generations

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-100, BGA-101, BGA-117
- **Deliverable:** Layout detection that reports a generation per migratable component rather than matching one of two whole-project templates, and a derived `hybrid` layout label for a project whose components are not all one generation.
- **Acceptance:** The official documentation describes migration as a per-file, independently staged process, so a project holding `gameinfos.inc.php` alongside `modules/php/Game.php` and `states.inc.php` — the most common real shape — must be detected and read rather than reported as `unrecognized`. Each of metadata, game logic, states, player actions, and client logic reports its own generation and the files that produced it. Metadata reading keys off the metadata generation rather than the whole-project label. A project with no resolvable generation on any component stays `unrecognized`, and the reason states which markers were found rather than claiming none were. The derived label stays `legacy` or `modern` when every resolved component agrees, so existing claims and scenarios keep their meaning.
- **Verification:** Unit scenarios cover each single-axis migration in both directions, the fully legacy and fully modern shapes, and the empty and unrecognizable projects. A `hybrid` fixture is added and every capability runs against it end to end, proving no validator reports a defect that the same content in a uniform layout would not. The compatibility matrix claims hybrid support only once they pass.
- **Evidence:** [`src/project/layout.ts`](../src/project/layout.ts) resolves a generation — `legacy`, `modern`, `both`, or `absent` — for metadata, game logic, states, and client logic, and derives the label from them; `hybrid` is a supported outcome and `unrecognized` now means no component resolved. The reason string names what was found rather than claiming nothing was. `<game>.action.php` is deliberately not a generation signal, because the documentation says it may remain in an autowired project. Component expectation follows the governing component's generation, so an autowired project is not told it is missing an action class. Metadata is read from the file its own generation selects; a project holding both metadata files reports `project.metadata.both-generations` and reads the JSON one. `tests/unit/project-layout.test.ts` covers each single-component migration, the common `modules/php` + `gameinfos.inc.php` + `states.inc.php` shape, a component held in both forms, game-key recovery from a surviving legacy file, and the unrecognized cases. `tests/fixtures/projects/hybrid` is an original part-migrated fixture; `E2E-INSPECT-PROJECT-HYBRID` reads its per-component generations through the public schema, and `E2E-VALIDATE-PROJECT-HYBRID` proves all four validators run and report nothing, so the mixture produces no false positives. Claimed as `CLAIM-LAYOUT-HYBRID`.
- **Sources:** [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference), [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php) ("this file is now named Game.php, located in the modules/php directory. If you see it named yourgamename.game.php in the root dir, it's the legacy usage."), [Game interface logic: yourgamename.js](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js), [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) ("Deprecation warning: Actions detected on .action.php file… If you transform your project to use only auto-wired actions, you can then delete the .action.php file.").
- **Note:** This item exists because BGA-100 assumed two whole-project templates without checking whether the framework migrates that way. It does not. The `gameinfos.inc.php` + `modules/php/Game.php` + `states.inc.php` shape — the most common one — was reported as `unrecognized`, with a reason claiming no marker was found while six had matched. The rule added to [AGENTS.md](../AGENTS.md) is the durable fix: read the documentation for a framework behavior before implementing it.

### BGA-123 — Read a partially migrated state machine from both sources

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-118, BGA-122
- **Deliverable:** State reading that merges `states.inc.php` with the state classes under `modules/php/States` when both are present, instead of taking the first source found.
- **Acceptance:** The migration guide describes migrating states one class at a time and removing `states.inc.php` only once all of them are done, so both sources are authoritative in the interim. States from both are read into one machine; a state defined in both is taken from the class, since the class is what the framework runs; the state machine validator sees the merged set, so a transition from a legacy state into a migrated one is not a dangling target. The single-source cases behave exactly as they do today.
- **Verification:** The state-machine suite gains partially migrated scenarios, including a transition that crosses sources in each direction and a state defined in both. The hybrid fixture from BGA-122 carries a partially migrated machine so the end-to-end path is covered.
- **Evidence:** `readStates` in [`src/project/model.ts`](../src/project/model.ts) reads both sources and merges them by identifier, with the class winning a duplicate because that is the form the framework runs. `ProjectStates` gained `sources`, so a caller can see every origin rather than only the first. A split machine reports `project.states.partially-migrated` as information — a fact about the project, not a defect — and names how many states came from each side and how many were declared twice. The hybrid fixture's machine spans both files with a transition crossing in each direction (state 1 in `states.inc.php` targets the migrated state 2, which targets state 99 back in `states.inc.php`); the state-machine validator reports nothing, which it could not do if either half were invisible. `tests/integration/project-model.test.ts` covers the fixture and a project where a stale `states.inc.php` entry is overridden by its class.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory), [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) ("Create a State class for each state of the game… When all classes are migrated, you can remove the states.inc.php file.").

### BGA-116 — Reduce first-run friction

- **Status:** verified
- **Priority:** P2
- **Depends on:** BGA-102, BGA-112
- **Deliverable:** Input and documentation changes that make a correctly configured server pleasant to use: `projectRoot` optional when exactly one root is configured, help text that states a project root must be an absolute path, and tool descriptions that state which layouts a validator supports.
- **Acceptance:** Omitting `projectRoot` with one configured root behaves as if it had been passed; omitting it with none or several fails with the existing stable codes rather than guessing. No change weakens a policy check.
- **Verification:** Packaged scenarios cover the omitted argument with zero, one, and several configured roots, and prove the refusals keep their current error codes.
- **Evidence:** `resolveProjectRoot` in [`src/tools/project-context.ts`](../src/tools/project-context.ts) resolves an omitted `projectRoot` to the sole configured root and refuses otherwise, and every tool calls it as the first statement of its handler, so the rule cannot reach six tools and miss the seventh. The resources use the same function with their own ambiguity wording, so the argument rule and the resource rule cannot drift apart. `E2E-INSPECT-PROJECT-DEFAULT-ROOT` proves the omitted argument returns byte-identical output to the explicit one; `E2E-INSPECT-PROJECT-DEFAULT-ROOT-AMBIGUOUS` proves two roots are refused with `resource.project.ambiguous` while an explicit root still works on the same server; `E2E-INSPECT-PROJECT-DEFAULT-ROOT-UNCONFIGURED` proves no roots are refused with `policy.root.unconfigured` and told which flag to pass. Each tool's `projectRoot` description states the default and that the path is absolute, and each tool description states which layouts it reads. The six `*-INVALID-INPUT` scenarios kept every other malformed input and dropped only `{}`, which is now valid input rather than a weakened check.

## Phase 2 — Documentation

### BGA-200 — Define the documentation source and provenance policy

- **Status:** verified
- **Priority:** P1
- **Depends on:** BGA-001, BGA-013
- **Deliverable:** An allowlisted source catalog distinguishing official BGA documentation from community examples, with licensing, attribution, retrieval, and trust rules.
- **Acceptance:** Every source has canonical URL, authority, allowed use, update signal, and retention policy; prompt-like content is treated as untrusted data.
- **Verification:** Catalog validation rejects unapproved, unattributed, or incompletely classified sources.
- **Evidence:** [`config/doc-sources.json`](../config/doc-sources.json) allowlists two sources with canonical URL, host, authority, licence, permitted use, the source's own content signals, retrieval mode, update signal, retention, and trust class; [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md) is its human-readable view. `pnpm verify:doc-sources` seeds seven defects — a non-HTTPS URL, a host that disagrees with its canonical URL, a source that retains no provenance, one classified as trusted, one permitting full-text redistribution against `use=reference`, one permitting bulk crawling from a site that refuses named crawlers, and one missing a required field — and fails on each before reporting on the real catalog. Every source is classified `untrusted-content`, and no source permits training, bulk crawling, or full-text redistribution.
- **Note:** The sources' own robots.txt decided the design rather than the other way round. `en.doc.boardgamearena.com` publishes `Content-Signal: search=yes,ai-train=no,use=reference` and refuses nine named AI crawlers outright, and publishes no content licence at all. So: one page per explicit request, link and short attributed excerpt only, no corpus and no vendored snapshot, honest user agent. Authority is recorded separately from host, because the BGA Studio Cookbook sits on the official wiki and invites anyone to edit it.
- **Sources:** [robots.txt](https://en.doc.boardgamearena.com/robots.txt), [Main Page](https://en.doc.boardgamearena.com/Main_Page), [Studio](https://en.doc.boardgamearena.com/Studio), [BGA Studio Cookbook](https://en.doc.boardgamearena.com/BGA_Studio_Cookbook), checked 2026-08-07.
- **Boundary:** TB-DOCS-NETWORK was reviewed on 2026-08-07, so Phase 2 work may begin. The review records seven preconditions that must be implemented before any documentation capability can be advertised, and the capability gate enforces them. See the [documentation boundary review](verification/DOCS_BOUNDARY_REVIEW.md).

### BGA-201 — Build the documentation index pipeline

- **Status:** superseded
- **Priority:** P1
- **Superseded by:** BGA-207, BGA-208
- **Reason:** The premise was wrong, and BGA-200 found it by reading the sources rather than assuming them. Both approved sources refuse bulk collection and publish no content licence, so a pipeline that crawls the wiki, builds an index and ships it would exceed what the sources permit and redistribute content that is all rights reserved. There is no version of "build the index pipeline" that survives that, so it is replaced by the two things actually needed: a guarded fetch that may cross the boundary at all (BGA-207), and a dated cache built from what a developer's own lookups returned (BGA-208). The original acceptance criteria are preserved by the replacements — determinism becomes reproducibility of a cached result, explicit staleness becomes the snapshot-date rule, and "private project data is never indexed" becomes a request-content rule enforced at the boundary.

### BGA-207 — Implement the guarded documentation fetch boundary

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-015, BGA-114, BGA-200
- **Deliverable:** The first network path in the server: a fetch confined to allowlisted documentation sources, owned by the policy boundary, implementing the boundary review's preconditions TM-DOC-HOST-ALLOWLIST, TM-DOC-NO-LOOPBACK, TM-DOC-REQUEST-CONTENT, and TM-DOC-RESPONSE-BUDGET.
- **Acceptance:** Only a host in [`config/doc-sources.json`](../config/doc-sources.json) may be reached, over HTTPS, with redirects confined to the allowlist and a redirect out of it refused rather than followed. A host resolving to a loopback, link-local, or private address is refused after resolution, not merely by name. A request carries only the client's explicit query — never project file content, path, or game name — and that is enforced where the request is built rather than trusted to the caller. Response size and time are bounded by the same policy budget every other capability uses. Network access stays off by default: with `--allow-network` absent, every one of these paths refuses before it resolves anything.
- **Verification:** Negative scenarios cover an unlisted host, an HTTP URL, a redirect that leaves the allowlist, a DNS name resolving to loopback and to a private range, an oversized response, a slow response, and a request built from project content. `E2E-READ-ONLY-NETWORK-DENIED` must keep passing unchanged, proving the local capabilities still reach no network at all.
- **Evidence:** `fetchDocumentation` in [`src/policy.ts`](../src/policy.ts) is the only outbound request in the server, and the only code allowed to import `node:https` and `node:dns` — `GATE-POLICY-IMPORT-BOUNDARY` keeps it that way. A caller names a source identifier and a page path, never a host, so the URL is built from reviewed catalog data; a protocol-relative, absolute, or traversing path is refused, and the constructed URL must still be HTTPS, on the source's host, and inside its canonical prefix. Every redirect hop is re-checked against the allowlist and refused rather than followed when it leaves, bounded at three hops. `createGuardedLookup` checks every address a name answers with and hands the socket the address it approved, so a name answering with one public and one private address is refused entirely and no second DNS answer can be substituted after the check. `readBoundedUtf8` destroys the stream the moment the budget is passed rather than buffering an oversized page. `requestContentViolation` refuses a query that is empty, over 200 characters, carries control characters, contains a filesystem path or a configured project root, or contains source syntax. `UNIT-DOC-ADDRESS-BLOCKED`, `UNIT-DOC-HOST-ALLOWLIST`, `UNIT-DOC-REQUEST-CONTENT`, `UNIT-DOC-RESPONSE-BUDGET`, `INT-DOC-NETWORK-OFF`, `INT-DOC-HOST-ALLOWLIST`, and `INT-DOC-REQUEST-CONTENT` cover these, and `E2E-READ-ONLY-NETWORK-DENIED` passes unchanged. TM-DOC-HOST-ALLOWLIST, TM-DOC-NO-LOOPBACK, TM-DOC-REQUEST-CONTENT, and TM-DOC-RESPONSE-BUDGET move from `planned` to `implemented`.
- **Note:** `implemented`, not `verified`, and the reason is structural. Every guard is proven at unit and integration level, and none is proven end to end through a real MCP client, because no capability exposes documentation retrieval yet — that is BGA-202. Two acceptance items are also not directly exercised: a real redirect off the allowlist and a real oversized response would need a live server, and the guard refuses loopback by design, so a local test server is exactly what it will not talk to. The mechanisms behind both are unit-tested against synthetic input instead. This item becomes `verified` when BGA-202 puts a capability in front of it and the packaged scenarios can drive the refusals through the public boundary.
- **Sources:** [documentation boundary review](verification/DOCS_BOUNDARY_REVIEW.md), [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md).

### BGA-208 — Implement the dated documentation cache

- **Status:** ready
- **Priority:** P1
- **Depends on:** BGA-200, BGA-207
- **Deliverable:** A bounded local cache of what a developer's own lookups returned, carrying provenance and snapshot dates, implementing TM-DOC-PROVENANCE, TM-DOC-UNTRUSTED, and TM-DOC-SNAPSHOT-INTEGRITY.
- **Acceptance:** A cache entry stores the canonical URL, the retrieval timestamp, the source's own last-modified signal where it publishes one, and the source's authority. Nothing is served without its date. An entry older than its source's `maxCacheDays` is refetched or reported as stale, never served as current. Retrieved text is stored and returned labelled as untrusted content. The cache holds excerpts, never whole pages, because no approved source permits retaining full text. It is per-developer local state, never part of the published package, and it is never populated by anything but an explicit lookup.
- **Verification:** Integration scenarios cover a cold lookup, a warm hit, an expired entry, an entry whose source authority is community, and a source that changed upstream. A packaged scenario proves provenance and snapshot date survive to the client, and that a cached excerpt is never returned without them.
- **Sources:** [documentation boundary review](verification/DOCS_BOUNDARY_REVIEW.md), [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md).

### BGA-202 — Implement `search_bga_docs`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-016, BGA-207, BGA-208
- **Deliverable:** A tool returning relevant, concise documentation excerpts with canonical sources, provenance, snapshot dates, and known framework versions.
- **Acceptance:** Official and community results are distinguishable, result limits are enforced, and retrieved text cannot issue instructions to the server.
- **Verification:** Tool E2E covers exact-topic, ambiguous, no-result, stale-source, malicious-content, invalid-input, and output-limit scenarios.

### BGA-203 — Implement `bga://docs/{topic}`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-202, BGA-208
- **Deliverable:** Topic-addressable documentation resources with stable media types and provenance metadata.
- **Acceptance:** Topic resolution is deterministic, unknown topics fail clearly, and resources never hide source authority or snapshot age.
- **Verification:** Resource E2E lists templates, reads valid topics, rejects invalid/traversal topics, and verifies provenance and size bounds.

### BGA-204 — Implement `bga://framework/version`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-200, BGA-207, BGA-208
- **Deliverable:** A resource describing verified current BGA framework/runtime information and the snapshot supporting it.
- **Acceptance:** Unknown or stale version data is labeled; no value is guessed from examples or historical fixtures.
- **Verification:** Resource E2E covers current, stale, missing, and conflicting source snapshots.

### BGA-205 — Build the retrieval evaluation set

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-001, BGA-200, BGA-202
- **Deliverable:** Maintained questions, expected source facts, relevance requirements, token/size limits, and regression thresholds.
- **Acceptance:** The set covers common and adversarial BGA questions, official/community distinctions, version sensitivity, and no-answer behavior.
- **Verification:** Packaged-server E2E runs the complete set and release gates fail below thresholds or when required attribution is absent.

### BGA-206 — Monitor BGA documentation and framework changes

- **Status:** planned
- **Priority:** P2
- **Depends on:** BGA-200, BGA-204, BGA-208
- **Deliverable:** A scheduled, non-mutating process that detects source/version drift and opens a reviewable update signal.
- **Acceptance:** Changes never auto-publish as verified guidance; removed or conflicting facts mark affected capabilities stale until reviewed and retested.
- **Verification:** Controlled source changes prove detection, staleness propagation, and refusal to silently update verified evidence.

## Phase 3 — Studio bridge

### BGA-300 — Establish the dedicated BGA Studio test environment

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-001, BGA-013
- **Deliverable:** A non-production Studio account/project, isolated test data, least-privilege credentials, ownership rules, cleanup procedure, and emergency stop.
- **Acceptance:** The exact remote target is allowlisted; it contains no publisher assets or user project data; test mutations cannot reach other projects; maintainers can rotate/revoke access.
- **Verification:** A manual authorization record and automated identity/target preflight pass before any live test is enabled.

### BGA-301 — Implement secure Studio credential providers

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-013, BGA-014, BGA-015, BGA-300
- **Deliverable:** SSH-agent and configured-key support without ordinary tool arguments containing secrets.
- **Acceptance:** Password/session values are neither required nor returned; credential source precedence is explicit; errors reveal no secret material.
- **Verification:** Integration tests use isolated keys; live E2E authenticates to the test project, rejects the wrong identity, and proves logs/evidence are redacted.

### BGA-302 — Implement SFTP connection diagnostics

- **Status:** planned
- **Priority:** P2
- **Depends on:** BGA-016, BGA-301
- **Deliverable:** A read-only diagnostic that verifies host, port, identity, remote root, permissions, and configured mapping without uploading.
- **Acceptance:** The diagnostic fails closed on mismatched identity/root and separates authentication, connectivity, permission, and configuration errors.
- **Verification:** Live E2E covers valid connection, invalid host/port/key, wrong project, read-only target, timeout, and redacted failure output.

### BGA-303 — Implement `preview_studio_sync`

- **Status:** planned
- **Priority:** P2
- **Depends on:** BGA-015, BGA-301, BGA-302
- **Deliverable:** A structured local-to-remote diff showing exact creates, updates, deletions, ignores, sizes, and target paths without mutation.
- **Acceptance:** Preview is deterministic, confines both sides to the mapping, protects ignored/private files, and does not infer deletions unless configured explicitly.
- **Verification:** Live E2E seeds known remote/local differences, proves the preview exactly matches them, and proves byte-for-byte that remote state is unchanged.

### BGA-304 — Implement `sync_to_studio`

- **Status:** planned
- **Priority:** P2
- **Depends on:** BGA-303, BGA-307
- **Deliverable:** An explicitly requested, guarded synchronization that executes an approved preview against the allowlisted test/project mapping.
- **Acceptance:** Execution binds to a non-stale preview, refuses target drift, reports exact results, minimizes partial state, and supports recovery/cleanup.
- **Verification:** Live E2E covers exact create/update, repeat call, stale preview, permission loss, interrupted transfer, cleanup/recovery, and proof that unlisted files/projects remain untouched.

### BGA-305 — Decide whether Studio log access is stable and permitted

- **Status:** planned
- **Priority:** P2
- **Depends on:** BGA-001, BGA-013, BGA-300
- **Deliverable:** An evidence-backed architecture decision covering documented access, authentication, fragility, data sensitivity, and allowed automation.
- **Acceptance:** Undocumented endpoints are not accepted as a core dependency; an unavailable safe mechanism results in a recorded rejection or experimental-only scope.
- **Verification:** A read-only proof against the test project demonstrates the chosen boundary without bypassing access controls; otherwise BGA-306 remains blocked.

### BGA-306 — Implement `read_studio_logs`

- **Status:** planned
- **Priority:** P2
- **Depends on:** BGA-016, BGA-305, BGA-307
- **Deliverable:** A read-only tool for permitted Studio diagnostics filtered by project, table/test marker, time, severity, and result limits.
- **Acceptance:** Output is structured, bounded, source-identifiable, and redacts credentials, sessions, player information, and unrelated project data.
- **Verification:** Live E2E creates an allowed unique diagnostic marker, retrieves only the expected entry, exercises filters/no-results/errors, and proves redaction and project isolation.

### BGA-307 — Build the live Studio E2E harness

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-005, BGA-012, BGA-300, BGA-301
- **Deliverable:** Serialized live-test orchestration with unique markers, identity preflight, remote snapshots, guaranteed cleanup, artifact redaction, and emergency stop.
- **Acceptance:** Untrusted contributions cannot access secrets; concurrent runs cannot collide; failed runs quarantine or restore test state and clearly report cleanup status.
- **Verification:** Harness self-tests seed assertion failure, timeout, lost connection, cleanup failure, and secret values and prove safe handling in each case.

### BGA-308 — Research test-table automation

- **Status:** planned
- **Priority:** P3
- **Depends on:** BGA-001, BGA-013, BGA-300
- **Deliverable:** A feasibility decision for creating, starting, stopping, and identifying Studio test tables using stable and permitted interfaces.
- **Acceptance:** The decision records authorization, cleanup, multi-user behavior, rate/abuse risks, and whether automation may be supported, experimental, or rejected.
- **Verification:** A constrained live proof is required before any public capability is proposed.

### BGA-309 — Implement verified test-table workflows

- **Status:** planned
- **Priority:** P3
- **Depends on:** BGA-307, BGA-308
- **Deliverable:** Only the test-table operations approved by BGA-308, each as a separate manifest capability.
- **Acceptance:** Operations are isolated to the test project/accounts, explicitly mutating, idempotent where possible, bounded, and always stop/clean up created tables.
- **Verification:** Each operation receives its own live E2E success, invalid-input, wrong-target, interruption, repeat, and cleanup scenarios.

### BGA-310 — Research and implement player-perspective workflows

- **Status:** planned
- **Priority:** P3
- **Depends on:** BGA-308, BGA-309
- **Deliverable:** A feasibility decision followed, only if approved, by safe access to allowed test-player perspectives.
- **Acceptance:** No real player impersonation or session leakage; behavior is confined to Studio test accounts and documented interfaces.
- **Verification:** Live E2E proves identity boundaries, allowed perspective switching, rejection of non-test users, and session redaction.

### BGA-311 — Research and implement saved-state workflows

- **Status:** planned
- **Priority:** P3
- **Depends on:** BGA-308, BGA-309
- **Deliverable:** A feasibility decision followed, only if approved, by save/restore operations for isolated test tables.
- **Acceptance:** Slots and table ownership are explicit; restore cannot target another table; test cleanup restores or ends the table safely.
- **Verification:** Live E2E saves, mutates, restores, verifies exact state, rejects cross-table restore, handles unavailable/ended states, and cleans up.

## Phase 4 — Public release and maintenance

### BGA-400 — Publish installation and removal guides

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-003, BGA-009
- **Deliverable:** Verified setup, configuration, troubleshooting, update, and removal instructions for each supported MCP client and platform, including a first-run walkthrough that states the supported layouts and what a modern-layout project will and will not get today.
- **Acceptance:** Commands use released artifacts, explain permissions and data flow, and never require copying secrets into agent prompts.
- **Verification:** Fresh-environment E2E follows each guide verbatim from install through capability call and clean removal.

### BGA-401 — Maintain the supported-client smoke matrix

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-009, BGA-010, BGA-400
- **Deliverable:** Automated or reproducible smoke tests for every MCP client explicitly claimed as supported.
- **Acceptance:** Client/version/platform claims map to current evidence; untested clients are described only as MCP-compatible candidates, not supported.
- **Verification:** Release gates run each supported client flow or attach current controlled-environment evidence.

### BGA-402 — Define versioning and compatibility policy

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-006, BGA-009
- **Deliverable:** Policies for package versions, tool/schema changes, manifest changes, MCP versions, deprecations, and BGA compatibility.
- **Acceptance:** Breaking-change criteria and support windows are explicit; public schemas cannot change silently.
- **Verification:** Compatibility tests prove supported previous contracts still pass or that a declared major/deprecation boundary is enforced.

### BGA-403 — Build the reproducible release pipeline

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-005, BGA-011, BGA-012, BGA-014, BGA-402
- **Deliverable:** A least-privilege pipeline that builds once from a clean tag, verifies, packages, signs, publishes, and attaches evidence.
- **Acceptance:** Publication cannot run when any manifest capability lacks required evidence; artifacts are reproducible from the recorded commit and lock digest.
- **Verification:** Dry-run release proves all gates and artifact hashes; a seeded missing scenario or failing live gate blocks publication.

### BGA-404 — Sign and attest release artifacts

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-403
- **Deliverable:** Checksums, signatures or provenance attestations, and verification instructions for distributed packages.
- **Acceptance:** Users can connect an artifact to the source commit and CI run; signing credentials are isolated from untrusted builds.
- **Verification:** Clean artifacts verify, modified artifacts fail, and fresh-install E2E uses the verified released artifact.

### BGA-405 — Complete release security review

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-013, BGA-014, all capabilities in the release
- **Deliverable:** Review of threat mitigations, dependencies, permissions, data handling, adapters, release pipeline, and residual risks.
- **Acceptance:** Every open release-blocking risk has an owner and resolution; unsupported risk results in removal or disabling of the affected capability.
- **Verification:** Security scenarios and scans pass against the exact release candidate, including live tests for Studio-backed behavior.

### BGA-406 — Establish private vulnerability reporting

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-013
- **Deliverable:** A working private channel, triage expectations, disclosure process, supported-version policy, and updated `SECURITY.md`.
- **Acceptance:** The channel is tested without sending secrets and is accessible to non-maintainers who need to report safely.
- **Verification:** A benign test report is received, acknowledged, triaged, and closed through the documented process.

### BGA-407 — Publish per-release verification evidence

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-012, BGA-403
- **Deliverable:** Non-secret machine-readable evidence attached to every release and retained according to policy.
- **Acceptance:** Evidence covers every advertised capability and claimed environment, clearly separates local from live Studio results, and identifies stale or excluded capabilities.
- **Verification:** Release validation downloads the published evidence, checks schema/signature, and proves exact capability coverage.

### BGA-408 — Establish the BGA framework change process

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-009, BGA-206, BGA-402
- **Deliverable:** Ownership, monitoring cadence, compatibility review, fixture updates, deprecation handling, and emergency response for BGA changes.
- **Acceptance:** Detected changes can mark affected support claims stale and trigger targeted tests before new guidance or packages are published.
- **Verification:** A simulated framework change proves detection, impact mapping, stale-state behavior, fixture update, retest, and restored verification.

### BGA-409 — Decide on a remote documentation-only transport

- **Status:** planned
- **Priority:** P3
- **Depends on:** BGA-013, BGA-202, BGA-402
- **Deliverable:** A separate architecture and threat-model decision for any remotely hosted, documentation-only MCP transport.
- **Acceptance:** Source inspection, credentials, private logs, and Studio operations remain excluded unless separately authorized and modeled; hosting, authentication, abuse, privacy, and cost are addressed.
- **Verification:** If approved, the transport receives independent conformance, authentication, isolation, load, and E2E gates before it is advertised.

### BGA-410 — Preserve telemetry as explicit opt-in

- **Status:** planned
- **Priority:** P2
- **Depends on:** BGA-013, BGA-403
- **Deliverable:** Enforcement and documentation that telemetry is absent by default; any future telemetry requires a separate backlog item, privacy review, and explicit opt-in.
- **Acceptance:** Default execution makes no telemetry requests and writes no analytics identifiers.
- **Verification:** Packaged-release E2E runs under network observation and proves zero telemetry traffic and identifiers by default.

## Coverage map

This map makes omissions visible when source documents evolve.

| Commitment source                                 | Backlog coverage                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Project goals and developer workflows             | BGA-001, BGA-100 through BGA-114, BGA-200 through BGA-206                            |
| Local stdio MCP deployment                        | BGA-002, BGA-003, BGA-010, BGA-011                                                   |
| Stable MCP tools and resources                    | BGA-006, BGA-102 through BGA-112, BGA-202 through BGA-204, BGA-303, BGA-304, BGA-306 |
| Diagnostic schema and uncertainty                 | BGA-007, BGA-101, BGA-106 through BGA-113                                            |
| Modern and legacy compatibility                   | BGA-008, BGA-009, BGA-100, BGA-101, BGA-117 through BGA-123                          |
| Documentation provenance and currency             | BGA-200 through BGA-208, BGA-408                                                     |
| Local-first, read-only, narrow permissions        | BGA-013 through BGA-016, BGA-114                                                     |
| Credentials, SFTP, sync, and logs                 | BGA-300 through BGA-307                                                              |
| Test tables, player perspectives, saved states    | BGA-308 through BGA-311                                                              |
| Unit, integration, conformance, E2E, and evidence | BGA-004 through BGA-012, BGA-307, BGA-407                                            |
| Security, secrets, data handling, telemetry       | BGA-013 through BGA-016, BGA-300, BGA-301, BGA-405, BGA-406, BGA-410                 |
| Packaging, clients, versioning, releases          | BGA-400 through BGA-408                                                              |
| Optional remote documentation transport           | BGA-409                                                                              |

## Explicitly preserved non-goals

The following are not implementation backlog items unless a future documented decision changes project scope:

- Fully autonomous game implementation or release.
- Generic source editing or Git hosting operations.
- Hosting or redistributing publisher artwork.
- Scraping private projects or bypassing BGA access controls.
- Depending on undocumented Studio endpoints for core functionality.
