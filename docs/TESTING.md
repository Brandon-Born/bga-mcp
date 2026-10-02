# Testing and Verification Policy

`bga-mcp` follows a strict rule: public behavior is verified through observable end-to-end evidence, not inferred from source code, mocks, or a successful build.

## Meaning of verified

A capability is verified only when an automated test:

1. Builds or installs the same artifact intended for users.
2. Starts the server through a supported launch command.
3. Connects using a real MCP client over a supported transport.
4. Discovers the capability from the running server.
5. Invokes it using its public schema.
6. Verifies the complete response and any allowed side effects.
7. Verifies relevant failure behavior and cleanup.

Calling an internal function directly is not end-to-end verification. Replacing the system boundary under test with a mock is not end-to-end verification.

## Required test layers

### Unit tests

Exercise parsers, rules, normalization, redaction, and policy decisions in isolation. Unit tests should be deterministic and provide fast fault localization.

### Integration tests

Exercise real internal components together, including filesystem fixtures, documentation indexes, credential-provider interfaces, and adapter boundaries. Fakes may be used to reproduce rare failures, but the test name and report must identify them as integration tests.

### Protocol conformance tests

Run the official MCP conformance suite for every protocol version and transport the package claims to support. A capability cannot be released on a transport that has not passed conformance checks.

### Local end-to-end tests

Start the packaged server as a subprocess and communicate only through its MCP interface. These tests use isolated temporary roots and representative BGA projects to verify discovery, validation, documentation, error handling, and path confinement.

The artifact is packed once per run in `tests/global-setup.ts`, and every capability suite installs that tarball. Packing runs `prepack`, which writes `dist/`, so suites that pack independently race on the same directory and fail intermittently. A new end-to-end suite must install the shared artifact rather than pack its own.

The official MCP Inspector CLI may provide an additional independent client check. It supplements the automated client harness; it does not replace capability-specific assertions.

The executable-only `src/cli.ts` and `src/release-cli.ts` boundaries, and their shared `src/cli-runner.ts`, are excluded from in-process V8 line coverage because importing an entry point starts stdio service. Their help, version, invalid-argument, startup, profile, protocol, and shutdown behavior is covered through subprocess and packaged-artifact tests instead; the exclusion is not an absence of testing.

#### Test-only installed-process barriers

A packaged suite may preload test-only instrumentation before the installed server when a deterministic in-operation event cannot be forced through the public schema alone. The preload must stay outside the tarball, production may expose no corresponding callback or environment switch, and the scenario must scan the installed package for the hook it claims is absent. The MCP boundary remains real: the suite installs the shared artifact, starts its CLI, connects through a real client, and invokes only public capabilities.

The parent test must observe the barrier before releasing it and fail if the public operation settles first. A stage transcript must place the forced event between the production operations named by the claim, and the same live client must remain usable afterward. This is evidence about the installed production stages around the barrier; it is not evidence for behavior that the preload itself replaces.

#### Scripted third-party sources

A packaged suite may answer the server's outbound requests from a source the test scripts, and only for a source the project does not own. Nobody can ask a third party's wiki to lose DNS, stall, answer one page and not another, or serve the revision it published four months ago — and those are the conditions under which a documentation capability has most to get wrong. `tests/e2e/doc-network-stub.ts` replaces the connection factory for exactly that reason.

Such a suite is still end-to-end in every part this policy names: it installs the packed artifact, launches it as a subprocess, speaks the protocol through a real client, discovers the capability, calls it through its public schema, and asserts the complete response. What is scripted is the other party, not the boundary under test.

Two rules keep it from becoming a mock of the thing being measured:

- **It is never evidence about the transport it replaced.** TLS, the address guard, and name resolution are gone along with the socket, so no scenario in such a suite may stand behind a claim about them. Those claims are proven where they are enforced, and their scenarios live elsewhere.
- **What it serves is captured, not invented, wherever the content is the point.** A page under `tests/fixtures/docs/` is a recorded fragment of the real page with its provenance written down; synthetic content is used only where the shape rather than the text is what a case turns on, and the assertion says so.

A live run against the real source stays the periodic truth check — `pnpm test:docs-eval` and `pnpm test:framework-version` — because a scripted source can only prove that a known answer is read correctly.

