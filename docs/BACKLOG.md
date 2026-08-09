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

Phase 1 delivered an initial local implementation against the repository's fixtures. The 2026-08-08 adversarial review then installed the packed artifact, exercised it through a real MCP client, and compared its output with documented BGA constructs that the fixtures omitted. That review found confident false positives in the modern state, action, notification, and database paths and incomplete public-boundary evidence across the local suite. Phase 1 is therefore reopened. BGA-124 through BGA-128 own the correctness and verification work; no local capability is release-verified until those items and the compositional evidence work in BGA-017 pass.

Phase 2 begins at `BGA-207`, the first network path in the server. `BGA-201` was superseded before it started: reading the sources under `BGA-200` showed a crawl-and-ship index is not something they permit.

Studio work begins only after `BGA-300` establishes a safe live test environment. Public release work begins only after all capabilities included in that release are verified.

### Adversarial review reopening — 2026-08-08

The [installed-package adversarial review](verification/ADVERSARIAL_REVIEW_2026-08-08.md) challenged every completion claim against the policy that created it. It made these existing items `implemented`, not `verified`:

- **Foundation evidence:** BGA-005, BGA-006, BGA-007, BGA-008, BGA-009, and BGA-012 through BGA-016. Their implementation remains, but required CI, packaged-boundary, conformance, current-record, policy, output-safety, or privacy evidence is absent or contradicted.
- **Local public boundary:** BGA-100 and BGA-102 through BGA-114. Their advertised behavior exists, but one or more literal verification cases are missing, and the validator family is downstream of observed false-certainty parser defects.
- **Modern, hybrid, and first-run claims:** BGA-116 through BGA-123. The modern fixtures omit common documented forms, the installed package misclassifies several of those forms, hybrid/default-root coverage does not reach every capability, and the 2026 protocol-era roots flow is not implemented.

