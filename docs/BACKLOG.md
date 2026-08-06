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

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-004
- **Deliverable:** Required CI workflows for supported operating systems and runtime versions, with concurrency control and least-privilege permissions.
- **Acceptance:** CI runs every applicable gate from a clean checkout, uses locked dependencies, retains non-secret evidence, and cannot publish or mutate Studio state from untrusted contributions.
- **Verification:** A controlled failing branch proves each required check blocks completion; a clean branch proves the full matrix passes.
- **Evidence:** `.github/workflows/ci.yml` defines the locked macOS/Linux/Windows and Node 22/24 matrix. External failing-branch and clean-matrix proof is still required.

### BGA-006 — Define the machine-readable capability manifest

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-002
- **Deliverable:** A versioned schema and manifest for every tool, resource, prompt, transport, adapter, stability level, compatibility claim, and required scenario.
- **Acceptance:** Runtime discovery and the manifest can be compared automatically; duplicate names, missing scenarios, unsupported stability values, and stale capability entries fail validation.
- **Verification:** Manifest-gate E2E starts the packaged server, discovers capabilities, and proves exact agreement with the manifest, including seeded mismatch failures.
- **Evidence:** The packed `config/capabilities.json` and schema pass runtime comparison in packaged E2E; `tests/unit/manifest.test.ts` proves seeded schema, duplicate, and stale entries fail.

### BGA-007 — Define the shared diagnostic contract

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-002
- **Deliverable:** Versioned schemas for findings, locations, evidence, severity, certainty, suggestions, unsupported syntax, and aggregate results.
- **Acceptance:** Facts and suggestions are distinct; heuristic findings expose uncertainty; schemas support human-readable content plus stable machine fields.
- **Verification:** Contract tests serialize and validate representative success, error, warning, heuristic, and unsupported findings through an MCP tool response.

### BGA-008 — Build the representative fixture corpus

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-001, BGA-002
- **Deliverable:** Minimal legal fixtures for supported modern and legacy BGA layouts, plus deliberately malformed variants for every validation rule.
- **Acceptance:** Fixtures contain no private source or publisher artwork, identify the BGA behavior they represent, and include expected normalized models and diagnostics.
- **Verification:** Fixture-integrity tests prove every fixture is immutable during tests, contains no banned secrets/assets, and produces its declared baseline result.
- **Evidence:** `tests/fixture-integrity.test.ts` passes for the original modern and legacy fixture layouts documented in `tests/fixtures/README.md`.

### BGA-009 — Publish the compatibility matrix

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-001, BGA-008
- **Deliverable:** Machine-readable and human-readable matrices for BGA layouts, file generations, runtimes, MCP versions, transports, and clients.
- **Acceptance:** Every support claim maps to a fixture and passing scenario; unknown and unsupported combinations are explicit.
- **Verification:** CI fails when a support claim lacks a fixture or passing evidence and when runtime behavior claims support outside the matrix.

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
- **Evidence:** `pnpm test:conformance` rejects a malformed initialize response and passes the candidate's supported official `server-initialize` scenario. The official CLI's stdio and 2026 gaps are recorded in [CONFORMANCE.md](CONFORMANCE.md), so this item is not yet `verified`.

### BGA-012 — Define and emit verification evidence

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-005, BGA-006, BGA-010, BGA-011
- **Deliverable:** A machine-readable evidence schema and CI artifact containing commit, package version, lock digest, environment, protocol version, scenario results, and timestamps.
- **Acceptance:** Evidence maps every manifest capability to current results, is reproducible, and contains no credentials or private BGA data.
- **Verification:** Schema validation, manifest coverage, tamper checks, and artifact redaction all run as release gates.

### BGA-013 — Complete the initial threat model

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-001, BGA-002
- **Deliverable:** A threat model covering local file access, symlinks and traversal, tool arguments, subprocesses, documentation content, SFTP, browser sessions, logs, credentials, supply chain, and MCP-client trust.
- **Acceptance:** Assets, actors, trust boundaries, abuse cases, mitigations, residual risk, and test requirements are recorded. Networked and mutating capabilities cannot start before their boundary is reviewed.
- **Verification:** Each required mitigation maps to an automated negative or security scenario, or to an explicit manual control with an owner.

### BGA-014 — Add secret and artifact safety gates

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-004, BGA-005, BGA-013
- **Deliverable:** Secret scanning, publisher-artwork checks where practical, log redaction tests, and CI artifact inspection.
- **Acceptance:** Known credential formats and seeded sensitive values are blocked or redacted; scans never upload the sensitive fixture itself as an artifact.
- **Verification:** Seeded secrets in source, tool output, logs, and evidence each fail the appropriate gate without revealing the complete value.

