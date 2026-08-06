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

The declaration proves the test exists and runs in the complete gate. The test run itself proves it passes. Machine-readable per-run results are BGA-012 and are not yet emitted.

## Capability manifest

The repository will maintain a machine-readable manifest containing every advertised tool, resource, prompt, transport, and external adapter. Each entry must identify:

- Its owner and stability level.
- Supported layouts, environments, and protocol versions.
- Positive, negative, security, and mutation scenario identifiers.
- Whether a live external environment is required.
- The most recent passing evidence produced by CI.

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

Flaky tests are failures. They must be fixed or the affected capability must be removed from the supported set; retries cannot be used to turn intermittent behavior into a passing release gate.

## Evidence language

Project documentation and release notes use these terms precisely:

- **Planned:** no implementation claim.
- **Implemented:** code exists but all verification gates may not have passed.
- **Verified:** every required gate has passed against the stated environments and versions.
- **Unsupported:** intentionally outside the compatibility contract.
- **Experimental:** available only by explicit opt-in and not part of the verified compatibility contract.

No other wording should imply a stronger level of confidence than the recorded evidence supports.