The review added BGA-017, BGA-018, BGA-124 through BGA-128, BGA-209 through BGA-211, BGA-318 through BGA-330, and BGA-411 as permanent owners. A status may move back to `verified` only after its own original acceptance criteria and the applicable new owner both pass; closing a new bug without restoring the reopened item's evidence is not enough.

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
- **Evidence:** `.github/workflows/ci.yml` defines the least-privilege macOS/Linux/Windows and Node 22/24 matrix with immutable current Action pins. [CI run 31098519365](https://github.com/Brandon-Born/bga-mcp/actions/runs/31098519365) proves the clean six-job matrix passes. The [controlled failure proof](verification/CI_FAILURE_PROOF.md) records one isolated hosted rejection for every command in the enforced CI chain.

### BGA-006 — Define the machine-readable capability manifest

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-002
- **Deliverable:** A versioned schema and manifest for every tool, resource, prompt, transport, adapter, stability level, compatibility claim, and required scenario.
- **Acceptance:** Runtime discovery and the manifest can be compared automatically; duplicate names, missing scenarios, unsupported stability values, and stale capability entries fail validation.
- **Verification:** Manifest-gate E2E starts the packaged server, discovers capabilities, and proves exact agreement with the manifest, including seeded mismatch failures.
- **Evidence:** The packed `config/capabilities.json` and schema pass runtime comparison in packaged E2E; `tests/unit/manifest.test.ts` proves seeded schema, duplicate, and stale entries fail.

### BGA-007 — Define the shared diagnostic contract

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-002
- **Deliverable:** Versioned schemas for findings, locations, evidence, severity, certainty, suggestions, unsupported syntax, and aggregate results.
- **Acceptance:** Facts and suggestions are distinct; heuristic findings expose uncertainty; schemas support human-readable content plus stable machine fields.
- **Verification:** Contract tests serialize and validate representative success, error, warning, heuristic, and unsupported findings through an MCP tool response.
- **Evidence:** The version 1 runtime schemas and generated `config/diagnostics.schema.json` are exercised by strict negative contract tests, a real stdio MCP serialization proof, and installed-package E2E. [CI run 31101182339](https://github.com/Brandon-Born/bga-mcp/actions/runs/31101182339) passes all six supported OS/runtime jobs at implementation commit `efcaa6dfbe38d6e2f1672f3e64e60327fa9666aa`.

### BGA-008 — Build the representative fixture corpus

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-001, BGA-002
- **Deliverable:** Minimal legal fixtures for supported modern and legacy BGA layouts, plus deliberately malformed variants for every validation rule.
- **Acceptance:** Fixtures contain no private source or publisher artwork, identify the BGA behavior they represent, and include expected normalized models and diagnostics.
- **Verification:** Fixture-integrity tests prove every fixture is immutable during tests, contains no banned secrets/assets, and produces its declared baseline result.
- **Evidence:** `tests/fixture-integrity.test.ts` passes for the original modern and legacy fixture layouts documented in `tests/fixtures/README.md`.

### BGA-009 — Publish the compatibility matrix

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-001, BGA-008
- **Deliverable:** Machine-readable and human-readable matrices for BGA layouts, file generations, runtimes, MCP versions, transports, and clients.
- **Acceptance:** Every support claim maps to a fixture and passing scenario; unknown and unsupported combinations are explicit.
- **Verification:** CI fails when a support claim lacks a fixture or passing evidence and when runtime behavior claims support outside the matrix.
- **Evidence:** [`config/compatibility.json`](../config/compatibility.json) and [COMPATIBILITY.md](COMPATIBILITY.md) hold 19 claims, 11 currently supported. See the [safety and compatibility milestone](verification/SAFETY_MILESTONE.md). `pnpm verify:compatibility` seeds a missing fixture, an undocumented claim, and a protocol claim beyond `SUPPORTED_PROTOCOL_VERSIONS`, and fails on each before passing the real matrix. The audit found that this gate does not compare each manifest capability's layout/protocol fields with the matrix; BGA-017 owns that composition gap. `pnpm verify:scenarios` proves every claimed scenario exists.

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

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-005, BGA-006, BGA-010, BGA-011
- **Deliverable:** A machine-readable evidence schema and CI artifact containing commit, package version, lock digest, environment, protocol version, scenario results, and timestamps.
- **Acceptance:** Evidence maps every manifest capability to current results, is reproducible, and contains no credentials or private BGA data.
- **Verification:** Schema validation, manifest coverage, tamper checks, and artifact redaction all run as release gates.
- **Evidence:** See the [verification evidence record](verification/VERIFICATION_EVIDENCE.md). [`config/evidence.schema.json`](../config/evidence.schema.json) describes the document; `pnpm evidence` writes `.artifacts/verification-evidence.json` at the end of `pnpm check` and `pnpm verify:evidence` checks it, both wired into the complete gate and the CI artifact upload. The document records the commit and whether the tree was clean, the package version and lock digest, the Node version and platform, the supported protocol versions and every conformance check, and each manifest capability with the result of every scenario it requires, down to the test file and title. A scenario with no test in the run is recorded as `missing` rather than omitted, and a capability advertised as `verified` whose evidence is anything less fails the gate. `integrity` seals the document with a digest over a canonical serialization, so a later edit is detectable. The emitter refuses to write a document containing a known credential format and the gate scans it again. `pnpm verify:evidence` builds five defective documents — wrong schema version, dropped capability, scenario that did not run, field edited after sealing, credential in a test title — and requires itself to reject each before reporting on the real artifact. `GATE-EVIDENCE-COVERAGE`, `GATE-EVIDENCE-TAMPER`, and `GATE-EVIDENCE-REDACTION` cover the same properties as executable tests, owned by the new `AC-FALSE-VERIFICATION` abuse case and by `TM-ARTIFACT-SCAN`.
- **Note:** BGA-011 remains `implemented` rather than `verified`. The first version of this artifact handled that badly: it listed both claimed protocol versions beside a single conformance run under one `passed`, which reads as if both had been exercised. Conformance coverage is now recorded per claimed version, `partial` is a distinct outcome, and the gate rejects a document whose overall word is stronger than its per-version results. The latest pre-audit record has `2025-11-25: passed` and `2026-07-28: not-applicable`; the audit removed the latter from the support constant, transport claim, and public capability entries until applicable stdio evidence exists. The packaged 2026 handshake/discovery smoke remains retained as observed behavior, not release support. Signing and per-release publication are BGA-404 and BGA-407.

### BGA-013 — Complete the initial threat model

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-001, BGA-002
- **Deliverable:** A threat model covering local file access, symlinks and traversal, tool arguments, subprocesses, documentation content, SFTP, browser sessions, logs, credentials, supply chain, and MCP-client trust.
- **Acceptance:** Assets, actors, trust boundaries, abuse cases, mitigations, residual risk, and test requirements are recorded. Networked and mutating capabilities cannot start before their boundary is reviewed.
- **Verification:** Each required mitigation maps to an automated negative or security scenario, or to an explicit manual control with an owner.
- **Evidence:** [THREAT_MODEL.md](THREAT_MODEL.md) and [`config/threat-model.json`](../config/threat-model.json) now record 29 abuse cases, 59 mitigations, and 10 residual risks across 8 trust boundaries. Broad pre-audit controls were narrowed to the behavior actually observed, with separate planned controls for BGA-319 and BGA-321 through BGA-330. `pnpm verify:threat-model` checks schema, identifiers, references, ownership, and named boundary preconditions; BGA-018 owns exact machine/human comparison and compositional self-invalidation.

### BGA-014 — Add secret and artifact safety gates

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-004, BGA-005, BGA-013
- **Deliverable:** Secret scanning, publisher-artwork checks where practical, log redaction tests, and CI artifact inspection.
- **Acceptance:** Known credential formats and seeded sensitive values are blocked or redacted; scans never upload the sensitive fixture itself as an artifact.
- **Verification:** Seeded secrets in source, tool output, logs, and evidence each fail the appropriate gate without revealing the complete value.
- **Evidence:** See the [safety and compatibility milestone](verification/SAFETY_MILESTONE.md). `pnpm verify:safety-gates` writes a seeded credential outside the repository, proves the scanner detects it in artifact content and in a log line, proves the printed finding is masked, then scans the repository and every retained artifact directory. `GATE-SECRET-SCAN-SOURCE`, `GATE-SECRET-SCAN-ARTIFACT`, `GATE-LOG-REDACTION`, and `GATE-FIXTURE-SAFETY` cover each rule, artifact output, stderr redaction, and fixture asset safety. CI runs the scan before the upload step and skips the upload when it fails.
- **Adversarial finding, 2026-08-08:** The gate does not seed a secret into a successful MCP result despite that literal verification requirement. `audit_database_usage` can return a secret-bearing SQL literal, and an own-account Studio log line containing an Authorization bearer value passes its local screen. BGA-327 owns successful-result minimization/redaction; this item cannot return to `verified` until a packaged seeded-secret result is rejected or scrubbed.

### BGA-015 — Implement the policy boundary

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-003, BGA-013
- **Deliverable:** Central enforcement for configured project roots, remote project allowlists, operation timeouts, network policy, mutation intent, and output limits.
- **Acceptance:** Capabilities cannot bypass policy through alternate paths; configuration is explicit and fails closed; defaults are local, read-only, and network-off.
- **Verification:** Packaged-server E2E covers traversal, symlink escape, unlisted roots, unlisted remotes, missing mutation confirmation, timeout, and oversized output.
- **Evidence:** [`src/policy.ts`](../src/policy.ts) is the current production path for roots, traversal, symlink checks, remote allowlists, network, mutation intent, timeout responses, and successful-result budgets. The current source contains no privileged-effect import outside it, and `GATE-POLICY-IMPORT-BOUNDARY` catches the enumerated exact imports; BGA-329 owns alternate specifiers, dynamic imports, re-exports, repository-owned wrappers, and privileged globals. `INT-POLICY-*` scenarios cover each existing decision, and `E2E-POLICY-CONFIG-FAILS-CLOSED` and `E2E-POLICY-ROOT-UNAVAILABLE` prove packaged startup refusals. BGA-102 added packaged calls for traversal, static symlink escape, unlisted roots, a timeout response, and successful-result output refusal. BGA-325, BGA-326, and BGA-330 show why those observations do not yet prove final failure bounds, underlying cancellation, or race-safe entry-bounded traversal. Unlisted remotes and mutation confirmation remain integration-only because no mutating adapter exists.
- **Adversarial findings, 2026-08-08:** The implementation exists, but several gates are incomplete. Error results bypass the output budget (BGA-325); a timeout wins the response race without cancelling ignored work or slow non-2xx response bodies (BGA-326); alternate module specifiers, dynamic imports, and global `fetch` bypass the import rule (BGA-329); and listing/read limits do not bound all directory entries or close filesystem races (BGA-330). This item remains `implemented`, not complete or verified, until those owners pass through the installed public boundary.

### BGA-016 — Implement shared error handling and redaction

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-007, BGA-013, BGA-015
- **Deliverable:** Stable public errors and redaction utilities for paths, credentials, sessions, connection strings, player data, and internal failures.
- **Acceptance:** Errors remain actionable without stack-trace leakage or secrets; unexpected failures receive stable codes and safe context.
- **Verification:** Every public capability inherits negative E2E scenarios seeded with sensitive values and proves they are absent from results and evidence.
- **Evidence:** [`src/errors.ts`](../src/errors.ts) publishes the versioned public error contract with stable codes, and [`src/redaction.ts`](../src/redaction.ts) removes private keys, tokens, sessions, connection credentials, player data, and out-of-root paths. `UNIT-REDACTION-CREDENTIALS`, `UNIT-REDACTION-PATHS`, `UNIT-REDACTION-PLAYER-DATA`, `UNIT-ERROR-UNEXPECTED-COLLAPSE`, and `GATE-LOG-REDACTION` prove seeded values never survive a published error or a log line. BGA-102 supplies the inherited negative scenarios: `E2E-INSPECT-PROJECT-REDACTION` proves a refusal carries a redacted path rather than an absolute one, and `E2E-INSPECT-PROJECT-SYMLINK-ESCAPE` proves seeded key material behind a link never reaches a result. Every future capability inherits the same requirement through its manifest entry.
- **Adversarial findings, 2026-08-08:** Shared redaction is applied to published failures, not to every successful structured result. Raw SQL text and permitted own-account Studio messages can retain seeded credential values (BGA-327). A Studio session loaded from `--studio-session-file` is sent to BGA but never registered in `redactionOptions`, which reads only the environment (BGA-321), and Studio preflight prints both foreign actors and the absolute session-file path (BGA-319 and BGA-328).

### BGA-017 — Make verification claims compositional and self-invalidating

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-005, BGA-006, BGA-009, BGA-011, BGA-012
- **Deliverable:** Evidence gates that derive a public capability's status from every prerequisite it claims: the exact packaged artifact, runnable passing scenarios, compatibility claims, transport and protocol conformance, current human records, and retained CI evidence.
- **Acceptance:** A capability cannot be `verified` while any claimed transport/protocol version lacks applicable passing conformance. A scenario identifier counts only when it prefixes a runnable, unskipped test assertion that passed in the retained result; a string in fixture data or a skipped/filtered test does not count. Each manifest entry identifies its most recent passing CI evidence as required by [TESTING.md](TESTING.md). Compatibility, rule-catalog, threat-model, and packaged E2E claim results are retained rather than inferred from source text. Human verification records are explicitly historical or are checked against the current manifest, commands, claim counts, scenario counts, and test result.
- **Verification:** Seeded gates reject partial/not-applicable conformance behind a `verified` capability, a scenario identifier present only in data, a skipped assertion, a missing CI-evidence reference, stale verification counts, and a claim whose test ran against a different artifact. The untampered current run passes and identifies the package hash it exercised.
- **Finding:** The 2026-08-08 audit found that `verify-evidence` accepts overall partial conformance while every formerly verified capability claims both protocol versions; `scripts/lib/scenarios.ts` matches arbitrary string literals; the manifest schema has no field for the CI evidence TESTING requires; and several documents calling themselves current are behind the actual manifest and test run. BGA-005, BGA-006, BGA-007, BGA-009, and BGA-012 stay reopened until this item passes.
- **Evidence:** [`scripts/lib/scenarios.ts`](../scripts/lib/scenarios.ts) reads a declaration only where it is the title argument of a runnable `it`/`test` call — including `it.each(table)('[ID] …')` — and records `.skip`, `.todo`, `.failing`, and an enclosing skipped `describe` as declared-but-inert; `pnpm verify:scenarios` proves that on a seeded tree holding fixture data, a commented-out test, a skipped case, a todo, a skipped suite, and a runnable case before it reads the real one. [`scripts/lib/evidence.ts`](../scripts/lib/evidence.ts) counts an identifier only where it prefixes the test's own title, reports a scenario whose tests were all skipped as `missing`, resolves each entry's `ciEvidence` into `this-commit`/`stale`/`unknown`, and retains a result for every compatibility claim, catalogued rule, and threat-model mitigation that names scenarios. `config/capabilities.json` gained `ciRuns` and a required `ciEvidence` on every entry, both enforced by the schema; only a passing run may be recorded. [`scripts/verify-evidence.ts`](../scripts/verify-evidence.ts) refuses a `verified` capability whose claimed protocol version lacks applicable passing conformance, whose CI evidence failed, is unrecorded, or belongs to another commit, and refuses a claim with no retained result or a failing one. `tests/global-setup.ts` records the packed artifact's SHA-256 and each packaged suite writes the digest it installed, so a scenario proven against a different build is visible; the gate rejects a mismatch. Human records now declare themselves in a `verification-record` block: a `run` record's capability, scenario, claim, and test counts are compared with the artifact and every `pnpm …` command it names must exist, a `review` names its scope, and a historical record is left alone. Fourteen seeded defects — schema, manifest coverage, scenario coverage, conformance overstatement, verified-without-conformance, verified-with-stale-CI, unretained claim, claim whose scenarios did not run, different artifact, tamper, redaction, stale record, unchecked record, review without scope, and a record naming a command that does not exist — must all be rejected before the gate reports.
- **Note:** BGA-005, BGA-006, BGA-007, BGA-009, and BGA-012 are no longer blocked by this item, but none of them returns to `verified` automatically: each still needs its own evidence, and BGA-005 in particular needs a CI run of the commit being claimed. The manifest currently points at [run 31283119741](https://github.com/Brandon-Born/bga-mcp/actions/runs/31283119741), which passed the six-job matrix for `a178783` — the commit before this work — so every entry's CI evidence is correctly reported as `stale` and no capability may call itself verified until CI runs again.

### BGA-018 — Enforce exact machine/human threat-model agreement

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013
- **Deliverable:** A threat-model gate that compares the complete machine-readable and human-readable boundary/control state, not identifier presence alone.
- **Acceptance:** Boundary status, review date, gates, preconditions, mitigation status/control/owner, and residual-risk disposition cannot disagree between `config/threat-model.json` and [THREAT_MODEL.md](THREAT_MODEL.md). A privacy control covers every output surface that can publish the protected data, including terminal diagnostics and CI logs, rather than only the MCP tool response.
- **Verification:** Seeded mismatches for every compared field fail. A seeded foreign Studio actor name in a tool result, CLI diagnostic, stderr line, and retained artifact is absent from each surface, while an own-account line remains usable where the capability permits it.
- **Finding:** `TB-DOCS-NETWORK` was `reviewed` in the machine model but still `unreviewed` in the human table, and the existing Studio privacy scenarios intentionally expected a foreign actor name in preflight output. The current gate passed both contradictions. BGA-013 and BGA-016 remain reopened; BGA-319 owns the concrete Studio leak.

## Phase 1 — Read-only local MVP

### BGA-100 — Detect BGA project layouts

- **Status:** implemented
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

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-006, BGA-007, BGA-100, BGA-101
- **Deliverable:** A read-only tool that explains the detected layout, components, capabilities, missing expected files, and uncertainty.
- **Acceptance:** The schema is stable, paths are safe and relative, results are concise but complete, and no file changes occur.
- **Verification:** Manifest-mapped E2E covers success for every layout plus invalid root, non-project, ambiguous syntax, traversal, permission failure, and proof of filesystem immutability.
- **Evidence:** The first advertised capability. Eleven manifest-mapped scenarios run against the packed and installed artifact through a real MCP client: both supported layouts, an unrecognized project, schema rejection for four malformed inputs, an unlisted root, an unconfigured server, traversal, symlink escape, redaction of a seeded secret and of absolute paths, deadline expiry, and output-budget refusal. Both success scenarios hash the project directory before and after the call and prove it unchanged. See the [first capability verification](verification/FIRST_CAPABILITY.md).

### BGA-103 — Implement `bga://project/summary`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-006, BGA-101, BGA-102
- **Deliverable:** A resource exposing the normalized project summary without triggering mutation or network access.
- **Acceptance:** Resource content matches `inspect_project` semantics, declares media type and version, and remains bounded for large projects.
- **Verification:** Resource E2E lists, reads, validates, and compares the resource against the fixture baseline, including missing-root and oversized-project failures.
- **Evidence:** [`src/resources/project-resources.ts`](../src/resources/project-resources.ts) serves the normalized model from `bga://project/summary` as JSON, through the same policy boundary, timeout, and output budget the tools use. `E2E-RESOURCE-SUMMARY` reads it from the packaged artifact and checks the layout, metadata, and component set; `E2E-RESOURCE-IMMUTABLE` hashes the project before and after reading all three resources. See the [project resource verification](verification/PROJECT_RESOURCES.md).
- **Scope note:** A resource takes no arguments, so it describes the single configured project root. With no root, or more than one, it refuses with a stable code rather than choosing; the tools remain available for a project named explicitly.

### BGA-104 — Implement `bga://project/states`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-006, BGA-101, BGA-106
- **Deliverable:** A resource exposing normalized states, transitions, handlers, locations, and uncertainty.
- **Acceptance:** Legacy and modern representations produce one documented shape without inventing missing relationships.
- **Verification:** Resource E2E covers each fixture generation, malformed state data, unsupported constructs, and output limits.
- **Evidence:** `bga://project/states` serves the state definitions with their transitions, handlers, source location, unsupported constructs, and the full state-machine validation, so uncertainty travels with the data. `E2E-RESOURCE-STATES` reads it from the packaged artifact and checks all of them. See the [project resource verification](verification/PROJECT_RESOURCES.md).
- **Scope note:** A resource takes no arguments, so it describes the single configured project root. With no root, or more than one, it refuses with a stable code rather than choosing; the tools remain available for a project named explicitly.

### BGA-105 — Implement `bga://project/diagnostics`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-006, BGA-007, BGA-112
- **Deliverable:** A resource exposing current aggregate validation findings.
- **Acceptance:** Results are deterministic for unchanged files, include rule and evidence versions, and do not imply unsupported checks passed.
- **Verification:** Resource E2E seeds known findings, validates ordering and schema, modifies an isolated fixture, and proves refresh behavior without stale results.
- **Evidence:** `bga://project/diagnostics` serves the same aggregate `validate_project` produces, including the per-group breakdown and any group that could not run. `E2E-RESOURCE-DIAGNOSTICS` reads it from the packaged artifact for both a clean and a defective project. See the [project resource verification](verification/PROJECT_RESOURCES.md).
- **Scope note:** A resource takes no arguments, so it describes the single configured project root. With no root, or more than one, it refuses with a stable code rather than choosing; the tools remain available for a project named explicitly.

### BGA-106 — Implement `validate_state_machine`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Cross-file validation for state identifiers, types, transitions, targets, handlers, reachability where provable, and supported BGA state conventions.
- **Acceptance:** Every rule has documented evidence, valid and invalid fixtures, certainty, severity, and false-positive notes. Heuristics are never reported as facts.
- **Verification:** Tool E2E covers every rule's positive and negative fixture plus invalid input, unsupported syntax, path confinement, deterministic ordering, and immutability.
- **Evidence:** Eleven rules in [`src/rules/state-machine.ts`](../src/rules/state-machine.ts), each carrying its severity, certainty, and known false positives, published to the client in every result. Structural rules are proven from the parsed declaration and reported as facts; the three cross-file handler rules are heuristics with `likely` certainty and heuristic evidence, and they stay silent when no PHP source could be read. A new `legacy-broken` fixture seeds nine defects and declares them in its `expected.json`, so a rule change cannot silently repurpose it; the `legacy` fixture gained its handler methods so it is a true clean baseline. Seven packaged scenarios prove the behavior through a real MCP client. See the [state-machine validation verification](verification/STATE_MACHINE_VALIDATION.md).
- **Scope note:** Rules apply to the legacy `states.inc.php` declaration. A modern project returns an `unsupported` result rather than a clean one, because class-based state definitions are not yet interpreted; BGA-118 delivered that reader on 2026-08-07; modern state classes are read.

### BGA-107 — Implement `validate_action_contracts`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Trace client action calls to server endpoints, argument validation, and game methods for supported layouts.
- **Acceptance:** Missing endpoints, mismatched names, unsupported arguments, and broken handler links produce evidence-backed findings with exact locations.
- **Verification:** Tool E2E exercises every supported action pattern, seeded mismatch, dynamic or uncertain pattern, invalid input, and non-execution of project code.
- **Evidence:** [`src/project/actions.ts`](../src/project/actions.ts) reads legacy `ajaxcall` URLs, modern `bgaPerformAction` names, and the request arguments an entry point consumes; [`src/rules/action-contracts.ts`](../src/rules/action-contracts.ts) traces each action from client call to entry point to game method. Eight rules: a duplicated entry point and a broken `act…` name are facts, every cross-file claim is a heuristic carrying its limitations, and a call assembled at runtime becomes unsupported syntax rather than a guess. When a side of the contract cannot be read the result says so instead of passing. Both fixtures gained real action wiring, and `legacy-broken` declares its eight expected contract findings. Seven packaged scenarios prove it through a real MCP client. See the [action contract verification](verification/ACTION_CONTRACTS.md).
- **Scope note:** Tracing covers the legacy client and action class. A modern project reports `action.trace.unavailable` because its attribute-based entry points are not yet read; BGA-119 delivered that reader on 2026-08-07; autowired actions are traced.

### BGA-108 — Implement `validate_notifications`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Trace server notifications to client subscriptions and compare supported payload shapes and handler use.
- **Acceptance:** Missing handlers, name mismatches, and provable payload incompatibilities are distinguished from dynamic or uncertain behavior.
- **Verification:** Tool E2E covers valid, missing, mismatched, extra, dynamic, and malformed notification fixtures with stable evidence.
- **Evidence:** [`src/project/notifications.ts`](../src/project/notifications.ts) reads `notifyAllPlayers` and `notifyPlayer` sends with their payload keys, and the client handlers bound by `dojo.subscribe` or the `notif_<name>` method convention with the keys each reads. [`src/rules/notifications.ts`](../src/rules/notifications.ts) compares the two sides. Five rules: a duplicate subscription and an untraceable contract are facts; sent-but-unhandled, handled-but-unsent, and payload disagreement in either direction are heuristics carrying their limitations. A send with a computed name or payload becomes unsupported syntax. Both fixtures gained notification wiring, and `legacy-broken` declares its five expected findings. Seven packaged scenarios prove it through a real MCP client. See the [notification contract verification](verification/NOTIFICATIONS.md).
- **Scope note:** Tracing covers the legacy client and PHP sources. A modern project reports `notification.trace.unavailable`, as does any project where neither side mentions a notification, so an unreadable contract never returns a clean result.

### BGA-109 — Implement `audit_database_usage`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Compare `dbmodel.sql` with supported query usage and detect high-confidence schema, reference, and unsafe-pattern findings.
- **Acceptance:** SQL is parsed without connecting to or executing against a database; dialect limits are explicit; no rule claims more certainty than the parser supports.
- **Verification:** Tool E2E covers valid schema usage, missing objects/columns, supported unsafe patterns, dynamic SQL uncertainty, malformed SQL, and zero network/database access.
- **Evidence:** [`src/project/database.ts`](../src/project/database.ts) reads the tables and columns `dbmodel.sql` declares and the queries the PHP sources run, attributing bare columns only when a query names exactly one table. [`src/rules/database.ts`](../src/rules/database.ts) compares them. Seven rules: undeclared tables and duplicate declarations are facts; undeclared columns, unused columns, and interpolated queries are heuristics carrying their limitations. Framework-owned tables are never reported as undeclared. Both fixtures gained a real schema and queries, and `legacy-broken` declares its four expected findings. Seven packaged scenarios prove it through a real MCP client. See the [database audit verification](verification/DATABASE_AUDIT.md).
- **Scope note:** Column attribution needs a single-table query; a multi-table query keeps only its qualified columns and reports the rest as unsupported. A query concatenated from several expressions is reported rather than reconstructed.

### BGA-110 — Define the pre-release rule catalog

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-001, BGA-007, BGA-008
- **Deliverable:** A versioned catalog mapping automatable BGA pre-release checks to official sources, rule implementations, fixtures, severities, and limitations.
- **Acceptance:** Manual-only checklist items remain explicit; community conventions are labeled; every automated rule has valid and failing fixtures.
- **Verification:** Catalog validation proves every automated rule has sources, implementation ownership, fixtures, and scenario IDs.
- **Evidence:** [`config/rule-catalog.json`](../config/rule-catalog.json) and [RULES.md](RULES.md) hold 31 automated checks and 8 manual-only ones. Each automated check names the rule that implements it, its severity and certainty, the fixtures that prove both outcomes, and its source kind; each manual check records why it cannot be automated. `pnpm verify:rule-catalog` fails when a rule is implemented but not catalogued or catalogued but not implemented, when a catalogued severity or certainty differs from the implementation, when a claimed failing fixture does not declare that finding, or when a check is missing from the documentation, and it seeds each of those defects to prove it fails on them.

### BGA-111 — Implement `run_pre_release_audit`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-102, BGA-106, BGA-107, BGA-108, BGA-109, BGA-110
- **Deliverable:** A read-only audit that runs supported pre-release rules and returns passed, failed, unsupported, and manual-required checks separately.
- **Acceptance:** The tool never converts an unimplemented or manual check into a pass and identifies the rule-catalog version used.
- **Verification:** Tool E2E covers clean, failing, partial-support, malformed, and manual-required projects and proves no project mutation.
- **Evidence:** [`src/rules/pre-release.ts`](../src/rules/pre-release.ts) turns validator output into a verdict per catalogued check. A check passes only when the validator that owns it ran and produced no finding for it; a validator that failed, was skipped, or could not read what the check examines leaves it `unsupported`, and a manual check is always `manual-required`. The tool reports the catalog version it applied, read from the catalog the package ships. Seven packaged scenarios cover a clean project, a defective one, a partially supported one, the manual checks, the catalog version, malformed input, and immutability.

### BGA-112 — Implement `validate_project`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-106, BGA-107, BGA-108, BGA-109
- **Deliverable:** A deterministic aggregator for project validations with selectable rule groups and bounded results.
- **Acceptance:** Aggregation preserves underlying evidence and certainty, reports skipped and unsupported groups, and cannot hide a failed validator.
- **Verification:** Tool E2E compares aggregate results with individual tools, covers selection and limits, and seeds one validator failure to prove safe partial-failure reporting.
- **Evidence:** [`src/rules/aggregate.ts`](../src/rules/aggregate.ts) runs the four validators and combines them under three guarantees: a validator that throws is reported as `failed` with its public error code and makes the whole run `incomplete`; findings keep the evidence, certainty, and locations their validator produced, so aggregation reorders but never rewrites; and a bounded result drops the least severe findings first and reports how many were omitted, while the per-group breakdown still reports full counts. `E2E-VALIDATE-PROJECT-MATCHES-PARTS` calls all four tools individually in the same connection and proves the aggregate agrees with each of them, finding for finding. `E2E-VALIDATE-PROJECT-PARTIAL-FAILURE` seeds a schema larger than the read budget so exactly one validator fails, and proves the other three still run. See the [aggregate validation verification](verification/AGGREGATE_VALIDATION.md).

### BGA-113 — Implement explicit unknown-syntax handling

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-101
- **Deliverable:** Shared behavior for syntax that cannot be parsed or relationships that cannot be proven.
- **Acceptance:** Unknown syntax produces an `unsupported` or `uncertain` result with a location and reason, never an implicit pass or fabricated relationship.
- **Verification:** Every parser and public validation E2E suite includes at least one unknown construct and asserts the explicit uncertainty result.
- **Evidence:** [`src/rules/uncertainty.ts`](../src/rules/uncertainty.ts) is the shared behavior every rule module now builds its findings with: a proven claim is a fact, a claim depending on unseen code is a heuristic carrying the rule's recorded false positives, and a construct the reader cannot interpret is unsupported syntax with its location and reason. A result made entirely of unsupported syntax reports `unsupported`, never `passed`. The four rule modules previously duplicated these builders; the refactor left every existing test passing unchanged. `tests/unit/uncertainty.test.ts` asserts the three shapes, that every non-certain rule records how it can be wrong, and that all seven parsers report a construct they cannot read rather than dropping it. Each validator's packaged suite already asserts the explicit unsupported result for a project it cannot fully read.

### BGA-114 — Enforce local read-only and network-off behavior

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-015, BGA-102 through BGA-113
- **Deliverable:** Technical enforcement and evidence that local inspection, resources, and validation cannot mutate source or initiate network access.
- **Acceptance:** The policy applies regardless of tool inputs and detects attempted adapter or dependency escape.
- **Verification:** E2E runs local capabilities in a network-denied environment, snapshots filesystem metadata/content, and fails on any outbound connection or mutation.
- **Evidence:** `tests/e2e/network-denied.ts` replaces every network primitive — `net`, `tls`, `http`, `https`, `dns`, `dns/promises`, `dgram`, `fetch`, and `net.Socket.prototype.connect` — with functions that throw and record the attempt, and is loaded before the packaged server starts. `E2E-READ-ONLY-NETWORK-DENIED` runs every advertised tool and the three project resources under that denial: all complete, the attempt log stays empty, and the project is unchanged by content digest and by per-file size and modification time. It does not read all eight network-backed concrete resources; that inventory-wide negative sweep remains part of BGA-128/BGA-017's public-boundary composition work. `E2E-READ-ONLY-NETWORK-HARNESS` proves the denial itself works by making an outbound connection fail and appear in the log. `E2E-READ-ONLY-INPUT-CANNOT-ESCAPE` proves the policy holds for an outside root, traversal, and filesystem root while a legitimate call succeeds and an outside file stays untouched.

### BGA-115 — Read the modern project layout

- **Status:** superseded
- **Priority:** P1
- **Superseded by:** BGA-117, BGA-118, BGA-119, BGA-120, BGA-121
- **Reason:** Research against the official BGA Studio documentation on 2026-08-07 showed this is four separable readers plus a fixture prerequisite, with different sources and different amounts of work. Splitting them keeps each one's evidence honest. The original deliverable and the scope notes that pointed here are preserved by the replacement items.

### BGA-117 — Capture a representative modern fixture pair

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-008
- **Deliverable:** Original modern fixtures matching the current framework — a valid one and a defective variant — replacing the minimal stub that only proves layout detection.
- **Acceptance:** The fixtures use the constructs the official documentation describes: state classes extending `Bga\GameFramework\States\GameState`, autowired `act…` methods, the `bga->notify` API, and the modern client API. The defective variant declares its expected findings the way `legacy-broken` does. No fixture copies a real published game.
- **Verification:** Fixture integrity passes for the new pair, and every modern reader item below is proven against it.
- **Evidence:** `tests/fixtures/projects/modern` and `modern-broken` are original fixtures built to the documented shapes: state classes extending `GameState` with named constructor arguments, autowired `act…` methods, `$this->bga->notify->all`, and `this.bga.actions.performAction`. The defective variant seeds a transition to an undeclared state, an unknown state type, an unreachable dead end, an action the game class never declares, a notification nobody handles, a payload mismatch, an undeclared table, and a state whose identifier is computed and therefore unreadable. Both declare their expected findings the way the legacy pair does.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory), [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide), [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php).

### BGA-118 — Read modern state classes

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-101, BGA-106, BGA-117
- **Deliverable:** A reader for state classes under `modules/php/States`, extracting the identifier, type, description, transitions, and action methods from the `parent::__construct` call and the class body, plus the `GameStateBuilder` form.
- **Acceptance:** The state machine validator produces real findings for a modern project. A state's name defaults to its class name as the framework does; `StateType::ACTIVE_PLAYER` and its siblings map to the same rule outcomes as the legacy type strings; `getArgs`, `onEnteringState`, and `zombie` are recognised as the handlers they are. Anything the reader cannot interpret stays unsupported syntax.
- **Verification:** The state-machine suite gains modern scenarios mirroring its legacy ones, including a seeded defect set, and the compatibility matrix claims modern support only once they pass.
- **Evidence:** [`src/project/modern.ts`](../src/project/modern.ts) reads state classes into the same shape the legacy declaration produces: identifier, type mapped from `StateType`, name defaulting to the class name as the framework does, transitions, and the `getArgs` and `onEnteringState` handlers. A computed identifier, type, or transition target is reported as unsupported syntax rather than guessed. Every state-machine rule now applies to both layouts, proven by `E2E-VALIDATE-STATES-MODERN-CLEAN` and `E2E-VALIDATE-STATES-MODERN-DEFECTS`.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory).

### BGA-119 — Read modern action autowiring and the modern client action API

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-107, BGA-117, BGA-118
- **Deliverable:** Action-contract tracing for projects with no `.action.php`: autowired public `act…` methods on the game class as the server side, and `this.bga.actions.performAction` alongside the existing `bgaPerformAction` and `ajaxcall` on the client side.
- **Acceptance:** A modern project no longer reports `action.trace.unavailable` merely for lacking an action class, and the absent file is never itself reported as a defect. Parameter names are compared through the framework's typed autowiring rather than request reads, and `#[IntParam]`-style attributes are read where present.
- **Verification:** The action-contract suite gains modern scenarios mirroring its legacy ones, including a seeded mismatch, and proves the legacy path is unchanged.
- **Evidence:** Action tracing now accepts a project with no `.action.php`: autowired public `act…` methods on the game class are the entry point, their typed parameters are the contract, and an autowired action is its own game method rather than a missing second hop. The client reader accepts `this.bga.actions.performAction` alongside `bgaPerformAction` and `ajaxcall`. The rule comparing calls against a state's declared actions now stays silent when no state enumerates any, because an empty set means unknown rather than nothing-allowed; that limitation is recorded on the rule.
- **Sources:** [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide), [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php).

### BGA-120 — Read the modern notification API

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-108, BGA-117
- **Deliverable:** Notification reading for `$this->bga->notify->all` and `$this->bga->notify->player`, and for the promise-based client setup that replaces `dojo.subscribe`.
- **Acceptance:** A modern project's notifications are compared in both directions. The legacy `notifyAllPlayers` and `notifyPlayer` forms keep working, since the documentation marks them superseded rather than removed, and a project mixing both is read correctly.
- **Verification:** The notification suite gains modern scenarios mirroring its legacy ones, including a seeded payload mismatch and a notification with no handler.
- **Evidence:** The notification reader accepts `$this->bga->notify->all` and `->player` alongside the legacy `notifyAllPlayers` and `notifyPlayer`, and recognises class-method handlers such as `async notif_playerPassed(notif)` alongside the object-literal form. A project mixing both is read correctly, which matters because the documentation marks the legacy form superseded rather than removed.
- **Sources:** [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php), [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide).

### BGA-121 — Confirm the database audit on the modern layout

- **Status:** implemented
- **Priority:** P2
- **Depends on:** BGA-109, BGA-117
- **Deliverable:** Evidence that the database audit already works for modern projects, or the changes needed if it does not.
- **Acceptance:** `dbmodel.sql`, `DbQuery`, and `getObjectListFromDB` are documented as unchanged between layouts, so this item is expected to need fixtures and scenarios rather than new reading. Any difference found is recorded rather than assumed away.
- **Verification:** The database suite gains modern scenarios mirroring its legacy ones, and the compatibility matrix claims modern support for database auditing only once they pass.
- **Evidence:** Confirmed: the database audit needed no new reading. `dbmodel.sql`, `DbQuery`, and `getObjectListFromDB` are unchanged between layouts, and the modern fixtures exercise the same rules, including an undeclared table in the defective variant.
- **Sources:** [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php).

### BGA-122 — Model the project layout as independent per-file generations

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-100, BGA-101, BGA-117
- **Deliverable:** Layout detection that reports a generation per migratable component rather than matching one of two whole-project templates, and a derived `hybrid` layout label for a project whose components are not all one generation.
- **Acceptance:** The official documentation describes migration as a per-file, independently staged process, so a project holding `gameinfos.inc.php` alongside `modules/php/Game.php` and `states.inc.php` — the most common real shape — must be detected and read rather than reported as `unrecognized`. Each of metadata, game logic, states, player actions, and client logic reports its own generation and the files that produced it. Metadata reading keys off the metadata generation rather than the whole-project label. A project with no resolvable generation on any component stays `unrecognized`, and the reason states which markers were found rather than claiming none were. The derived label stays `legacy` or `modern` when every resolved component agrees, so existing claims and scenarios keep their meaning.
- **Verification:** Unit scenarios cover each single-axis migration in both directions, the fully legacy and fully modern shapes, and the empty and unrecognizable projects. A `hybrid` fixture is added and every capability runs against it end to end, proving no validator reports a defect that the same content in a uniform layout would not. The compatibility matrix claims hybrid support only once they pass.
- **Evidence:** [`src/project/layout.ts`](../src/project/layout.ts) resolves a generation — `legacy`, `modern`, `both`, or `absent` — for metadata, game logic, states, and client logic, and derives the label from them; `hybrid` is a supported outcome and `unrecognized` now means no component resolved. The reason string names what was found rather than claiming nothing was. `<game>.action.php` is deliberately not a generation signal, because the documentation says it may remain in an autowired project. Component expectation follows the governing component's generation, so an autowired project is not told it is missing an action class. Metadata is read from the file its own generation selects; a project holding both metadata files reports `project.metadata.both-generations` and reads the JSON one. `tests/unit/project-layout.test.ts` covers each single-component migration, the common `modules/php` + `gameinfos.inc.php` + `states.inc.php` shape, a component held in both forms, game-key recovery from a surviving legacy file, and the unrecognized cases. `tests/fixtures/projects/hybrid` is an original part-migrated fixture; `E2E-INSPECT-PROJECT-HYBRID` reads its per-component generations through the public schema, and `E2E-VALIDATE-PROJECT-HYBRID` proves all four validators run and report nothing, so the mixture produces no false positives. Claimed as `CLAIM-LAYOUT-HYBRID`.
- **Sources:** [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference), [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php) ("this file is now named Game.php, located in the modules/php directory. If you see it named yourgamename.game.php in the root dir, it's the legacy usage."), [Game interface logic: yourgamename.js](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js), [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) ("Deprecation warning: Actions detected on .action.php file… If you transform your project to use only auto-wired actions, you can then delete the .action.php file.").
- **Note:** This item exists because BGA-100 assumed two whole-project templates without checking whether the framework migrates that way. It does not. The `gameinfos.inc.php` + `modules/php/Game.php` + `states.inc.php` shape — the most common one — was reported as `unrecognized`, with a reason claiming no marker was found while six had matched. The rule added to [AGENTS.md](../AGENTS.md) is the durable fix: read the documentation for a framework behavior before implementing it.

### BGA-123 — Read a partially migrated state machine from both sources

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-118, BGA-122
- **Deliverable:** State reading that merges `states.inc.php` with the state classes under `modules/php/States` when both are present, instead of taking the first source found.
- **Acceptance:** The migration guide describes migrating states one class at a time and removing `states.inc.php` only once all of them are done, so both sources are authoritative in the interim. States from both are read into one machine; a state defined in both is taken from the class, since the class is what the framework runs; the state machine validator sees the merged set, so a transition from a legacy state into a migrated one is not a dangling target. The single-source cases behave exactly as they do today.
- **Verification:** The state-machine suite gains partially migrated scenarios, including a transition that crosses sources in each direction and a state defined in both. The hybrid fixture from BGA-122 carries a partially migrated machine so the end-to-end path is covered.
- **Evidence:** `readStates` in [`src/project/model.ts`](../src/project/model.ts) reads both sources and merges them by identifier, with the class winning a duplicate because that is the form the framework runs. `ProjectStates` gained `sources`, so a caller can see every origin rather than only the first. A split machine reports `project.states.partially-migrated` as information — a fact about the project, not a defect — and names how many states came from each side and how many were declared twice. The hybrid fixture's machine spans both files with a transition crossing in each direction (state 1 in `states.inc.php` targets the migrated state 2, which targets state 99 back in `states.inc.php`); the state-machine validator reports nothing, which it could not do if either half were invisible. `tests/integration/project-model.test.ts` covers the fixture and a project where a stale `states.inc.php` entry is overridden by its class.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory), [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) ("Create a State class for each state of the game… When all classes are migrated, you can remove the states.inc.php file.").

### BGA-116 — Reduce first-run friction

- **Status:** implemented
- **Priority:** P2
- **Depends on:** BGA-102, BGA-112
- **Deliverable:** Input and documentation changes that make a correctly configured server pleasant to use: `projectRoot` optional when exactly one root is configured, help text that states a project root must be an absolute path, and tool descriptions that state which layouts a validator supports.
- **Acceptance:** Omitting `projectRoot` with one configured root behaves as if it had been passed; omitting it with none or several fails with the existing stable codes rather than guessing. No change weakens a policy check.
- **Verification:** Packaged scenarios cover the omitted argument with zero, one, and several configured roots, and prove the refusals keep their current error codes.
- **Evidence:** `resolveProjectRoot` in [`src/tools/project-context.ts`](../src/tools/project-context.ts) resolves an omitted `projectRoot` to the sole configured root and refuses otherwise, and every tool calls it as the first statement of its handler, so the rule cannot reach six tools and miss the seventh. The resources use the same function with their own ambiguity wording, so the argument rule and the resource rule cannot drift apart. `E2E-INSPECT-PROJECT-DEFAULT-ROOT` proves the omitted argument returns byte-identical output to the explicit one; `E2E-INSPECT-PROJECT-DEFAULT-ROOT-AMBIGUOUS` proves two roots are refused with `resource.project.ambiguous` while an explicit root still works on the same server; `E2E-INSPECT-PROJECT-DEFAULT-ROOT-UNCONFIGURED` proves no roots are refused with `policy.root.unconfigured` and told which flag to pass. Each tool's `projectRoot` description states the default and that the path is absolute, and each tool description states which layouts it reads. The six `*-INVALID-INPUT` scenarios kept every other malformed input and dropped only `{}`, which is now valid input rather than a weakened check.

### BGA-124 — Correct modern state semantics and replace the false clean fixture

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-008, BGA-101, BGA-106, BGA-117, BGA-118, BGA-123
- **Deliverable:** A documented modern-state reader and layout-aware validator whose clean fixture uses current state-class constructs rather than carrying the legacy states 1 and 99 into the class model.
- **Acceptance:** The modern initial state comes from the class or identifier returned by `setupNewGame`; absence of state 1 is not an error. State 1 and state 99 conventions are interpreted by generation rather than imposed on every representation. Identifiers expressed through `StateConstants`, supported class constants, and `GameStateBuilder` are resolved without executing code. `StateType::PRIVATE` is accepted. Description fields, `getArgs`, `onEnteringState`, `zombie`, `#[PossibleAction]`, class/id/transition returns, and both sides of a partially migrated machine survive normalization. A construct outside the documented static forms produces one located unsupported result and no downstream reachability or dangling-target facts derived from the incomplete model.
- **Verification:** Original packaged fixtures cover setup returning a class, no state 1 or 99 class, constant identifiers, every documented state type, `GameStateBuilder`, descriptions, zombie handling, class/id/transition redirects, and split legacy/class sources. Each observed false finding is a regression assertion, and `run_pre_release_audit` preserves unsupported rather than converting it into failed checks.
- **Finding:** The installed package reported `state.initial.missing` and two `state.unreachable` findings for a documented `setupNewGame(): return PlayerTurn::class`; it rejected `StateConstants::STATE_PLAYER_TURN`, warned that `StateType::PRIVATE` was unknown, and converted incomplete parsing into certain validation failures. The current “clean modern” fixture instead defines class states 1 and 99, so it could not expose these defects.
- **Evidence:** [Modern state semantics verification](verification/MODERN_STATE_SEMANTICS.md) records the whole correction. [`src/project/php.ts`](../src/project/php.ts) masks string and comment content before reading structure, so a `clienttranslate` description containing brackets no longer moves the reader off the end of a call, and collects the `define()` and class constants both spellings use. [`src/project/modern.ts`](../src/project/modern.ts) reads every documented constructor argument, resolves identifiers through constants, keeps descriptions, `getArgs`, `onEnteringState`, `zombie` and `#[PossibleAction]`, and resolves class, identifier and transition redirects into edges; `readInitialState` reads what `setupNewGame` returns. [`src/project/parse.ts`](../src/project/parse.ts) reads the `GameStateBuilder` chain beside the array form and marks `gameSetup`/`endScore` as the framework's own states. [`src/project/model.ts`](../src/project/model.ts) resolves the entry point per generation, records whether declarations and edges were read completely, and reports duplicates per source. [`src/rules/state-machine.ts`](../src/rules/state-machine.ts) seeds reachability from the resolved entry point, treats 1 and 99 as the framework's, accepts the four documented types, and stays silent about the whole machine when part of it could not be read; `state.id.reserved` is the one thing it says about a class that takes a reserved identifier. `run_pre_release_audit` leaves a check `unsupported` whenever its validator reported an unreadable construct. `tests/fixtures/projects/modern` is rebuilt on the documented shapes, `modern-state-classes` and `modern-unreadable` are new, and the fixture-integrity gate fails if an `-unreadable` fixture ever declares a certain finding. Proven through the installed package by `E2E-VALIDATE-STATES-MODERN-CLEAN`, `E2E-VALIDATE-STATES-MODERN-CONSTRUCTS`, `E2E-VALIDATE-STATES-MODERN-DEFECTS`, `E2E-VALIDATE-STATES-UNSUPPORTED`, `E2E-PRE-RELEASE-UNSUPPORTED-PRESERVED`, `E2E-INSPECT-PROJECT-MODERN` and `E2E-INSPECT-PROJECT-HYBRID`. It stays `implemented` rather than `verified` because the evidence system itself is reopened: BGA-017 owns compositional verification and BGA-005 owns the current CI record.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) says to add `return PlayerTurn::class` in `setupNewGame`, says state-class IDs “cannot use 1 or 99,” lists `StateType::PRIVATE` among “4 types of game states,” documents class/id/transition return values, and shows the `StateConstants` example. [Your game state machine: states.inc.php](https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php) documents the `GameStateBuilder` chain, `GameStateBuilder::gameSetup(2)` “only keep this line if your initial state is not 2,” and the `define()` constants. [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) says “States 1 and 99, that must not be changed, are now optional” and preserves the independently migrated older forms.
- **Open questions:** The current documentation lists four state types and no longer mentions `manager`, which older skeletons gave the reserved states; it is accepted on identifiers 1 and 99, which no rule judges, and reported as undocumented anywhere else. The state-class page marks the default entry point of a project that returns nothing “(_to be confirmed_)”; the reader uses state 2 and says so in its evidence. A `transitions` target written as a class name is not documented, so it is reported as unreadable rather than assumed. `GameStateBuilder::endScore()` has no documented transitions, so it is treated as the framework's state rather than judged as the project's.