### BGA-015 — Implement the policy boundary

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-003, BGA-013
- **Deliverable:** Central enforcement for configured project roots, remote project allowlists, operation timeouts, network policy, mutation intent, and output limits.
- **Acceptance:** Capabilities cannot bypass policy through alternate paths; configuration is explicit and fails closed; defaults are local, read-only, and network-off.
- **Verification:** Packaged-server E2E covers traversal, symlink escape, unlisted roots, unlisted remotes, missing mutation confirmation, timeout, and oversized output.

### BGA-016 — Implement shared error handling and redaction

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-007, BGA-013, BGA-015
- **Deliverable:** Stable public errors and redaction utilities for paths, credentials, sessions, connection strings, player data, and internal failures.
- **Acceptance:** Errors remain actionable without stack-trace leakage or secrets; unexpected failures receive stable codes and safe context.
- **Verification:** Every public capability inherits negative E2E scenarios seeded with sensitive values and proves they are absent from results and evidence.

## Phase 1 — Read-only local MVP

### BGA-100 — Detect BGA project layouts

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-008, BGA-009, BGA-015
- **Deliverable:** Capability-based discovery for supported modern and legacy project layouts.
- **Acceptance:** Detection identifies present components without assuming a template, reports ambiguous or partial layouts, and never reads outside the configured root.
- **Verification:** E2E runs every fixture plus empty, partial, ambiguous, nested, traversal, and symlink cases through the packaged server.

### BGA-101 — Build the normalized project model

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-100
- **Deliverable:** A normalized representation of metadata, options, states, transitions, actions, methods, notifications, database objects, statistics, templates, styles, modules, and tests.
- **Acceptance:** Source locations and certainty survive normalization; unsupported constructs are retained as explicit unknowns; parsers do not execute project code.
- **Verification:** Integration tests compare fixtures to declared models; public E2E proves the same model drives observable inspection and validation results.

### BGA-102 — Implement `inspect_project`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-007, BGA-100, BGA-101
- **Deliverable:** A read-only tool that explains the detected layout, components, capabilities, missing expected files, and uncertainty.
- **Acceptance:** The schema is stable, paths are safe and relative, results are concise but complete, and no file changes occur.
- **Verification:** Manifest-mapped E2E covers success for every layout plus invalid root, non-project, ambiguous syntax, traversal, permission failure, and proof of filesystem immutability.

### BGA-103 — Implement `bga://project/summary`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-101, BGA-102
- **Deliverable:** A resource exposing the normalized project summary without triggering mutation or network access.
- **Acceptance:** Resource content matches `inspect_project` semantics, declares media type and version, and remains bounded for large projects.
- **Verification:** Resource E2E lists, reads, validates, and compares the resource against the fixture baseline, including missing-root and oversized-project failures.

### BGA-104 — Implement `bga://project/states`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-101, BGA-106
- **Deliverable:** A resource exposing normalized states, transitions, handlers, locations, and uncertainty.
- **Acceptance:** Legacy and modern representations produce one documented shape without inventing missing relationships.
- **Verification:** Resource E2E covers each fixture generation, malformed state data, unsupported constructs, and output limits.

### BGA-105 — Implement `bga://project/diagnostics`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-007, BGA-112
- **Deliverable:** A resource exposing current aggregate validation findings.
- **Acceptance:** Results are deterministic for unchanged files, include rule and evidence versions, and do not imply unsupported checks passed.
- **Verification:** Resource E2E seeds known findings, validates ordering and schema, modifies an isolated fixture, and proves refresh behavior without stale results.

### BGA-106 — Implement `validate_state_machine`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Cross-file validation for state identifiers, types, transitions, targets, handlers, reachability where provable, and supported BGA state conventions.
- **Acceptance:** Every rule has documented evidence, valid and invalid fixtures, certainty, severity, and false-positive notes. Heuristics are never reported as facts.
- **Verification:** Tool E2E covers every rule's positive and negative fixture plus invalid input, unsupported syntax, path confinement, deterministic ordering, and immutability.

### BGA-107 — Implement `validate_action_contracts`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Trace client action calls to server endpoints, argument validation, and game methods for supported layouts.
- **Acceptance:** Missing endpoints, mismatched names, unsupported arguments, and broken handler links produce evidence-backed findings with exact locations.
- **Verification:** Tool E2E exercises every supported action pattern, seeded mismatch, dynamic or uncertain pattern, invalid input, and non-execution of project code.

### BGA-108 — Implement `validate_notifications`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Trace server notifications to client subscriptions and compare supported payload shapes and handler use.
- **Acceptance:** Missing handlers, name mismatches, and provable payload incompatibilities are distinguished from dynamic or uncertain behavior.
- **Verification:** Tool E2E covers valid, missing, mismatched, extra, dynamic, and malformed notification fixtures with stable evidence.

### BGA-109 — Implement `audit_database_usage`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Compare `dbmodel.sql` with supported query usage and detect high-confidence schema, reference, and unsafe-pattern findings.
- **Acceptance:** SQL is parsed without connecting to or executing against a database; dialect limits are explicit; no rule claims more certainty than the parser supports.
- **Verification:** Tool E2E covers valid schema usage, missing objects/columns, supported unsafe patterns, dynamic SQL uncertainty, malformed SQL, and zero network/database access.

