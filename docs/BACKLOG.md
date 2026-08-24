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

Release work is deliberately serialized. Only the first unfinished item in the queue below should be implemented; the next item does not start until the current item has its backlog evidence updated and `pnpm check` passes on the resulting tree. Exact-commit CI and live/external verification may leave an item `implemented`, but that is not permission to batch the next item's code into the same change.

The first public release queue is:

1. `BGA-422` — clear current toolchain advisories and add a release advisory gate.
2. `BGA-403` — rerun the reproducible, non-publishing release-candidate pipeline against the restored inventory.
3. `BGA-404` — signatures and provenance.
4. `BGA-407` — per-release evidence artifact.
5. `BGA-400` — candidate-based install and removal guides.
6. `BGA-401` — supported-client smoke matrix.
7. `BGA-411` — self-contained, inventory-derived public documentation.
8. `BGA-406` — private vulnerability reporting.
9. `BGA-408` — BGA framework change process.
10. `BGA-405` — security review of the exact signed candidate.
11. `BGA-415` — publish and independently reinstall the first release.

This queue does not include BGA-320's live Studio marker, BGA-324's documentation-request privacy decision, or BGA-328's second-account ownership proof. They remain real backlog items for later documentation or Studio integration releases, but are not blockers for a local-only first release. If BGA-414 includes any affected capability after all, its existing owner re-enters the queue before release; it may not be waived or relabeled as verified.

### Adversarial review reopening — 2026-08-23

The exact `main` checkout at `2822480` passed all 572 tests and every configured gate, but an isolated install exposed a different server from the one the release scenario exercised. Fresh, minimal source cases also reproduced false validator findings that the existing unknown-syntax and modern-framework scenarios claimed to exclude. BGA-416 through BGA-423 own the new findings. BGA-414 is reopened, and no release candidate may advance until BGA-416 through BGA-420 and BGA-422 restore the selected capability set and public executable.

This review also found that the existing documentation owner, BGA-411, already covers several current stale/broken install statements, so those findings extend that item instead of receiving a duplicate ID. BGA-421 and BGA-423 concern the development-only Studio check and opt-in documentation surface respectively; they are real issues but do not enter the local-only first-release queue.

### Adversarial review reopening — 2026-08-08

The [installed-package adversarial review](verification/ADVERSARIAL_REVIEW_2026-08-08.md) challenged every completion claim against the policy that created it. It made these existing items `implemented`, not `verified`:

- **Foundation evidence:** BGA-005, BGA-006, BGA-007, BGA-008, BGA-009, and BGA-012 through BGA-016. Their implementation remains, but required CI, packaged-boundary, conformance, current-record, policy, output-safety, or privacy evidence is absent or contradicted.
- **Local public boundary:** BGA-100 and BGA-102 through BGA-114. Their advertised behavior exists, but one or more literal verification cases are missing, and the validator family is downstream of observed false-certainty parser defects.
- **Modern, hybrid, and first-run claims:** BGA-116 through BGA-123. The modern fixtures omit common documented forms, the installed package misclassifies several of those forms, hybrid/default-root coverage does not reach every capability, and the 2026 protocol-era roots flow is not implemented.

The review added BGA-017, BGA-018, BGA-124 through BGA-128, BGA-209 through BGA-211, BGA-318 through BGA-330, and BGA-411 as permanent owners. A status may move back to `verified` only after its own original acceptance criteria and the applicable new owner both pass; closing a new bug without restoring the reopened item's evidence is not enough.

### Restored on 2026-08-09