### BGA-125 — Correct modern action-contract tracing

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-107, BGA-119, BGA-124
- **Deliverable:** Action tracing that models both state-class and Game.php autowiring, including framework-injected parameters and documented parameter attributes.
- **Acceptance:** A state method bearing `#[PossibleAction]` is a callable entry point. The documented camel- and snake-case active/current player identifiers and state `args` are framework-injected, not client request fields. An action absent from the current state is still traced to Game.php because framework-wide actions may run from any state. Supported parameter attributes such as `#[IntParam]` contribute their documented validation contract instead of being skipped. Legacy `.action.php` remains supported independently.
- **Verification:** Packaged scenarios cover state-class-only actions, Game.php fallback actions, every documented injected-name alias, attributes with passing and failing client arguments, mixed legacy/modern action wiring, dynamic unsupported syntax, and exact client-to-server parameter comparison.
- **Finding:** A documented `#[PossibleAction] actPlay($cardId, $active_player_id, $currentPlayerId)` produced `action.entry-point.missing`, and a valid Game.php-wide `actPass` produced `action.call.not-declared`. The parser also exposed both injected identifiers as client arguments and skipped `#[IntParam]` semantics.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) says actions need `#[PossibleAction]`, lists the injected parameter aliases, and says the framework checks Game.php for actions available in any state. [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) documents autowired actions and parameter attributes.
- **Evidence:** [Modern action contract verification](verification/MODERN_ACTION_CONTRACTS.md) records the correction. `parseModernActions` in [`src/project/modern.ts`](../src/project/modern.ts) reads `act…` methods from either form, honours `#[PossibleAction]` where a state class requires it, skips a non-public method, excludes every documented injected parameter in both spellings — and not `$playerId`, which the documentation says autowired actions do not support — and reads each parameter attribute's name and checks. [`src/rules/action-contracts.ts`](../src/rules/action-contracts.ts) builds entry points from the action class, the game class, and the state classes, lets the legacy dispatcher win where it declares an action, exempts a game-class action from `action.call.not-declared` because the framework allows it in any state, and adds `action.argument.invalid` for a literal client value that fails its attribute's documented check. `parseClientActionCalls` reads shorthand keys and literal values, and treats the framework key list as belonging to `ajaxcall` rather than to `bgaPerformAction`, whose own documented example expects a parameter named `action`. `tests/fixtures/projects/modern-state-classes` declares its action contract as passing and `modern-broken` declares the attribute violation. Proven through the installed package by `E2E-VALIDATE-ACTIONS-STATE-CLASSES`, `E2E-VALIDATE-ACTIONS-MODERN-CLEAN`, `E2E-VALIDATE-ACTIONS-MODERN-DEFECTS`, and the unchanged legacy scenarios.
- **Open questions:** `#[CheckAction(false)]` marks an action playable outside the player's turn; it is read as an ordinary entry point, and the documentation does not settle whether such an action should be exempt from state-related rules. `JsonParam(class: …)` is recognized by name, but the shape of the mapped object is not compared with the client's payload.