### Live Studio end-to-end tests

Capabilities that connect to BGA Studio must run against a dedicated, non-production Studio test project with isolated credentials and data. Mock SFTP servers, recorded responses, and local browser fixtures are integration tests, not proof of live compatibility.

Live tests must:

- Confirm the authenticated identity and allowlisted remote project before acting.
- Use unique test markers so results cannot be confused with developer files.
- Verify dry-run output without changing remote state.
- Verify the exact remote effect of an executed mutation.
- Verify repeat or idempotency behavior when applicable.
- Remove or restore all test state even after a failed assertion.
- Redact credentials, session data, private source, and player information from artifacts.

If a stable and permitted live test cannot be built, the capability must remain experimental, disabled by default, and absent from the supported-capability list.

## Scenario declarations

A scenario identifier links an executable test to the entry that depends on it: a capability-manifest entry, a threat-model mitigation, or a compatibility claim. A test declares its identifiers at the start of its title:

```ts
it('[INT-POLICY-TIMEOUT] aborts and reports an operation that outlives its deadline', …);
```

`pnpm verify:scenarios` fails when a required scenario has no declaring test, and when a declared identifier is required by nothing. Identifiers reserved by planned work are recorded as such and may not be claimed as evidence.

A declaration has to be a test, and one that runs. The identifier alone is just characters: the same characters in fixture data, in a comment, or in the title of a skipped test would otherwise satisfy the existence check while nothing was asserted. Only the title argument of a runnable `it`/`test` call counts — including the `it.each(table)('[ID] …')` form — and `.skip`, `.todo`, `.failing`, or an enclosing skipped `describe` makes the declaration inert rather than evidence. The gate proves this on a seeded tree containing each of those shapes before it looks at the real one.

The declaration proves the test exists and runs in the complete gate. The test run itself proves it passes, and the evidence artifact below records which of the two happened for every required scenario. In that artifact the same rule applies again: a scenario whose tests were all skipped is `missing`, exactly as if no test had ever been written.

## Capability manifest

The repository will maintain a machine-readable manifest containing every advertised tool, resource, prompt, transport, and external adapter. Each entry must identify:

- Its owner and stability level.
- Supported layouts, environments, and protocol versions.
- Positive, negative, security, and mutation scenario identifiers.
- Whether a live external environment is required.
- The most recent passing evidence produced by CI.

CI evidence is a `ciEvidence` reference on every entry, resolving to a run recorded once in the manifest's `ciRuns`: its workflow, URL, commit, completion time, conclusion, and the matrix jobs it ran. Only a passing run may be recorded there. The evidence artifact then reports, per entry, whether that run covers the commit being verified or is `stale` — evidence of an earlier commit is evidence of that commit and of nothing else.

CI must fail when runtime capability discovery and the manifest differ, or when a manifest entry lacks a required end-to-end scenario.

### First-release inventory

[`config/release.json`](../config/release.json) is a narrower, machine-readable allowlist over the capability manifest. The development entry point may retain implemented and experimental work, but the release entry point registers only names selected by this inventory and supports only the protocol revisions it names. The same inventory is the input to candidate-manifest generation, public documentation, security review, and release evidence; those consumers may not maintain parallel lists.

`pnpm verify:release` first proves its gate against an excluded capability, runtime exposure, runtime omission, stale-commit evidence, and wrong-artifact evidence. A candidate manifest can be derived only when every selected entry is verified and local-only, every CI reference resolves, every retained scenario passed for the exact candidate commit, the evidence names the candidate tarball, and the inventory itself is verified. The derived manifest computes rather than accepts its inventory, capability-manifest, verification-evidence, and artifact digests.

### Release-candidate dry run

The manual `Release candidate` workflow accepts only an existing `vX.Y.Z-rc.N` tag. Its checkout disables persisted credentials and its complete workflow permission is `contents: read`; it has no package, identity-token, registry, signing, or publication permission. BGA-404 adds a separate signing workflow that consumes that retained candidate; BGA-415 retains publication ownership.

`pnpm release:candidate` runs the complete local gate at the tagged commit, packs the candidate, and checks that its digest is the artifact digest recorded by the packaged end-to-end run. It then creates a detached worktree at the same tag, installs the same lockfile offline, reconstructs the tarball, and requires byte-for-byte equality. The reconstruction is discarded. Only the original tarball enters the candidate directory.

