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

The small executable-only `src/cli.ts` boundary is excluded from in-process V8 line coverage because importing it starts stdio service. Its help, version, invalid-argument, startup, protocol, and shutdown behavior is covered through subprocess and packaged-artifact tests instead; the exclusion is not an absence of testing.

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