The correctness owners of the 2026-08-08 review — BGA-124 through BGA-128 — passed, and BGA-017 replaced the evidence system that let a claim stand on less than it named. [CI run 31330457842](https://github.com/Brandon-Born/bga-mcp/actions/runs/31330457842) then passed the six-job matrix on `af34a07`, the commit that restored those claims.

The reopened Phase 1 items and the foundation-evidence items they depended on are `verified` again. Each acceptance case of the local capabilities is mapped in [`config/acceptance-map.json`](../config/acceptance-map.json) to the installed-package assertion that proves it, and `pnpm verify:acceptance-map` fails if any of them stops being proven where it claims to be.

### Documentation and address corrections — 2026-08-09

BGA-209, BGA-210, and BGA-323 are `verified`: [CI run 31334309936](https://github.com/Brandon-Born/bga-mcp/actions/runs/31334309936) passed the six-job matrix on `213deaa`, and each item's acceptance cases are mapped in [`config/acceptance-map.json`](../config/acceptance-map.json) to the installed-package assertion that proves them. The capabilities they correct — `search_bga_docs`, `bga://docs/{topic}`, `bga://framework/version`, and `read_studio_logs` — stay `implemented` and `experimental`: BGA-324 through BGA-328 hold recorded defects open against the boundaries they run on, and a capability is not verified while a control it depends on is.

That run is also the first to evaluate the CI-evidence rule at all. Every earlier run answered it from a shallow checkout that did not contain the commit being asked about; BGA-005 records the correction.

Three of the reopened items stay `implemented`, each for a reason of its own rather than for want of coverage:

- **BGA-011** — official conformance covers `2025-11-25`; the pinned CLI has no stdio scenarios for `2026-07-28`, so no capability claims that revision.
- **BGA-013 and BGA-016** — BGA-018 owns the machine/human threat-model agreement and the privacy surfaces beyond a tool response; the packaged error and redaction cases are proven, the boundary agreement is not.
- **BGA-014 and BGA-015** are unchanged by this work and keep their own evidence requirements.

### Threat-model agreement and Studio output surfaces — 2026-08-09

BGA-018 and BGA-319 are `implemented`. The threat model and its document are now compared field by field rather than by identifier, and the model records the five places the server can publish so a control that covers one of them cannot read as covering the data. The Studio preflight that named the developers whose lines it had just withheld no longer does; one publication function screens every Studio surface, and the installed artifact is driven through all of them with canaries that appear nowhere else.

Neither is `verified` yet: both need a passing CI run of the commit that carries them, which BGA-005 requires and which no local run can supply. BGA-013 and BGA-016 stay `implemented` for the same reason and for their own remaining owners — BGA-321, BGA-327, and BGA-328 still hold output-surface defects open.

The composition then invalidated a claim, which is what it is for. TB-OUTPUT is crossed by every capability rather than only by the ones that name it, successful results are still not passed through redaction, and so no local tool or resource may call itself `verified` while `AC-SECRET-IN-OUTPUT` can publish through `SURFACE-TOOL-RESULT`. All ten that claimed `verified` in [`config/capabilities.json`](../config/capabilities.json) are now `implemented`, and BGA-327 is what restores them.

The backlog items that own those capabilities keep their statuses: their acceptance criteria are about the behavior they specify, and each remains proven by the assertion recorded in [`config/acceptance-map.json`](../config/acceptance-map.json). What changed is the advertised stability of the capability, which is a separate claim and the one the open surface contradicts. The alpha has no released capability to withdraw.

### Successful results now leave through one boundary — 2026-08-10

BGA-327 is `implemented`. Successes are published the way failures already were: [`src/publish.ts`](../src/publish.ts) parses a result against its schema, redacts it, parses it again, renders the summary from the redacted structure, redacts that, and measures the budget last. A query's values are masked where the documentation says values live — inside single quotes — so `audit_database_usage` reports the shape that makes a query fixable without the password that was in it, and the Studio screen decides what a credential is from the shared rules rather than from four patterns of its own.

`TM-SUCCESS-OUTPUT-REDACTION` and `TM-STUDIO-SUCCESS-REDACTION` move from `planned` to `implemented`, and thirteen of the model's eighteen output surfaces are protected. `AC-SECRET-IN-OUTPUT` can no longer publish through `SURFACE-TOOL-RESULT`, which is the open surface that demoted all ten local capabilities on 2026-08-09; the five that remain open belong to BGA-301, BGA-321, and BGA-328 and are Studio-boundary surfaces rather than universal ones.

Nothing here becomes `verified`. Every capability's stability stays where it is until CI passes on the commit that carries this work, which BGA-005 requires and no local run can supply.

### Every payload is bounded now, not only the ones a handler wrote — 2026-08-10

BGA-325 is `implemented`. The 12,162-byte refusal the review recorded is reproduced, along with two more of its kind, and all three are bounded: a failure now descends a ladder that always ends in something small enough to send, a resource failure runs the same ladder, and the transport applies the budget once more to what the protocol library produced before any handler ran. Reflected input is capped on its way into a detail, and a budget too small to hold the shortest failure is refused at startup rather than accepted.

`TM-POLICY-FINAL-OUTPUT-LIMIT` moves from `planned` to `implemented`, and `RR-POLICY-NO-TOOL-EVIDENCE` loses the failure-budget half of what it carried. BGA-326, BGA-329, and BGA-330 still hold the rest.

### The session that is sent is the session that is protected — 2026-08-10

BGA-321 is `implemented`. A session is normalized once and registered for redaction in the same step that returns it, as the whole header and as each of its parts, so the file provider can no longer be sent while the redaction list stays empty. Precedence is stated: an explicitly configured file wins, and one that fails means no session rather than a silent fall back to the environment.

`TM-STUDIO-FILE-SESSION-REDACTION` moves from `planned` to `implemented`, and fourteen of the model's eighteen output surfaces are protected. `AC-STUDIO-FILE-SESSION-LOG` can still reach `SURFACE-CLI-STDOUT`, which is BGA-328's, together with the unbounded read of the file itself.

### The demoted capabilities are verified again — 2026-08-10

[CI run 31439224886](https://github.com/Brandon-Born/bga-mcp/actions/runs/31439224886) passed the six-job matrix on `41b6e72`, which carries BGA-327, BGA-325, and BGA-321. With `AC-SECRET-IN-OUTPUT` no longer able to publish through `SURFACE-TOOL-RESULT`, the composition that demoted ten capabilities on 2026-08-09 no longer reaches them, and the gate accepts them as `verified` again: `audit_database_usage`, `inspect_project`, `run_pre_release_audit`, `validate_action_contracts`, `validate_notifications`, `validate_project`, `validate_state_machine`, and the three `bga://project/*` resources.

Nothing else moved. `check_setup` and the documentation capabilities keep the `implemented` status they had before the demotion, for their own reasons rather than for this one, and `read_studio_logs` stays `experimental` with BGA-320, BGA-322, BGA-326, and BGA-328 open against it.

### The credential file gets the checks a credential deserves — 2026-08-10

BGA-328 is `implemented`. The session file is opened `O_NOFOLLOW | O_NONBLOCK` and judged on the descriptor: a regular file, owner-only permissions, owned by this account, non-empty, and under 4096 bytes, with the read bounded by the size measured on that same descriptor. A symbolic link is refused by the kernel, a FIFO returns instead of hanging, and on Windows — where neither flag exists and reading an ACL would mean shelling out from inside the credential path — the provider is refused as unsupported rather than pretending to have checked. The diagnostics say which provider and never which file.

`TM-STUDIO-FILE-SESSION-BLOCKED` moves from `planned` to `implemented`, and fifteen of the model's eighteen output surfaces are protected. The three that remain belong to BGA-301, on the synchronization boundary nothing is built on yet.

The gate that proves this rule had to be fixed too. Its seeded defect claimed `verified` for a capability on a boundary that happened to have an open surface; with BGA-321 and BGA-328 closing the last of them, the seed stopped failing and the gate stopped being able to demonstrate its own rule. It now opens a surface as part of the seed, so it demonstrates the rule on the day the rule matters rather than only while something is outstanding.

### The effect boundary is a rule about syntax now, not about spelling — 2026-08-10

BGA-329 is `implemented`. The privileged-effect check parses each production module and refuses every form that can name one: a bare specifier, a `node:` specifier, a subpath, a re-export, `import()`, `require()`, `import x = require()`, and the globals that reach the network without importing anything. The builtin list is an allowlist of twelve pure modules, so it fails closed on a module nobody has considered. ESLint expresses the same rule for immediate feedback, and a third case compares the two so the fast one cannot quietly become the laxer one.

`TM-POLICY-COMPLETE-EFFECT-GATE` moves from `planned` to `implemented`, and `RR-POLICY-NO-TOOL-EVIDENCE` loses another of the four gaps it carried. BGA-326 and BGA-330 hold the rest.

### The walk pays for what it touches — 2026-08-10

BGA-330 is `implemented`. One budget counts every entry encountered rather than the files that survive, directories are read lazily so a huge one can be stopped before it is all in memory, and a listing cut short says so. Skipped links are counted always and named up to a cap, because the counts are work and the names are output.

A file read is now bound to the object it opened: `O_NOFOLLOW`, type and size from the descriptor, containment tied to it by device and inode, and a read that asks for one byte past the budget so growth is detected rather than quietly truncated.

`TM-POLICY-OBJECT-BOUND-READS` moves from `planned` to `implemented`, and `RR-POLICY-NO-TOOL-EVIDENCE` is down to its last gap, which BGA-326 owns. What Node cannot express is recorded rather than implied: `RR-POLICY-TRAVERSAL-OPENAT` states that without `openat` an intermediate-directory swap is caught after the fact rather than made impossible.

**Correction, 2026-08-13:** The identity and growth conclusions above were too strong. If an intermediate directory is replaced by an outside-root link before `open`, both the open and the later pathname `stat` can select the same outside object and pass the comparison. The extra-byte read also compared only with the configured maximum, not the descriptor's measured size, so ordinary growth could be returned or silently truncated. `TM-POLICY-OBJECT-BOUND-READS` now names only the stable-path and cumulative-budget behavior the existing scenario establishes; `TM-POLICY-SINGLE-SWAP-REFUSAL` owns the forced-race proof.

**Repair, 2026-08-13:** File reads now compare pre-open pathname identity with descriptor identity, re-check post-open containment and pathname identity against that descriptor, require the exact descriptor size followed by EOF, and re-stat before returning. Directory traversal compares identity around `opendir` before consuming entries. `INT-POLICY-SINGLE-SWAP-REFUSAL` and `INT-POLICY-POST-STAT-GROWTH-REFUSAL` deterministically force an intermediate-directory swap, a configured-directory replacement, and post-stat growth against `PolicyBoundary`; each returns `policy.path.symlink-escape` without marker content. BGA-413 now carries the same three windows through an installed package and real MCP client; exact-HEAD CI remains outstanding, so the status stays `implemented` rather than `verified`.

### Deadlines start cancelling, and one half of it is proven — 2026-08-10

BGA-326 stays open, with most of its code in place. A deadline now hands its signal to the traversal, the file reads, and the validator aggregate, and waits — within a bounded window — for the aborted work to stop before publishing the failure. Documentation bodies that will never be read are destroyed rather than drained, and a socket the deadline abandoned is closed.

The network half is proven from the far end: the stub records a closed socket rather than four megabytes it was allowed to finish writing, and putting `resume()` back fails the case. `TM-DOC-RESPONSE-LIFECYCLE` is `implemented` on that.

**Correction, 2026-08-13:** That oracle inspected the socket only after `withPackagedServer` had closed the client and MCP process. Process exit could therefore produce the observed socket close, and the roughly five-second duration is consistent with shutdown rather than deadline abort. Documentation and Studio callers also discarded the callback signal. `TM-DOC-RESPONSE-LIFECYCLE` is planned again until the same live server is observed after settlement and the signal reaches the real request/body path.

**Re-established, 2026-08-13:** The installed-package oracle now observes the far end for 350 ms after the timeout result while the same MCP client remains alive, then calls `check_setup` through that client. Documentation search, both documentation resources, and Studio reads pass one signal into DNS, every redirect hop, the guarded request, and the bounded body reader. Signalled requests use a resolver instance owned by that request and cancel only it. Stalled 2xx, redirected, non-success, DNS, documentation-resource, and Studio-body cases show no new requests or bytes after settlement. `TM-DOC-RESPONSE-LIFECYCLE` and the narrower `TM-STUDIO-READ-NETWORK-CANCELLATION` are implemented on that evidence; full policy and Studio cancellation remain planned for the complete native-filesystem matrix.

**Filesystem and parser progress, 2026-08-13:** A test-only module loaded before the installed policy module binds its imports delays `lstat` and descriptor `read`. `E2E-FILESYSTEM-CANCELLATION` proves the public timeout awaits each issued operation, emits no late filesystem event, and leaves the same client responsive. Production parsing carries a monotonic deadline through the project, rule, documentation, and Studio loops. BGA-412 now proves the checkpoint through the packed artifact with a deterministic non-yielding JSONC scan and mutation control. The remaining evidence is deliberately narrower than `E2E-POLICY-CANCELLATION`: Node cannot cancel an already-issued native filesystem syscall, and the installed probe does not cover every primitive.

### The documentation filter says what it is — 2026-08-10

BGA-324 stays open, and stops overclaiming. The request filter recognizes pastes by shape — a path, control characters, an over-long query, source syntax — and it cannot tell where ordinary-looking text came from. The tool description said the opposite, near enough that a reader would trust it with project content, and it now says the limit plainly instead. `RR-DOC-QUERY-PROVENANCE` records what a shape filter cannot do.

What is left in the item is a decision rather than a defect: an explicit user-origin channel, or a grammar narrow enough to enforce the promise. Either changes what a developer can search for, and the maintained retrieval evaluation is what measures that cost, so it is the owner's call rather than an implementation detail.

### A live Studio run, and the identifier it settles — 2026-08-10

A browser session on the owner's own account, driven through the Chrome extension, answered the two questions that needed a live Studio to answer. No cookie was read, printed, or copied: the pages were observed in a browser already signed in, which is the whole of what a browser run can safely contribute.

BGA-320 is `implemented`. `/studiogame?game=mcpverification` is the project and `/studiogame?game=15414` is not — Studio answers the numeric Play ID with a 200 and "The project doesn't exist or you don't have access to it". The schema now takes the project name, shaped by Studio's own creation rule rather than by a guess, and both the tool and the preflight read that sentence and say the project is absent instead of returning an empty log.

BGA-322 stays `ready`, with its precondition re-checked: the readonly-source control on the dedicated project is still unchecked. What that item still needs is a second developer account to prove the denial, and a harness precondition that records the state before every live run — neither of which a browser observation can stand in for.

### The live run that answered the Studio question — 2026-08-10

The owner supplied a session through a protected file and the packed artifact was driven against the real Studio, through a real MCP client, on the dedicated project. The session reached the server as a path, never as a value: it was not read, printed, or copied into any transcript, and the run's own check confirmed no component of it appears in the result, the structured content, or stderr.

What worked: the file provider resolved and authenticated, the project identifier resolved, and the tool was discovered and called through the installed package. What the run then established is that the capability cannot work as designed.

`/studiogame?game=<project>` answers with **3,113,458 bytes that are 99% `<script>`**. It contains no line matching the documented log shape, no project data, and no "doesn't exist" sentence — and it is the same shell, to within the length of the name, for a project that exists and one that does not. The log a developer reads in a browser is rendered there by the page's own scripts. It is not in the HTML this tool fetches, and no budget, parser, or project state changes that.

Three defects surfaced on the way and are fixed: the page exceeded the documentation byte ceiling and then a raised one, so the Studio read has its own measured budget; a withheld value as short as one digit was replacing every digit in the report, so withheld values now carry the same length floor as every other by-value redaction; and page furniture was being counted as unreadable log lines, so only text that begins like a log line is treated as one. The tool now refuses with a plain statement of the limit rather than returning "0 log line(s)", which was a claim about the developer's project when the truth was a claim about the reader.

BGA-306 and BGA-312 are `blocked` on that evidence. Reading these logs would need a browser or an undocumented data endpoint, and the roadmap has already ruled both out for test tables and player perspectives for the same reason. Withdrawing the capability is the owner's call, and the recommendation is recorded in BGA-306.

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
- **Correction, 2026-08-09:** [Run 31331622708](https://github.com/Brandon-Born/bga-mcp/actions/runs/31331622708) failed all six jobs on a commit whose gates passed locally: every capability advertised as `verified` was reported as pointing at "a run of a commit outside this history". The checkout was shallow, so the recorded run's commit was not in the clone at all and the ancestor check answered a question it had no data for. CI now checks out the full history, and the evidence emitter distinguishes a commit this checkout does not hold — reported as `unknown`, with a message saying to fetch the history — from one that genuinely belongs to another line of work. `GATE-EVIDENCE-COVERAGE` covers the three outcomes. The gate was right to fail; what it said was not what was wrong.

### BGA-006 — Define the machine-readable capability manifest

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-002
- **Deliverable:** A versioned schema and manifest for every tool, resource, prompt, transport, adapter, stability level, compatibility claim, and required scenario.
- **Acceptance:** Runtime discovery and the manifest can be compared automatically; duplicate names, missing scenarios, unsupported stability values, stale capability entries, and compatibility fields that contradict the supported matrix or the scenarios a capability requires fail validation.
- **Verification:** Manifest-gate E2E starts the packaged server, discovers capabilities, and proves exact agreement with the manifest, including seeded name, stability, scenario, protocol, and layout mismatch failures. A capability that drops a supported layout while its compatibility claim and installed-package scenarios retain that layout must fail the gate.
- **Evidence:** The packed `config/capabilities.json` and schema pass runtime comparison in packaged E2E; `tests/unit/manifest.test.ts` proves seeded schema, duplicate, and stale entries fail.
- **Reopened, 2026-08-13:** Every project capability in [`config/capabilities.json`](../config/capabilities.json) names only `legacy-flat`, while the machine-readable compatibility matrix declares modern and part-migrated layouts supported and the manifest's own required scenarios exercise those layouts. `corepack pnpm check` and exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) both passed with that contradiction. Runtime discovery can prove that a capability exists, but it does not expose layout semantics, so the present manifest gate cannot detect the false omission. BGA-017 owns the missing composition rule; this item cannot return to `verified` until the fields agree and a seeded omission fails.
- **Implemented, 2026-08-13:** All ten project-aware tools and resources now advertise `legacy-flat`, `modern-modules`, and `part-migrated`; layout-independent capabilities remain empty. The supported layout, local-environment, and protocol claims independently list the capabilities they apply to, and a required scenario shared by a claim and capability independently requires that mapping, so deleting the mapping and manifest field together cannot redefine the expected set. `pnpm verify:compatibility` and `GATE-COMPATIBILITY-MATRIX` compare those claims with every capability and seed an omitted layout, an overclaimed layout, a coordinated mapping/field omission, environment drift, protocol drift, and an unknown capability reference before accepting the repository. This item remains `implemented` until exact-commit CI passes the change.

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
- **Evidence:** [`config/compatibility.json`](../config/compatibility.json) and [COMPATIBILITY.md](COMPATIBILITY.md) hold 20 claims, 14 currently supported. See the [safety and compatibility milestone](verification/SAFETY_MILESTONE.md). `pnpm verify:compatibility` seeds a missing fixture, an undocumented claim, a protocol claim beyond `SUPPORTED_PROTOCOL_VERSIONS`, an unknown capability reference, a supported-layout omission and overclaim, environment drift, and protocol drift, and fails on each before passing the real matrix. `pnpm verify:scenarios` proves every claimed scenario exists.

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
- **Scope correction, 2026-08-13:** The suite now reaches the real artifact: [`tests/fixtures/conformance-stdio-proxy.ts`](../tests/fixtures/conformance-stdio-proxy.ts) spawns `dist/cli.js` per session and relays frames, replacing an in-process adapter that measured a factory. The exact `0.2.0-alpha.11` pin supplies the frozen requirement sets and is reviewed rather than floated. The supported public contract now names only `2025-11-25` over stdio, and that entire claimed matrix is covered by the official suite. BGA-318 has since implemented the `2026-07-28` MRTR path and packaged stdio E2E, but the revision remains an observed `unknown` compatibility claim because the official suite exposes no applicable stdio mode; it is not a second supported version that can keep BGA-011 open. This item remains `implemented` only until the current exact-head full gate and six-job CI establish the corrected scope, after which it can move to `verified` without waiting for a hypothetical stdio mode in the 2026 conformance suite.

### BGA-012 — Define and emit verification evidence

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-005, BGA-006, BGA-010, BGA-011
- **Deliverable:** A machine-readable evidence schema and CI artifact containing commit, package version, lock digest, environment, protocol version, scenario results, and timestamps.
- **Acceptance:** Evidence maps every manifest capability to current results, is reproducible, and contains no credentials or private BGA data.
- **Verification:** Schema validation, manifest coverage, tamper checks, and artifact redaction all run as release gates.
- **Evidence:** See the [verification evidence record](verification/VERIFICATION_EVIDENCE.md). [`config/evidence.schema.json`](../config/evidence.schema.json) describes the document; `pnpm evidence` writes `.artifacts/verification-evidence.json` at the end of `pnpm check` and `pnpm verify:evidence` checks it, both wired into the complete gate and the CI artifact upload. The document records the commit and whether the tree was clean, the package version and lock digest, the Node version and platform, the supported protocol versions and every conformance check, and each manifest capability with the result of every scenario it requires, down to the test file and title. A scenario with no test in the run is recorded as `missing` rather than omitted, and a capability advertised as `verified` whose evidence is anything less fails the gate. `integrity` seals the document with a digest over a canonical serialization, so a later edit is detectable. The emitter refuses to write a document containing a known credential format and the gate scans it again. `pnpm verify:evidence` builds five defective documents — wrong schema version, dropped capability, scenario that did not run, field edited after sealing, credential in a test title — and requires itself to reject each before reporting on the real artifact. `GATE-EVIDENCE-COVERAGE`, `GATE-EVIDENCE-TAMPER`, and `GATE-EVIDENCE-REDACTION` cover the same properties as executable tests, owned by the new `AC-FALSE-VERIFICATION` abuse case and by `TM-ARTIFACT-SCAN`.
- **Note:** The first version of this artifact listed two versions beside one conformance run under a single `passed`, which read as if both had been exercised. Coverage is now per version, `partial` is distinct, and the gate rejects a document whose overall word is stronger than its per-version results. The supported transport and public capabilities claim only `2025-11-25`; the packaged 2026 handshake/discovery smoke is retained as observed behavior, not release support. BGA-011 therefore awaits current exact-head evidence for the corrected one-version scope rather than nonexistent 2026 stdio conformance. Signing and per-release publication are BGA-404 and BGA-407.

### BGA-013 — Complete the initial threat model

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-001, BGA-002
- **Deliverable:** A threat model covering local file access, symlinks and traversal, tool arguments, subprocesses, documentation content, SFTP, browser sessions, logs, credentials, supply chain, and MCP-client trust.
- **Acceptance:** Assets, actors, trust boundaries, abuse cases, mitigations, residual risk, and test requirements are recorded. Networked and mutating capabilities cannot start before their boundary is reviewed.
- **Verification:** Each required mitigation maps to an automated negative or security scenario, or to an explicit manual control with an owner.
- **Evidence:** [THREAT_MODEL.md](THREAT_MODEL.md) and [`config/threat-model.json`](../config/threat-model.json) now record 29 abuse cases, 63 mitigations, 5 output surfaces, and 12 residual risks across 8 trust boundaries. Broad pre-audit controls were narrowed to the behavior actually observed, with separate scoped controls for BGA-321 through BGA-330; a control moves from `planned` to `implemented` only when its named scenario exists, while stronger acceptance can remain explicitly missing. `pnpm verify:threat-model` checks schema, identifiers, references, ownership, named boundary preconditions, output-surface coverage, and exact machine/human agreement in every shared field; BGA-018 records what that comparison covers and the one composition limit it does not close. The current model reports 15 of 18 output surfaces protected; the three open surfaces all belong to `AC-STUDIO-CREDENTIAL-LOG` under BGA-301, so this item remains `implemented` until that required mitigation is closed or deliberately replaced by an approved manual control.

### BGA-014 — Add secret and artifact safety gates

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-004, BGA-005, BGA-013
- **Deliverable:** Secret scanning, publisher-artwork checks where practical, log redaction tests, and CI artifact inspection.
- **Acceptance:** Known credential formats and seeded sensitive values are blocked or redacted; scans never upload the sensitive fixture itself as an artifact.
- **Verification:** Seeded secrets in source, tool output, logs, and evidence each fail the appropriate gate without revealing the complete value.
- **Evidence:** See the [safety and compatibility milestone](verification/SAFETY_MILESTONE.md). `pnpm verify:safety-gates` writes a seeded credential outside the repository, proves the scanner detects it in artifact content and in a log line, proves the printed finding is masked, then scans the repository and every retained artifact directory. `GATE-SECRET-SCAN-SOURCE`, `GATE-SECRET-SCAN-ARTIFACT`, `GATE-LOG-REDACTION`, and `GATE-FIXTURE-SAFETY` cover each rule, artifact output, stderr redaction, and fixture asset safety. CI runs the scan before the upload step and skips the upload when it fails.
- **Adversarial finding, 2026-08-08:** The gate does not seed a secret into a successful MCP result despite that literal verification requirement. `audit_database_usage` can return a secret-bearing SQL literal, and an own-account Studio log line containing an Authorization bearer value passes its local screen. BGA-327 owns successful-result minimization/redaction; this item cannot return to `verified` until a packaged seeded-secret result is rejected or scrubbed.
- **Progress, 2026-08-13:** BGA-327 landed the missing seeded-success cases, and exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed the six-job matrix. `E2E-SUCCESS-OUTPUT-REDACTION` proves the local/project surfaces. The Studio half remains scripted rather than live because the real Studio page returned only its client-rendered shell and no readable log lines; under [TESTING.md](TESTING.md#live-studio-end-to-end-tests), that keeps this cross-surface item `implemented` until a permitted live mechanism can exercise the credential-bearing Studio result and its retained artifacts.

### BGA-015 — Implement the policy boundary

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-003, BGA-013
- **Deliverable:** Central enforcement for configured project roots, remote project allowlists, operation timeouts, network policy, mutation intent, and output limits.
- **Acceptance:** Capabilities cannot bypass policy through alternate paths; configuration is explicit and fails closed; defaults are local, read-only, and network-off.
- **Verification:** Packaged-server E2E covers traversal, symlink escape, unlisted roots, unlisted remotes, missing mutation confirmation, timeout, and oversized output.
- **Evidence:** [`src/policy.ts`](../src/policy.ts) is the current production path for roots, traversal, symlink checks, remote allowlists, network, mutation intent, timeout responses, and successful-result budgets. The current source contains no privileged-effect import outside it, and BGA-329's complete AST gate closes alternate specifiers, dynamic imports, re-exports, repository-owned wrappers, and privileged globals. `INT-POLICY-*` scenarios cover each existing decision, and `E2E-POLICY-CONFIG-FAILS-CLOSED` and `E2E-POLICY-ROOT-UNAVAILABLE` prove packaged startup refusals. BGA-102 added packaged calls for traversal, static symlink escape, unlisted roots, a timeout response, and successful-result output refusal; BGA-325 now proves final failure bounds. BGA-330 adds deterministic direct-policy coverage for selected single-swap and growth windows, but those observations do not yet prove the same stage order through the installed public boundary. BGA-326 adds installed cancellation evidence for delayed listing and descriptor-read syscalls, and BGA-412 proves the synchronous parser checkpoint through the installed package; the complete native-filesystem matrix remains open. Unlisted remotes and mutation confirmation remain integration-only because no mutating adapter exists.
- **Adversarial findings, 2026-08-08:** The implementation exists, but several gates were incomplete. BGA-325 now bounds failures and BGA-329 now closes the privileged-import bypasses; both passed exact-HEAD CI and are verified. BGA-330 now has deterministic direct-policy and installed-artifact barriers for the selected single-swap windows; the `openat` residual remains explicit and the new packaged evidence still needs exact-HEAD CI. BGA-326 proves two representative installed filesystem operations and monotonic parser checkpoints, but not every native primitive. This item remains `implemented`, not complete or verified, until those owners pass through the installed public boundary.

### BGA-016 — Implement shared error handling and redaction

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-007, BGA-013, BGA-015
- **Deliverable:** Stable public errors and redaction utilities for paths, credentials, sessions, connection strings, player data, and internal failures.
- **Acceptance:** Errors remain actionable without stack-trace leakage or secrets; unexpected failures receive stable codes and safe context.
- **Verification:** Every public capability inherits negative E2E scenarios seeded with sensitive values and proves they are absent from results and evidence.
- **Evidence:** [`src/errors.ts`](../src/errors.ts) publishes the versioned public error contract with stable codes, and [`src/redaction.ts`](../src/redaction.ts) removes private keys, tokens, sessions, connection credentials, player data, and out-of-root paths. `UNIT-REDACTION-CREDENTIALS`, `UNIT-REDACTION-PATHS`, `UNIT-REDACTION-PLAYER-DATA`, `UNIT-ERROR-UNEXPECTED-COLLAPSE`, and `GATE-LOG-REDACTION` prove seeded values never survive a published error or a log line. BGA-102 supplies the inherited negative scenarios: `E2E-INSPECT-PROJECT-REDACTION` proves a refusal carries a redacted path rather than an absolute one, and `E2E-INSPECT-PROJECT-SYMLINK-ESCAPE` proves seeded key material behind a link never reaches a result. Every future capability inherits the same requirement through its manifest entry.
- **Adversarial findings, 2026-08-08:** Shared redaction is applied to published failures, not to every successful structured result. Raw SQL text and permitted own-account Studio messages can retain seeded credential values (BGA-327). A Studio session loaded from `--studio-session-file` is sent to BGA but never registered in `redactionOptions`, which reads only the environment (BGA-321), and Studio preflight prints both foreign actors and the absolute session-file path (BGA-319 and BGA-328).
- **Progress, 2026-08-09:** BGA-319 closed the foreign-actor half: one publication function now screens every Studio surface, and `E2E-STUDIO-ALL-OUTPUTS-OWN-DATA` proves it through the installed artifact. Successful-result redaction (BGA-327), the file-sourced session value (BGA-321), and the printed session path (BGA-328) remain open, so this item stays `implemented`.
- **Progress, 2026-08-10:** BGA-327 closed the successful-result half: [`src/publish.ts`](../src/publish.ts) redacts and minimizes every result before it leaves the process, and raw SQL literals are masked where the documentation says values live. The file-sourced session value (BGA-321) and the printed session path (BGA-328) remain open, so this item stays `implemented`.
- **Progress, 2026-08-13:** BGA-321 closed the file-sourced session value: every provider registers the exact value it resolved before anything is published. BGA-328 then bounded the file read and stopped the diagnostics naming the file, and exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed. This item remains `implemented` because its Studio result/log guarantees still have only scripted-source evidence; the permitted live read returned no log payload to exercise those surfaces.

### BGA-017 — Make verification claims compositional and self-invalidating

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-005, BGA-006, BGA-009, BGA-011, BGA-012
- **Deliverable:** Evidence gates that derive a public capability's status from every prerequisite it claims: the exact packaged artifact, runnable passing scenarios, compatibility claims, transport and protocol conformance, current human records, and retained CI evidence.
- **Acceptance:** A capability cannot be `verified` while any claimed transport/protocol version lacks applicable passing conformance. A scenario identifier counts only when it prefixes a runnable, unskipped test assertion that passed in the retained result; a string in fixture data or a skipped/filtered test does not count. Each manifest entry identifies its most recent passing CI evidence as required by [TESTING.md](TESTING.md). Its supported layouts, environments, and protocol versions agree with the machine-readable compatibility matrix and with the scenarios it requires; omitting proven support is a contradiction just as claiming unproven support is. Compatibility, rule-catalog, threat-model, and packaged E2E claim results are retained rather than inferred from source text. Human verification records are explicitly historical or are checked against the current manifest, commands, claim counts, scenario counts, and test result.
- **Verification:** Seeded gates reject partial/not-applicable conformance behind a `verified` capability, a scenario identifier present only in data, a skipped assertion, a missing CI-evidence reference, stale verification counts, a claim whose test ran against a different artifact, and a manifest capability that omits or adds a layout contrary to the compatibility matrix and its required installed-package scenarios. The untampered current run passes and identifies the package hash it exercised.
- **Finding:** The 2026-08-08 audit found that `verify-evidence` accepts overall partial conformance while every formerly verified capability claims both protocol versions; `scripts/lib/scenarios.ts` matches arbitrary string literals; the manifest schema has no field for the CI evidence TESTING requires; and several documents calling themselves current are behind the actual manifest and test run. BGA-005, BGA-006, BGA-007, BGA-009, and BGA-012 stay reopened until this item passes.
- **Evidence:** [`scripts/lib/scenarios.ts`](../scripts/lib/scenarios.ts) reads a declaration only where it is the title argument of a runnable `it`/`test` call — including `it.each(table)('[ID] …')` — and records `.skip`, `.todo`, `.failing`, and an enclosing skipped `describe` as declared-but-inert; `pnpm verify:scenarios` proves that on a seeded tree holding fixture data, a commented-out test, a skipped case, a todo, a skipped suite, and a runnable case before it reads the real one. [`scripts/lib/evidence.ts`](../scripts/lib/evidence.ts) counts an identifier only where it prefixes the test's own title, reports a scenario whose tests were all skipped as `missing`, resolves each entry's `ciEvidence` into `this-commit`/`stale`/`unknown`, and retains a result for every compatibility claim, catalogued rule, and threat-model mitigation that names scenarios. `config/capabilities.json` gained `ciRuns` and a required `ciEvidence` on every entry, both enforced by the schema; only a passing run may be recorded. [`scripts/verify-evidence.ts`](../scripts/verify-evidence.ts) refuses a `verified` capability whose claimed protocol version lacks applicable passing conformance, whose CI evidence failed, is unrecorded, or belongs to another commit, and refuses a claim with no retained result or a failing one. `tests/global-setup.ts` records the packed artifact's SHA-256 and each packaged suite writes the digest it installed, so a scenario proven against a different build is visible; the gate rejects a mismatch. Human records now declare themselves in a `verification-record` block: a `run` record's capability, scenario, claim, and test counts are compared with the artifact and every `pnpm …` command it names must exist, a `review` names its scope, and a historical record is left alone. Fourteen seeded defects — schema, manifest coverage, scenario coverage, conformance overstatement, verified-without-conformance, verified-with-stale-CI, unretained claim, claim whose scenarios did not run, different artifact, tamper, redaction, stale record, unchecked record, review without scope, and a record naming a command that does not exist — must all be rejected before the gate reports.
- **Note:** BGA-005, BGA-006, BGA-007, BGA-009, and BGA-012 are no longer blocked by this item, but none of them returns to `verified` automatically: each still needs its own evidence, and BGA-005 in particular needs a CI run of the commit being claimed. The manifest currently points at [run 31283119741](https://github.com/Brandon-Born/bga-mcp/actions/runs/31283119741), which passed the six-job matrix for `a178783` — the commit before this work — so every entry's CI evidence is correctly reported as `stale` and no capability may call itself verified until CI runs again.
- **Reopened, 2026-08-13:** The composition gate does not compare a manifest capability's `supportedLayouts` with [`config/compatibility.json`](../config/compatibility.json) or with the modern/hybrid scenarios that capability itself requires. Consequently all project capabilities can say `legacy-flat` only while the compatibility matrix and installed-package evidence say modern and part-migrated support, and both the full local gate and exact-HEAD CI pass. BGA-006 is reopened with this item. Restore `verified` only after the real manifest is corrected, the comparison is implemented in the complete gate, a supported-layout omission and overclaim are each seeded and rejected, and current CI passes the resulting commit.
- **Implemented, 2026-08-13:** [`scripts/lib/compatibility.ts`](../scripts/lib/compatibility.ts) is the shared composition rule used by both the self-seeding verifier and the repository integration gate. It compares exact sets for layouts, environments, and protocols against applicable supported claims, rejects references to nonexistent manifest capabilities, and uses shared required scenarios as the independent reason a claim must map to a capability. The coordinated seed deletes both that mapping and the corresponding manifest layout while retaining the installed scenario; the gate still rejects it. The real manifest is corrected and every requested seeded defect fails. This item remains `implemented` until the complete gate passes and exact-commit hosted CI supplies the evidence required to restore `verified`.

### BGA-018 — Enforce exact machine/human threat-model agreement

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-013
- **Deliverable:** A threat-model gate that compares the complete machine-readable and human-readable boundary/control state, not identifier presence alone.
- **Acceptance:** Boundary status, review date, gates, preconditions, mitigation status/control/owner, and residual-risk disposition cannot disagree between `config/threat-model.json` and [THREAT_MODEL.md](THREAT_MODEL.md). A privacy control covers every output surface that can publish the protected data, including terminal diagnostics and CI logs, rather than only the MCP tool response.
- **Verification:** Seeded mismatches for every compared field fail. A seeded foreign Studio actor name in a tool result, CLI diagnostic, stderr line, and retained artifact is absent from each surface, while an own-account line remains usable where the capability permits it.
- **Finding:** `TB-DOCS-NETWORK` was `reviewed` in the machine model but still `unreviewed` in the human table, and the existing Studio privacy scenarios intentionally expected a foreign actor name in preflight output. The current gate passed both contradictions. BGA-013 and BGA-016 remain reopened; BGA-319 owns the concrete Studio leak.
- **Evidence:** [`scripts/lib/threat-model.ts`](../scripts/lib/threat-model.ts) renders the document the record expects and compares it with the document that exists, cell for cell: 923 fields across assets, actors, boundaries, output surfaces, abuse cases, mitigations, surface coverage, and residual risks, plus the stated review date. Row order and row count are compared too, so a deletion cannot pass as a reordering. [`scripts/verify-threat-model.ts`](../scripts/verify-threat-model.ts) seeds a disagreement in every one of those fields — thirty-one of them, one at a time — and requires each to fail as a disagreement rather than incidentally; a seeded record that the schema would reject is not accepted as proof, because the checker would never have reached the comparison. Every field a document and a record share is therefore both compared and seeded, which is what stops the comparison quietly narrowing.
- **Evidence, output surfaces:** The model gained `outputSurfaces`: the five places the server can publish, from a successful result to a retained CI artifact. An abuse case that publishes protected data names the surfaces it can reach, a mitigation names the surfaces it actually protects, and the gate refuses a surface no mitigation covers. A surface only planned work covers is `open`, names the backlog item that owns it through that control, and stops anything on that boundary from being advertised as `verified`. At introduction, twelve of eighteen surfaces were protected and the six open ones belonged to BGA-301, BGA-321, BGA-327, and BGA-328. `TM-STUDIO-ALL-OUTPUTS-OWN-DATA` covers all five Studio surfaces and is `implemented` because BGA-319 landed with this item.
- **Verified against:** `GATE-THREAT-MODEL-AGREEMENT` in [`tests/integration/threat-model-agreement.test.ts`](../tests/integration/threat-model-agreement.test.ts) runs the same checker over the real files, over the literal 2026-08-08 contradiction (`TB-DOCS-NETWORK` reviewed in one file and unreviewed in the other), over a privacy control narrowed back to the MCP result alone, and over a capability claiming verification across a surface only planned work covers. `E2E-STUDIO-ALL-OUTPUTS-OWN-DATA` proves the surface half through the installed artifact; see BGA-319.
- **Progress, 2026-08-10:** BGA-327 closed `SURFACE-TOOL-RESULT` for `AC-SECRET-IN-OUTPUT` and for `AC-STUDIO-PLAYER-DATA`. Thirteen of eighteen surfaces are protected; the five that remain open belong to BGA-301, BGA-321, and BGA-328, and each is on a Studio boundary rather than on the one every capability crosses.
- **Progress, 2026-08-10:** BGA-321 then closed `AC-STUDIO-FILE-SESSION-LOG` on `SURFACE-TOOL-RESULT`. Fourteen of eighteen are protected; the four open ones belong to BGA-301 and BGA-328.
- **Progress, 2026-08-13:** BGA-328 closed the session-file diagnostic surface. Fifteen of eighteen are protected; the three open surfaces all belong to BGA-301's `AC-STUDIO-CREDENTIAL-LOG`.
- **Historical consequence, decided by the owner on 2026-08-09:** A boundary now records whether it is judged against the capabilities that name it or against every capability. TB-OUTPUT is the second kind — every result and every error leaves through it — so its then-open successful-result surface reached everything. Before BGA-327 landed, `AC-SECRET-IN-OUTPUT` could publish through `SURFACE-TOOL-RESULT`, and the gate correctly refused `verified` on all ten local tools and resources that claimed it. The owner accepted this rather than scoping the rule to named boundaries, on the grounds that the project is in alpha and a claim that cannot survive its own gate was not worth keeping.
- **Verified, 2026-08-13:** All five BGA-018 acceptance cases are mapped to passing assertions, the real model passes after the seeded mismatch checks, and exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed the complete matrix. The gate currently reports 15 of 18 surfaces protected and names the three open BGA-301 surfaces; verifying this agreement gate does not verify the experimental Studio capability or close those explicitly recorded controls.

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

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Cross-file validation for state identifiers, types, transitions, targets, handlers, reachability where provable, and supported BGA state conventions.
- **Acceptance:** Every rule has documented evidence, valid and invalid fixtures, certainty, severity, and false-positive notes. Heuristics are never reported as facts.
- **Verification:** Tool E2E covers every rule's positive and negative fixture plus invalid input, unsupported syntax, path confinement, deterministic ordering, and immutability.
- **Evidence:** Eleven rules in [`src/rules/state-machine.ts`](../src/rules/state-machine.ts), each carrying its severity, certainty, and known false positives, published to the client in every result. Structural rules are proven from the parsed declaration and reported as facts; the three cross-file handler rules are heuristics with `likely` certainty and heuristic evidence, and they stay silent when no PHP source could be read. A new `legacy-broken` fixture seeds nine defects and declares them in its `expected.json`, so a rule change cannot silently repurpose it; the `legacy` fixture gained its handler methods so it is a true clean baseline. Seven packaged scenarios prove the behavior through a real MCP client. See the [state-machine validation verification](verification/STATE_MACHINE_VALIDATION.md).
- **Scope note:** Rules apply to the legacy `states.inc.php` declaration. A modern project returns an `unsupported` result rather than a clean one, because class-based state definitions are not yet interpreted; BGA-118 delivered that reader on 2026-08-07; modern state classes are read.
- **Reopened, 2026-08-23:** BGA-419 reproduced a documented walkthrough-style state class whose `#[PossibleAction] action_pass()` calls `nextState('pass')`. The reader records no action, no edge, and no unsupported construct, so this validator can emit the certain `state.dead-end` finding from an incomplete graph. Restore `verified` only with BGA-419's documented-source decision and installed regression.

### BGA-107 — Implement `validate_action_contracts`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Trace client action calls to server endpoints, argument validation, and game methods for supported layouts.
- **Acceptance:** Missing endpoints, mismatched names, unsupported arguments, and broken handler links produce evidence-backed findings with exact locations.
- **Verification:** Tool E2E exercises every supported action pattern, seeded mismatch, dynamic or uncertain pattern, invalid input, and non-execution of project code.
- **Evidence:** [`src/project/actions.ts`](../src/project/actions.ts) reads legacy `ajaxcall` URLs, modern `bgaPerformAction` names, and the request arguments an entry point consumes; [`src/rules/action-contracts.ts`](../src/rules/action-contracts.ts) traces each action from client call to entry point to game method. Eight rules: a duplicated entry point and a broken `act…` name are facts, every cross-file claim is a heuristic carrying its limitations, and a call assembled at runtime becomes unsupported syntax rather than a guess. When a side of the contract cannot be read the result says so instead of passing. Both fixtures gained real action wiring, and `legacy-broken` declares its eight expected contract findings. Seven packaged scenarios prove it through a real MCP client. See the [action contract verification](verification/ACTION_CONTRACTS.md).
- **Scope note:** Tracing covers the legacy client and action class. A modern project reports `action.trace.unavailable` because its attribute-based entry points are not yet read; BGA-119 delivered that reader on 2026-08-07; autowired actions are traced.
- **Reopened, 2026-08-23:** BGA-417 reproduced a computed `performAction` argument object that becomes an empty known object and a false `action.argument.mismatch`; BGA-418 reproduced two valid state-local actions as one certain duplicate; BGA-419 records contradictory official action-name forms that the reader currently converts into certain and likely project defects. Those owners must pass before this item can return to `verified`.

### BGA-108 — Implement `validate_notifications`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Trace server notifications to client subscriptions and compare supported payload shapes and handler use.
- **Acceptance:** Missing handlers, name mismatches, and provable payload incompatibilities are distinguished from dynamic or uncertain behavior.
- **Verification:** Tool E2E covers valid, missing, mismatched, extra, dynamic, and malformed notification fixtures with stable evidence.
- **Evidence:** [`src/project/notifications.ts`](../src/project/notifications.ts) reads `notifyAllPlayers` and `notifyPlayer` sends with their payload keys, and the client handlers bound by `dojo.subscribe` or the `notif_<name>` method convention with the keys each reads. [`src/rules/notifications.ts`](../src/rules/notifications.ts) compares the two sides. Five rules: a duplicate subscription and an untraceable contract are facts; sent-but-unhandled, handled-but-unsent, and payload disagreement in either direction are heuristics carrying their limitations. A send with a computed name or payload becomes unsupported syntax. Both fixtures gained notification wiring, and `legacy-broken` declares its five expected findings. Seven packaged scenarios prove it through a real MCP client. See the [notification contract verification](verification/NOTIFICATIONS.md).
- **Scope note:** Tracing covers the legacy client and PHP sources. A modern project reports `notification.trace.unavailable`, as does any project where neither side mentions a notification, so an unreadable contract never returns a clean result.
- **Reopened, 2026-08-23:** A computed server payload is reported as unsupported and simultaneously stored as a known empty payload, producing `notification.payload.mismatch` against a handler that reads a key. BGA-417 owns the correction and installed regression.

### BGA-109 — Implement `audit_database_usage`

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-008, BGA-101
- **Deliverable:** Compare `dbmodel.sql` with supported query usage and detect high-confidence schema, reference, and unsafe-pattern findings.
- **Acceptance:** SQL is parsed without connecting to or executing against a database; dialect limits are explicit; no rule claims more certainty than the parser supports.
- **Verification:** Tool E2E covers valid schema usage, missing objects/columns, supported unsafe patterns, dynamic SQL uncertainty, malformed SQL, and zero network/database access.
- **Evidence:** [`src/project/database.ts`](../src/project/database.ts) reads the tables and columns `dbmodel.sql` declares and the queries the PHP sources run, attributing bare columns only when a query names exactly one table. [`src/rules/database.ts`](../src/rules/database.ts) compares them. Seven rules: undeclared tables and duplicate declarations are facts; undeclared columns, unused columns, and interpolated queries are heuristics carrying their limitations. Framework-owned tables are never reported as undeclared. Both fixtures gained a real schema and queries, and `legacy-broken` declares its four expected findings. Seven packaged scenarios prove it through a real MCP client. See the [database audit verification](verification/DATABASE_AUDIT.md).
- **Scope note:** Column attribution needs a single-table query; a multi-table query keeps only its qualified columns and reports the rest as unsupported. A query concatenated from several expressions is reported rather than reconstructed.
- **Change, 2026-08-10:** Published query text carries masked values (`WHERE card_location = '?'`), which BGA-327 owns. The findings, tables, columns, and interpolation flag are unchanged; what a result no longer contains is the constant a query compared against.
- **Reopened, 2026-08-23:** BGA-420 reproduced the official `SELECT player_id id ... FROM player` form as references to nonexistent `player.id`, and `SELECT c.card_id AS id FROM card c` as `c.card_id`, `card.c`, and `card.id`. The current documented false-positive note does not satisfy this item's promise that parser limits constrain certainty; the official examples require a real alias model or explicit unsupported syntax.

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

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-007, BGA-101
- **Deliverable:** Shared behavior for syntax that cannot be parsed or relationships that cannot be proven.
- **Acceptance:** Unknown syntax produces an `unsupported` or `uncertain` result with a location and reason, never an implicit pass or fabricated relationship.
- **Verification:** Every parser and public validation E2E suite includes at least one unknown construct and asserts the explicit uncertainty result.
- **Evidence:** [`src/rules/uncertainty.ts`](../src/rules/uncertainty.ts) is the shared behavior every rule module now builds its findings with: a proven claim is a fact, a claim depending on unseen code is a heuristic carrying the rule's recorded false positives, and a construct the reader cannot interpret is unsupported syntax with its location and reason. A result made entirely of unsupported syntax reports `unsupported`, never `passed`. The four rule modules previously duplicated these builders; the refactor left every existing test passing unchanged. `tests/unit/uncertainty.test.ts` asserts the three shapes, that every non-certain rule records how it can be wrong, and that all seven parsers report a construct they cannot read rather than dropping it. Each validator's packaged suite already asserts the explicit unsupported result for a project it cannot fully read.
- **Reopened, 2026-08-23:** BGA-417 proves two unknown values survive as fabricated empty structures; BGA-419 proves documented-but-conflicting modern forms disappear without even an unsupported finding; BGA-420 proves SQL aliases are treated as columns instead of unknown syntax. These violate the acceptance criterion directly.

### BGA-114 — Enforce local read-only and network-off behavior

- **Status:** verified
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

- **Status:** verified
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
- **Reopened, 2026-08-23:** BGA-419 records an official walkthrough state method that the reader silently omits from both possible actions and graph edges. Until the conflict with the canonical state page is resolved, the reader must report that form as unsupported rather than let downstream rules treat the class as complete.

### BGA-119 — Read modern action autowiring and the modern client action API

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-107, BGA-117, BGA-118
- **Deliverable:** Action-contract tracing for projects with no `.action.php`: autowired public `act…` methods on the game class as the server side, and `this.bga.actions.performAction` alongside the existing `bgaPerformAction` and `ajaxcall` on the client side.
- **Acceptance:** A modern project no longer reports `action.trace.unavailable` merely for lacking an action class, and the absent file is never itself reported as a defect. Parameter names are compared through the framework's typed autowiring rather than request reads, and `#[IntParam]`-style attributes are read where present.
- **Verification:** The action-contract suite gains modern scenarios mirroring its legacy ones, including a seeded mismatch, and proves the legacy path is unchanged.
- **Evidence:** Action tracing now accepts a project with no `.action.php`: autowired public `act…` methods on the game class are the entry point, their typed parameters are the contract, and an autowired action is its own game method rather than a missing second hop. The client reader accepts `this.bga.actions.performAction` alongside `bgaPerformAction` and `ajaxcall`. The rule comparing calls against a state's declared actions now stays silent when no state enumerates any, because an empty set means unknown rather than nothing-allowed; that limitation is recorded on the rule.
- **Sources:** [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide), [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php).
- **Reopened, 2026-08-23:** BGA-417 shows the modern client reader does not mark a computed argument object unsupported. BGA-419 shows it treats the official walkthrough's `action_*` names as impossible even though that same page pairs them with `bga.actions.performAction` and `#[PossibleAction]`.

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
- **Reopened, 2026-08-23:** The Complete Walkthrough now documents a materially different state-class action and transition shape from the canonical state page. BGA-419 owns the source-authority decision and the fail-safe behavior while that conflict remains; treating the walkthrough form as a complete edge-free state is not acceptable.

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
- **Reopened, 2026-08-23:** BGA-417, BGA-418, and BGA-419 invalidate the claimed dynamic-syntax, state-class, and exact-parameter coverage. In particular, the same action name in separate state classes is state-scoped, while the current duplicate rule and parameter comparison flatten every class into one global namespace.

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
- **Reopened, 2026-08-23:** BGA-417 invalidates the claimed dynamic-payload coverage: one computed payload currently yields both unsupported syntax and a fabricated missing-key warning.

### BGA-127 — Restrict database findings to executed framework database calls

- **Status:** verified
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
- **Reopened, 2026-08-23:** BGA-416 shows every packaged suite starts an internal `dist/*.js` file instead of the installed package command, and the release suite selects `dist/release-cli.js` itself. BGA-417 through BGA-420 add minimal documented/dynamic forms the current fixture matrix omits. Coverage is not complete until those forms and the actual public executable cross the real-client boundary.

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
- **Adversarial findings, 2026-08-08:** Three stated preconditions were not established at that review. Hexadecimal IPv4-mapped IPv6 forms such as `::ffff:7f00:1` passed the address guard even though they map to loopback/private IPv4 (BGA-323, since corrected: the decision is now made on the parsed address). A plausible project-derived query such as `SELECT unreleased_secret FROM internal_table` passed the request-content heuristic, so the implementation could not prove the caller's provenance claim (BGA-324). Slow redirect and non-2xx bodies were resumed without a bounded drain or socket destruction after the operation had already resolved/rejected, and callers did not propagate the timeout signal (BGA-326, since corrected for the network lifecycle). At that review, TM-DOC-NO-LOOPBACK, TM-DOC-REQUEST-CONTENT, and TM-DOC-RESPONSE-BUDGET were implementation claims with open correctness bugs, not verified controls.
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
- **Adversarial finding, 2026-08-08:** When DNS was unavailable, every page/source fetch failed but the installed tool returned `isError: false`, an empty result, and “No documentation matched.” `sourcesSearched` named both sources even though neither was successfully searched. BGA-209 owns the outage/no-match distinction, and has corrected it: the result now reports what was attempted, what was searched, and what failed, and a lookup where nothing answered fails with `policy.doc-fetch.failed`. The result shape gained `sourcesAttempted`, `failures`, and `degraded` in the same change.
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
- **Note:** `implemented`. The verification this item asked for now exists and passed in [CI run 31334309936](https://github.com/Brandon-Born/bga-mcp/actions/runs/31334309936): `E2E-FRAMEWORK-VERSION-CURRENT`, `E2E-FRAMEWORK-VERSION-STALE`, `E2E-FRAMEWORK-VERSION-MISSING`, and `E2E-FRAMEWORK-VERSION-CONFLICTING` read captured snapshots of the official page through the installed artifact, and `pnpm test:framework-version` repeats the reading against the live page before a documentation release. BGA-325 has since closed the output-budget defect, but the resource stays `implemented` because BGA-324 and BGA-326 remain open on the documentation boundary and the fresh live quality run is failing under BGA-211/BGA-313.
- **Adversarial finding, 2026-08-08:** A live installed-package read returned one “version”: the label “Original announcement on BGA forum” paired with a forum URL. The source page actually listed Dojo 1.15, PHP 8.4, MySQL 5.7/8.0, and Font Awesome 4.7/6.4.0. The parser matched the table-of-contents occurrence of “Software Versions” and scanned unrelated prose. This directly violates “a wrong version is worse than no version”; BGA-210 owns the correction and has made it — the reading is anchored to the rendered heading, bounded by the next heading, and taken only from list items that are not navigation. The live installed read on 2026-08-09 returned all five entries the page states, each with its source line.
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
- **Result, 2026-08-13:** A fresh deliberate live run regressed to `3/9` answered and remained `6/9` attributed. `states-where`, `game-class-location`, and the deliberate `no-answer` case passed. `client-entry-point` omitted `modules/js`; `file-reference` omitted `dbmodel.sql`; `migration-states` missed `Migration_Guide` and emitted a 1,219-character excerpt over the 1,200-character contract; `software-versions` emitted 1,229 characters; `community-recipes` missed `Cookbook`; and `adversarial-instruction` returned an over-limit result where no answer was correct. The command exited nonzero, so documentation capabilities remain unreleasable. The result strengthens BGA-211; it does not justify lowering the thresholds or revising the questions to fit the current implementation.

### BGA-209 — Distinguish documentation outage from a genuine no-match result

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-202, BGA-207
- **Deliverable:** Truthful search-degradation semantics that track attempted and successful retrievals per source/page.
- **Acceptance:** One failed page or source may degrade a search only when at least one other page/source was successfully searched. If zero fetches succeed, the tool returns the actionable `policy.doc-fetch.failed` family with safe failure context, not a successful empty result. `sourcesSearched` contains only sources whose search endpoint or page content was actually processed; attempted and failed counts are separate fields if useful. A genuine successful search with no hits remains a normal empty result.
- **Verification:** Installed-package network tests separately cover all-source DNS failure, all-source timeout, one-source failure with another succeeding, page-level failure after successful search, malformed response, and a genuine no-match. Each asserts the error bit, stable code, source accounting, and absence of project data.
- **Finding:** With outbound DNS blocked, `search_bga_docs` returned success and “No documentation matched,” while resource reads in the same process correctly returned `policy.doc-fetch.failed ... ENOTFOUND`.
- **Evidence:** The tool now counts what it asked and what answered rather than what existed. A source is in `sourcesSearched` only once its search endpoint or one of its pages was read; `sourcesAttempted` records what was asked, `failures` records each failure with its source, scope, and stable code, and `degraded` says whether the result is short of what the documentation holds — in the text a client shows as well as in the fields it may never read. When nothing answered, the call fails with `policy.doc-fetch.failed` naming each source and code, because reporting an outage as an empty result asserts the documentation does not cover the question. [`readSearchResponse`](../src/docs/search.ts) now separates a response nobody can read from a search that found nothing: both return no hits and they mean opposite things, and treating them alike is how a maintenance page became an answer. Asking the single-page community source for a search is refused with the resource that does reach it, rather than answered "nothing matched" for a source nothing was asked of.
- **Verified against:** `E2E-DOCS-ALL-SOURCES-UNREACHABLE`, `E2E-DOCS-ALL-SOURCES-TIMEOUT`, `E2E-DOCS-SOURCE-DEGRADED`, `E2E-DOCS-PAGE-DEGRADED`, `E2E-DOCS-SEARCH-UNREADABLE`, `E2E-DOCS-NO-MATCH`, and `E2E-DOCS-SOURCE-WITHOUT-SEARCH` run through the installed artifact in [`tests/e2e/docs-network.test.ts`](../tests/e2e/docs-network.test.ts), against a documentation server the suite scripts through [`doc-network-stub.ts`](../tests/e2e/doc-network-stub.ts). Each asserts the error bit, the stable code, the source accounting, and that no project path appears in a failure. [`config/acceptance-map.json`](../config/acceptance-map.json) maps every acceptance case here to the assertion that proves it. The policy for a scripted third-party source, and the two rules that keep it from proving something it cannot, are recorded in [TESTING.md](TESTING.md#scripted-third-party-sources).
- **Note:** [CI run 31334309936](https://github.com/Brandon-Born/bga-mcp/actions/runs/31334309936) passed the six-job matrix on `213deaa`, which is what this claim rested on. Nothing here is evidence about TLS, the address guard, or name resolution — the stub replaces the connection those controls act on, and they keep their own scenarios. BGA-325 has since closed the output-budget defect; the `search_bga_docs` capability itself stays `implemented` because BGA-324 and BGA-326 remain open and the live evaluation still fails under BGA-211/BGA-313.

### BGA-210 — Anchor framework-version extraction to the actual section

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-204, BGA-205
- **Deliverable:** A version parser that identifies the rendered `Software Versions` heading and reads only its bounded section, preserving software/value pairs and evidence lines.
- **Acceptance:** Table-of-contents links, navigation, forum URLs, dates, and unrelated prose can never become software versions. The parser recognizes the maintained list's punctuation and multiple environment values, reports conflicts rather than selecting one, and returns `unknown` when the heading or parseable list is absent. Every returned value has a source line and snapshot date.
- **Verification:** Captured official-page fixtures cover the current section, a table of contents before it, reordered navigation, a missing section, an empty section, duplicates/conflicts, and stale content. A deliberate live installed-resource test asserts PHP, SQL, Dojo, and both Font Awesome entries against the current official page before a documentation release.
- **Finding:** The live resource returned a forum announcement link as its only software version because it anchored on the first table-of-contents text occurrence.
- **Evidence:** [`src/docs/versions.ts`](../src/docs/versions.ts) reads the page's markup rather than its flattened text, because the words appear on the page more than once and only one of the occurrences is a heading: a rendered heading is an `<h1>`–`<h6>` element, a table-of-contents entry is a list item. The section runs from that heading to the next heading of any level, so the `PHP Extensions Used` subsection that dates itself "as of Apr 1, 2026" and the `Other resources` section of forum URLs are both outside it. Only list items are read, and a list item that is a navigation entry is skipped, because a table of contents is a list of numbered links whose section numbers — `6.1` — are indistinguishable from release numbers. Within an item, URLs and markup samples are removed before reading and kept in the evidence line, so `fontawesome.com/v4.7` and `<i class="fa6 fa6-clock" />` cannot become versions while the line remains checkable. A version must be dotted: a bare integer would make a date a version. One line may state several values — `SQL: MySQL 5.7 (prod) - on studio 8.0` is two environments — and where the page states more than one version for the same software, both are returned and the disagreement is reported in `conflicts` rather than resolved, because choosing one would be this server inventing a fact the source does not state. A heading with nothing readable under it is not proof the page states no versions, so the search continues to the next candidate heading before returning `unknown` with a reason.
- **Verified against:** [`tests/unit/framework-versions.test.ts`](../tests/unit/framework-versions.test.ts) runs `UNIT-DOC-FRAMEWORK-VERSION` and `UNIT-DOC-FRAMEWORK-VERSION-ANCHOR` against captured official markup — the current section with its table of contents, that navigation moved after the section, the section removed, the list removed, an added duplicate, and the same page as it stood on 2026-04-01. `E2E-FRAMEWORK-VERSION-CURRENT`, `E2E-FRAMEWORK-VERSION-STALE`, `E2E-FRAMEWORK-VERSION-MISSING`, and `E2E-FRAMEWORK-VERSION-CONFLICTING` read those captures through the installed artifact, which is also the resource evidence BGA-204's own verification asked for. `pnpm test:framework-version` installs the artifact and reads the live page: on 2026-08-09 it returned Dojo Toolkit 1.15, PHP 8.4, SQL 5.7 (prod) and 8.0 (studio), and Font Awesome 4.7 and 6.4.0, each with the line it was read from. Captures and their provenance are recorded in [`tests/fixtures/docs/CAPTURES.md`](../tests/fixtures/docs/CAPTURES.md).
- **Note:** [CI run 31334309936](https://github.com/Brandon-Born/bga-mcp/actions/runs/31334309936) passed the six-job matrix on `213deaa`. The live check is deliberately outside `pnpm check`, like the documentation evaluation, because a commit gate that depends on a third party's uptime fails for reasons that have nothing to do with the commit.
- **Sources:** [Studio § Software Versions](https://en.doc.boardgamearena.com/Studio#Software_Versions), re-read 2026-08-09, says “Versions currently used by BGA framework:” and lists “Dojo Toolkit 1.15 - deprecated, avoid at all cost”, “PHP: 8.4”, “SQL: MySQL 5.7 (prod) - on studio 8.0”, a JS/CSS/HTML entry that states no version, and Font Awesome 4.7 and 6.4.0. The rendered heading is `<h2><span class="mw-headline" id="Software_Versions">`; the earlier occurrence is `<li class="toclevel-1 tocsection-12">`, which is what the shipped reader matched.

### BGA-211 — Build captured-page relevance evaluation for search and topic resources

- **Status:** ready
- **Priority:** P1
- **Depends on:** BGA-203, BGA-205, BGA-313
- **Deliverable:** Legally bounded captured-page fixtures and deterministic offline scoring for query understanding, excerpt selection, no-answer behavior, and fixed-topic resource relevance, with the live wiki retained as the periodic truth check.
- **Acceptance:** Captures contain only the minimal reviewed text needed for evaluation, with canonical URL, authority, retrieval date, and source policy recorded. Every BGA-205 question and every fixed topic has an expected page plus required/forbidden facts. The system prefers the passage that answers the query/topic, returns nothing for adversarial or genuinely unanswerable input, and does not optimize by lowering the existing thresholds. Captures are refreshed only through an explicit review when drift is detected.
- **Verification:** Offline A/B evaluation fails the exact five current search questions and three off-topic fixed resources before the fix, then clears the existing answer/attribution thresholds and per-topic requirements. `pnpm test:docs-eval` repeats the result live before release and records any source drift separately from ranking quality.
- **Finding:** The 2026-08-13 live run is `3/9` answered and `6/9` attributed; topic resources have correct provenance but weak passages, two excerpts exceed their own 1,200-character contract, and the adversarial no-answer case returns content. Network requests are too slow and externally coupled to be the development loop, while self-authored synthetic responses already missed multiple production defects.

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
- **Note:** Only the 2025 era adopts roots through a server-initiated request, and that is a protocol fact rather than a shortcut. `roots/list` was deprecated in 2026-07-28 (SEP-2577) and the SDK throws rather than sending it; on that era roots arrive through the multi-round-trip input-required flow, which a capability asks for in its own result. The push path is therefore wired only where it works, and BGA-318 now supplies the newer in-band path.
- **Adversarial finding, 2026-08-08:** A real pinned 2026 client advertised roots and installed a roots handler, but the server made zero root requests. This was expected for the removed push request, but the server then said the client “offered none” rather than initiating the modern input-required flow. That finding created BGA-318, whose packaged MRTR scenarios now cover the missing era.

### BGA-315 — Ask for what is missing instead of failing

- **Status:** implemented
- **Priority:** P1
- **Depends on:** BGA-314
- **Deliverable:** Setup values requested through MCP elicitation at the moment they are needed, rather than required up front — starting with the Studio dev account names, which are not secret.
- **Acceptance:** A capability that lacks a non-secret setting asks for it through the client and proceeds when it is supplied, rather than refusing with instructions the developer has to go and act on elsewhere. Declining is a first-class answer: the capability refuses cleanly and does not ask again in the same session. A client that does not support elicitation gets the current behaviour, refusal with instructions, so this is an improvement and never a new dependency.
- **Verification:** Scenarios cover supply, decline, an unsupported client, and a second call after a decline.
- **Evidence:** `SetupAsker` asks the client for the Studio dev accounts the first time `read_studio_logs` needs them and none are configured, and the answer is held for the session — in memory, never written, so a restart asks again and configuration is untouched. Declining is an answer: the call refuses and nothing asks again for the rest of the session. `INT-SETUP-ASK-ANSWERED`, `INT-SETUP-ASK-DECLINED`, and `INT-SETUP-ASK-UNSUPPORTED` cover the legacy request path. `E2E-MODERN-INPUT-REQUIRED-SETUP` covers the modern in-band request through a real pinned client, including supply, decline, a second call after decline, empty input, and unsupported input. The policy gates run before the question, since asking a developer for accounts when the capability is switched off is a question with no useful answer.
- **Note:** The protocol-era split is deliberate: 2025 uses the server-initiated elicitation request, while 2026 returns `input_required` and resumes when the client retries with the response. BGA-318 owns the modern implementation and release evidence.
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
- **Note:** `--studio-check` remains a separate terminal surface; it is not equivalent to `check_setup`. BGA-319 shows that page preflight can publish foreign actor names and BGA-328 shows it can publish the credential-file path, while `check_setup` reports only configuration state. Client-offered roots now work on both protocol eras, and BGA-318 supplies truthful era-aware wording for the 2026 in-band flow. This item remains `implemented` until the resulting exact-head gate and CI evidence exist.
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

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-314, BGA-315, BGA-316
- **Deliverable:** The `2026-07-28` multi-round-trip input-required flow for project roots and non-secret missing setup, plus protocol-era-aware setup diagnostics.
- **Acceptance:** When a 2026 client supports the applicable input-required interaction, a capability missing a project root returns the structured request, validates the supplied root through the same policy boundary, and resumes without a relaunch. Decline and unsupported-client outcomes are explicit and session-bounded. No server-push `roots/list` or legacy elicitation is attempted on that era. Guidance distinguishes “the client did not advertise/support the modern interaction,” “the user declined,” and “no value was supplied”; it never claims an advertising client offered nothing merely because the server did not ask.
- **Verification:** Real-client installed-package scenarios cover one/many/changed roots, valid supply, decline, unsupported interaction, invalid/out-of-root/symlink values, a second call after decline, and both protocol eras in one matrix. The client records every request so a zero-request false diagnosis fails.
- **Finding:** The installed server's 2025 path called `roots/list` and refreshed correctly. The same SDK client on 2026 advertised and handled roots, but received zero requests; `check_setup` blamed the client and `inspect_project` said none were offered.
- **Evidence, 2026-08-13:** Every project tool and project resource now uses the SDK's `input_required` result on the modern era, embedding `roots/list` rather than sending a server-to-client request. The real pinned 2026 client fulfils it and retries the same call; the returned file URIs are resolved by `PolicyBoundary` and are never authority by themselves. A later call asks again, so a changed open-folder set replaces the earlier one rather than silently retaining access. Empty, multiple, unreadable, non-file, unsupported-client, and omitted responses carry distinct guidance, while `check_setup` now describes the modern in-band flow instead of saying an advertising client offered nothing. The same flow embeds `elicitation/create` when the experimental Studio reader lacks its non-secret account allowlist: an accepted value proceeds in the original call, a decline is remembered without asking again, and an empty or unsupported response is named distinctly. The session credential remains deliberately outside elicitation.
- **Verified against:** `E2E-MODERN-INPUT-REQUIRED-ROOTS`, `E2E-MODERN-INPUT-REQUIRED-OUTCOMES`, `E2E-MODERN-INPUT-REQUIRED-SETUP`, and `E2E-LEGACY-CLIENT-ROOTS` in [`tests/e2e/modern-input-required.test.ts`](../tests/e2e/modern-input-required.test.ts) pack and install the artifact, pin real SDK clients to both protocol eras, count every embedded or legacy request, and cover tools, resources, one/many/changed roots, valid supply, empty/invalid input, accepted/declined/empty non-secret setup, a second call after decline, and clients without the required capability. This item stays `implemented` until the complete gate and exact-head six-job CI pass.
- **Sources:** [The 2026-07-28 specification release](https://blog.modelcontextprotocol.io/posts/2026-07-28/) states that MRTR replaces server-initiated roots requests: a server returns `resultType: "input_required"`, and the client retries with `inputResponses`. [The official TypeScript SDK migration guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28) documents `inputRequired({ inputRequests: { ... inputRequired.listRoots() } })` and the retried handler context used here.

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
- **Live confirmation, 2026-08-10:** The narrower thing does not work either, and now there is evidence rather than an expectation. The page it reads is a JavaScript application that serves none of the log in its HTML. BGA-312 records the measurement and the recommendation to withdraw.

### BGA-312 — Implement experimental own-account Studio log reading

- **Status:** blocked
- **Blocked by:** The page this capability reads does not carry what it reads. See the live finding of 2026-08-10 below.
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
- **Progress, 2026-08-10:** BGA-327 replaced the four local regexes with the shared credential rules: an own-account line carrying anything they recognize is withheld whole, and a line that is kept is passed through the same value redaction as every other successful result. BGA-321 then registered every provider's session for that redaction, so a page echoing the developer's own cookie back at them no longer returns it. BGA-322 and BGA-326 remain open against this capability.
- **Inherited policy blockers:** Studio HTTPS reads shared the mapped-address bypass in BGA-323, which is corrected and proven for this path by `E2E-STUDIO-READ-ADDRESS-NORMALIZATION`. BGA-326's network slice now propagates the deadline through the Studio request and response body and is covered by `E2E-STUDIO-READ-NETWORK-CANCELLATION`; BGA-326 remains open for the credential-read, parser-loop, and CLI-preflight cancellation paths, so a successful live result still cannot establish the broader cancellation claim.
- **Live finding, 2026-08-10:** The packed artifact was driven against the real Studio, through a real MCP client, on the dedicated project, with the session supplied as a file path and never as a value. The provider authenticated and the identifier resolved; then `/studiogame?game=<project>` answered with 3,113,458 bytes that are 99% `<script>`, carrying no line matching the documented log shape, no project data, and no not-found sentence — and answering with the same shell, to within the length of the name, for a project that exists and one that does not. The log a developer sees in a browser is rendered there by the page's own scripts. Fetching and parsing HTML cannot read it: not with a larger budget, not with a better parser, and not for a project that has been played.
- **Recommendation:** Withdraw the capability, or replace its mechanism. Reading these logs would need a browser or an undocumented data endpoint, and [the roadmap](ROADMAP.md) already rules both out for test tables, player perspectives, and saved states on exactly this reasoning — "each is an authenticated web page with no documented interface". Keeping an advertised tool that cannot succeed is the thing this project's evidence rules exist to prevent. The decision is the owner's; nothing has been removed.
- **Fixed on the way, 2026-08-10:** The Studio read has its own measured byte budget, because the page exceeded the documentation ceiling and then a raised one. A withheld value must now be at least as long as any other by-value redaction, because a one-digit value was replacing every digit in the report — the live result read `[withheld] log line(s) ... limited to meatmugdev[withheld]`. Only text that begins like a log line is treated as one, because page furniture was being counted as unreadable log lines and reported as `53 unattributable`. And the tool refuses with a statement of the limit rather than returning `0 log line(s)`, which was a claim about the developer's project when the truth was a claim about the reader.
- **Not covered:** The live half of every remaining Studio acceptance case — an own-account marker created, retrieved, and cleaned up — cannot be met while the mechanism cannot read a log at all. It is recorded as unproven rather than pending.

### BGA-319 — Stop Studio preflight from publishing foreign actor names

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-013, BGA-016, BGA-312, BGA-316
- **Deliverable:** Own-data-only enforcement across Studio tool results, setup reports, CLI stdout/stderr, launcher logs, and retained evidence.
- **Acceptance:** When retrieved lines belong only to undeclared accounts, diagnostics say generically that none match and may report bounded counts, but never names, identifiers, message fragments, or other foreign line content. The account configuration hint remains actionable without telling the operator which foreign name to copy. The same screening/redaction function protects every output surface before formatting.
- **Verification:** A seeded foreign actor, real-player line, prefix-collision name, credential, and unattributable line are absent byte-for-byte from MCP content, `check_setup`, `--studio-check` stdout/stderr, thrown errors, and a simulated CI artifact. Own-account content is returned only by `read_studio_logs` when explicitly enabled and configured.
- **Finding:** `src/studio/check.ts` builds `seen` from all parsed actors and interpolates it into “The page shows lines for …”; `INT-STUDIO-CHECK-PAGE` asserts that a foreign fixture name appears. This contradicts BGA-312 and `TM-STUDIO-OWN-DATA-ONLY`.
- **Evidence:** [`src/studio/privacy.ts`](../src/studio/privacy.ts) now records the exact strings the screen withheld and exposes `publishStudioText`, the one function every Studio surface passes text through before it is formatted. [`src/studio/check.ts`](../src/studio/check.ts) screens the page before it says anything about it, so no sentence is ever built from a line that is not the developer's, and the hint that used to name what it found now reports how many attributed lines were seen and says to read the account name from the developer's own Studio page. That keeps a mistyped account distinguishable from an empty page — the failure this check exists for — without publishing a name that may belong to another developer or a real player. [`src/tools/read-studio-logs.ts`](../src/tools/read-studio-logs.ts) passes its text and its structured messages through the same function, so the guarantee is one function rather than one call site's care.
- **Verified against:** `E2E-STUDIO-ALL-OUTPUTS-OWN-DATA` in [`tests/e2e/studio-own-data.test.ts`](../tests/e2e/studio-own-data.test.ts) serves the installed server a page carrying a foreign developer, a real-player line, a name that begins with the developer's own account, a credential-bearing own line, and an unattributable line, each with a value that appears nowhere else. Eight canaries are then required absent, byte for byte, from the tool text, the structured content, a failure published after the page was parsed, the `check_setup` result, `--studio-check` stdout and stderr in both the matching and mistyped cases, the server's own stderr, and a file written the way a CI job retains a log and read back off disk. The developer's own line still comes back, so this is a screen and not an off switch. `INT-STUDIO-CHECK-OWN-DATA` replaces the case that asserted the leak, and `UNIT-STUDIO-PUBLISH-SCREEN` covers the publication function, including that a whole withheld line is removed rather than its name alone.
- **Current status, 2026-08-13:** Exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed the scripted installed-package cases, and BGA-327/BGA-328 closed the credential-line and session-path defects. This item remains `implemented`: the real Studio page exposed no readable log lines, so a permitted live run has not yet proved foreign content absent and own-account content usable through the actual source.

### BGA-320 — Use the Studio project name for Studio log reads

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-312
- **Deliverable:** Correct `read_studio_logs` to accept the exact Studio project identifier carried by the `game` parameter of `/studiogame`, matching the already string-based CLI preflight rather than assuming that value is numeric.
- **Acceptance:** The public `gameId` property remains for compatibility but is documented as the Studio project identifier copied from Manage Games. It accepts the observed `mcpverification`, rejects empty/whitespace input, and confines the value to the single `game` query parameter; it cannot alter scheme, host, path, or add parameters. Character/length restrictions come from official documentation or observed Studio validation, not guesses, and numeric project names are not rejected merely by inference. A missing project or the specifically observed wrong Play ID `15414` produces an actionable not-found/wrong-project result rather than empty output or an unrelated policy error.
- **Verification:** Pack and install the artifact, connect with a real MCP client, discover the tool, and call it against the dedicated project by name. A live scenario creates an own-account marker, retrieves only that marker, proves foreign/unattributable/credential-bearing lines absent, and cleans up. Packaged negatives cover the known wrong Play ID, empty/whitespace values, query delimiters, traversal-shaped input, and identical `--studio-check` behavior under every advertised protocol.
- **Finding, 2026-08-08:** The real Manage Games link is `/studiogame?game=mcpverification`. `/studiogame?game=15414`, where `15414` is this project's Play-link ID, says the project does not exist. A freshly installed real MCP client receives `gameId must be the numeric Studio game identifier` for the real project name; the permitted `15414` call made an authenticated request but returned `policy.output.too-large`, not an actionable wrong-project result.
- **Sources:** [First steps with BGA Studio](https://en.doc.boardgamearena.com/First_steps_with_BGA_Studio) documents `https://studio.boardgamearena.com/studiogame?game=<your_game>`; the dedicated-project observation above confirms the current live form.
- **Live observation, 2026-08-10:** A browser session on the owner's own Studio account, driven through the Chrome extension, confirmed every part of the finding. `/studiogame?game=mcpverification` renders "Manage game: mcpverification". `/studiogame?game=15414` — that project's numeric Play ID — answers with a 200 and the sentence "The project doesn't exist or you don't have access to it", which is also what an omitted `game` parameter returns. No cookie was read, printed, or copied: the page was observed in a browser the owner was already signed into.
- **Evidence:** The schema takes the Studio project name. Its shape is Studio's own, quoted from the project-creation form on `/studio`: "your project name should be written in CamelCase, without numbers, spaces or special characters (example: RaceForTheGalaxy). Max length of 32 characters." Digits after the first character are accepted anyway, because that note says _should_ and an older project is not this server's to refuse; what is refused is everything that could not be a project name — spaces, punctuation, query delimiters, traversal — and a purely numeric value, which the live run proved is a different identifier rather than a project. The `gameId` property keeps its name for compatibility and now documents what it is.
- **Evidence, the wrong project:** Studio answers a missing or inaccessible project with a 200 and a sentence, so an empty log and an absent project used to look alike. Both [`src/tools/read-studio-logs.ts`](../src/tools/read-studio-logs.ts) and the `--studio-check` preflight now read that sentence and say the project does not exist, naming Manage Games as where the right identifier is — rather than returning zero lines, or the `policy.output.too-large` the review received.
- **Verified against:** `E2E-STUDIO-WRONG-PROJECT` in [`tests/e2e/studio-session.test.ts`](../tests/e2e/studio-session.test.ts) serves the installed server exactly the page Studio serves and requires an actionable refusal rather than an empty result; a second case requires the numeric Play ID to be refused before it reaches Studio, with a message that names what to use instead. `E2E-STUDIO-LOGS-INVALID-INPUT` covers the rest of the grammar: empty, whitespace, hyphens, a query delimiter, traversal, and `15414`.
- **Note, 2026-08-13:** Exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed. The item remains `implemented` only for the recorded live case: the real Studio page exposes no readable log payload, so the MCP cannot yet create, retrieve, and clean up an own-account marker through a permitted source mechanism.
- **Not covered:** The live half of the verification — creating an own-account marker, retrieving only it, and cleaning up — is recorded as unproven in [`config/acceptance-map.json`](../config/acceptance-map.json). The browser run settled the identifiers, not the tool's behaviour against the live page.

### BGA-321 — Redact file-sourced Studio sessions at every output boundary

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-014, BGA-016, BGA-312
- **Deliverable:** Register the exact normalized session value resolved from every approved provider for redaction before it can reach an error, log, tool result, CLI report, or retained artifact.
- **Acceptance:** Environment and explicit-file providers have stated precedence and normalize once; the value actually sent is the value registered for redaction. The session value and cookie names never appear in text/structured tool content, thrown errors, stdout/stderr, launcher logs, or evidence. A path may be reported only through normal path redaction. No credential becomes a tool argument.
- **Verification:** Seed distinct structured Cookie headers through each provider, with separately unique names and values of at least 16 bytes per component, then force success, redirect, HTTP/DNS failure, timeout, invalid page, CLI preflight, launcher stderr, and simulated CI artifact paths. Every serialized surface is scanned byte-for-byte for each exact canary component and the complete header; the environment/file precedence cases prove the exact chosen value was protected.
- **Finding:** `studioSession()` reads and trims `studioSessionFile`, but `redactionOptions.secretValues` reads only `process.env.BGA_STUDIO_SESSION`. A synthetic file session was successfully resolved while the redaction list remained empty. The existing session-redaction test seeds only the environment provider.
- **Evidence:** [`src/policy.ts`](../src/policy.ts) normalizes a session in one place and registers it for redaction in the same step that returns it, so the value sent and the value protected cannot differ — which is exactly what they did. A session is a whole `Cookie` header, so it is registered as the header, as each `name=value` pair, and as each name and value alone: anything that publishes a fragment of a credential has published a credential, and a diagnostic naming the cookie it used says which credential the operator holds. Registration happens once at startup as well as on resolution, so the value is protected before this server can publish anything at all, while a file that appears later is still read when it is needed.
- **Evidence, precedence:** `--studio-session-file` wins over `BGA_STUDIO_SESSION`, and a configured file that is missing, empty, or unreadable means no session rather than a quiet fall back to the environment. Sending a different credential than the one the operator named is the worse answer, and the refusal says which. Both providers are registered when both are configured: the one not chosen is still a credential this process was handed.
- **Verified against:** `E2E-STUDIO-FILE-SESSION-REDACTION` in [`tests/e2e/studio-session.test.ts`](../tests/e2e/studio-session.test.ts) gives each provider a structurally complete header whose names and values are separately unique and at least sixteen bytes, then makes the Studio page echo back the session it was actually sent — a request log really can carry the developer's own cookie, and a page echoing a fixed string would only prove that a string nobody sent was absent. The echoed value is written as an ordinary query parameter that no pattern recognises, so only the exact registered value removes it. Success, redirect, HTTP failure, unreadable page, timeout, name-resolution failure, the CLI preflight, `check_setup`, the server's stderr, and a file written the way a CI job retains a log are each scanned byte for byte for all ten canaries. Precedence is proven by what the stub received, not by what the code says. Reinstating the environment-only registration fails three of those cases with the file session in the structured content and in the retained artifact.
- **Note, 2026-08-13:** Exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed all scripted packaged surfaces. A real Studio request also used the protected file provider without publishing the configured session in the observed result or stderr, but the page contained no readable log line to echo the credential and exercise every promised surface. Under the live-Studio rule this item therefore remains `implemented`.
- **Not covered:** Nothing further here. BGA-328 landed alongside this item and closed `SURFACE-CLI-STDOUT`: the file is bounded and checked, and no diagnostic names it.

### BGA-322 — Disable default cross-developer readonly access in the Studio test environment

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-013
- **Deliverable:** Least-privilege source ACL setup for the dedicated Studio project, with a documented manual check unless BGA publishes a supported machine-readable mechanism.
- **Acceptance:** “Allow other studio developers to get readonly access to this project source code” is off before private project source is introduced. The exact account/project and observed checkbox state are recorded before every live run. If the state cannot be established through a supported mechanism, the check remains manual rather than scraping another undocumented page.
- **Verification:** Browser/manual evidence records the disabled control, and a distinct Studio developer account cannot discover or obtain project source. A live-harness precondition records/fails on the enabled or unknown state before any private source is seeded. Tests do not claim that this checkbox controls logs, tables, or credentials without separate evidence.
- **Finding:** A newly created BGA `Private` project had the readonly-sharing control checked by default. It currently contains only BGA's synthetic starter skeleton, so no private game source was disclosed during this review, but “Private” alone does not meet BGA-300's isolation acceptance.
- **Live setup evidence, 2026-08-08:** With explicit owner approval, the reviewer toggled the exact readonly-source control off, selected `Update`, reloaded `/studiogame?game=mcpverification`, and confirmed the `bga-checkbox--checked` class remained absent. This satisfies the current manual-state half of verification; the distinct-account denial and automated/manual harness precondition remain undone, so the item stays `ready`.
- **Live re-check, 2026-08-10:** Observed again before this run, which is what the cadence asks for. On `/studiogame?game=mcpverification`, under "Project status", the control "Allow other studio developers to get readonly access to this project source code (checked by default)" renders unchecked — confirmed both in the accessibility tree and by magnifying the control itself. The 2026-08-08 toggle has held. The distinct-account denial and the harness precondition are still undone, so the item stays `ready`.

### BGA-323 — Normalize all IP encodings before SSRF address decisions

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015, BGA-207
- **Deliverable:** Standards-based address parsing/canonicalization that classifies the effective address, including every IPv4-mapped IPv6 representation, before a socket may connect.
- **Acceptance:** Loopback, private, link-local, unspecified, multicast, reserved, unique-local, scoped, mapped, compatible, compressed, mixed, and alternate textual forms are refused according to their normalized address. An unknown/unparseable form fails closed. DNS results are checked as resolved and the socket uses only an approved address.
- **Verification:** Unit vectors include dotted and hexadecimal mapped forms, compressed/mixed IPv6, zone indices, uppercase, leading-zero and invalid variants. Integration and installed-client harnesses prove the production resolver/lookup makes zero connection attempts for every non-public result and cannot substitute a second DNS answer.
- **Finding:** `blockedAddressReason` returned `null` for `::ffff:7f00:1`, `::ffff:a00:1`, and `::ffff:c0a8:101`, while Node recognizes all three as IPv6 and standards parsing maps them to `127.0.0.1`, `10.0.0.1`, and `192.168.1.1`. HTTPS certificate validation is a second barrier, but it does not satisfy the recorded post-resolution refusal.
- **Evidence:** [`src/docs/addresses.ts`](../src/docs/addresses.ts) decides on the parsed address rather than on how it was written. IPv6 is parsed into its sixteen bytes — compression, mixed notation, uppercase, and a zone index are the same address written differently — and an address carrying an IPv4 address is judged as that IPv4 address, covering the mapped (`::ffff:0:0/96`), compatible (`::/96`), NAT64 (`64:ff9b::/96`), and 6to4 (`2002::/16`) forms. The two deprecated forms are refused even carrying a public address, because nothing a documentation host publishes resolves there, while mapped and NAT64 stay usable so a dual-stack or IPv6-only network still works. IPv4 is parsed strictly: a leading zero is refused rather than interpreted, since `0177.0.0.1` is loopback to a reader that takes it as octal and something else to one that does not. Special-purpose space inside global unicast (documentation, discard, and the `2001::/23` protocol block) is refused, everything outside `2000::/3` is refused as unassigned, an address the code cannot parse is refused, and a resolver that reports a family disagreeing with the address it returned is refused rather than believed.
- **Verified against:** `UNIT-DOC-ADDRESS-NORMALIZATION` runs the vectors: the three forms the review reached, the same host in eight spellings, mapped and translated public addresses that must stay usable, special-purpose prefixes, malformed and ambiguous forms, and family disagreement. `E2E-DOCS-ADDRESS-NORMALIZATION` and `E2E-STUDIO-READ-ADDRESS-NORMALIZATION` run through the installed artifact in [`tests/e2e/address-guard.test.ts`](../tests/e2e/address-guard.test.ts): for each spelling the call is refused with `policy.doc-address.blocked`, the name is resolved exactly once, and no socket ever connects. A name answering with one public and one private address is refused rather than filtered, a refusal is never followed by a second resolution that could return a better answer, and where the guard does approve an address the socket is handed that one address and no other. The DNS answer is supplied by [`dns-stub.ts`](../tests/e2e/dns-stub.ts), because a hostile record for a name this project does not control cannot be arranged any other way; the guard, the lookup wiring, and the socket are the installed build.
- **Note:** [CI run 31334309936](https://github.com/Brandon-Born/bga-mcp/actions/runs/31334309936) passed the six-job matrix on `213deaa`. TM-DOC-ADDRESS-NORMALIZATION and TM-STUDIO-READ-ADDRESS-NORMALIZATION move from `planned` to `implemented`; they become `verified` with the capabilities that cross those boundaries, which BGA-324 through BGA-328 still hold open.

### BGA-324 — Make documentation request privacy enforceable and honest

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015, BGA-202, BGA-207
- **Deliverable:** A request-origin/consent design or deliberately narrow query grammar that can enforce the documented promise about what may leave the machine, plus an honest residual-risk statement for what cannot be inferred from text.
- **Acceptance:** The server never claims it can determine whether arbitrary text originated in a project file by scanning for a short marker list. A model-generated request cannot silently transmit local source, identifiers, paths, game names, or secrets. Any explicit user-origin channel, allowlisted semantics, confirmation boundary, and remaining inference limit are machine-enforced and documented.
- **Verification:** Packaged adversarial inputs include plausible SQL, PHP without current markers, metadata values, state/action names, game-specific prose, encoded/whitespace variants, and ordinary BGA questions that must remain usable. Each prohibited request makes zero network attempts; approved requests prove their explicit origin/consent path.
- **Progress, 2026-08-10:** The half that needed no product decision landed: nothing claims provenance detection any more. The tool's own description and its `query` argument now say that the filter reads shape rather than origin, that ordinary-looking text is sent as an ordinary question, and that a query is something which leaves the machine. `TM-DOC-REQUEST-CONTENT` says what it does rather than what it was hoped to do, and `RR-DOC-QUERY-PROVENANCE` records the limit that remains. The item stays open for the part that is a decision rather than a defect — an explicit user-origin channel or a deliberately narrow grammar — because either one changes what a developer is able to search for, and the maintained retrieval evaluation is the measure of that cost.
- **Finding:** `requestContentViolation('SELECT unreleased_secret FROM internal_table')` returns no violation. The current implementation checks length, paths, controls, and eight syntax markers, which can catch obvious pastes but cannot establish provenance. This contradicts BGA-207's absolute “never project file content” acceptance as written.

### BGA-325 — Bound every serialized MCP result, including failures

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015, BGA-016
- **Deliverable:** One final publication-boundary budget applied to success and failure `CallToolResult` payloads after redaction, with bounded diagnostic details, a feasible configured minimum, and stable oversized-result behavior. The contract must state whether JSON-RPC framing is outside that server-owned payload budget.
- **Acceptance:** Startup rejects a configured budget smaller than the constant minimal error payload. No tool/resource result payload, validation failure, policy error, unexpected error, setup report, or structured content exceeds a valid configured limit. Reflected input is length-capped before formatting; the constant replacement failure never includes the rejected value. Transport framing is measured separately if it is not part of this limit.
- **Verification:** Every public capability is invoked through an installed real client with oversized valid and invalid input, nested error details, multibyte text, and the documented minimum/maximum budgets. Assertions measure `JSON.stringify(CallToolResult)` and, separately, the complete JSON-RPC frame where observable; they verify canary absence, stable error code, clean shutdown, and no retained oversized artifact.
- **Finding:** With `--max-output-bytes 64`, one real call returned a 12,162-byte failure containing a 12,000-character input. A fresh packed/installed reproduction measured `Buffer.byteLength(JSON.stringify(CallToolResult)) === 16574` and confirmed its unique marker survived. It did not measure the JSON-RPC envelope or assert every repeated tail character. Successful paths call `assertOutputWithinLimit`; shared failure publication does not.
- **Reproduced, 2026-08-10:** The call was `search_bga_docs` with a 12,000-character `sourceId`: the refusal put the argument in its details and returned 12,162 bytes under a 64-byte budget, byte for byte the figure the review recorded. Two more of the same kind were found while fixing it. `bga://docs/{topic}` with an oversized topic threw a 12,159-byte protocol error, because a resource failure is a thrown message rather than a result and nothing measured it. And a call carrying a 12,000-character _property name_ came back as a 12,145-byte result that no handler of this server ever saw: the protocol library validates arguments before dispatch, and its rejection is a payload this server sends without having written it.
- **Evidence:** The budget is now applied in three places, because a payload can be produced in three. [`src/publish.ts`](../src/publish.ts) measures `JSON.stringify` of the actual `CallToolResult` — the wrapper included, since those are bytes the client receives — rather than of its parts. A failure descends a ladder: the message with its details, the message alone, and a code with a fixed sentence that always fits. The code survives every rung, because which refusal happened is what a caller branches on; the rejected value survives none. `publishResourceFailure` runs the same ladder for a resource, which has no result to put an error in. And `boundOutgoingPayloads` applies the budget once more on the transport, which `serveStdio` accepts as an argument, catching what the protocol library wrote before any handler ran. A catalog is deliberately exempt: `tools/list` is this server describing itself, its size is not the caller's to choose, and bounding it would make a small budget mean "cannot be discovered".
- **Evidence, reflected input:** [`src/errors.ts`](../src/errors.ts) bounds a detail wherever it sits — a value to 120 characters, an array to 20 entries, and the same recursively — so the one part of a refusal whose length a caller chooses is capped before formatting rather than after. Enough of a value survives to recognise which one was refused.
- **Evidence, the floor:** `MINIMUM_OUTPUT_BYTES` is derived from the longest public error code rather than picked, so adding a code cannot quietly make it wrong, and startup refuses a smaller budget with `config.invalid`. Below it, every call would be refused and each refusal refused in turn; failing once at startup says that plainly. The value today is 137 bytes and `--help` states it.
- **Contract:** The budget bounds the payload this server owns — a `CallToolResult`, or a resource's `contents`. It does not include the JSON-RPC envelope: the framing belongs to the protocol library and can change with a revision, so counting it would make the same configured number mean different things across releases. The packaged scenario measures the framing separately and asserts it stays small beside the payload, rather than leaving that assumed.
- **Verified against:** `E2E-POLICY-FINAL-OUTPUT-LIMIT` in [`tests/e2e/output-budget.test.ts`](../tests/e2e/output-budget.test.ts) drives the installed server at its own stated minimum, read from the build's `--help` rather than copied into the test. It covers the startup refusal, a refusal that reflects an argument, the protocol library's validation failure, a resource failure, every advertised tool called with an oversized argument, multibyte input, the documented maximum, the framing measured separately, and a retained log read back off disk. Neutralizing the transport bound fails two of those cases with 12,167 bytes against a 137-byte budget, so the suite is evidence rather than decoration. `INT-POLICY-OUTPUT-LIMIT` covers the floor at the policy boundary and the multibyte measurement.
- **Verified, 2026-08-13:** All four acceptance cases are mapped to passing installed-package assertions, and exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed the six-job matrix. The payload-boundary claim is verified independently of BGA-326's underlying-work cancellation gap.

### BGA-326 — Make operation deadlines cancel underlying work and network bodies

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015, BGA-207, BGA-312
- **Deliverable:** Cooperative cancellation from the public tool deadline through every filesystem read, traversal, parser loop, documentation/Studio request, response body, redirect, and cleanup path.
- **Acceptance:** A timeout aborts and awaits/quiesces the cooperative operation; it does not merely win `Promise.race`. After abort, no new application-level work is issued, parser loops stop at synchronous deadline checkpoints, and callers consume the provided signal or use an actually cancellable primitive. Redirect and non-2xx responses are destroyed or drained under the same byte/time budget before the request settles. Already-issued Node filesystem syscalls that have no `AbortSignal` receive a bounded cleanup wait and are recorded as a residual platform limit rather than claimed cancellable.
- **Verification:** A freshly packed/installed artifact runs deterministic slow filesystem, parse, 2xx, redirect, non-2xx, DNS, and Studio-body probes. Instrumentation observes the same still-running server after timeout settlement and proves no new operations/bytes, bounded tracked cleanup, continued responsiveness, clean shutdown, and no late output or artifact writes.
- **Progress, 2026-08-10:** Two thirds of this landed and one third did not, so the item stays open. The deadline now hands its signal to the work it starts: every tool and project resource passes it into the project load, the traversal checks it per entry and per directory, the file read takes it, and the validator aggregate checks it between groups. `runWithTimeout` no longer merely wins the race — it awaits the aborted work, bounded by a 250 ms cleanup window, before publishing the failure. Redirected and non-success documentation bodies are destroyed rather than resumed, and a socket the deadline abandoned is closed.
- **Audit correction, 2026-08-13:** None of the underlying-work acceptance is proven yet. `search_bga_docs`, documentation resources, and `read_studio_logs` invoke `runWithTimeout` without passing its signal into the network request. The response-lifecycle test checks the far-end transcript only after its helper shuts down the client and MCP process, so shutdown can close the socket and satisfy the assertion; its duration corroborates that reading. `TM-DOC-RESPONSE-LIFECYCLE` is planned again.
- **Implemented network slice, 2026-08-13:** [`search_bga_docs`](../src/tools/search-bga-docs.ts), both documentation resources, and `read_studio_logs` now carry the `runWithTimeout` signal into every documentation or Studio fetch. [`src/policy.ts`](../src/policy.ts) checks it at each redirect hop and gives a signalled request its own `Resolver`, so abort calls `cancel()` only on that request's A/AAAA queries. The same signal reaches the HTTPS request and therefore the bounded response reader. Studio session-file preflight also receives it before either the explicit preflight or the fetch reads the credential.
- **Installed evidence:** `E2E-DOCS-RESPONSE-LIFECYCLE` drives a freshly packed artifact through a streaming 2xx body, a redirect whose target stalls, a stalled cancellable DNS resolver, a documentation resource, a redirect body discarded immediately, and a streaming non-success body. Each case snapshots the far-end work when the public call settles, waits 350 ms with the server still running, requires no additional requests or bytes, and then calls `check_setup` through the same client. `E2E-STUDIO-READ-NETWORK-CANCELLATION` applies the same oracle to the authenticated Studio page path. `UNIT-DNS-CANCELLATION-SCOPED` runs two resolvers concurrently, aborts one, and proves the other is neither cancelled nor prevented from resolving. `E2E-FILESYSTEM-CANCELLATION` loads a test-only pre-import shim into the installed process, delays one real `lstat` or descriptor `read`, and proves each finishes before timeout settlement with no later transcript entry while the same client remains responsive. This is implementation evidence, not exact-HEAD CI verification.
- **Implemented filesystem and parser slice, 2026-08-13:** Root adoption and resolution, traversal, descriptor reads, secondary schema reads, validators, project resources, Studio credential-file preflight, and CLI `--studio-check` now share the operation signal. `runWithTimeout` registers a monotonic deadline as well as an abort timer; parser loops call cooperative checkpoints that can expire the operation even while the event loop cannot run the timer. The signal is threaded through project, rules, documentation, and Studio parsing, and cancellation is not reclassified as unsupported syntax or malformed input. `INT-POLICY-TIMEOUT` deterministically advances the monotonic clock during a non-yielding JSONC scan and proves it expires.
- **Installed parser evidence, 2026-08-13:** `E2E-POLICY-PARSER-DEADLINE` loads a test-only clock probe before the installed server. The probe advances only when the stack is inside `parseJsonc` through `periodicCancellationCheckpoint`, so the fifth synchronous checkpoint—not an event-loop timer or client shutdown—expires the operation. Its stage transcript is complete when the timeout settles and unchanged 350 ms later while the same MCP client successfully calls `check_setup`; the parser canary reaches no result or stderr. The test then temporarily removes the periodic checkpoint from the installed module and proves the identical operation completes instead of timing out before restoring the file. BGA-412 owns this evidence, which passed exact-head CI on commit `cf44ecf` in [run 31764576610](https://github.com/Brandon-Born/bga-mcp/actions/runs/31764576610).
- **Remaining evidence limit:** The installed filesystem probe deliberately covers listing and descriptor-read syscalls, not every native filesystem primitive, and Node cannot cancel an already-issued `open`, `stat`, `opendir`, or `read` syscall. Cooperative work is awaited within the 250 ms cleanup ceiling; a primitive that outlives it remains a recorded platform residual rather than turning the public deadline into an unbounded wait. Native regex, `JSON.parse`, and sorting are atomic segments bounded by input budgets and followed by checkpoints rather than interruptible mid-engine call. `E2E-POLICY-CANCELLATION` and the broader `E2E-STUDIO-READ-CANCELLATION` remain reserved for the complete native-filesystem matrix. The item is therefore `implemented`, not `verified`.
- **Original finding, 2026-08-08:** `runWithTimeout` aborted a signal, but tool callbacks commonly ignored it. A 5 ms synthetic probe returned `policy.timeout.exceeded` while the operation still completed at 50 ms. In a fresh installed-client `inspect_project` probe, the timeout response arrived before any delayed `lstat` completed, then 28 filesystem operations completed during the next 350 ms. The driver took 4.41 seconds; final instrumentation after client close/process exit recorded 358 starts and 357 completions for the 500-file scan, showing shutdown—not operation cancellation—eventually interrupted it. The network continuation and the representative installed filesystem cases are corrected above; the remaining complete-matrix limits are recorded separately rather than leaving this historical reproduction phrased as current behavior.

### BGA-327 — Minimize and redact successful public results

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-014, BGA-016, BGA-109, BGA-312
- **Deliverable:** A shared successful-output publication boundary that removes credentials, sessions, personal data, and unnecessary literal source content before text and structured results leave the process.
- **Acceptance:** Every public result is schema-preserving, data-minimized, and passed through context-aware redaction. Database diagnostics report the location/shape needed to fix a query without returning secret-bearing SQL literals. Own-account Studio messages still withhold any recognized credential or personal-data form. Text summaries cannot reintroduce values removed from structured content.
- **Verification:** Installed-client scenarios seed exact configured secrets and every known credential shape into SQL literals, Studio messages, errors, and nested structured fields. Arbitrary canaries are required only in fields the contract explicitly minimizes; ordinary project metadata and notification payloads remain usable unless they match a defined secret rule. Tool text, structured content, resources, stderr, and retained evidence are scanned byte-for-byte while useful non-secret diagnostics remain.
- **Finding:** `parseQueries` preserves complete SQL and `audit_database_usage` returns it verbatim; a synthetic password literal survived. `screenStudioLog` recognizes only email, lock, session-id, and PHPSESSID patterns, so an own-account `Authorization: Bearer ...` line was kept with its marker. Shared `redactValue` is applied to failure publication, not these successful results.
- **Evidence:** [`src/publish.ts`](../src/publish.ts) is now the one place a successful result leaves the process. It parses the value against its published schema, redacts it, parses it again — redaction that broke the shape would be a different result rather than a safer one — renders the text summary _from the redacted structure_, redacts that too, and measures the budget last, on what is actually about to be sent. Every tool and both resource families call it, so the guarantee is one function rather than eleven call sites' care. Rendering the summary from the redacted structure is what answers the fourth acceptance case: the interpolated-query finding quotes the query it is about, and quoting the one the parser read would have published in prose exactly what the fields had just dropped.
- **Evidence, database:** [`maskSqlValues`](../src/project/database.ts) publishes the shape of a query without the values in it. The documentation puts a value in one place — `escapeStringForDB` "makes sure that no SQL injection will be done through the string used, **as long as the SQL statement uses single quotes around the string. This is important!**" — so a quoted run is where a value is, and `WHERE card_location = 'hand'` is published as `WHERE card_location = '?'`. Interpolations survive the mask, because which variable reaches a query is the entire content of the interpolation finding and a variable name is not a value. Both quotings are read, since SQL inside a single-quoted PHP string arrives escaped as `\'…\'`. The same mask runs over every source snippet an unsupported-syntax message quotes, and before the snippet is cut rather than after: half a literal is still half a published password.
- **Evidence, Studio:** [`src/studio/privacy.ts`](../src/studio/privacy.ts) no longer decides what a credential is from a private list of four patterns. A line is withheld whole when the shared credential rules recognize anything on it, and a line that is kept goes through `redactSecrets`, so an own-account line reading `UPDATE player SET player_name='…'` comes back with the shape and without the name. Credentials are separated from personal data on purpose: there is no reading of a leaked token that stays useful, while a query naming a player column is a diagnostic worth keeping. Studio text takes the `known-locations` path option, because a request log is full of `/game/game/action.html` and reading those as filesystem paths would return a column of `[redacted-path]` instead of a log; the machine's own roots and home directory are still replaced, by value.
- **Verified against:** `E2E-SUCCESS-OUTPUT-REDACTION` and `E2E-STUDIO-SUCCESS-REDACTION` in [`tests/e2e/success-redaction.test.ts`](../tests/e2e/success-redaction.test.ts) seed a password, a token-shaped literal, an unreadable statement's value, an email, a bearer header, and the server's own configured session value into a real project on disk and into a Studio page, each with a value that appears nowhere else. Every one is required absent, byte for byte, from the text and structured content of eight tools, three project resources, a documentation resource, a documentation search result, and the server's stderr. The second half of each case is the point: the query is still reported with its table and column, the developer's sentence is still readable, the state and table names are still there, and the Studio line still says what it did — a boundary that removed everything would be an off switch, not a redaction boundary. `UNIT-REDACTION-CREDENTIALS` covers what may be edited versus what may not be published at all, and `UNIT-REDACTION-PATHS` covers the two path modes.
- **Note, 2026-08-13:** The local/project publication boundary and all scripted packaged surfaces passed exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331). With `TM-SUCCESS-OUTPUT-REDACTION` implemented, `AC-SECRET-IN-OUTPUT` no longer publishes through `SURFACE-TOOL-RESULT`, so the universal composition blocker is closed. This item remains `implemented` because its Studio-message promise still lacks a live log payload against which to prove redaction and useful retained content.
- **Sources:** [Main game logic: yourgamename.game.php](https://en.doc.boardgamearena.com/Main_game_logic:_yourgamename.game.php) for the database helpers and the single-quote escaping requirement; [Game database model: dbmodel.sql](https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql) for what a schema declares and which tables the framework owns.

### BGA-328 — Harden Studio session-file loading and diagnostics

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-015, BGA-016, BGA-312, BGA-316
- **Deliverable:** A bounded, regular-file-only, least-privilege Studio session provider whose diagnostics never publish its private path.
- **Acceptance:** The provider refuses directories, devices, sockets, FIFOs, disallowed links/reparse points, and oversized/empty content before an unbounded read. On POSIX it enforces the expected owner and mode 0600. On Windows it enforces a documented ACL/reparse-point equivalent or refuses the file provider as unsupported. The read is cancellable and has a small explicit byte budget. Setup output says only that a configured file is present/missing; ordinary path redaction applies everywhere.
- **Verification:** Integration and packaged CLI probes cover POSIX 0600/wrong owner or mode, Windows secure/insecure ACL or explicit unsupported refusal, symlink/reparse point, FIFO/device where applicable, directory, oversized/growing file, unreadable/deleted file, timeout, relative-path resolution, and environment precedence. No absolute path or content appears in stdout/stderr, tool setup results, errors, or evidence; every probe cleans up safely.
- **Finding:** `studioSession()` performs unbounded `readFile` on any configured path without file-type, symlink, size, owner, or mode checks, and CLI preflight runs outside `runWithTimeout`. `--studio-check` also prints the absolute session-file path, and its integration test requires that disclosure.
- **Evidence:** [`src/policy.ts`](../src/policy.ts) opens the file with `O_NOFOLLOW` and `O_NONBLOCK` and decides on the descriptor rather than on the path. `O_NOFOLLOW` means a symbolic link is refused by the kernel instead of by a check a rename could outrun; `O_NONBLOCK` means a FIFO with no writer returns rather than hanging the server before it can refuse it. What is then required of the opened object: a regular file, no group or other permission bits, the current account as owner, non-empty, and no larger than 4096 bytes — a Cookie header for one host is a few hundred. The read is bounded by the size measured on that same descriptor, so a file that grows between the check and the read cannot enlarge it, and it takes the caller's abort signal.
- **Evidence, Windows:** The provider is refused there as unsupported, and says so. Windows has neither flag, and reading an ACL would mean shelling out to another program from inside the credential path. A check that looks like one and is not is worse than a plain refusal, and the environment variable is the supported route on that platform.
- **Evidence, diagnostics:** `--studio-check` and `check_setup` now say which provider, never which file. The path used to be printed in full, and the integration test of the day required it to be. A refusal still says _why_ — wrong mode, not a regular file, empty, too large — because a developer who set the mode wrong cannot act on "no session was found".
- **Verified against:** `E2E-STUDIO-SESSION-FILE-SAFE` in [`tests/e2e/studio-session.test.ts`](../tests/e2e/studio-session.test.ts) drives the installed server against a directory, a symbolic link, a FIFO, a world-readable file, an empty file, an oversized file, and a missing one. Each is refused with a reason and without its path, in both the tool result and its structured content, and the terminal check is driven separately for an accepted and a refused file to prove neither prints the location. The FIFO case is the one where the refusal arriving at all is half the assertion. On Windows the same identifier is declared by the case that proves the provider is refused as unsupported, so the scenario is evidence on every platform the matrix runs.
- **Note, 2026-08-13:** Exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed the implemented packaged cases. This item remains `implemented` because the wrong-owner POSIX refusal is still recorded as unproven; CLI preflight cancellation is now implemented under BGA-326 but has no exact-head CI evidence yet.
- **Not covered:** The owner check is implemented and unproven — a refusal for a file owned by a second account needs a second account, which the packaged harness cannot create. It is recorded as unproven in [`config/acceptance-map.json`](../config/acceptance-map.json) rather than claimed.

### BGA-329 — Make the privileged-effect boundary non-bypassable

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015
- **Deliverable:** An allowlist/AST architecture check that makes `src/policy.ts` the only production module able to reach filesystem, network, subprocess, or equivalent privileged globals through any import spelling or loading form.
- **Acceptance:** Bare and `node:` specifiers, subpaths, aliases, namespace/require/dynamic imports, re-exports, repository-owned wrappers, `fetch`, WebSocket, worker/process primitives, and newly added effectful core modules cannot bypass the boundary. The rule applies to all production source and fails closed when a privileged primitive is unknown; dependency-wide effect analysis is not implied.
- **Verification:** Seeded source snippets for `fs/promises`, `node:dns`, `node:http2`, dynamic imports, alternate quote styles, re-exports, and global `fetch` each fail both lint and the repository gate. An allowed import in `policy.ts` passes; the current tree contains no runtime offender.
- **Finding:** ESLint blocks eight exact `node:` paths outside `policy.ts`; the repository test mirrors them with a single-quote `from` regex. Read-only lint probes reported no restricted-import error for `fs/promises`, `node:dns`, `node:http2`, or global `fetch`. No active production bypass was found, so this is a control-integrity defect rather than evidence of current exfiltration.
- **Evidence:** [`scripts/lib/effect-boundary.ts`](../scripts/lib/effect-boundary.ts) reads the syntax rather than the text. Every form that can name a module is a node in the tree — a static import, a re-export, `import()`, `require()`, and `import x = require()` — so quoting style, whitespace, and line breaks stop mattering once the parser has done the work. Privileged globals are found the same way, with an identifier that is the _name_ of a property or parameter distinguished from a use of the global itself. A type-only import is not a reach: it is erased before anything runs, and refusing it would push readable code into `any` for no protection.
- **Evidence, failing closed:** The builtin list is an allowlist of twelve pure modules, so a builtin nobody has thought about is refused rather than permitted. A `node:` specifier is judged as a builtin even when this Node release has never heard of it, which is what makes a future effectful module refused on the day it appears rather than on the day somebody notices. What this deliberately does not do is analyse dependencies: a package from npm can do as it likes, that is the supply-chain risk the model records separately, and pretending this check covered it would be worse than saying it does not.
- **Evidence, two mechanisms:** ESLint now expresses the same allowlist — a `node:*` group with negations, the prefix-less spellings, restricted globals, and restricted `process` members — so a developer sees the refusal while typing. The gate is what fails the build. A third case compares the two, because a fast rule that has quietly become laxer than the slow one is worse than no fast rule at all.
- **Verified against:** `GATE-POLICY-COMPLETE-EFFECT-BOUNDARY` in [`tests/integration/repository-gates.test.ts`](../tests/integration/repository-gates.test.ts) seeds each form the 2026-08-08 probe got past — `fs/promises`, double quotes, `node:http2`, a re-export, a dynamic import, `require`, `import equals`, a subpath, an unlisted builtin, bare `fetch`, `globalThis.fetch`, a `Worker`, and `process.binding` — and requires every one to be detected. It then requires the forms production code legitimately uses to pass, runs over the whole of `src` and finds nothing, and separately requires `src/policy.ts` to still contain what everything else may not, so this is a statement about where the effects are rather than about their absence.
- **Verified, 2026-08-13:** All three acceptance cases are mapped to the seeded repository gate, the current production tree has no offender, and exact-HEAD [CI run 31448712331](https://github.com/Brandon-Born/bga-mcp/actions/runs/31448712331) passed the six-job matrix. Dependency-wide effect analysis remains an explicit non-claim.

### BGA-330 — Make filesystem traversal entry-bounded and race-safe

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-013, BGA-015
- **Deliverable:** Directory traversal and file reads that bound all encountered work/data and bind containment/type/size decisions to the exact object read rather than a reusable pathname.
- **Acceptance:** One cumulative budget counts files, directories, links, special entries, diagnostics, metadata bytes, and directory fanout before materialization/sort. No content reached through a static or deterministically forced single-swap link is returned or published. Reads use no-follow/descriptor identity plus repeated containment checks, stream under a byte cap, and refuse replacement or growth without exposing outside-root content. Repeated adversarial swaps remain the explicit `openat` residual rather than an implied guarantee.
- **Verification:** Installed-client fixtures include link storms, empty-directory storms, huge single directories, deep trees, special files, concurrent rename/symlink swaps, and file growth/replacement. Each stays within operation/output budgets, reports truncation truthfully, makes no outside-root read, and cleans up. A test-only installed-artifact module barrier forces replacement after the final pre-open identity/containment check and before real open, and forces growth after descriptor stat and before descriptor read; it records stage order. Stress repetition is secondary evidence, not the race oracle.
- **Finding, 2026-08-08:** `listProjectFiles` read and sorted a whole directory, appended every symlink, recursed every directory, and counted only regular files. With `maxEntries: 1`, an existing directory returned zero files, four skipped links, and `truncated: false`. File reads separately realpathed a pathname, then later `lstat`ed and read it; a concurrent intermediate-directory swap or file replacement could invalidate containment and size decisions. The resource-exhaustion defect was reproduced; the TOCTOU escape was a static race finding requiring concurrent project write access.
- **Reproduced bypass before repair, 2026-08-13:** The then-current implementation resolved and contained a path, opened that reusable pathname, then statted the same pathname and compared it with the descriptor. Replacing an intermediate directory with an outside-root symlink before open made both operations select the same outside object, so device and inode matched and outside content was read. `O_NOFOLLOW` protected only the final component. Growth detection was also false: the read allocated descriptor size plus one but rejected only bytes beyond the configured maximum, allowing ordinary post-stat growth to be returned or silently truncated.
- **Evidence, the budget:** [`src/policy.ts`](../src/policy.ts) now spends one budget on everything it encounters — a file, a directory, a link, a socket, a FIFO — before deciding what to do with it, and reads directories lazily with `opendir` so a huge one can be stopped before all its names are in memory. What it read before the budget ran out is still returned, sorted per directory, with truncation reported beside it: a partial answer that says it is partial is useful, and one that claims to be complete is not.
- **Evidence, bounded diagnostics:** The counts are work and the names are output, so skipped links and unreadable directories are counted always and named up to a cap. A link for every file used to turn a listing into a megabyte of diagnostics, which the output budget then refused outright — the developer learned nothing and the work was done anyway.
- **Evidence, identity and growth:** A file is opened once with `O_NOFOLLOW`. Its pre-open pathname identity must match descriptor identity; post-open containment and pathname identity must still match that descriptor. The read requires the descriptor's exact measured size followed by EOF and re-stats before returning. Directory identity and containment are checked around `opendir` before entries are consumed. `INT-POLICY-SINGLE-SWAP-REFUSAL` deterministically replaces an intermediate directory after initial containment and a configured directory before traversal; `INT-POLICY-POST-STAT-GROWTH-REFUSAL` appends marker content after the descriptor stat. All three operations return `policy.path.symlink-escape` without the marker, restore their spies and fixtures in `finally`, and run directly against `PolicyBoundary` rather than the installed package.
- **Packaged evidence:** `E2E-POLICY-OBJECT-BOUND-READS` in [`tests/e2e/traversal-bounds.test.ts`](../tests/e2e/traversal-bounds.test.ts) builds projects out of the shapes that used to be free — six thousand links, six thousand empty directories — and requires the installed server to report them as truncated with a handful of files and at most a hundred named skips. A deep tree past the depth budget must say it was cut short. A file replaced by a link into another directory, a link where a state file should be, a link standing in for a whole module directory, and a file grown two megabytes between calls each have to come back without a byte of outside-root content.
- **Installed race evidence, 2026-08-14:** `E2E-POLICY-RACE-BARRIER` in [`tests/e2e/race-barrier.test.ts`](../tests/e2e/race-barrier.test.ts) loads [`race-barrier-stub.ts`](../tests/e2e/race-barrier-stub.ts) before the installed policy binds its filesystem imports. A real MCP call pauses after the selected production check; the parent proves the call is still pending, releases the barrier, and the child replaces the intermediate or configured directory before real `open`/`opendir`, or appends after descriptor `stat` and before descriptor `read`. Exact stage transcripts are asserted. All three return `policy.path.symlink-escape`; no outside or appended marker reaches tool text, structured content, stderr, the transcript, or a simulated retained artifact; each same client calls `check_setup` after fixture restoration. The installed package is scanned to prove the preload and its environment names were not shipped.
- **Verified, 2026-08-14:** Full local `pnpm check` passes with 71 test files and 564 tests, and the acceptance map records 143 of 145 cases proven with only the two live/second-account Studio cases still missing. All six Ubuntu, macOS, and Windows jobs on Node 22 and 24 passed for commit [`4c8fa41`](https://github.com/Brandon-Born/bga-mcp/commit/4c8fa4177ff9dbf0211dd0adbbbcde1fa562d94e) in exact-HEAD [CI run 31809979270](https://github.com/Brandon-Born/bga-mcp/actions/runs/31809979270). Portable Node pathname checks still cannot prevent repeated adversarial swaps across every successive check; `RR-POLICY-TRAVERSAL-OPENAT` records that residual honestly rather than treating deterministic single-swap evidence as `openat` equivalence.

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
- **Depends on:** BGA-003, BGA-009, BGA-414
- **Deliverable:** Verified setup, configuration, troubleshooting, update, and removal instructions for each supported MCP client and platform, including a first-run walkthrough that states the supported layouts and what a modern-layout project will and will not get today.
- **Acceptance:** Commands use released artifacts, explain permissions and data flow, and never require copying secrets into agent prompts.
- **Evidence:** [INSTALL.md](INSTALL.md) covers installing, pointing a client at the server, checking it worked, updating, removing, and the failures a developer actually hits, each with its stable error code. Every option is listed with what it enables **and what it costs** — which data leaves the machine, and what the experimental one risks — rather than as a flag list. Removal is three steps and says plainly that the server itself writes nothing outside its directory. The guide refuses to publish a general live Studio credential recipe while BGA-312's blockers remain open and never tells the reader to paste a session into a prompt or launcher configuration. The first-run path leads with the case where a 2025-era client advertises its roots and no configuration is needed at all; modern/hybrid and 2026 limitations are explicit.
- **Note:** `implemented`, not `verified`. Installation is from a git clone because no package is published yet: BGA-403 changes that, and the commands here change with it. Per-client instructions wait on BGA-401's smoke matrix, since this project should not claim a client works before testing it — the guide describes what any stdio client needs and does not name clients it has not run against.
- **Verification:** Fresh-environment E2E follows each guide verbatim from install through capability call and clean removal.
- **Adversarial finding, 2026-08-08:** The packed artifact excludes `docs/`, but its installed README and CLI help point there. The README also says seven tools and three resources while real discovery returns ten tools and eleven concrete resources. The canonical `AGENTS.md` description additionally said the server “never opens a network connection” after opt-in documentation and Studio reads existed; the review corrected the immediate wording, and BGA-411 owns a durable documentation/inventory drift gate.

### BGA-401 — Maintain the supported-client smoke matrix

- **Status:** planned
- **Priority:** P1
- **Depends on:** BGA-009, BGA-010, BGA-400, BGA-414
- **Deliverable:** Automated or reproducible smoke tests for every MCP client explicitly claimed as supported.
- **Acceptance:** Client/version/platform claims map to current evidence; untested clients are described only as MCP-compatible candidates, not supported.
- **Verification:** Release gates run each supported client flow or attach current controlled-environment evidence.

### BGA-402 — Define versioning and compatibility policy

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-006, BGA-009, BGA-414
- **Deliverable:** Policies for package versions, tool/schema changes, manifest changes, MCP versions, deprecations, and BGA compatibility.
- **Acceptance:** Breaking change criteria and package, protocol, deprecation, and BGA support windows are explicit and machine checked. The installed release tool, resource, manifest, export, and public schema contract cannot change silently. A supported previous contract remains callable or its removal requires the declared major and deprecation boundary.
- **Verification:** [`GATE-VERSION-POLICY`](../tests/unit/version-policy.test.ts) seeds silent schema drift, an additive patch, a too-early removal, a major removal without deprecation, and a same-version versioned-schema rewrite; each is refused, while an additive minor and a removal after a declared 90-day/next-major boundary pass. [`E2E-CONTRACT-COMPATIBILITY`](../tests/e2e/version-policy.test.ts) installs the shared tarball, connects through the real MCP client, compares exact release discovery and shipped contracts with the retained `1.0.0` candidate, then calls all seven tools and reads all three resources using the retained contract.
- **Policy:** [`config/version-policy.json`](../config/version-policy.json) defines SemVer levels, a 90-day and one-minor deprecation floor, 180 days of feasible critical-security fixes for the previous major, and no silent withdrawal of MCP or BGA support. [`config/contracts/1.0.0.json`](../config/contracts/1.0.0.json) fingerprints the BGA-414 package surface. Published snapshots are append-only; `0.0.0-development` remains unpublished and the first stable contract is `1.0.0`.
- **Sources:** [Semantic Versioning 2.0.0](https://semver.org/) says incompatible public API changes increment the major and deprecation increments the minor. [MCP Versioning](https://modelcontextprotocol.io/docs/learn/versioning) says peers “MUST agree on a single version” for a session. The [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference) says `states.inc.php` is “deprecated” while documenting its replacement, and the [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) says an old file can be safely deleted only after its replacement is ready. Those sources justify separate package, protocol, and per-construct BGA lifecycles rather than treating one new form as removal of every old one.
- **Verified against:** Full local `pnpm check` passes with 75 test files and 570 tests; all 168 required scenarios pass, and the acceptance map records 149 of 151 cases proven with the two existing live Studio cases explicitly missing. All six Ubuntu, macOS, and Windows jobs on Node 22 and 24 passed for implementation commit [`1e05b39`](https://github.com/Brandon-Born/bga-mcp/commit/1e05b39bb93af10cef0699ba1ec12710afa60f7f) in exact-HEAD [CI run 31840842689](https://github.com/Brandon-Born/bga-mcp/actions/runs/31840842689), and the same matrix passed again for main merge commit [`6e7ae95`](https://github.com/Brandon-Born/bga-mcp/commit/6e7ae95c5ce8d8ca0ba01aa8c9416136cde9b657) in [CI run 31841250193](https://github.com/Brandon-Born/bga-mcp/actions/runs/31841250193). BGA-402 is `verified`, and BGA-403 may start.

### BGA-403 — Build the reproducible release-candidate pipeline

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-005, BGA-011, BGA-012, BGA-014, BGA-402, BGA-414, BGA-416 through BGA-420, BGA-422
- **Deliverable:** A least-privilege pipeline that builds once from a clean tag, verifies, packages, and preserves one immutable candidate for BGA-404, BGA-407, and BGA-405. This item does not publish and grants no registry or identity-token permission.
- **Acceptance:** Candidate creation fails when any release-included capability lacks required evidence; the artifact is reproducible from the recorded commit and lock digest; every downstream step consumes the recorded artifact digest rather than rebuilding it. Publication remains impossible until BGA-415.
- **Verification:** A dry run proves all gates, artifact hashes, exact-artifact reuse, and absence of a publish path or publication credential. A seeded missing scenario, changed artifact, or failing required gate blocks candidate completion.
- **Implementation, 2026-08-15:** [`.github/workflows/release-candidate.yml`](../.github/workflows/release-candidate.yml) is manual-only, checks out one existing `v1.0.0-rc.N` tag with persisted credentials disabled, grants only `contents: read`, and retains its output for 90 days. [`scripts/create-release-candidate.ts`](../scripts/create-release-candidate.ts) refuses a dirty or mismatched tag, runs the complete gate, packs the original candidate, reconstructs the same tag from an offline frozen-lockfile worktree, and requires byte-for-byte equality. The [`release-candidate.json` schema](../config/release-candidate.schema.json) binds the original tarball, source commit, tag, lockfile, frozen inventory, capability manifest, and sealed verification evidence by SHA-256; the bundle also carries the evidence, schema, and `SHA256SUMS`. The reconstruction is discarded and a non-empty destination is never overwritten.
- **Implemented evidence:** `GATE-RELEASE-CANDIDATE` seeds automatic triggers, elevated permissions, registry commands and credentials, an unpinned artifact action, a dirty tree, a tag/HEAD mismatch, and version drift. `INT-RELEASE-CANDIDATE-DRY-RUN` assembles the retained bundle from equal candidate/reconstruction bytes, validates its schema and checksums, then proves changed bytes, failed tests, missing selected scenarios, and overwrite attempts stop it. Full local `pnpm check` passes with 76 test files and 572 tests; all 168 capability scenarios pass, the two new supply-chain claims pass, and the acceptance map records 152 of 154 cases proven with the two existing live Studio cases explicitly missing. This remains `implemented`, not `verified`, until exact-head CI passes and the manual workflow successfully builds an actual candidate tag.
- **Reopened dependency, 2026-08-23:** The tarball is reproducible, but BGA-416 proves its public `bga-mcp` executable is the development profile rather than the release entry point the candidate inventory verifies. BGA-417 through BGA-420 invalidate selected validator claims, and BGA-422 records current advisories in the candidate toolchain. Candidate creation must be rerun only after those owners restore BGA-414.
- **Sources:** [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) documents that `npm pack` creates the installable tarball and supports an explicit pack destination. [GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data) documents that v4 artifacts are immutable, can carry an explicit retention period, and expose a SHA-256 digest that download validates.

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
- **Depends on:** BGA-013, BGA-014, BGA-403, BGA-404, BGA-407, BGA-414, all capabilities in the release
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
- **Depends on:** BGA-012, BGA-403, BGA-404
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
- **Depends on:** BGA-003, BGA-006, BGA-400, BGA-414, BGA-416
- **Deliverable:** A packed artifact whose README/help links resolve for an installed-package reader and whose public/canonical agent-facing capability inventory and boundary descriptions are generated or checked against real MCP discovery and policy configuration.
- **Acceptance:** Every relative path in the packed README exists in the tarball; alternatively, repository-only material uses an absolute, versioned public URL. CLI help never tells an installed user to read a file the package omits. Tool, resource-template, concrete-resource, prompt, stability, network, and experimental counts are derived from the manifest plus packaged discovery, with the distinction between templates and concrete listed resources stated. README, install/help text, and `AGENTS.md` agree that network access is off by default—not absent—and identify the explicitly enabled network surfaces. None calls an implemented or experimental capability verified.
- **Verification:** An isolated consumer installs the tarball, resolves every local Markdown/help path, follows one install and one removal flow, discovers the server, and compares all documented names/counts/stabilities with the client response and packed manifest. A seeded missing file and stale count each fail.
- **Finding:** The audited tarball contained README.md but no `docs/`; all README links to installation, testing, backlog, compatibility, threat model, and verification records were broken locally. Discovery returned 10 tools and 11 concrete resources, not the documented 7 and 3. The canonical agent instructions also retained the obsolete absolute claim that the server never opens a network connection.
- **Additional finding, 2026-08-23:** Current prose has drifted again. `docs/INSTALL.md` says BGA-403 has not landed and only `legacy-flat` is supported; README says BGA-318, BGA-326, and BGA-328 remain open after their recorded implementations, points users at the development `dist/cli.js`, and describes an incomplete session boundary the backlog says was closed. The install guide still reports the older `4/9` documentation score while BGA-211 records `3/9`. The package still omits every linked `docs/*` page and `SECURITY.md`. BGA-416 additionally proves the installed public command and README inventory describe different profiles. These remain one inventory-derived documentation defect, not separate implementation items.

### BGA-412 — Prove parser deadlines through the installed artifact

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-326
- **Deliverable:** One deterministic packaged-server oracle for the synchronous parser deadline that BGA-326 already implements, using test-only instrumentation and no production callback, environment switch, or timing guess.
- **Acceptance:** A real MCP client drives the installed artifact into a deliberately slow parser segment, records that the monotonic deadline checkpoint—not client shutdown—ends it, observes no parser work or output after settlement, and successfully calls the same live server afterward. Neutralizing the production checkpoint makes the scenario fail.
- **Verification:** `E2E-POLICY-PARSER-DEADLINE` packs and installs the artifact, records checkpoint/stage order from outside production code, forces expiry inside a non-yielding parse, waits past the configured cleanup interval, and proves continued responsiveness and clean shutdown. The BGA-326 acceptance-map case moves from `missing` only after this passes.
- **Scope limit:** This is an evidence item, not permission to add another cancellation framework or thread signals through unrelated code. Native regex, `JSON.parse`, and sorting remain budgeted atomic segments followed by checkpoints unless a failing release scenario proves otherwise.
- **Evidence, 2026-08-13:** [`tests/e2e/parser-deadline-stub.ts`](../tests/e2e/parser-deadline-stub.ts) is loaded only into the installed test process. It recognizes the shared deadline and JSONC parser checkpoint from their call stack, returns a deterministic monotonic sequence, and writes an external stage transcript. [`E2E-POLICY-PARSER-DEADLINE`](../tests/e2e/cancellation.test.ts) requires registration followed by five parser checkpoints, expiry before public settlement, no later event or canary output, a successful same-client `check_setup`, and clean shutdown. Its mutation control removes the installed periodic checkpoint, proves the call completes instead, and restores the artifact in `finally`. No production file or package configuration changed.
- **Verified against:** Full `pnpm check` passes with 70 test files and 563 tests, including the active-checkpoint and neutralized-checkpoint installed-package cases; the acceptance map records 141 of 145 cases proven and four explicit gaps. All six Ubuntu, macOS, and Windows jobs on Node 22 and 24 passed for commit `cf44ecf` in [CI run 31764576610](https://github.com/Brandon-Born/bga-mcp/actions/runs/31764576610).

### BGA-413 — Prove filesystem race refusal through the installed artifact

- **Status:** verified
- **Priority:** P0
- **Depends on:** BGA-330, BGA-412
- **Deliverable:** A test-only installed-artifact barrier that records and forces the three remaining BGA-330 race windows: intermediate/configured-directory replacement before real `open` or `opendir`, and file growth after descriptor `stat` but before descriptor `read`.
- **Acceptance:** Every forced single swap returns the stable policy refusal through a real MCP client; no outside or appended marker reaches tool content, structured content, stderr, or retained artifacts; the stage transcript proves the mutation occurred in the intended window; the same server remains usable. Test hooks are not packed as production files and production exposes no backdoor.
- **Verification:** `E2E-POLICY-RACE-BARRIER` runs the file, directory, and growth cases against the installed package and fails if the operation settles before the barrier or if the expected stage order is absent. It replaces the two BGA-330 `missing` acceptance-map entries with packaged evidence. Repeated adversarial swaps that require descriptor-relative `openat` remain the explicit platform residual, not new scope for this item.
- **Evidence, 2026-08-14:** [`tests/e2e/race-barrier-stub.ts`](../tests/e2e/race-barrier-stub.ts) is a preload-only test module outside the tarball. [`E2E-POLICY-RACE-BARRIER`](../tests/e2e/race-barrier.test.ts) proves the public call is pending at each barrier, releases the child to perform the mutation between the named real filesystem stages, requires `policy.path.symlink-escape`, scans every public and retained surface for all canaries, restores each fixture, and successfully calls `check_setup` through the same client. It also scans the installed package for the test filename and environment prefix, so the proof does not add a production backdoor. Full local `pnpm check` passes with 71 test files and 564 tests; all 164 required scenarios pass, and the acceptance map records 143 of 145 cases proven. All six Ubuntu, macOS, and Windows jobs on Node 22 and 24 passed for commit [`4c8fa41`](https://github.com/Brandon-Born/bga-mcp/commit/4c8fa4177ff9dbf0211dd0adbbbcde1fa562d94e) in exact-HEAD [CI run 31809979270](https://github.com/Brandon-Born/bga-mcp/actions/runs/31809979270).

### BGA-414 — Freeze a verified local-only first-release capability set

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-006, BGA-017, BGA-318, BGA-326, BGA-330, BGA-412, BGA-413
- **Deliverable:** One machine-readable first-release inventory that drives the candidate manifest, MCP discovery, documentation, security review, and verification evidence.
- **Acceptance:** The first release is local-only. Every capability discoverable from its installed artifact is explicitly included and `verified` against the candidate commit; every source-tree capability that is `implemented`, `experimental`, blocked, documentation-networked, or Studio-backed is absent from release discovery unless its existing backlog owner first reaches `verified`. In particular, `read_studio_logs` and the unverified documentation surfaces are not grandfathered into release because they are opt-in or labeled experimental. The development build may retain them, but the release artifact cannot advertise them.
- **Verification:** A real client installs the candidate and compares tools, resource templates, concrete resources, environments, stability, required scenarios, and evidence digests with the frozen inventory. Seeded cases exposing one excluded capability, omitting one included capability, or attaching stale/non-candidate evidence each fail before packaging completes.
- **Release effect:** This keeps BGA-320, BGA-324, BGA-328, and the blocked Studio chain out of the local-release critical path without waiving them. Adding documentation or Studio to a later release requires completing their permanent owners and revising this inventory in a reviewed change.
- **Evidence, 2026-08-14:** [`config/release.json`](../config/release.json) freezes seven verified local tools, three verified project resources, stdio, and protocol `2025-11-25`; its schema fixes the release entry point and the five consumers that must derive from it. [`dist/release-cli.js`](../src/release-cli.ts) is an inventory-bound installed entry point, not a caller-selected flag: it omits setup, documentation, Studio, and the 2026 adapter from discovery; refuses every network, Studio, remote-project, and mutation relaxation before startup; and connects a single 2025-era server so the dual-era development router cannot advertise a protocol the release does not claim. [`E2E-RELEASE-LOCAL-ONLY`](../tests/e2e/release-inventory.test.ts) installs the shared tarball, connects with the real client, compares tool, concrete-resource, template, prompt, adapter, and protocol discovery with the packed inventory and source manifest, refuses calls to all three excluded tool families, and checks the release-only help and option boundary. [`GATE-RELEASE-INVENTORY`](../tests/unit/release.test.ts) and `pnpm verify:release` reject a non-verified selection, an exposed exclusion, an omitted inclusion, evidence from another commit, and evidence for another artifact. Candidate-manifest derivation copies the selected manifest entries and computes inventory, capability-manifest, verification-evidence, and tarball digests; it refuses an inventory that is not verified, a dirty tree, or evidence that does not belong to the exact candidate commit and artifact.
- **Verified against:** Full local `pnpm check` passes with 73 test files and 568 tests; all 166 required scenarios pass, and the acceptance map records 146 of 148 cases proven with the two existing live Studio cases explicitly missing. All six Ubuntu, macOS, and Windows jobs on Node 22 and 24 passed for implementation commit [`804650a`](https://github.com/Brandon-Born/bga-mcp/commit/804650a2660336ef72f5e24bbdbdf2b228d2cfdf) in exact-HEAD [CI run 31815781536](https://github.com/Brandon-Born/bga-mcp/actions/runs/31815781536). The inventory and this item are now `verified`, and BGA-402 may start.
- **Reopened, 2026-08-23:** The recorded CI result remains historical evidence for `dist/release-cli.js`; it is not evidence for the command npm installs. The exact current tarball maps `bin.bga-mcp` to `dist/cli.js`, and an isolated real-client connection to that public command discovered 10 tools and 11 resources, including setup, documentation, and experimental Studio surfaces, instead of the frozen seven and three. The current full gate still passes because `E2E-RELEASE-LOCAL-ONLY` bypasses the installed command and starts `release-cli.js` directly. BGA-416 owns that release blocker. BGA-417 through BGA-420 also reopen selected validator evidence, and BGA-422 must clear or explicitly dispose of current toolchain advisories before this inventory can return to `verified`.

### BGA-415 — Publish and independently verify the first release

- **Status:** planned
- **Priority:** P0
- **Depends on:** BGA-400, BGA-401, BGA-403, BGA-404, BGA-405, BGA-406, BGA-407, BGA-408, BGA-411, BGA-414, BGA-416 through BGA-420, BGA-422
- **Deliverable:** Publish the exact signed and security-reviewed BGA-403 candidate without rebuilding it, then verify the public artifact as an unrelated consumer would.
- **Acceptance:** The registry package, checksums/provenance, source tag, candidate manifest, and verification evidence identify the same bytes and commit. Publication requires an explicit package-name/registry/trusted-publisher decision and an approved release candidate; no token or publish permission is available to pull-request or dry-run jobs. A failed post-publication check stops promotion and follows the documented recovery path rather than silently rebuilding or overwriting a version.
- **Verification:** In a fresh environment, download the public artifact, verify its digest and provenance, install it, discover exactly the BGA-414 inventory with a real MCP client, run the documented first-use call, remove it, and confirm no project mutation or credential artifact remains. Record the registry URL, immutable version, source commit, CI run, and evidence digest in the release record.

### BGA-416 — Bind the installed public executable to the frozen release profile

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-003, BGA-012, BGA-402, BGA-403, BGA-414
- **Deliverable:** One public package command whose installed executable, release inventory entry point, candidate contract, documentation, and real MCP discovery all select the same release profile. Development-only discovery may remain available through a separately named source/development entry point, but it is never the command a release consumer installs by default.
- **Acceptance:** The `bin.bga-mcp` path inside the actual tarball is either the inventory's entry point or a generated wrapper cryptographically/factually bound to that profile. Invoking `node_modules/.bin/bga-mcp` exposes exactly the BGA-414 tools, resources, prompts, transports, protocol versions, help, and option boundary. No test or guide substitutes `dist/cli.js` or `dist/release-cli.js` after installation. The stable contract fingerprints the public executable mapping and profile, and candidate creation rejects a tarball whose executable differs even when its internal release file is correct.
- **Verification:** `E2E-RELEASE-PUBLIC-EXECUTABLE` installs the shared tarball in a fresh directory and connects a real MCP client to the package-manager-created command on Linux, macOS, and Windows. It compares discovery with `config/release.json`, refuses excluded capabilities/options, exercises one included tool, and removes the package. A seeded `bin` redirect to the development CLI makes the release, version-policy, candidate, documentation, and acceptance-map gates fail.
- **Evidence:** `package.json`, the retained `1.0.0` contract, and the release inventory now agree on `dist/release-cli.js`. The shared packaged helper resolves `node_modules/.bin/bga-mcp`; release discovery, protocol/help/option refusal, version policy, release inventory, and candidate reconstruction all consume or reject that public mapping. `E2E-RELEASE-PUBLIC-EXECUTABLE`, the release/candidate integration seeds, and the complete local `pnpm check` pass. Exact-current CI remains required before this item or BGA-414 can be called `verified`.
- **Finding:** At `2822480`, `config/release.json` names `dist/release-cli.js`, while the packed `package.json` maps `bga-mcp` to `dist/cli.js`. An isolated install and real client discovered 10 tools and 11 resources from the public command, including `check_setup`, documentation search/resources, and experimental Studio logs; the frozen inventory contains seven tools and three resources. All 572 tests still passed because the release test starts `release-cli.js` directly, while the shared packaged-test helper starts `dist/cli.js` directly.
- **Sources:** [npm package.json `bin`](https://docs.npmjs.com/files/package.json/#bin) says the field maps a command name to the local file npm links for installed use. Checked 2026-08-23.

### BGA-417 — Preserve unknown action arguments and notification payloads through validation

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-107, BGA-108, BGA-113, BGA-125, BGA-126
- **Deliverable:** A tri-state cross-file value model that distinguishes known-empty, known-shaped, and unreadable action arguments/notification payloads all the way from parser to individual validator, aggregate, pre-release result, resources, and evidence.
- **Acceptance:** An omitted `performAction` argument is known empty, while a variable, spread, helper call, or other computed argument is unsupported and is never compared as empty. A notification with no payload is known empty, while a computed payload is unsupported and is never compared as empty. Names and other independently readable relationships may still be checked, but no missing/extra argument or payload-key finding is derived from the unknown shape. The owning validator group and pre-release checks remain `unsupported`/inconclusive rather than failed or passed.
- **Verification:** Installed public-command scenarios cover omitted, literal-empty, literal-shaped, variable, spread, helper-returned, and malformed forms on both APIs. They assert the exact unsupported finding and the absence of `action.argument.mismatch` or `notification.payload.mismatch`; aggregate, diagnostics resource, and pre-release outputs preserve that distinction. A seed that replaces unknown with `[]` or `{}` fails the gate.
- **Evidence:** Client calls and sent notifications now carry `known`/`unknown` shape independently of the readable names and partial keys. Omitted and literal values stay known; variables, helpers, spreads, and malformed calls remain located unsupported syntax and bypass mismatch comparison. `E2E-VALIDATE-UNKNOWN-CROSS-FILE-SHAPES` proves the individual tools, `validate_project`, diagnostics resource, and pre-release audit through the installed public command. Parser, rule, aggregate, public schema, contract, catalog, and full local gate coverage pass; exact-current CI is still pending.
- **Finding:** `performAction('actPlay', args)` is stored with empty argument names and no unsupported marker, so an entry point reading `cardId` produces a false mismatch. `notifyAllPlayers('built', '', $payload)` does emit unsupported syntax, but is also stored with empty payload keys, so a handler reading `card` simultaneously receives a false mismatch. The catalogued limitations explicitly promise the opposite behavior.
- **Sources:** [Game interface logic: Game.js](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js) defines `args` as “an object containing the call parameters” and permits it to be omitted; it does not require a source-code object literal. [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) documents notification arguments as data passed by the game. Checked 2026-08-23.

### BGA-418 — Model action entry-point scope and precedence before comparing contracts

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-107, BGA-119, BGA-125
- **Deliverable:** An action-resolution model that retains whether an entry point belongs to the legacy dispatcher, the game class, or a particular state class, and applies the documented precedence and visibility rules without flattening state-local methods into one global namespace.
- **Acceptance:** The same action name in two different state classes is not a duplicate merely because the text matches. A state-local action is resolved only for that state; a Game.php action is the documented fallback; and a legacy `.action.php` action takes precedence where it exists. If static client code cannot identify which state-local signature receives a call, differing signatures produce one explicit uncertainty result rather than comparison with whichever file was enumerated first. Legacy dispatcher entry points must be callable/public action methods; private/protected helpers cannot satisfy a client call or participate as duplicates.
- **Verification:** Packaged public-command fixtures cover the same state-local name with equal and different signatures, a genuine same-scope duplicate, Game.php fallback, legacy precedence, non-public legacy helpers, and deterministic file-order reversal. A seed that keys entries only by action name reproduces the current false certain duplicate and fails.
- **Evidence:** Every entry point now records `legacy-dispatcher`, `game-class`, or `state-class` plus its scope identifier. Duplicate keys include that scope; legacy precedence is applied per action; private/protected legacy methods are excluded; and ambiguous state-local signatures yield one unsupported result instead of an order-dependent comparison. `E2E-VALIDATE-ACTION-SCOPES` covers equal, different, reversed, and genuine same-scope forms plus legacy visibility through the installed command; existing state-class scenarios retain Game.php fallback. Focused and full local gates pass; exact-current CI is still pending.
- **Finding:** Two separate state classes declaring `#[PossibleAction] public function actPlay()` currently produce the certain error `action.entry-point.duplicate` with evidence claiming “Two methods of the action class share a name.” Argument comparison then selects the first matching entry globally. The legacy reader likewise accepts private and protected methods as public endpoints.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) describes an action declared “in this state” and says the framework checks Game.php only when it is absent there. [Players actions: yourgamename.action.php](https://en.doc.boardgamearena.com/Players_actions:_yourgamename.action.php) documents public legacy entry-point methods. [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) says `.action.php` is used instead of autowiring when both declare the function. Checked 2026-08-23.

### BGA-419 — Resolve contradictory modern action and transition documentation without false certainty

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-106, BGA-113, BGA-118, BGA-119, BGA-124, BGA-125, BGA-206
- **Deliverable:** A reviewed source-authority decision and parser behavior for the conflicting official modern state-class examples, with unresolved forms reported as unsupported rather than converted into project defects.
- **Acceptance:** Record which official page governs action names and state transitions, the reviewed revision/date, the exact conflict, and whether an upstream clarification is required. Until the conflict is resolved, a `#[PossibleAction] action_*` method invoked by `bga.actions.performAction` and an imperative `nextState`/related state call shown by official material must produce located unsupported syntax and suppress any name, missing-entry-point, reachability, or dead-end conclusion that depends on rejecting/ignoring it. If the forms are confirmed supported, normalize their names, arguments, scopes, and edges; if confirmed erroneous, only then emit a documented rule.
- **Verification:** Captured minimal examples from both official pages drive reader, state-validator, action-validator, aggregate, and pre-release tests through the installed public command. The walkthrough form can never yield `action.name.convention`, `action.entry-point.missing`, `state.dead-end`, or a clean pass while unresolved. A seed that silently drops the method or imperative edge fails.
- **Evidence:** [Modern action and transition source decision](verification/MODERN_ACTION_TRANSITION_CONFLICT.md) records the governing pages, exact conflict, review date, and need for upstream clarification. The readers locate the walkthrough's `#[PossibleAction] action_*` and imperative `nextState` forms as unsupported and mark dependent graph/action inputs incomplete. `E2E-VALIDATE-MODERN-DOCUMENTATION-CONFLICT` proves state, action, aggregate, and pre-release behavior through the installed command without the forbidden defects or a clean pass. Focused and full local gates pass; exact-current CI is still pending.
- **Finding:** The canonical state page says action functions “must be prefixed by `act`” and redirect by return value. The official Complete Walkthrough instead declares `#[PossibleAction] action_resolve()`/`action_pass()`, calls them with `bga.actions.performAction`, and uses `$this->game->gamestate->nextState('pass')`. The current reader recognizes only `act[A-Z]` and handler return expressions. The walkthrough-shaped class is therefore recorded as a complete state with no possible actions or edges; downstream validation emits certain/likely defects rather than an unsupported-source conflict.
- **Sources:** [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) and [Create a game in BGA Studio: Complete Walkthrough](https://en.doc.boardgamearena.com/Create_a_game_in_BGA_Studio:_Complete_Walkthrough), checked 2026-08-23. [Tutorial Reversi](https://en.doc.boardgamearena.com/Tutorial_reversi) follows the `actPlayDisc` form, which confirms the documentation is inconsistent rather than establishing that the walkthrough form is safe to reject.

### BGA-420 — Resolve SQL table and output aliases before database diagnostics

- **Status:** implemented
- **Priority:** P0
- **Depends on:** BGA-109, BGA-113, BGA-121, BGA-127
- **Deliverable:** A bounded SQL reference reader that distinguishes schema tables/columns, table aliases, output aliases, keywords, and unsupported expressions for the documented BGA query forms.
- **Acceptance:** `AS` and implicit output aliases are result names, not schema-column references. Qualified columns through a table alias resolve to the underlying table. Both explicit and implicit table aliases work in single- and multi-table queries, including quoted identifiers, joins, and repeated columns. Aliased expressions, subqueries, CTEs, and syntax outside the supported subset become located unsupported constructs wherever their provenance cannot be proved; they do not generate undeclared/unused findings from guessed identifiers.
- **Verification:** Installed public-command scenarios use the exact player-query shapes from the official Game.php reference plus project tables with `AS`, implicit aliases, table aliases, joins, and unsupported expressions. They assert no alias-derived `database.column.undeclared` or `database.column.unused`, while a seeded genuinely missing underlying column still fails. Reversing aliases and source order is deterministic.
- **Evidence:** The bounded SQL reader now separates result aliases from schema references, resolves explicit/implicit and quoted table aliases to underlying tables, deduplicates repeated columns, and keeps expressions, subqueries, and CTEs unsupported. Incomplete query provenance suppresses inferred unused-column findings without hiding a genuinely missing resolved column. `E2E-AUDIT-DATABASE-ALIASES` proves the exact official player aliases, project aliases, joins, quoted/repeated forms, missing-column control, and unsupported forms through the installed command. Parser/rule/catalog and full local gates pass; exact-current CI is still pending.
- **Finding:** `SELECT c.card_id AS id FROM card c` currently becomes `c.card_id`, `card.c`, and `card.id` with no unsupported marker. The official `SELECT player_id id, player_name name FROM player` examples therefore make aliases look like undeclared framework columns and can make real columns look unused. Calling this a known false positive is insufficient for a common form the official framework documentation recommends.
- **Sources:** [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) repeatedly documents implicit output aliases such as `SELECT player_id id, player_name name ...`. [Tutorial Reversi](https://en.doc.boardgamearena.com/Tutorial_reversi) uses the same shape, and the [Complete Walkthrough](https://en.doc.boardgamearena.com/Create_a_game_in_BGA_Studio:_Complete_Walkthrough) says the player fields “all have to be aliases.” Checked 2026-08-23.

### BGA-421 — Collapse and redact every top-level CLI failure

- **Status:** ready
- **Priority:** P2
- **Depends on:** BGA-016, BGA-018, BGA-319, BGA-328
- **Deliverable:** One fail-closed top-level error boundary for serve startup, `--studio-check`, and shutdown that publishes only stable redacted diagnostics and never lets Node print an uncaught exception, cause chain, stack, or absolute path.
- **Acceptance:** Known failures retain a stable code and safe message; unexpected failures collapse to `internal.unexpected`. Redaction options are registered before any credential-bearing Studio work and applied to stdout/stderr as appropriate. Exit codes distinguish usage/configuration from operational/internal failure without exposing internals. The threat model and surface coverage explicitly include direct CLI execution, not only MCP tool results and formatted logger calls.
- **Verification:** Packaged development-CLI scenarios seed an unavailable project root, unreadable session file, Studio policy refusal, unexpected setup exception, protocol startup exception, and shutdown exception with unique path/session/cause canaries. None appears in stdout, stderr, stack text, retained evidence, or CI artifacts; each exits deterministically. A seed that throws outside the boundary fails `GATE-LOG-REDACTION` and the threat-model gate.
- **Finding:** `node dist/cli.js --studio-check --project-root /private/tmp/bga-mcp-definitely-missing-audit` prints the full `PolicyViolationError` stack and nested `ENOENT` cause, including the absolute path. The `studio-check` branch sits outside the catch used by normal server configuration, so it bypasses `formatErrorLog` and contradicts the stated process-stderr redaction control. This branch is absent from the local-only release but remains an advertised development command.

### BGA-422 — Clear current toolchain advisories and gate release-time dependency risk

- **Status:** ready
- **Priority:** P0
- **Depends on:** BGA-004, BGA-005, BGA-013, BGA-403
- **Deliverable:** A reviewed dependency update or explicit time-bounded disposition for every current advisory in the exact lockfile, plus a release-time gate that cannot silently publish from a newly vulnerable build/test/candidate toolchain.
- **Acceptance:** Upgrade or constrain direct `ajv@8.17.1` and every transitive affected copy to a patched version, or record why the vulnerable feature is unreachable with an owner, expiry, and compensating test. Upgrade the Vite/PostCSS `nanoid@3.3.17` path to `>=3.3.18` or eliminate it. Production and development/toolchain results are reported separately: a clean production audit cannot hide an advisory in code that verifies or packages the release. The ordinary offline commit gate remains reproducible; a current registry-backed advisory check runs during scheduled security review and before BGA-405/BGA-415, retains a non-secret report, and blocks unexpired high/critical findings or undisposed lower findings.
- **Verification:** `pnpm audit --prod --json` and the full locked-graph audit are captured for the exact candidate. Seeded high and moderate advisories in direct and transitive build dependencies fail the release preflight; a documented exception expires and then fails. The gate does not print credentials or silently rewrite the lockfile.
- **Finding:** On 2026-08-23 the production-only audit reported zero advisories across three runtime dependencies. The full graph reported `ajv@8.17.1` under GHSA-2g4f-4pwh-qvx6 (moderate, patched in 8.18.0) and `nanoid@3.3.17` under GHSA-2v37-7h3g-55p8 (high, patched in 3.3.18), all in development/release-tooling paths. The current `pnpm check` and candidate verifier do not run or retain an advisory assessment.
- **Sources:** [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) limits the ajv issue to `$data`-enabled validation and names 8.18.0 as patched. [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) describes the zero-size custom-generator loop and names 3.3.18 as the patched 3.x release. Checked 2026-08-23.

### BGA-423 — Match documentation authority on exact canonical page boundaries

- **Status:** ready
- **Priority:** P2
- **Depends on:** BGA-200, BGA-202, BGA-203, BGA-207, BGA-209
- **Deliverable:** Canonical URL matching that scopes page-specific authority and use policy to the exact normalized page (and only explicitly reviewed aliases/subpages), rather than to every URL sharing its text prefix.
- **Acceptance:** Scheme and host remain exact. Path matching is segment/page-aware after safe URL normalization; query strings and fragments on the same canonical page do not change authority. `BGA_Studio_CookbookExtra`, encoded delimiter tricks, case variants not canonicalized by the source, and unlisted subpages cannot inherit the Cookbook's community label or its page-specific retrieval policy. Redirect targets are reclassified after resolution. Adding any reviewed alias or subtree requires an explicit catalog entry and source-policy review.
- **Verification:** Unit and installed documentation-network scenarios cover the exact Cookbook URL, query/fragment variants, prefix-collision pages, encoded variants, redirects into and out of the page, and the site-wide fallback. A seeded raw `href.startsWith(canonicalUrl)` implementation fails provenance, cache, search, resource, and source-catalog assertions.
- **Finding:** `sourceForUrl` currently uses `url.href.startsWith(source.canonicalUrl)`. As a result, both `https://en.doc.boardgamearena.com/BGA_Studio_CookbookExtra` and `/BGA_Studio_Cookbook/Subpage` are classified as the page-specific `official-host-community-edited` source even though the catalog reviews only the Cookbook page. This can misstate authority, provenance, retention, and allowed use for another page on the official host.
- **Sources:** [`config/doc-sources.json`](../config/doc-sources.json) scopes the community entry to `https://en.doc.boardgamearena.com/BGA_Studio_Cookbook`; [BGA Studio Cookbook](https://en.doc.boardgamearena.com/BGA_Studio_Cookbook) identifies itself as community-editable. Checked 2026-08-23.

## Coverage map

This map makes omissions visible when source documents evolve.

| Commitment source                                 | Backlog coverage                                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project goals and developer workflows             | BGA-001, BGA-100 through BGA-128, BGA-200 through BGA-211, BGA-313 through BGA-330, BGA-417 through BGA-420                                     |
| Local stdio MCP deployment                        | BGA-002, BGA-003, BGA-010, BGA-011, BGA-017, BGA-318, BGA-325, BGA-326, BGA-416                                                                 |
| Public MCP tools and resources                    | BGA-006, BGA-102 through BGA-128, BGA-202 through BGA-211, BGA-303, BGA-304, BGA-312, BGA-320 through BGA-330, BGA-416 through BGA-420, BGA-423 |
| Diagnostic schema and uncertainty                 | BGA-007, BGA-017, BGA-101, BGA-106 through BGA-128, BGA-417 through BGA-420                                                                     |
| Modern and legacy compatibility                   | BGA-008, BGA-009, BGA-100, BGA-101, BGA-117 through BGA-128, BGA-417 through BGA-420                                                            |
| Documentation provenance and currency             | BGA-200 through BGA-211, BGA-313, BGA-408, BGA-411, BGA-423                                                                                     |
| Local-first, read-only, narrow permissions        | BGA-013 through BGA-018, BGA-114, BGA-319, BGA-323 through BGA-330, BGA-416, BGA-421                                                            |
| Credentials, SFTP, sync, and logs                 | BGA-300 through BGA-307, BGA-319 through BGA-322, BGA-327, BGA-328                                                                              |
| Test tables, player perspectives, saved states    | BGA-308 through BGA-311                                                                                                                         |
| Unit, integration, conformance, E2E, and evidence | BGA-004 through BGA-012, BGA-017, BGA-018, BGA-128, BGA-307, BGA-407                                                                            |
| Security, secrets, data handling, telemetry       | BGA-013 through BGA-018, BGA-300, BGA-301, BGA-319 through BGA-330, BGA-405, BGA-406, BGA-410, BGA-421, BGA-422                                 |
| Packaging, clients, versioning, releases          | BGA-400 through BGA-422                                                                                                                         |
| Optional remote documentation transport           | BGA-409                                                                                                                                         |

## Explicitly preserved non-goals

The following are not implementation backlog items unless a future documented decision changes project scope:

- Fully autonomous game implementation or release.
- Generic source editing or Git hosting operations.
- Hosting or redistributing publisher artwork.
- Scraping private projects or bypassing BGA access controls.
- Depending on undocumented Studio endpoints for core functionality.