The retained directory contains the original `.tgz`, `release-candidate.json`, its JSON Schema, the sealed verification evidence, `security-audit.json`, the reviewed `security-audit-policy.json`, and `SHA256SUMS`. The manifest binds the tag, commit, package version, lockfile, release inventory, capability manifest, verification evidence, security report, and tarball by SHA-256. Candidate output is write-once: an existing non-empty destination is refused instead of overwritten. GitHub retains that directory as one immutable workflow artifact for downstream signing, evidence publication, and security review.

### Dependency security preflight

`pnpm verify:security-audit` is an offline component of `pnpm check`: it checks release/review wiring and proves the gate refuses seeded risks. `pnpm audit:security` is the separate, registry-backed check required during candidate creation, weekly/manual security review, and immediately before BGA-405 security review or BGA-415 publication. A successful ordinary commit gate cannot substitute for this fresh assessment.

The live command separately runs production and full-graph audits against the npm registry. It does not modify the lockfile. It rejects unavailable or malformed responses, count inconsistencies, hidden advisory filtering, and source changes during collection. Its sanitized report identifies the exact commit and lockfile, package, workspace and policy digests; it retains severity, GHSA and package identifiers rather than raw registry messages or paths. Reports older than 24 hours or from another source identity fail preflight. Candidate creation also rechecks the report before sealing it and retains the report on advisory failure.

High and critical findings always block. Every lower finding requires a reviewed exception in `config/security-audit-policy.json`, with an owner, rationale, a maximum 30-day expiry, and a current passing compensating scenario from integrity-checked verification evidence. Exceptions cannot hide findings or replace fresh collection. The current policy has no exceptions. Before review/publication, compare the retained candidate's source/digests and the fresh audit, record the new assessment alongside the immutable candidate, and stop on any failed or stale assessment; do not rebuild the candidate to refresh an advisory report.

## Minimum scenarios for every capability

Every public capability requires:

- Successful use with representative input.
- Schema rejection for invalid or incomplete input.
- A relevant operational failure with an actionable, non-secret error.
- Stable structured output assertions, not snapshot approval alone.
- Verification that access stays within configured roots and targets.

Mutating capabilities additionally require:

- Dry run with proof of no side effect.
- Exact execution effect.
- Failure before partial mutation where possible.
- Recovery or cleanup after failure.
- Repeat-call behavior.

## Verification cadence and workflow-only documentation

User-approved execution policy, 2026-10-02: verification must match the changed behavior and the claim being made. Passing evidence retains its exact source, environment, harness and artifact scope. This section changes agent scheduling and handoff practice; it does not change the executable release or framework guards.

During implementation, use the affected suites for feedback. Assemble the implementation, required manifest/compatibility/documentation updates and known reference changes before one complete `pnpm check` at the integrated handoff. Repeat the full gate when subsequent implementation or contract changes invalidate it, when a check fails, or when an unresolved concern requires broader coverage. Do not repeat it merely to attach another source hash to unchanged prose or retained evidence.

A workflow-only documentation change may finish with formatting of the owned files, `pnpm verify:documentation` and `git diff --check` instead of another full runtime suite. This exception is limited to agent instructions, execution order and future-work proposals. It excludes changed BGA semantic source decisions, supported behavior, schemas, security controls, release admission, executable code, dependencies, scenarios, manifest claims, or evidence edits that alter an asserted result. Those changes keep their applicable full gates. A workflow-policy handoff does not establish new capability verification or release approval. In a shared checkout, inspect and stage only the owned paths; the implementation owner performs the integrated full gate rather than two agents running competing package builds.

Wait for exact-source CI where a claim or admission rule requires it. Other independent authorized work can proceed while the run stays active. Retain the final relevant run once, preserving failures and narrowly stated scope. An evidence-only follow-up commit may cite the implementation commit it proves without claiming that evidence covers its own new HEAD. Automatic CI on that follow-up is allowed to finish without another documentation commit recording it. Do not recursively regenerate receipts for receipts.