### BGA-126 — Correct modern notification sends and registrations

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-108, BGA-120, BGA-124
- **Deliverable:** Notification tracing for every documented Game.php and state-class send form, with client handlers counted only when they are actually registered.
- **Acceptance:** `$this->bga->notify->all/player`, the state-class `$this->notif->all/player` shortcut, and still-supported legacy sends normalize to the same contract. A `notif_*` method is auto-bound only when `setupPromiseNotifications` registers it with the applicable prefix/handlers/ignore list; otherwise it is merely a method. Manual `dojo.subscribe` continues to work. Framework-predefined notifications that the documentation says need no custom subscription are not reported as unhandled.
- **Verification:** Packaged scenarios cover every send form, setup present/absent, custom prefixes and handlers, ignored notifications, mixed generations, payload agreement/disagreement, dynamic names, malformed payloads, and predefined notifications.
- **Finding:** The installed package ignored the documented state shortcut and emitted `notification.handled.not-sent`; separately, the client reader treats every `notif_*` method as bound even without `setupPromiseNotifications`.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) says state classes can write `$this->notif->all`. [Game interface logic: Game.js](https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js) says `setupPromiseNotifications` “auto-detect[s] all notifications declared on the game object (functions starting with `notif_`) and register[s] them with dojo.subscribe”, documents its `prefix` and `ignoreNotifications` parameters, and lists `tableWindow`, `message` and `simplePause` as pre-defined types a game may send with nothing on the client side. [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) documents `bga->notify->all` and `bga->notify->player`.
- **Evidence:** [Modern notification verification](verification/MODERN_NOTIFICATIONS.md) records the correction. `parseSentNotifications` in [`src/project/notifications.ts`](../src/project/notifications.ts) reads all three documented spellings including the state-class shortcut; `parsePromiseRegistration` reads the prefix and ignore list; `parseNotificationHandlers` marks a handler `bound` only when the registration covers it or the client subscribes by hand. [`src/rules/notifications.ts`](../src/rules/notifications.ts) looks for the registration across every client source, compares only bound handlers, says why an unregistered method does not receive its send, and never reports a predefined type as unhandled. `tests/fixtures/projects/modern-state-classes` declares its notification contract as passing; `modern-broken` declares the ignored registration. Proven through the installed package by `E2E-VALIDATE-NOTIFICATIONS-STATE-CLASSES` and `E2E-VALIDATE-NOTIFICATIONS-MODERN-DEFECTS`.
- **Open questions:** `handlers: [this, ...this.bga.states.getStateClasses()]` registers methods declared on other objects, and the documentation warns a duplicated name is called several times; a registration anywhere in the client is treated as registering every matching method rather than resolving ownership. `setIgnoreNotificationCheck` suppresses a notification by run-time predicate and is not read.

### BGA-127 — Restrict database findings to executed framework database calls

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-109, BGA-121
- **Deliverable:** A database-use reader that distinguishes a SQL-looking string from a query passed to a documented BGA database helper.
- **Acceptance:** A quoted string is a query only when data flow places it in `DbQuery`, `getObjectFromDB`, `getObjectListFromDB`, or another explicitly supported helper call. Unrelated examples, exceptions, logs, comments, templates, and dead string assignments produce no schema finding. A dynamic helper argument that cannot be resolved is one located unsupported construct; it is not reconstructed and does not make an undeclared table or column certain.
- **Verification:** Packaged scenarios cover inline queries, assigned-then-called queries, each supported helper, unrelated SQL-like strings in every excluded context, dynamic concatenation, malformed SQL, multiple statements, framework tables, and zero database/network execution.
- **Finding:** Adding only `$example = 'SELECT imaginary_id FROM ghost';` to an otherwise clean project made the installed tool count a third query and report the certain error `database.table.undeclared`; pre-release turned it into a failed check.
- **Sources:** [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) defines `DbQuery(string $sql)` as the generic database-access method and documents the specialized query helpers. [Game database model: dbmodel.sql](https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql) documents the project schema boundary.
- **Evidence:** [Database query source verification](verification/DATABASE_QUERY_SOURCES.md) records the correction. `parseQueries` in [`src/project/database.ts`](../src/project/database.ts) starts from a call to `DbQuery` or one of the seven documented helpers, reads a literal argument, follows a variable to the last literal assigned to it before the call, and reports anything else as one located unsupported construct without reconstructing a table or column from it. A helper argument that is not a recognized statement is reported rather than parsed. `tests/fixtures/projects/modern-state-classes` carries the review's own `$example = 'SELECT imaginary_id FROM ghost';` line, a SQL example in a comment, and one in an exception message, and declares its database audit as passing; `modern-broken` declares the assembled query as unsupported beside its real undeclared-table error. Proven through the installed package by `E2E-AUDIT-DATABASE-STRINGS-ONLY` and `E2E-AUDIT-DATABASE-MODERN-DEFECTS`.
- **Open questions:** A query built across several statements, or assigned inside a helper method, is unreadable here; following it further would mean interpreting PHP rather than reading it.

### BGA-128 — Complete the packaged public-boundary matrix for local capabilities

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-017, BGA-124, BGA-125, BGA-126, BGA-127
- **Deliverable:** The missing installed-artifact scenarios required by the original acceptance criteria of BGA-007, BGA-008, BGA-016, BGA-100, BGA-102 through BGA-114, and BGA-116 through BGA-123. Superseded BGA-115 remains excluded.
- **Acceptance:** The packaged server covers empty, partial, ambiguous, nested, permission-denied, oversized, malformed, and unknown-syntax projects; every rule has positive and negative public evidence; every resource covers every supported generation, limits, and in-session refresh; every tool receives relevant escape/redaction and default-root cases; aggregate and pre-release preserve failures and unsupported syntax; and every claimed hybrid/split-source/duplicate-precedence path crosses the public boundary. Fixture integrity runs the product and proves each declared normalized model and finding set rather than validating only the fixture's self-description.
- **Verification:** A generated coverage report maps each literal acceptance case to the exact installed-package assertion and retained result. Removing or skipping any mapped test, swapping in a source-launched server, or changing the fixture without its observed result fails the gate.
- **Finding:** The review found the missing cases documented in the reopened items: among them packaged permission failure, resource output limits and refresh, dynamic/malformed validator paths, four state rules' negative fixtures, modern rule-catalog fixtures, per-tool malicious inputs and default roots, and public hybrid coverage beyond inspection plus aggregate validation.
- **Evidence:** [Packaged boundary matrix verification](verification/PACKAGED_BOUNDARY_MATRIX.md) records the whole item. [`config/acceptance-map.json`](../config/acceptance-map.json) is the map this item exists to produce: every literal acceptance case of the reopened items, each either naming the assertions that prove it or recording why nothing does yet. `pnpm verify:acceptance-map` refuses a case whose scenario is undeclared, skipped, declared outside `tests/e2e/` when the case says packaged, absent from the retained evidence, recorded as anything but passed, or proven against an artifact other than the packed one; six seeded defects must be rejected before it reports. `tests/fixture-integrity.test.ts` now runs the readers and all four validators over every fixture and compares the result with the fixture's declared model and finding sets, so a fixture can no longer agree only with itself. New packaged scenarios close the empty-project, partial-layout, hybrid-per-capability and duplicate-precedence cases: `E2E-INSPECT-PROJECT-EMPTY`, `E2E-INSPECT-PROJECT-PARTIAL`, `E2E-VALIDATE-STATES-HYBRID`, `E2E-VALIDATE-ACTIONS-HYBRID`, `E2E-VALIDATE-NOTIFICATIONS-HYBRID`, `E2E-AUDIT-DATABASE-HYBRID`, and the class-wins assertion inside `E2E-INSPECT-PROJECT-HYBRID`. The hybrid fixture now declares a state in both sources so that precedence is a fact a public result shows.
  All 76 cases are now proven: `E2E-INSPECT-PROJECT-UNREADABLE-FILES` and `E2E-INSPECT-PROJECT-NESTED-ROOT` for the permission-denied and nested projects, `E2E-RESOURCE-SUMMARY-BOUNDED`, `E2E-RESOURCE-STATES-GENERATIONS`, `E2E-RESOURCE-DIAGNOSTICS-UNSUPPORTED` and `E2E-RESOURCE-REFRESH` for the resources, `E2E-VALIDATE-STATES-RULE-COVERAGE` for the four state rules that had no failing fixture, `E2E-VALIDATE-ACTIONS-UNSUPPORTED-SYNTAX`, `E2E-VALIDATE-NOTIFICATIONS-UNSUPPORTED-SYNTAX` and `E2E-AUDIT-DATABASE-UNREADABLE-STATEMENT` for dynamic and unrecognized syntax, and `E2E-TOOLS-REDACTION` and `E2E-TOOLS-DEFAULT-ROOT` for the guarantees every project tool shares. The rule-catalog gate now cross-checks `failingModern` against the modern defective fixture, and each fixture states the BGA behavior it represents. Writing the permission-denied case found a real defect: a directory the process may not list made `inspect_project` fail with `internal.unexpected`; it is now recorded in the listing and reported as `project.listing.unreadable`.