### BGA-110 — Define the pre-release rule catalog

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-001, BGA-007, BGA-008
- **Deliverable:** A versioned catalog mapping automatable BGA pre-release checks to official sources, rule implementations, fixtures, severities, and limitations.
- **Acceptance:** Manual-only checklist items remain explicit; community conventions are labeled; every automated rule has valid and failing fixtures.
- **Verification:** Catalog validation proves every automated rule has sources, implementation ownership, fixtures, and scenario IDs.

### BGA-111 — Implement `run_pre_release_audit`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-102, BGA-106, BGA-107, BGA-108, BGA-109, BGA-110
- **Deliverable:** A read-only audit that runs supported pre-release rules and returns passed, failed, unsupported, and manual-required checks separately.
- **Acceptance:** The tool never converts an unimplemented or manual check into a pass and identifies the rule-catalog version used.
- **Verification:** Tool E2E covers clean, failing, partial-support, malformed, and manual-required projects and proves no project mutation.

### BGA-112 — Implement `validate_project`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-106, BGA-107, BGA-108, BGA-109
- **Deliverable:** A deterministic aggregator for project validations with selectable rule groups and bounded results.
- **Acceptance:** Aggregation preserves underlying evidence and certainty, reports skipped and unsupported groups, and cannot hide a failed validator.
- **Verification:** Tool E2E compares aggregate results with individual tools, covers selection and limits, and seeds one validator failure to prove safe partial-failure reporting.

### BGA-113 — Implement explicit unknown-syntax handling

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-007, BGA-101
- **Deliverable:** Shared behavior for syntax that cannot be parsed or relationships that cannot be proven.
- **Acceptance:** Unknown syntax produces an `unsupported` or `uncertain` result with a location and reason, never an implicit pass or fabricated relationship.
- **Verification:** Every parser and public validation E2E suite includes at least one unknown construct and asserts the explicit uncertainty result.

### BGA-114 — Enforce local read-only and network-off behavior

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-015, BGA-102 through BGA-113
- **Deliverable:** Technical enforcement and evidence that local inspection, resources, and validation cannot mutate source or initiate network access.
- **Acceptance:** The policy applies regardless of tool inputs and detects attempted adapter or dependency escape.
- **Verification:** E2E runs local capabilities in a network-denied environment, snapshots filesystem metadata/content, and fails on any outbound connection or mutation.

## Phase 2 — Documentation

### BGA-200 — Define the documentation source and provenance policy

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-001, BGA-013
- **Deliverable:** An allowlisted source catalog distinguishing official BGA documentation from community examples, with licensing, attribution, retrieval, and trust rules.
- **Acceptance:** Every source has canonical URL, authority, allowed use, update signal, and retention policy; prompt-like content is treated as untrusted data.
- **Verification:** Catalog validation rejects unapproved, unattributed, or incompletely classified sources.

### BGA-201 — Build the documentation index pipeline

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-004, BGA-200
- **Deliverable:** A reproducible pipeline that retrieves or consumes approved snapshots, normalizes them, preserves provenance, and builds a bounded local index.
- **Acceptance:** Builds are deterministic from recorded inputs; source failures and stale snapshots are explicit; private project data is never indexed.
- **Verification:** Integration tests build from controlled snapshots; E2E starts the packaged server with the built index and proves source metadata survives retrieval.

### BGA-202 — Implement `search_bga_docs`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-016, BGA-201
- **Deliverable:** A tool returning relevant, concise documentation excerpts with canonical sources, provenance, snapshot dates, and known framework versions.
- **Acceptance:** Official and community results are distinguishable, result limits are enforced, and retrieved text cannot issue instructions to the server.
- **Verification:** Tool E2E covers exact-topic, ambiguous, no-result, stale-source, malicious-content, invalid-input, and output-limit scenarios.

### BGA-203 — Implement `bga://docs/{topic}`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-201, BGA-202
- **Deliverable:** Topic-addressable documentation resources with stable media types and provenance metadata.
- **Acceptance:** Topic resolution is deterministic, unknown topics fail clearly, and resources never hide source authority or snapshot age.
- **Verification:** Resource E2E lists templates, reads valid topics, rejects invalid/traversal topics, and verifies provenance and size bounds.

### BGA-204 — Implement `bga://framework/version`

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-006, BGA-200, BGA-201
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
- **Depends on:** BGA-200, BGA-201, BGA-204
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
- **Deliverable:** Verified setup, configuration, troubleshooting, update, and removal instructions for each supported MCP client and platform.
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
| Modern and legacy compatibility                   | BGA-008, BGA-009, BGA-100, BGA-101                                                   |
| Documentation provenance and currency             | BGA-200 through BGA-206, BGA-408                                                     |
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