Repeat a candidate evaluation only for a changed candidate, relevant harness or claim, a failed or incomplete observation, or the freshness requirement at actual review/publication. Preserve all immutable originals and historical assessments. A changed packed guide still needs a replacement candidate before publication; collect guide changes with the next substantive candidate preparation rather than immediately rerunning the entire release chain for every policy edit. This is scheduling, not permission to publish stale guides or waive signature, audit, reporting, framework or consumer gates.

BGA-433 implements explicit semantic/proof dependency identities in the repository framework gate. Its schema, dependency mutations and installed lifecycle retain conservative holds; legacy ledgers require explicit migration and new scoped baselines. Metadata carry-forward never changes the original CI commit or grants artifact, signature or security approval. Full-check and exact-source CI receipts identify their actual implementation source; a later receipt-only commit does not recursively require a new receipt for itself.

## Release gates

A change cannot be considered complete when any applicable gate is missing or failing:

1. Formatting, linting, and static type checks.
2. Unit tests.
3. Integration tests.
4. MCP protocol conformance tests.
5. Packaged-server local end-to-end tests.
6. Live Studio end-to-end tests for Studio-backed changes.
7. Capability-manifest, threat-model, compatibility, and scenario-coverage verification.
8. Secret scanning and test-artifact redaction checks.

Every verification gate must fail on demand. Each `pnpm verify:*` command seeds its own defect, requires the gate to reject it, and only then reports on the real repository. A gate that cannot fail is not evidence.

A release must publish or retain machine-readable evidence containing the package version, source commit, dependency lock digest, test environment identity, supported protocol version, scenario results, and timestamps. Secrets and private BGA data must never appear in that evidence.

## Verification evidence

`pnpm check` ends by writing `.artifacts/verification-evidence.json` and checking it. The document is described by [`config/evidence.schema.json`](../config/evidence.schema.json) and records the commit and whether the tree was clean, the package version and lock digest, the Node version and platform, the supported protocol versions and conformance runs, and every advertised capability with the result of each scenario it requires.

Four properties make it evidence rather than a summary:

- **It records absence.** A required scenario with no test in the run is `missing`, not omitted, and a capability with a missing or failed scenario cannot be `passed`. The gate fails when a capability advertised as `verified` has anything less. Protocol versions follow the same rule: each claimed version carries its own official-conformance result, a version nobody exercised is `not-run`, one the suite cannot measure for the shipped transport is `not-applicable` with its reason, and the overall status may not be stronger than the per-version results. A revision that passed against a reviewed baseline also records how many scenarios that baseline excused, because a pass means much less when the exclusion list is long.
- **It is compositional.** `verified` is a claim about every prerequisite at once, so the gate checks them together: a capability may not be `verified` while any protocol version it claims lacks applicable passing conformance, nor while the CI run it points at failed, is unrecorded, or belongs to a different commit. Every compatibility claim, catalogued rule, and threat-model mitigation that names scenarios carries its retained result here rather than being inferred from source text, and packaged scenarios record the digest of the artifact they installed, so a claim proven against a different build is visible instead of assumed away.
- **It is sealed.** `integrity` is a SHA-256 digest of the document with that field removed, computed over a canonical serialization, so an artifact edited after its run no longer matches itself.
- **It is scanned before it is written.** The emitter refuses to write a document containing a known credential format, and the gate scans it again, because a test title or file path is a plausible carrier into a published artifact.

### Human records

Every document under `docs/verification/` says what it is, in a fenced `verification-record` block:

```verification-record
{ "kind": "run", "capabilities": 16, "scenarios": 115, "claims": 75, "tests": 413 }
```

A `run` record is checked against the artifact: its capability, scenario, claim, and test counts must match the run, and every `pnpm …` command it names must exist. A `review` record names the boundary or artifact it reviewed and has no run to check against. A record marked `> Historical evidence only.` describes a run that is over and is left alone. A record that stops matching the repository must be updated or marked historical; there is no third option in which it quietly keeps claiming to be current.

`pnpm evidence` records a run; it never creates one. It reads the Vitest results and conformance output that `pnpm check` has already produced, so the artifact always describes the run that gated the change.

Flaky tests are failures. They must be fixed or the affected capability must be removed from the supported set; retries cannot be used to turn intermittent behavior into a passing release gate.

## Evidence language

Project documentation and release notes use these terms precisely:

- **Planned:** no implementation claim.
- **Implemented:** code exists but all verification gates may not have passed.
- **Verified:** every required gate has passed against the stated environments and versions.
- **Unsupported:** intentionally outside the compatibility contract.
- **Experimental:** available only by explicit opt-in and not part of the verified compatibility contract.

No other wording should imply a stronger level of confidence than the recorded evidence supports.

### Original-candidate signing — BGA-404

`pnpm verify:release-signing` and the GATE-RELEASE-SIGNING/INT-RELEASE-SIGNING scenarios run offline in the ordinary gate. They prove job isolation, pinned actions, no rebuild or publication path, and archive/subject/provenance policy refusal; synthetic policy tests do not produce signatures. The explicit manual signing workflow separately runs `pnpm verify:signed-release` against a real Sigstore bundle with independently acquired trust roots. It verifies the reviewed signing identity, refuses modified bytes and wrong commit/workflow, and installs that exact original tarball for real-client discovery, first use, excluded-call refusal, unchanged-project hash, clean exit and removal. See [verification policy and evidence](verification/RELEASE_SIGNING.md).

### Published release evidence — BGA-407

`pnpm verify:release-evidence` and GATE-RELEASE-EVIDENCE/INT-RELEASE-EVIDENCE/INT-RELEASE-EVIDENCE-PACKET run offline in the ordinary gate. Synthetic policy fixtures do not generate signatures or establish live Studio support. The separate manual workflow consumes the retained signed original; it independently checks archive/schema/signature, derives exact selected capability/environment coverage, isolates contents-write from build/dependency execution, and publishes a scanned metadata-only handoff bound by a job-output digest. Its final job downloads public asset URLs without a GitHub token and validates trusted schemas, original signature/identity, source/material digests and exact coverage. BGA-407 is verified only after that actual workflow, independent public download and exact-source CI pass. [Verification and lifetime retention](verification/RELEASE_EVIDENCE.md) retain the observations.

## Client smoke release evidence

`pnpm verify:clients` checks the [client matrix](CLIENTS.md) and proves it refuses unsupported claims before accepting the real matrix. Maintained clients run their packaged smoke flow in every claimed CI environment. Controlled evaluations retain exact candidate/client/platform and runner identities, without raw transcripts or credentials. The native Codex runner uses documented app-server APIs without an inference turn; its smoke is not a substitute for BGA-424 development evaluation. A runner change requires re-execution before its receipt is accepted.

## Framework process gate

`pnpm verify:framework-change` checks BGA-408 policy and impact coverage offline. `pnpm framework:status` reports current holds; `pnpm framework:observe URL` performs one explicitly requested official lookup. `pnpm framework:review URL EVIDENCE REVIEWER CI_RUN` requires clean post-observation evidence and matching affected semantic/proof dependencies. `framework:migrate` explicitly archives version-1 reviews without admitting them; `framework:retest` refreshes proof while preserving an unchanged interpretation review. `pnpm framework:release` is mandatory before new candidate creation or guidance publication; it fails closed without a reviewed, fresh baseline. Process simulations and full local checks cannot stand in for live observation. See [FRAMEWORK_CHANGES.md](FRAMEWORK_CHANGES.md).

## Original-candidate security replay

`pnpm review:security` requires an authenticated original packet, clean exact candidate source and a new assessment directory. The test harness selects those original bytes only in explicit security-review mode and records their digest separately from normal checkout evidence. `pnpm verify:security-review` checks the held/approved report and seeded integrity/admission controls; it cannot renew historical audit freshness or manufacture approval. See [the review procedure](verification/RELEASE_SECURITY_REVIEW.md).

### Registry publication

`pnpm verify:publication` checks the manual workflow, default dry run, pinned actions/tool, separated identity permissions and digest-bound preparation/consumer dependencies without registry writes. `GATE-PUBLICATION` seeds permission, trigger, rebuild, token and promotion bypasses; `INT-PUBLICATION-BOUNDARIES` seeds admission, registry-byte and provenance substitution. `E2E-PUBLICATION-CONSUMER` uses the shared installed artifact through the documented guide. These controls cannot verify an actual registry publication. The separate manual BGA-415 workflow requires an explicit configured publisher and fresh exact-candidate approval, then retains a real public-consumer receipt before promotion; see [publication process](verification/RELEASE_PUBLICATION.md).