- **Note:** Coverage is complete; release verification is not. A capability still cannot be `verified` until CI has run the commit being claimed and conformance covers every protocol version it advertises, which BGA-005 and BGA-017 own.

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
- **Evidence:** `fetchDocumentation` in [`src/policy.ts`](../src/policy.ts) is the current outbound documentation path. A caller names a source and page path rather than a host; catalog construction, HTTPS/prefix checks, redirect confinement, network-off behavior, bounded successful-body reads, and obvious path/source-marker refusals have unit and integration coverage. Packaged `search_bga_docs` and fixed-resource scenarios now reach this path through a real MCP client, including network-off and selected invalid requests. The current source contains no second privileged import path, but BGA-329 owns making that property non-bypassable. The threat model now narrows the implemented controls to these observations and records the missing complete address, privacy, and lifecycle invariants separately.
- **Note:** Public documentation capabilities now exist, so the old “no capability exposes retrieval” reason is obsolete. This item remains `implemented` because installed/live calls and source probes disproved parts of its original acceptance: address normalization, arbitrary-query provenance, cancellation, redirect/error-body lifecycle, and full public negative coverage are incomplete. BGA-323, BGA-324, and BGA-326 own those corrections; BGA-128/BGA-017 own the inventory-wide evidence composition.
- **Adversarial findings, 2026-08-08:** Three stated preconditions are not established. Hexadecimal IPv4-mapped IPv6 forms such as `::ffff:7f00:1` pass the address guard even though they map to loopback/private IPv4 (BGA-323). A plausible project-derived query such as `SELECT unreleased_secret FROM internal_table` passes the request-content heuristic, so the implementation cannot prove the caller's provenance claim (BGA-324). Slow redirect and non-2xx bodies are resumed without a bounded drain or socket destruction after the operation has already resolved/rejected, and callers do not propagate the timeout signal (BGA-326). TM-DOC-NO-LOOPBACK, TM-DOC-REQUEST-CONTENT, and TM-DOC-RESPONSE-BUDGET remain implementation claims with open correctness bugs, not verified controls.
- **Sources:** [documentation boundary review](verification/DOCS_BOUNDARY_REVIEW.md), [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md).

### BGA-208 — Implement the dated documentation cache

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-200, BGA-207
- **Deliverable:** A bounded local cache of what a developer's own lookups returned, carrying provenance and snapshot dates, implementing TM-DOC-PROVENANCE, TM-DOC-UNTRUSTED, and TM-DOC-SNAPSHOT-INTEGRITY.
- **Acceptance:** A cache entry stores the canonical URL, the retrieval timestamp, the source's own last-modified signal where it publishes one, and the source's authority. Nothing is served without its date. An entry older than its source's `maxCacheDays` is refetched or reported as stale, never served as current. Retrieved text is stored and returned labelled as untrusted content. The cache holds excerpts, never whole pages, because no approved source permits retaining full text. It is per-developer local state, never part of the published package, and it is never populated by anything but an explicit lookup.
- **Verification:** Integration scenarios cover a cold lookup, a warm hit, an expired entry, an entry whose source authority is community, and a source that changed upstream. A packaged scenario proves provenance and snapshot date survive to the client, and that a cached excerpt is never returned without them.
- **Evidence:** [`src/docs/cache.ts`](../src/docs/cache.ts) holds excerpts keyed by URL, bounded in count and excerpt length, evicting by least recent use. Every read returns `retrievedAt`, `ageDays`, and `stale`, so there is no way to obtain an entry without its date; an entry whose date cannot be parsed is treated as maximally old rather than fresh. Staleness is per source, so the same entry is fresh against the maintained reference's 30 days and stale against a community page's 7. [`src/docs/retrieve.ts`](../src/docs/retrieve.ts) assembles the only result shape a caller may show: title, URL, source, authority, provenance, dates, staleness, excerpt, and an untrusted-content notice, all required rather than optional. A fresh entry is served without a request; a stale one is refetched, and the stale copy comes back only when the refetch fails, marked stale and dated. [`src/docs/excerpt.ts`](../src/docs/excerpt.ts) strips script, style, template, and comment content before quoting, because that is where text aimed at an agent hides and it is not what the developer saw. `UNIT-DOC-SNAPSHOT-DATE`, `UNIT-DOC-CACHE-BOUNDED`, `UNIT-DOC-EXCERPT`, and `UNIT-DOC-PROVENANCE` cover these; TM-DOC-PROVENANCE, TM-DOC-UNTRUSTED, and TM-DOC-SNAPSHOT-INTEGRITY move from `planned` to `implemented`.
- **Note:** The cache is in memory for the life of the process, which is a decision rather than an omission. Persisting it would give a mostly read-only server a new write boundary; a restart instead costs one repeated fetch. Public documentation capabilities now exercise cold retrieval through a real client, but the original cache acceptance still lacks packaged warm-hit, expiry, upstream-change, and per-session provenance scenarios. BGA-128/BGA-211 own that missing public/live evaluation rather than the obsolete claim that no retrieval capability exists.
- **Sources:** [documentation boundary review](verification/DOCS_BOUNDARY_REVIEW.md), [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md).

### BGA-202 — Implement `search_bga_docs`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-006, BGA-016, BGA-207, BGA-208
- **Deliverable:** A tool returning relevant, concise documentation excerpts with canonical sources, provenance, snapshot dates, and known framework versions.
- **Acceptance:** Official and community results are distinguishable, result limits are enforced, and retrieved text cannot issue instructions to the server.
- **Verification:** Tool E2E covers exact-topic, ambiguous, no-result, stale-source, malicious-content, invalid-input, and output-limit scenarios.
- **Evidence:** [`src/tools/search-bga-docs.ts`](../src/tools/search-bga-docs.ts) searches the allowlisted sources through the MediaWiki search API, which is the `search=yes` use the sources' content signals permit and which returns each page's last edit as its own freshness signal. Every result carries title, canonical URL, source, authority, provenance, retrieval date, last edit, age, staleness, and a `trust: untrusted-content` label, and the response carries a notice saying the text is documentation to read rather than instructions to follow. An official-host community page is labelled `community`, because the host does not vouch for it. Results are capped at five and excerpts at 1,200 characters, so this is a citation list rather than a corpus. It is the only capability with `openWorldHint`. `E2E-DOCS-ADVERTISED`, `E2E-DOCS-NETWORK-OFF`, `E2E-DOCS-REQUEST-CARRIES-NO-PROJECT-DATA`, `E2E-DOCS-UNKNOWN-SOURCE`, and `E2E-DOCS-INVALID-INPUT` run through the packaged artifact; `UNIT-DOC-SEARCH-PARSE` covers reading the API response, including a malformed one and a hit with no title. `E2E-READ-ONLY-NETWORK-DENIED` now calls this tool too and proves it refuses because the network is off rather than because the harness blocked it — the attempt log stays empty.
- **Note:** `implemented`, not `verified`. The scenarios that need a live wiki — a real result with real provenance, a stale source, and adversarial page content — cannot run in an offline CI, so what is proven here is every refusal and the shape of the contract, not a successful retrieval. Those belong with BGA-205's evaluation set, which is where a network-dependent suite can be run deliberately rather than on every commit.
- **Correction:** Two defects were found by hand on 2026-08-08 and fixed — a missing `srwhat=text`, which made the wiki match titles only and return nothing for `notifyAllPlayers`, `getArgs`, and `dbmodel`; and unescaped control characters in wiki snippets, which made `JSON.parse` throw and the parser return an empty result rather than a failure. Every offline scenario passed before and after, because they assert against responses this project wrote. BGA-313 records the live run that would have caught them.
- **Adversarial finding, 2026-08-08:** When DNS was unavailable, every page/source fetch failed but the installed tool returned `isError: false`, an empty result, and “No documentation matched.” `sourcesSearched` named both sources even though neither was successfully searched. BGA-209 owns the outage/no-match distinction.
- **Adversarial finding, 2026-08-08:** The public free-text query is also the outbound-data surface in BGA-324: SQL-shaped project content without one of eight markers passes the policy and becomes MediaWiki `srsearch`. Errors reflecting an oversized `sourceId` bypass the output budget (BGA-325). This item cannot be verified until those cross-cutting owners pass.

### BGA-203 — Implement `bga://docs/{topic}`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-006, BGA-202, BGA-208
- **Deliverable:** Topic-addressable documentation resources with stable media types and provenance metadata.
- **Acceptance:** Topic resolution is deterministic, unknown topics fail clearly, and resources never hide source authority or snapshot age.
- **Verification:** Resource E2E lists templates, reads valid topics, rejects invalid/traversal topics, and verifies provenance and size bounds.
- **Evidence:** [`src/docs/topics.ts`](../src/docs/topics.ts) resolves a topic through a fixed table rather than a search, for two reasons: a resource must mean the same page every time, and a topic that became an arbitrary path would hand URI text to the request builder. Every page in the table was retrieved and read while writing it. The template lists one entry per topic, so a client sees the topics instead of guessing at a URI shape, and the community page says so in its description. An unknown topic is refused with the list of known ones, and a topic shaped like a path or a wiki special page is refused the same way, before any request is built. `E2E-DOCS-TOPIC-LISTED`, `E2E-DOCS-TOPIC-UNKNOWN`, and `E2E-DOCS-TOPIC-NETWORK-OFF` run through the packaged artifact.
- **Note:** `implemented`. Reading a real topic needs a live wiki, so what is proven offline is the listing, the refusals, and the network-off behaviour.
- **Adversarial finding, 2026-08-08:** All seven live topics returned the right canonical URL and authority, but several excerpts did not answer their topic: `game-logic` quoted cross-game persistence, `file-reference` skipped the central file list, and `studio` began in the table of contents. BGA-211 owns fixed-topic relevance evidence.

### BGA-204 — Implement `bga://framework/version`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-006, BGA-200, BGA-207, BGA-208
- **Deliverable:** A resource describing verified current BGA framework/runtime information and the snapshot supporting it.
- **Acceptance:** Unknown or stale version data is labeled; no value is guessed from examples or historical fixtures.
- **Verification:** Resource E2E covers current, stale, missing, and conflicting source snapshots.
- **Evidence:** The resource reads the Studio page's "Software Versions" section, which is where BGA publishes what the platform runs — PHP 8.4, MySQL 5.7 in production and 8.0 on Studio, Dojo 1.15 marked deprecated at the time of writing. [`src/docs/versions.ts`](../src/docs/versions.ts) reports only lines that name software and a version, keeps the line each reading came from so a developer can check it rather than trust it, and returns `status: unknown` with a reason when the section cannot be found. Nothing is defaulted or carried over from a fixture: a wrong version is worse than no version to a developer choosing which syntax to write. `UNIT-DOC-FRAMEWORK-VERSION`, `E2E-FRAMEWORK-VERSION-LISTED`, and `E2E-FRAMEWORK-VERSION-NETWORK-OFF` cover it.
- **Note:** `implemented`. Current, stale, and conflicting snapshots need a live source; offline coverage is the parser, the advertisement, and the refusal when the network is off.
- **Adversarial finding, 2026-08-08:** A live installed-package read returned one “version”: the label “Original announcement on BGA forum” paired with a forum URL. The source page actually listed Dojo 1.15, PHP 8.4, MySQL 5.7/8.0, and Font Awesome 4.7/6.4.0. The parser matched the table-of-contents occurrence of “Software Versions” and scanned unrelated prose. This directly violates “a wrong version is worse than no version”; BGA-210 owns the correction.
- **Sources:** [Studio § Software Versions](https://en.doc.boardgamearena.com/Studio#Software_Versions), checked 2026-08-07.

### BGA-205 — Build the retrieval evaluation set

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-001, BGA-200, BGA-202
- **Deliverable:** Maintained questions, expected source facts, relevance requirements, token/size limits, and regression thresholds.
- **Acceptance:** The set covers common and adversarial BGA questions, official/community distinctions, version sensitivity, and no-answer behavior.
- **Verification:** Packaged-server E2E runs the complete set and release gates fail below thresholds or when required attribution is absent.
- **Evidence:** [`config/doc-evaluation.json`](../config/doc-evaluation.json) holds nine questions with the page each should be answered from, the fact the excerpt must contain, and the provenance expected. Two of them are deliberate no-answer/adversarial cases. `pnpm test:docs-eval` uses the real SDK client against the repository build and live wiki and fails below the thresholds; it is not an installed-tarball driver, so packaged evaluation remains a BGA-211 gap. `pnpm verify:doc-evaluation` runs on every commit and validates the evaluation set, while `UNIT-DOC-EVALUATION` covers wrong-page, missing-fact, provenance, excerpt-size, invented-answer, and threshold scoring.
- **Note:** `implemented`. `pnpm test:docs-eval` is deliberately outside `pnpm check`: it needs a third party's wiki, and putting it in the commit gate would make every commit depend on someone else's uptime and send traffic nobody asked for. It runs before a documentation release and whenever the drift monitor reports a change.

### BGA-313 — Confirm documentation retrieval quality against the live wiki

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-202, BGA-205
- **Deliverable:** A recorded `pnpm test:docs-eval` run against the live wiki, and whatever the result forces: a fallback when search returns nothing, a revised question set, or a recorded limitation.
- **Acceptance:** Retrieval either clears the set's thresholds or the reasons it does not are recorded per question. A question the documentation demonstrably answers must not fail because of how this server searches.
- **Verification:** The evaluation run is the verification. Its output is kept with the date and the wiki state it ran against, because the wiki changes and a passing run is only evidence about the day it happened.
- **Note:** Opened after two defects in `search_bga_docs` were found by hand on 2026-08-08, both of which had shipped and neither of which any offline test could have caught. First, the search omitted `srwhat=text`, so the wiki matched titles only: `notifyAllPlayers`, `getArgs`, `dbmodel`, and `notification` each returned zero results while the pages documenting them sat in the index. Second, the wiki emits raw control characters inside snippets, which `JSON.parse` rejects, and the parser treated a thrown error as an empty result — so a malformed response and a genuinely empty one were indistinguishable. Both are fixed and unit-tested. The lesson is the item: every offline scenario passed throughout, because they all asserted against responses this project wrote itself. Only a live run measures whether the thing works.
- **Sources:** MediaWiki search API behaviour measured directly against <https://en.doc.boardgamearena.com/api.php> on 2026-08-08.
- **Result, 2026-08-08:** 4 of 9 answered against a threshold of 0.8, 6 of 9 attributed against a threshold of 1. **The set does not pass, and the thresholds have deliberately not been lowered to make it.** What the run bought was five defects that every offline test had passed over, four of them fatal to the capability:

  1. **The guarded DNS lookup answered in the wrong shape.** Node asks for either one address or all of them, and the wrapper always returned one, so every documentation request failed with `Invalid IP address: undefined`. The capability had never worked. Only a real connection exercises this.
  2. **A source scoped to a single page aborted the whole search.** The community catalog entry points at one Cookbook page, so building the search endpoint against it failed the containment check and threw, emptying every result — including results from the source that was fine.
  3. **Authority was resolved per source rather than per page**, so a community page reached through the site-wide source was reported as official. Provenance is now the most specific catalog entry that matches a URL.
  4. **One unreachable page emptied the result.** A single failure now degrades instead of aborting.
  5. **Relevance was unusable**, addressed by ranking the curated topic first and dropping results that never mention what was asked.

  A sixth was introduced while fixing the fourth and caught by the existing suite: tolerating a failed page swallowed policy refusals too, so a network-disabled call came back as an empty result rather than a refusal. Only a page-level failure is tolerated now; anything else propagates.

- **Remaining failures, per question:** `client-entry-point` and `file-reference` reach the right page but excerpt the wrong passage; `migration-states` and `community-recipes` do not return the expected page at all; `adversarial-instruction` returns something where nothing is correct. Two attempted excerpt heuristics — preferring the earliest near-best line, and restricting the topic keywords to distinctive ones — were each measured and each made the score worse, so both were reverted and the measurements recorded in the code where someone would otherwise try them again.
- **Next:** the remaining gap is excerpt selection and query understanding, which is a different problem from the plumbing this run fixed. It wants its own item and a way to iterate that does not mean firing requests at a third party's wiki to A/B a heuristic — captured page fixtures, scored offline, with the live run as the periodic check rather than the development loop.
- **Current confirmation:** The maintained real-SDK live run against the repository build on 2026-08-08 reproduced the same `4/9` answered and `6/9` attributed result. It did not install the tarball; BGA-211 owns both the relevance work and an install-aware evaluation driver.

### BGA-209 — Distinguish documentation outage from a genuine no-match result

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-202, BGA-207
- **Deliverable:** Truthful search-degradation semantics that track attempted and successful retrievals per source/page.
- **Acceptance:** One failed page or source may degrade a search only when at least one other page/source was successfully searched. If zero fetches succeed, the tool returns the actionable `policy.doc-fetch.failed` family with safe failure context, not a successful empty result. `sourcesSearched` contains only sources whose search endpoint or page content was actually processed; attempted and failed counts are separate fields if useful. A genuine successful search with no hits remains a normal empty result.
- **Verification:** Installed-package network tests separately cover all-source DNS failure, all-source timeout, one-source failure with another succeeding, page-level failure after successful search, malformed response, and a genuine no-match. Each asserts the error bit, stable code, source accounting, and absence of project data.
- **Finding:** With outbound DNS blocked, `search_bga_docs` returned success and “No documentation matched,” while resource reads in the same process correctly returned `policy.doc-fetch.failed ... ENOTFOUND`.

### BGA-210 — Anchor framework-version extraction to the actual section

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-204, BGA-205
- **Deliverable:** A version parser that identifies the rendered `Software Versions` heading and reads only its bounded section, preserving software/value pairs and evidence lines.
- **Acceptance:** Table-of-contents links, navigation, forum URLs, dates, and unrelated prose can never become software versions. The parser recognizes the maintained list's punctuation and multiple environment values, reports conflicts rather than selecting one, and returns `unknown` when the heading or parseable list is absent. Every returned value has a source line and snapshot date.
- **Verification:** Captured official-page fixtures cover the current section, a table of contents before it, reordered navigation, a missing section, an empty section, duplicates/conflicts, and stale content. A deliberate live installed-resource test asserts PHP, SQL, Dojo, and both Font Awesome entries against the current official page before a documentation release.
- **Finding:** The live resource returned a forum announcement link as its only software version because it anchored on the first table-of-contents text occurrence.
- **Sources:** [Studio § Software Versions](https://en.doc.boardgamearena.com/Studio#Software_Versions) currently says “Versions currently used by BGA framework” and lists Dojo 1.15, PHP 8.4, MySQL 5.7/8.0, and Font Awesome 4.7/6.4.0.

### BGA-211 — Build captured-page relevance evaluation for search and topic resources

- **Status:** ready
- **Priority:** P1
- **Depends on:** BGA-203, BGA-205, BGA-313
- **Deliverable:** Legally bounded captured-page fixtures and deterministic offline scoring for query understanding, excerpt selection, no-answer behavior, and fixed-topic resource relevance, with the live wiki retained as the periodic truth check.
- **Acceptance:** Captures contain only the minimal reviewed text needed for evaluation, with canonical URL, authority, retrieval date, and source policy recorded. Every BGA-205 question and every fixed topic has an expected page plus required/forbidden facts. The system prefers the passage that answers the query/topic, returns nothing for adversarial or genuinely unanswerable input, and does not optimize by lowering the existing thresholds. Captures are refreshed only through an explicit review when drift is detected.
- **Verification:** Offline A/B evaluation fails the exact five current search questions and three off-topic fixed resources before the fix, then clears the existing answer/attribution thresholds and per-topic requirements. `pnpm test:docs-eval` repeats the result live before release and records any source drift separately from ranking quality.
- **Finding:** The current live run is `4/9` answered and `6/9` attributed; topic resources have correct provenance but weak passages. Network requests are too slow and externally coupled to be the development loop, while self-authored synthetic responses already missed multiple production defects.

### BGA-206 — Monitor BGA documentation and framework changes

- **Status:** implemented
- **Priority:** P2
- **Depends on:** BGA-200, BGA-204, BGA-208
- **Deliverable:** A scheduled, non-mutating process that detects source/version drift and opens a reviewable update signal.
- **Acceptance:** Changes never auto-publish as verified guidance; removed or conflicting facts mark affected capabilities stale until reviewed and retested.
- **Verification:** Controlled source changes prove detection, staleness propagation, and refusal to silently update verified evidence.
- **Evidence:** `pnpm docs:drift` retrieves every tracked topic through the policy boundary and compares it with the baseline it was reviewed at, reporting changed text, an edit that changed no text, a page that could not be read, a tracked page that has gone, and a page nobody reviewed. It never writes a baseline as a side effect: recording one is `--record`, run by a person after reading what changed, because "the wiki changed" and "the new text is correct" are different claims and only the second one needs judgement. Changed, missing, and untracked pages fail the run and the message says the derived guidance is stale until it is re-read and `pnpm test:docs-eval` passes again. The digest covers extracted text rather than markup, so a formatting edit is reported as an edit and not as drift. `UNIT-DOC-DRIFT` covers all five outcomes, including that an unreachable page is never treated as unchanged.
- **Note:** `implemented`. The comparison is fully covered offline; running it needs the network, so like the evaluation set it is a scheduled and pre-release command rather than a commit gate.

### BGA-314 — Take project roots from the client instead of a flag

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-015, BGA-116
- **Deliverable:** Project roots discovered from the MCP `roots/list` request when the client offers it, with `--project-root` remaining as the override rather than the requirement.
- **Acceptance:** A client that advertises roots needs no `--project-root` at all. A root offered by the client is subject to every check a configured root is: it is resolved, it is contained, and a path outside it is refused exactly as now. Roots that appear or disappear during a session are picked up rather than cached forever. A client that offers no roots behaves exactly as today, so nothing regresses for a launcher that only knows how to pass arguments.
- **Verification:** Packaged scenarios cover a client offering one root, several, none, and a root that vanishes mid-session; the traversal and symlink refusals are re-run against a client-offered root to prove the policy is the same policy.
- **Evidence:** `PolicyBoundary` gained a client-roots provider, set by the server factory rather than by configuration, because whether a client can offer roots is a property of the connection. An offered root is resolved through the filesystem and checked exactly like a configured one — `INT-CLIENT-ROOTS-ADOPTED` proves a path outside it is still refused with the same code, and that a traversal out of it still fails. Configured roots outrank offered ones, a root that does not exist is skipped rather than failing the others, and a duplicate appears once. The list is fetched once per connection and again when the client sends `notifications/roots/list_changed`, so opening another project mid-session works without reconnecting. A client that cannot answer is treated as a client without roots, and the refusal now names both ways to fix it.
- **Note:** Only the 2025 era adopts roots this way, and that is a protocol fact rather than a shortcut. `roots/list` was deprecated in 2026-07-28 (SEP-2577) and the SDK throws rather than sending it; on that era roots arrive through the multi-round-trip input-required flow, which a capability must ask for in its own result. The push path is therefore wired only where it works, and the newer era keeps requiring an explicit root until that flow is built — which is BGA-315's mechanism, so it lands there.
- **Adversarial finding, 2026-08-08:** A real pinned 2026 client advertised roots and installed a roots handler, but the server made zero root requests. This is expected for the removed push request, but the server then said the client “offered none” rather than initiating the modern input-required flow. BGA-318 owns that missing era.

### BGA-315 — Ask for what is missing instead of failing

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-314
- **Deliverable:** Setup values requested through MCP elicitation at the moment they are needed, rather than required up front — starting with the Studio dev account names, which are not secret.
- **Acceptance:** A capability that lacks a non-secret setting asks for it through the client and proceeds when it is supplied, rather than refusing with instructions the developer has to go and act on elsewhere. Declining is a first-class answer: the capability refuses cleanly and does not ask again in the same session. A client that does not support elicitation gets the current behaviour, refusal with instructions, so this is an improvement and never a new dependency.
- **Verification:** Scenarios cover supply, decline, an unsupported client, and a second call after a decline.
- **Evidence:** `SetupAsker` asks the client for the Studio dev accounts the first time `read_studio_logs` needs them and none are configured, and the answer is held for the session — in memory, never written, so a restart asks again and configuration is untouched. Declining is an answer: the call refuses and nothing asks again for the rest of the session, which `INT-SETUP-ASK-DECLINED` proves by counting the requests. `INT-SETUP-ASK-UNSUPPORTED` covers a client that does not advertise elicitation, one that advertises it and then fails, and the 2026 era — all three get the refusal they would have got anyway, so this is never a new dependency. An empty or unusable answer counts as a decline rather than as an empty allowlist, which matters because an empty allowlist would silently return nothing. The policy gates run before the question, since asking a developer for accounts when the capability is switched off is a question with no useful answer.
- **Note:** Legacy era only, for the same protocol reason as BGA-314: on 2026-07-28 elicitation is an input-required result a capability returns rather than a request the server may push, and the SDK throws if asked to push. Extending it there is the same piece of work as the modern roots path, and both are still outstanding.
- **Adversarial finding, 2026-08-08:** The outstanding 2026 flow had no backlog owner after this item was marked implemented. BGA-318 now owns both modern roots and non-secret setup input.
- **Open question — must be answered before any credential is elicited:** whether the Studio session may be requested this way at all. It is not a tool argument, which is the property BGA-312 protects, but an elicited value still crosses the client, and whether it lands in a transcript is a property of the client rather than of this server. Until that is reviewed, elicitation covers non-secret settings only, and the session continues to come from the environment or a file. Do not widen this without a boundary review.

### BGA-316 — Make the setup state legible to the agent

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-312
- **Deliverable:** The `--studio-check` report, and the equivalent for local and documentation capabilities, exposed as a capability an agent can call — machine-readable, with the same one-problem-at-a-time ordering and an explicit next action per finding.
- **Acceptance:** An agent can determine what is configured, what is missing, and what to do about it without a human reading terminal output. Each finding carries a stable code, a human sentence, and a next action. It reports on capabilities that are off, saying how to turn them on, rather than pretending they do not exist. It never reports a credential, only whether one was found and from where.
- **Verification:** Packaged scenarios cover a server with nothing configured, one fully configured, and one part-way; the result is asserted against its schema rather than its prose.
- **Evidence:** `check_setup` returns every finding with a stable code, a sentence, and a next action, and it never refuses — a capability that explains why things are refusing is useless if it refuses too. It reports capabilities that are switched off as off, with the flag that enables them, because a reader cannot ask about something they were never told exists. `ready` means the local capabilities can work: optional things being off is not a problem to solve. A Studio session is reported as present or missing and never by value, which `INT-SETUP-NO-CREDENTIALS` proves by asserting the serialized report contains neither the session nor its cookie name. `E2E-SETUP-NOTHING-CONFIGURED` and `E2E-SETUP-READY` run it through the packaged artifact, and the first asserts that every actionable finding carries an action rather than only a symptom.
- **Note:** `--studio-check` remains a separate terminal surface; it is not equivalent to `check_setup`. BGA-319 shows that page preflight can publish foreign actor names and BGA-328 shows it can publish the credential-file path, while `check_setup` reports only configuration state. Client-offered roots work on the 2025 path; BGA-318 owns the missing 2026 input-required flow and truthful era-aware wording.
- **Adversarial finding, 2026-08-08:** On the 2026 protocol the installed tool told a client that did advertise roots to “use a client that advertises its open folders as roots.” Era-aware, truthful wording is part of BGA-318.
- **Adversarial finding, 2026-08-08:** The CLI-side Studio preflight is also not a safe equivalent of `check_setup`: a page check can print foreign actor names (BGA-319), and even a configuration-only check prints the absolute session-file path (BGA-328). Setup evidence must cover every output surface before this item can be verified.

### BGA-317 — Remember the setup between runs

- **Status:** planned
- **Priority:** P2
- **Depends on:** BGA-315, BGA-316
- **Deliverable:** A local configuration file the setup flow can write, so a developer answers a question once rather than at every launch.
- **Acceptance:** Configuration resolves in a stated order — command line, then file, then client-offered roots, then defaults — and the file's location is documented and per-user rather than per-project. Nothing is written without the developer asking for it in that moment. A secret is never written to it.
- **Verification:** Scenarios cover each precedence level, a malformed file, an unreadable file, and a refusal to write a secret.
- **Blocked on a boundary decision:** this server has never written to disk. `GATE-POLICY-IMPORT-BOUNDARY` and the read-only guarantee in `E2E-READ-ONLY-NETWORK-DENIED` are both built on that, and every capability today is advertised `readOnlyHint`. Writing a configuration file is a small write, but it is the first one, and "the server only ever reads" is a sentence this project currently gets to say without qualification. Decide deliberately whether to give that up for the convenience, and record the answer either way before implementing.

### BGA-318 — Implement the 2026 input-required setup flow

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-314, BGA-315, BGA-316
- **Deliverable:** The `2026-07-28` multi-round-trip input-required flow for project roots and non-secret missing setup, plus protocol-era-aware setup diagnostics.
- **Acceptance:** When a 2026 client supports the applicable input-required interaction, a capability missing a project root returns the structured request, validates the supplied root through the same policy boundary, and resumes without a relaunch. Decline and unsupported-client outcomes are explicit and session-bounded. No server-push `roots/list` or legacy elicitation is attempted on that era. Guidance distinguishes “the client did not advertise/support the modern interaction,” “the user declined,” and “no value was supplied”; it never claims an advertising client offered nothing merely because the server did not ask.
- **Verification:** Real-client installed-package scenarios cover one/many/changed roots, valid supply, decline, unsupported interaction, invalid/out-of-root/symlink values, a second call after decline, and both protocol eras in one matrix. The client records every request so a zero-request false diagnosis fails.
- **Finding:** The installed server's 2025 path called `roots/list` and refreshed correctly. The same SDK client on 2026 advertised and handled roots, but received zero requests; `check_setup` blamed the client and `inspect_project` said none were offered.

## Phase 3 — Studio bridge

### BGA-300 — Establish the dedicated BGA Studio test environment

- **Status:** blocked
- **Priority:** P0
- **Depends on:** BGA-001, BGA-013
- **Deliverable:** A non-production Studio account/project, isolated test data, least-privilege credentials, ownership rules, cleanup procedure, and emergency stop.
- **Acceptance:** The exact remote target is allowlisted; it contains no publisher assets or user project data; test mutations cannot reach other projects; maintainers can rotate/revoke access.
- **Verification:** A manual authorization record and automated identity/target preflight pass before any live test is enabled.
- **Live progress and blocker, 2026-08-08:** The owner completed Studio developer enrollment, then explicitly authorized creation of the private, BGG-ID-0 tutorial project `mcpverification`. BGA generated and committed only its starter skeleton; no publisher assets or user data were introduced. The project page nevertheless enabled “Allow other studio developers to get readonly access” by default, so `Private` alone did not satisfy least privilege. After a separate explicit approval, the reviewer turned the control off, selected the page's `Update` action, reloaded the project page, and confirmed the checked class remained absent. That establishes the current manual checkbox state only; BGA-322 still owns the distinct-account negative check and live-harness precondition. The owner placed the complete Cookie header value in an owner-only mode-600 handoff file. The reviewer verified only file metadata and supplied the value to the installed server through its environment provider, never through `--studio-session-file` and never printed it. The real project name was rejected locally (BGA-320); the observed numeric Play ID made an authenticated request but returned `policy.output.too-large` rather than an actionable wrong-project error. Keep this item blocked until identity/target/cleanup controls pass and BGA-319 through BGA-328's applicable live-read blockers close.

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

- **Status:** superseded
- **Superseded by:** BGA-312
- **Priority:** P2
- **Depends on:** BGA-001, BGA-013, BGA-300
- **Deliverable:** An evidence-backed architecture decision covering documented access, authentication, fragility, data sensitivity, and allowed automation.
- **Acceptance:** Undocumented endpoints are not accepted as a core dependency; an unavailable safe mechanism results in a recorded rejection or experimental-only scope.
- **Verification:** A read-only proof against the test project demonstrates the chosen boundary without bypassing access controls; otherwise BGA-306 remains blocked.
- **Decision:** Rejected on 2026-08-07 by this review, then **overturned the same day by the project owner**, who accepted the fragility trade on the condition that the capability returns no personal data belonging to anyone else. That condition is not a note: it is implemented as an allowlist that fails closed (TM-STUDIO-OWN-DATA-ONLY) and the capability is BGA-312. The original reasoning, unchanged, follows, because it is still why the capability is experimental rather than supported.

  Rejected on the current evidence. Studio logs are a panel on an authenticated web page, with production errors behind a button and Sentry behind its own interface. There is no documented programmatic access, so automating it means driving a session and parsing HTML nobody promised to keep stable, using a session that is itself a credential. The rule against that is this project's own recorded non-goal, not a BGA prohibition: `studio.boardgamearena.com/robots.txt` allows `/studiogame`, no Studio terms-of-use page was found, and nothing in the documentation addresses automation. That is the blocker, and it applies to every kind of log equally. Player data is a separate and narrower constraint: it applies to production errors and Sentry, where the identifiers belong to real players, and not to a developer's own Studio test tables, where they are their own dev accounts. Nothing here says a developer should not read their own logs, and nothing says BGA objects; it says this project will not build a core capability on an undocumented page it does not control. See the [Studio boundary review](verification/STUDIO_BOUNDARY_REVIEW.md). Worth re-reading if BGA publishes an API — own-table logs first.

- **Sources:** [Studio logs](https://en.doc.boardgamearena.com/Studio_logs), [Practical debugging](https://en.doc.boardgamearena.com/Practical_debugging), checked 2026-08-07.

### BGA-306 — Implement `read_studio_logs`

- **Status:** superseded
- **Superseded by:** BGA-312
- **Priority:** P2
- **Depends on:** BGA-016, BGA-305, BGA-307
- **Deliverable:** A read-only tool for permitted Studio diagnostics filtered by project, table/test marker, time, severity, and result limits.
- **Acceptance:** Output is structured, bounded, source-identifiable, and redacts credentials, sessions, player information, and unrelated project data.
- **Verification:** Live E2E creates an allowed unique diagnostic marker, retrieves only the expected entry, exercises filters/no-results/errors, and proves redaction and project isolation.
- **Reason:** Written for a supported capability with a documented mechanism, and no such mechanism exists. What was actually built is narrower on every axis — experimental, own-data-only, read-only, off by default — so it carries a new identifier rather than quietly reusing this one's acceptance criteria. See BGA-312.

### BGA-312 — Implement experimental own-account Studio log reading

- **Status:** implemented
- **Priority:** P3
- **Depends on:** BGA-015, BGA-016
- **Deliverable:** `read_studio_logs`, an experimental, read-only tool returning the developer's own Studio request and SQL log lines for one game, off unless explicitly enabled.
- **Acceptance:** It returns no personal data belonging to anyone but the developer running it, and that is enforced across every output surface rather than documented: only lines whose actor matches a declared `--studio-dev-account` are returned, and a line about anyone else, or one whose owner cannot be determined, is withheld entirely. With no declared account it returns nothing. Production error logs and Sentry are never requested. A session is never accepted as a tool argument; the environment provider is the only currently evidenced live path, while BGA-321/BGA-328 block the explicit file provider. The tool is advertised as `experimental`, refuses without `--experimental-studio-logs`, and states that it scrapes an unversioned page and can break.
- **Verification:** The screening rule is proven against the documented log shape, including a real player's line, an unreadable line, a credential, and an account name that is a prefix of a declared one. Packaged scenarios prove the refusals: disabled, no session, and a session offered as an argument.
- **Evidence:** [`src/studio/logline.ts`](../src/studio/logline.ts) reads the documented shape — `20/06 21:50:56 [info] [T403] [4/mytest0] …` — which is what makes an actor allowlist possible. [`src/studio/privacy.ts`](../src/studio/privacy.ts) keeps a line only when its actor exactly matches a declared account, case-insensitively but never by prefix, and reports bounded withheld counts. `policy.fetchStudioPage` fixes the host as a constant, refuses redirects, and applies the documentation address guard and response budget. The listed unit/integration/packaged scenarios prove parser and refusal behavior, but not a successful live read; the adversarial findings below disprove the broader credential/privacy evidence claims.
- **Setup:** `bga-mcp --studio-check <projectName>` already accepts the project name syntactically, but its page-fetching diagnostics remain unsafe under BGA-319/BGA-328. The MCP `read_studio_logs` schema alone incorrectly requires digits (BGA-320). The source guide no longer tells operators to launch the server with the file provider until BGA-321/BGA-328 pass.
- **Note:** `implemented`, not verified. A real developer account and dedicated private project now exist. A freshly packed/installed MCP discovered the tool, rejected `mcpverification` at schema validation, and made a bounded authenticated request with the observed numeric Play ID; that call failed as `policy.output.too-large`, not with an actionable wrong-project result. The owner supplied the session through a protected handoff file that the shell passed into the server's environment; neither browser storage nor the cookie value was inspected or printed, and the isolated install was removed. `RR-STUDIO-UNDOCUMENTED-PAGE` remains the upstream-fragility risk; the defects below are local implementation bugs.
- **Adversarial finding, 2026-08-08:** The MCP response filter withholds foreign lines, but `--studio-check` constructs a diagnostic from every parsed actor and prints up to five foreign account names. The integration test intentionally requires that leak. Terminal, launcher, and CI logs are output boundaries too; BGA-319 owns the correction.
- **Adversarial findings, 2026-08-08:** The live project link is `/studiogame?game=mcpverification`, while `game=15414` (the numeric Play ID) says the project does not exist and the MCP rejects the valid project name before the handler (BGA-320). A session loaded from `--studio-session-file` is sent to Studio but omitted from value redaction (BGA-321). Own-account messages containing credential shapes outside four local regexes are returned raw (BGA-327). File loading is unbounded and accepts arbitrary file types while preflight publishes the absolute path (BGA-328).
- **Inherited policy blockers:** Studio HTTPS reads share the mapped-address bypass in BGA-323 and the ignored-cancellation/response-lifecycle defect in BGA-326. A successful live result cannot count as verification while those guards remain open.

### BGA-319 — Stop Studio preflight from publishing foreign actor names

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013, BGA-016, BGA-312, BGA-316
- **Deliverable:** Own-data-only enforcement across Studio tool results, setup reports, CLI stdout/stderr, launcher logs, and retained evidence.
- **Acceptance:** When retrieved lines belong only to undeclared accounts, diagnostics say generically that none match and may report bounded counts, but never names, identifiers, message fragments, or other foreign line content. The account configuration hint remains actionable without telling the operator which foreign name to copy. The same screening/redaction function protects every output surface before formatting.
- **Verification:** A seeded foreign actor, real-player line, prefix-collision name, credential, and unattributable line are absent byte-for-byte from MCP content, `check_setup`, `--studio-check` stdout/stderr, thrown errors, and a simulated CI artifact. Own-account content is returned only by `read_studio_logs` when explicitly enabled and configured.
- **Finding:** `src/studio/check.ts` builds `seen` from all parsed actors and interpolates it into “The page shows lines for …”; `INT-STUDIO-CHECK-PAGE` asserts that a foreign fixture name appears. This contradicts BGA-312 and `TM-STUDIO-OWN-DATA-ONLY`.

### BGA-320 — Use the Studio project name for Studio log reads

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-312
- **Deliverable:** Correct `read_studio_logs` to accept the exact Studio project identifier carried by the `game` parameter of `/studiogame`, matching the already string-based CLI preflight rather than assuming that value is numeric.
- **Acceptance:** The public `gameId` property remains for compatibility but is documented as the Studio project identifier copied from Manage Games. It accepts the observed `mcpverification`, rejects empty/whitespace input, and confines the value to the single `game` query parameter; it cannot alter scheme, host, path, or add parameters. Character/length restrictions come from official documentation or observed Studio validation, not guesses, and numeric project names are not rejected merely by inference. A missing project or the specifically observed wrong Play ID `15414` produces an actionable not-found/wrong-project result rather than empty output or an unrelated policy error.
- **Verification:** Pack and install the artifact, connect with a real MCP client, discover the tool, and call it against the dedicated project by name. A live scenario creates an own-account marker, retrieves only that marker, proves foreign/unattributable/credential-bearing lines absent, and cleans up. Packaged negatives cover the known wrong Play ID, empty/whitespace values, query delimiters, traversal-shaped input, and identical `--studio-check` behavior under every advertised protocol.
- **Finding, 2026-08-08:** The real Manage Games link is `/studiogame?game=mcpverification`. `/studiogame?game=15414`, where `15414` is this project's Play-link ID, says the project does not exist. A freshly installed real MCP client receives `gameId must be the numeric Studio game identifier` for the real project name; the permitted `15414` call made an authenticated request but returned `policy.output.too-large`, not an actionable wrong-project result.
- **Sources:** [First steps with BGA Studio](https://en.doc.boardgamearena.com/First_steps_with_BGA_Studio) documents `https://studio.boardgamearena.com/studiogame?game=<your_game>`; the dedicated-project observation above confirms the current live form.

### BGA-321 — Redact file-sourced Studio sessions at every output boundary

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-014, BGA-016, BGA-312
- **Deliverable:** Register the exact normalized session value resolved from every approved provider for redaction before it can reach an error, log, tool result, CLI report, or retained artifact.
- **Acceptance:** Environment and explicit-file providers have stated precedence and normalize once; the value actually sent is the value registered for redaction. The session value and cookie names never appear in text/structured tool content, thrown errors, stdout/stderr, launcher logs, or evidence. A path may be reported only through normal path redaction. No credential becomes a tool argument.
- **Verification:** Seed distinct structured Cookie headers through each provider, with separately unique names and values of at least 16 bytes per component, then force success, redirect, HTTP/DNS failure, timeout, invalid page, CLI preflight, launcher stderr, and simulated CI artifact paths. Every serialized surface is scanned byte-for-byte for each exact canary component and the complete header; the environment/file precedence cases prove the exact chosen value was protected.
- **Finding:** `studioSession()` reads and trims `studioSessionFile`, but `redactionOptions.secretValues` reads only `process.env.BGA_STUDIO_SESSION`. A synthetic file session was successfully resolved while the redaction list remained empty. The existing session-redaction test seeds only the environment provider.

### BGA-322 — Disable default cross-developer readonly access in the Studio test environment

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013
- **Deliverable:** Least-privilege source ACL setup for the dedicated Studio project, with a documented manual check unless BGA publishes a supported machine-readable mechanism.
- **Acceptance:** “Allow other studio developers to get readonly access to this project source code” is off before private project source is introduced. The exact account/project and observed checkbox state are recorded before every live run. If the state cannot be established through a supported mechanism, the check remains manual rather than scraping another undocumented page.
- **Verification:** Browser/manual evidence records the disabled control, and a distinct Studio developer account cannot discover or obtain project source. A live-harness precondition records/fails on the enabled or unknown state before any private source is seeded. Tests do not claim that this checkbox controls logs, tables, or credentials without separate evidence.
- **Finding:** A newly created BGA `Private` project had the readonly-sharing control checked by default. It currently contains only BGA's synthetic starter skeleton, so no private game source was disclosed during this review, but “Private” alone does not meet BGA-300's isolation acceptance.
- **Live setup evidence, 2026-08-08:** With explicit owner approval, the reviewer toggled the exact readonly-source control off, selected `Update`, reloaded `/studiogame?game=mcpverification`, and confirmed the `bga-checkbox--checked` class remained absent. This satisfies the current manual-state half of verification; the distinct-account denial and automated/manual harness precondition remain undone, so the item stays `ready`.

### BGA-323 — Normalize all IP encodings before SSRF address decisions

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015, BGA-207
- **Deliverable:** Standards-based address parsing/canonicalization that classifies the effective address, including every IPv4-mapped IPv6 representation, before a socket may connect.
- **Acceptance:** Loopback, private, link-local, unspecified, multicast, reserved, unique-local, scoped, mapped, compatible, compressed, mixed, and alternate textual forms are refused according to their normalized address. An unknown/unparseable form fails closed. DNS results are checked as resolved and the socket uses only an approved address.
- **Verification:** Unit vectors include dotted and hexadecimal mapped forms, compressed/mixed IPv6, zone indices, uppercase, leading-zero and invalid variants. Integration and installed-client harnesses prove the production resolver/lookup makes zero connection attempts for every non-public result and cannot substitute a second DNS answer.
- **Finding:** `blockedAddressReason` returned `null` for `::ffff:7f00:1`, `::ffff:a00:1`, and `::ffff:c0a8:101`, while Node recognizes all three as IPv6 and standards parsing maps them to `127.0.0.1`, `10.0.0.1`, and `192.168.1.1`. HTTPS certificate validation is a second barrier, but it does not satisfy the recorded post-resolution refusal.

### BGA-324 — Make documentation request privacy enforceable and honest

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015, BGA-202, BGA-207
- **Deliverable:** A request-origin/consent design or deliberately narrow query grammar that can enforce the documented promise about what may leave the machine, plus an honest residual-risk statement for what cannot be inferred from text.
- **Acceptance:** The server never claims it can determine whether arbitrary text originated in a project file by scanning for a short marker list. A model-generated request cannot silently transmit local source, identifiers, paths, game names, or secrets. Any explicit user-origin channel, allowlisted semantics, confirmation boundary, and remaining inference limit are machine-enforced and documented.
- **Verification:** Packaged adversarial inputs include plausible SQL, PHP without current markers, metadata values, state/action names, game-specific prose, encoded/whitespace variants, and ordinary BGA questions that must remain usable. Each prohibited request makes zero network attempts; approved requests prove their explicit origin/consent path.
- **Finding:** `requestContentViolation('SELECT unreleased_secret FROM internal_table')` returns no violation. The current implementation checks length, paths, controls, and eight syntax markers, which can catch obvious pastes but cannot establish provenance. This contradicts BGA-207's absolute “never project file content” acceptance as written.

### BGA-325 — Bound every serialized MCP result, including failures

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015, BGA-016
- **Deliverable:** One final publication-boundary budget applied to success and failure `CallToolResult` payloads after redaction, with bounded diagnostic details, a feasible configured minimum, and stable oversized-result behavior. The contract must state whether JSON-RPC framing is outside that server-owned payload budget.
- **Acceptance:** Startup rejects a configured budget smaller than the constant minimal error payload. No tool/resource result payload, validation failure, policy error, unexpected error, setup report, or structured content exceeds a valid configured limit. Reflected input is length-capped before formatting; the constant replacement failure never includes the rejected value. Transport framing is measured separately if it is not part of this limit.
- **Verification:** Every public capability is invoked through an installed real client with oversized valid and invalid input, nested error details, multibyte text, and the documented minimum/maximum budgets. Assertions measure `JSON.stringify(CallToolResult)` and, separately, the complete JSON-RPC frame where observable; they verify canary absence, stable error code, clean shutdown, and no retained oversized artifact.
- **Finding:** With `--max-output-bytes 64`, one real call returned a 12,162-byte failure containing a 12,000-character input. A fresh packed/installed reproduction measured `Buffer.byteLength(JSON.stringify(CallToolResult)) === 16574` and confirmed its unique marker survived. It did not measure the JSON-RPC envelope or assert every repeated tail character. Successful paths call `assertOutputWithinLimit`; shared failure publication does not.

### BGA-326 — Make operation deadlines cancel underlying work and network bodies

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015, BGA-207, BGA-312
- **Deliverable:** Cooperative cancellation from the public tool deadline through every filesystem read, traversal, parser loop, documentation/Studio request, response body, redirect, and cleanup path.
- **Acceptance:** A timeout aborts and awaits/quiesces the underlying operation; it does not merely win `Promise.race`. Callers must consume the provided signal or use an actually cancellable primitive. Redirect and non-2xx responses are destroyed or drained under the same byte/time budget before the request settles. No work, socket, timer, or child activity continues after the bounded cleanup window.
- **Verification:** A freshly packed/installed artifact runs deterministic slow filesystem, parse, 2xx, redirect, non-2xx, DNS, and Studio-body probes. Instrumentation proves zero further operations/bytes after timeout settlement, bounded cleanup, clean client/server shutdown, and no late output or artifact writes.
- **Finding:** `runWithTimeout` aborts a signal, but tool callbacks commonly ignore it. A 5 ms synthetic probe returned `policy.timeout.exceeded` while the operation still completed at 50 ms. In a fresh installed-client `inspect_project` probe, the timeout response arrived before any delayed `lstat` completed, then 28 filesystem operations completed during the next 350 ms. The driver took 4.41 seconds; final instrumentation after client close/process exit recorded 358 starts and 357 completions for the 500-file scan, showing shutdown—not operation cancellation—eventually interrupted it. The redirect/non-2xx continuation is a source-path finding: those bodies are resumed and settled without a bounded drain/destruction after the operation timer clears.

### BGA-327 — Minimize and redact successful public results

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-014, BGA-016, BGA-109, BGA-312
- **Deliverable:** A shared successful-output publication boundary that removes credentials, sessions, personal data, and unnecessary literal source content before text and structured results leave the process.
- **Acceptance:** Every public result is schema-preserving, data-minimized, and passed through context-aware redaction. Database diagnostics report the location/shape needed to fix a query without returning secret-bearing SQL literals. Own-account Studio messages still withhold any recognized credential or personal-data form. Text summaries cannot reintroduce values removed from structured content.
- **Verification:** Installed-client scenarios seed exact configured secrets and every known credential shape into SQL literals, Studio messages, errors, and nested structured fields. Arbitrary canaries are required only in fields the contract explicitly minimizes; ordinary project metadata and notification payloads remain usable unless they match a defined secret rule. Tool text, structured content, resources, stderr, and retained evidence are scanned byte-for-byte while useful non-secret diagnostics remain.
- **Finding:** `parseQueries` preserves complete SQL and `audit_database_usage` returns it verbatim; a synthetic password literal survived. `screenStudioLog` recognizes only email, lock, session-id, and PHPSESSID patterns, so an own-account `Authorization: Bearer ...` line was kept with its marker. Shared `redactValue` is applied to failure publication, not these successful results.

### BGA-328 — Harden Studio session-file loading and diagnostics

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-015, BGA-016, BGA-312, BGA-316
- **Deliverable:** A bounded, regular-file-only, least-privilege Studio session provider whose diagnostics never publish its private path.
- **Acceptance:** The provider refuses directories, devices, sockets, FIFOs, disallowed links/reparse points, and oversized/empty content before an unbounded read. On POSIX it enforces the expected owner and mode 0600. On Windows it enforces a documented ACL/reparse-point equivalent or refuses the file provider as unsupported. The read is cancellable and has a small explicit byte budget. Setup output says only that a configured file is present/missing; ordinary path redaction applies everywhere.
- **Verification:** Integration and packaged CLI probes cover POSIX 0600/wrong owner or mode, Windows secure/insecure ACL or explicit unsupported refusal, symlink/reparse point, FIFO/device where applicable, directory, oversized/growing file, unreadable/deleted file, timeout, relative-path resolution, and environment precedence. No absolute path or content appears in stdout/stderr, tool setup results, errors, or evidence; every probe cleans up safely.
- **Finding:** `studioSession()` performs unbounded `readFile` on any configured path without file-type, symlink, size, owner, or mode checks, and CLI preflight runs outside `runWithTimeout`. `--studio-check` also prints the absolute session-file path, and its integration test requires that disclosure.

### BGA-329 — Make the privileged-effect boundary non-bypassable

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015
- **Deliverable:** An allowlist/AST architecture check that makes `src/policy.ts` the only production module able to reach filesystem, network, subprocess, or equivalent privileged globals through any import spelling or loading form.
- **Acceptance:** Bare and `node:` specifiers, subpaths, aliases, namespace/require/dynamic imports, re-exports, repository-owned wrappers, `fetch`, WebSocket, worker/process primitives, and newly added effectful core modules cannot bypass the boundary. The rule applies to all production source and fails closed when a privileged primitive is unknown; dependency-wide effect analysis is not implied.
- **Verification:** Seeded source snippets for `fs/promises`, `node:dns`, `node:http2`, dynamic imports, alternate quote styles, re-exports, and global `fetch` each fail both lint and the repository gate. An allowed import in `policy.ts` passes; the current tree contains no runtime offender.
- **Finding:** ESLint blocks eight exact `node:` paths outside `policy.ts`; the repository test mirrors them with a single-quote `from` regex. Read-only lint probes reported no restricted-import error for `fs/promises`, `node:dns`, `node:http2`, or global `fetch`. No active production bypass was found, so this is a control-integrity defect rather than evidence of current exfiltration.

### BGA-330 — Make filesystem traversal entry-bounded and race-safe

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015
- **Deliverable:** Directory traversal and file reads that bound all encountered work/data and bind containment/type/size decisions to the exact object read rather than a reusable pathname.
- **Acceptance:** One cumulative budget counts files, directories, links, special entries, diagnostics, metadata bytes, and directory fanout before materialization/sort. Symlinks are never followed. Reads use no-follow/descriptor-relative or equivalent primitives, validate containment/type/size after open, stream under a byte cap, and detect replacement/growth without exposing outside-root content.
- **Verification:** Installed-client fixtures include link storms, empty-directory storms, huge single directories, deep trees, special files, concurrent rename/symlink swaps, and file growth/replacement between checks. Each stays within operation/output budgets, reports truncation truthfully, makes no outside-root read, and cleans up. A synchronization hook/barrier forces each rename or growth exactly between check and open; stress repetition is secondary evidence, not the race oracle.
- **Finding:** `listProjectFiles` reads and sorts a whole directory, appends every symlink, recurses every directory, and counts only regular files. With `maxEntries: 1`, an existing directory returned zero files, four skipped links, and `truncated: false`. File reads separately realpath a pathname, then later `lstat` and `readFile` it; a concurrent intermediate-directory swap or file replacement can invalidate containment/size decisions. The resource-exhaustion defect is reproduced; the TOCTOU escape is a static race finding requiring concurrent project write access.

### BGA-307 — Build the live Studio E2E harness

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-005, BGA-012, BGA-300, BGA-301, BGA-319, BGA-320, BGA-321, BGA-322, BGA-323, BGA-326, BGA-327, BGA-328
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
- **Note:** The 2026-08-07 [Studio boundary review](verification/STUDIO_BOUNDARY_REVIEW.md) found no documented interface for this — it is a web page — so building it means driving an authenticated session, which is an explicit non-goal. Left `planned` rather than rejected: the research question is still open if BGA publishes an API, but nothing should be built on the current evidence.

### BGA-309 — Implement verified test-table workflows

- **Status:** planned
- **Priority:** P3
- **Depends on:** BGA-307, BGA-308
- **Deliverable:** Only the test-table operations approved by BGA-308, each as a separate manifest capability.
- **Acceptance:** Operations are isolated to the test project/accounts, explicitly mutating, idempotent where possible, bounded, and always stop/clean up created tables.
- **Verification:** Each operation receives its own live E2E success, invalid-input, wrong-target, interruption, repeat, and cleanup scenarios.
- **Note:** The 2026-08-07 [Studio boundary review](verification/STUDIO_BOUNDARY_REVIEW.md) found no documented interface for this — it is a web page — so building it means driving an authenticated session, which is an explicit non-goal. Left `planned` rather than rejected: the research question is still open if BGA publishes an API, but nothing should be built on the current evidence.

### BGA-310 — Research and implement player-perspective workflows

- **Status:** planned
- **Priority:** P3
- **Depends on:** BGA-308, BGA-309
- **Deliverable:** A feasibility decision followed, only if approved, by safe access to allowed test-player perspectives.
- **Acceptance:** No real player impersonation or session leakage; behavior is confined to Studio test accounts and documented interfaces.
- **Verification:** Live E2E proves identity boundaries, allowed perspective switching, rejection of non-test users, and session redaction.
- **Note:** The 2026-08-07 [Studio boundary review](verification/STUDIO_BOUNDARY_REVIEW.md) found no documented interface for this — it is a web page — so building it means driving an authenticated session, which is an explicit non-goal. Left `planned` rather than rejected: the research question is still open if BGA publishes an API, but nothing should be built on the current evidence.

### BGA-311 — Research and implement saved-state workflows

- **Status:** planned
- **Priority:** P3
- **Depends on:** BGA-308, BGA-309
- **Deliverable:** A feasibility decision followed, only if approved, by save/restore operations for isolated test tables.
- **Acceptance:** Slots and table ownership are explicit; restore cannot target another table; test cleanup restores or ends the table safely.
- **Verification:** Live E2E saves, mutates, restores, verifies exact state, rejects cross-table restore, handles unavailable/ended states, and cleans up.
- **Note:** The 2026-08-07 [Studio boundary review](verification/STUDIO_BOUNDARY_REVIEW.md) found no documented interface for this — it is a web page — so building it means driving an authenticated session, which is an explicit non-goal. Left `planned` rather than rejected: the research question is still open if BGA publishes an API, but nothing should be built on the current evidence.

## Phase 4 — Public release and maintenance

### BGA-400 — Publish installation and removal guides

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-003, BGA-009
- **Deliverable:** Verified setup, configuration, troubleshooting, update, and removal instructions for each supported MCP client and platform, including a first-run walkthrough that states the supported layouts and what a modern-layout project will and will not get today.
- **Acceptance:** Commands use released artifacts, explain permissions and data flow, and never require copying secrets into agent prompts.
- **Evidence:** [INSTALL.md](INSTALL.md) covers installing, pointing a client at the server, checking it worked, updating, removing, and the failures a developer actually hits, each with its stable error code. Every option is listed with what it enables **and what it costs** — which data leaves the machine, and what the experimental one risks — rather than as a flag list. Removal is three steps and says plainly that the server itself writes nothing outside its directory. The guide refuses to publish a general live Studio credential recipe while BGA-312's blockers remain open and never tells the reader to paste a session into a prompt or launcher configuration. The first-run path leads with the case where a 2025-era client advertises its roots and no configuration is needed at all; modern/hybrid and 2026 limitations are explicit.
- **Note:** `implemented`, not `verified`. Installation is from a git clone because no package is published yet: BGA-403 changes that, and the commands here change with it. Per-client instructions wait on BGA-401's smoke matrix, since this project should not claim a client works before testing it — the guide describes what any stdio client needs and does not name clients it has not run against.
- **Verification:** Fresh-environment E2E follows each guide verbatim from install through capability call and clean removal.
- **Adversarial finding, 2026-08-08:** The packed artifact excludes `docs/`, but its installed README and CLI help point there. The README also says seven tools and three resources while real discovery returns ten tools and eleven concrete resources. The canonical `AGENTS.md` description additionally said the server “never opens a network connection” after opt-in documentation and Studio reads existed; the review corrected the immediate wording, and BGA-411 owns a durable documentation/inventory drift gate.

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

### BGA-411 — Make public and agent-facing documentation self-contained and inventory-derived

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-003, BGA-006, BGA-400
- **Deliverable:** A packed artifact whose README/help links resolve for an installed-package reader and whose public/canonical agent-facing capability inventory and boundary descriptions are generated or checked against real MCP discovery and policy configuration.
- **Acceptance:** Every relative path in the packed README exists in the tarball; alternatively, repository-only material uses an absolute, versioned public URL. CLI help never tells an installed user to read a file the package omits. Tool, resource-template, concrete-resource, prompt, stability, network, and experimental counts are derived from the manifest plus packaged discovery, with the distinction between templates and concrete listed resources stated. README, install/help text, and `AGENTS.md` agree that network access is off by default—not absent—and identify the explicitly enabled network surfaces. None calls an implemented or experimental capability verified.
- **Verification:** An isolated consumer installs the tarball, resolves every local Markdown/help path, follows one install and one removal flow, discovers the server, and compares all documented names/counts/stabilities with the client response and packed manifest. A seeded missing file and stale count each fail.
- **Finding:** The audited tarball contained README.md but no `docs/`; all README links to installation, testing, backlog, compatibility, threat model, and verification records were broken locally. Discovery returned 10 tools and 11 concrete resources, not the documented 7 and 3. The canonical agent instructions also retained the obsolete absolute claim that the server never opens a network connection.

## Coverage map

This map makes omissions visible when source documents evolve.

| Commitment source                                 | Backlog coverage                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Project goals and developer workflows             | BGA-001, BGA-100 through BGA-128, BGA-200 through BGA-211, BGA-313 through BGA-330                            |
| Local stdio MCP deployment                        | BGA-002, BGA-003, BGA-010, BGA-011, BGA-017, BGA-318, BGA-325, BGA-326                                        |
| Public MCP tools and resources                    | BGA-006, BGA-102 through BGA-128, BGA-202 through BGA-211, BGA-303, BGA-304, BGA-312, BGA-320 through BGA-330 |
| Diagnostic schema and uncertainty                 | BGA-007, BGA-017, BGA-101, BGA-106 through BGA-128                                                            |
| Modern and legacy compatibility                   | BGA-008, BGA-009, BGA-100, BGA-101, BGA-117 through BGA-128                                                   |
| Documentation provenance and currency             | BGA-200 through BGA-211, BGA-313, BGA-408                                                                     |
| Local-first, read-only, narrow permissions        | BGA-013 through BGA-018, BGA-114, BGA-319, BGA-323 through BGA-330                                            |
| Credentials, SFTP, sync, and logs                 | BGA-300 through BGA-307, BGA-319 through BGA-322, BGA-327, BGA-328                                            |
| Test tables, player perspectives, saved states    | BGA-308 through BGA-311                                                                                       |
| Unit, integration, conformance, E2E, and evidence | BGA-004 through BGA-012, BGA-017, BGA-018, BGA-128, BGA-307, BGA-407                                          |
| Security, secrets, data handling, telemetry       | BGA-013 through BGA-018, BGA-300, BGA-301, BGA-319 through BGA-330, BGA-405, BGA-406, BGA-410                 |
| Packaging, clients, versioning, releases          | BGA-400 through BGA-411                                                                                       |
| Optional remote documentation transport           | BGA-409                                                                                                       |

## Explicitly preserved non-goals

The following are not implementation backlog items unless a future documented decision changes project scope:

- Fully autonomous game implementation or release.
- Generic source editing or Git hosting operations.
- Hosting or redistributing publisher artwork.
- Scraping private projects or bypassing BGA access controls.
- Depending on undocumented Studio endpoints for core functionality.
