# Compatibility matrix

Updated: 2026-10-02. Backlog items: BGA-009, BGA-402, BGA-414, BGA-417 through BGA-420, BGA-426 through BGA-428, and BGA-432.

[`config/compatibility.json`](../config/compatibility.json) is the machine-readable source of truth; this file is its human-readable view. `pnpm verify:compatibility` fails when the two disagree, when a supported claim has no required evidence, when a capability mapping lacks a packaged scenario required by both the claim and capability, or when runtime behavior claims support outside this matrix. `pnpm verify:scenarios` fails when a claimed scenario is not declared by an executable test.

The lifecycle of these claims is governed by [VERSIONING.md](VERSIONING.md). The first stable contract fingerprints every matrix entry. Adding supported coverage is minor; narrowing or removing supported coverage is major and requires the prior deprecation window. Upstream BGA drift freezes publication for review rather than silently changing `supported` to `unknown`.

Support levels use the vocabulary from [TESTING.md](TESTING.md):

- **supported** — inside the compatibility contract, with a fixture where a fixture is meaningful and at least one passing scenario.
- **unsupported** — deliberately outside the contract. The server must fail explicitly rather than degrade.
- **unknown** — no claim is made. Behavior may work, but no evidence exists and no support is implied.

## Project layouts

| Claim                     | Layout         | Support   | Fixture                               |
| ------------------------- | -------------- | --------- | ------------------------------------- |
| CLAIM-LAYOUT-MODERN       | modern-modules | supported | tests/fixtures/projects/modern        |
| CLAIM-LAYOUT-LEGACY       | legacy-flat    | supported | tests/fixtures/projects/legacy        |
| CLAIM-LAYOUT-HYBRID       | part-migrated  | supported | tests/fixtures/projects/hybrid        |
| CLAIM-LAYOUT-UNRECOGNIZED | unrecognized   | unknown   | none — reported as unsupported syntax |

BGA migrates a project one file at a time, and the documentation marks the older form of each file deprecated rather than removed. `legacy` and `modern` are therefore the two ends of a range, not two templates: detection resolves a generation for metadata, game logic, states, and client logic separately, and reports `hybrid` when they disagree. A project is `unrecognized` only when none of the four can be identified.

Modern and hybrid support were reopened by the 2026-08-08 installed-package audit, and are restored here. BGA-124 corrected the state semantics, BGA-125 the action tracing, BGA-126 the notification registration and BGA-127 the database reading; BGA-128 then proved every acceptance case of the affected items through the installed server, including every capability against the part-migrated layout and the precedence a state declared in both sources takes.

The 2026-08-23 release audit found narrower correctness gaps without changing which layouts are supported. BGA-417 preserves computed action arguments and notification payloads as unknown through every aggregate consumer. BGA-418 keeps legacy, game-class, and individual state-class action scopes distinct and applies legacy precedence per action. BGA-419 records the conflict between the canonical modern state documentation and the Complete Walkthrough, treating the walkthrough form as unsupported until BGA clarifies it. BGA-420 resolves explicit and implicit SQL output/table aliases before database rules consume references. The four installed-command scenarios are now part of the modern and legacy claim evidence.

BGA-426 through BGA-428 address gaps observed on a real generated template.
`gameoptions`, `gamepreferences`, and `stats` each accept JSONC, JSON, or their
legacy PHP file independently. Contract validation excludes the documented root
`_ide_helper.php` and `.d.ts` declarations; they remain visible in file inventory.
Git ignore rules, backup folder names, and arbitrary nested PHP helpers do not
establish runtime scope. State returns can directly delegate to a unique same-class
`act…` method when its targets are readable; cycles, missing/ambiguous methods,
computed targets chains longer than eight steps, and graphs over 256 expansion steps remain unsupported. These
subsets are exercised by the original `modern-generated-regression` fixture and
`E2E-INSPECT-JSONC-COMPONENTS`, `E2E-CONTRACT-EDITOR-HELPERS`, and
`E2E-STATE-DELEGATED-RETURNS` through the installed public executable. This adds
coverage without claiming the whole generated template or game is release-ready.

BGA-429 separates inventory from production-contract sources. All PHP and client source under `modules/` remains readable, including ignored files and arbitrary subdirectories; documented legacy root files remain readable independently. Other local PHP/JS/TS files remain in the inventory and produce `project.source.unsupported-syntax`, with their relative paths, rather than supplying contracts. This reports unknown Studio/test/generator execution scope, not a defect in the game. It propagates through individual validators, aggregate diagnostics and pre-release uncertainty. Copies inside `modules/` remain readable: this reader does not resolve dynamic imports or prove that every module executes. Callers needing a narrower set must identify and configure a separate canonical root. [Source-scope decision and workflow](verification/PROJECT_SOURCE_SCOPE.md).

A layout being inside the compatibility contract is not the same as every capability being release-verified. The manifest now names all three supported layouts on each of the ten project tools and resources, and each supported layout claim independently lists the capabilities and packaged scenarios that prove that exact pairing. `pnpm verify:compatibility` compares those sources and seeds both an omission and an overclaim before accepting the real manifest. Retained evidence also copies layouts and environments from the manifest and rejects drift. BGA-006 and BGA-017 remain `implemented` until exact-commit CI passes this composition change; the semantic readers and compatibility claims remain supported on their existing evidence.

BGA-432 keeps the state-class-only default initial state unsupported because the official page still marks it unconfirmed. A missing explicit setup return does not become a state-2 edge, a missing-entry defect or a reachability conclusion. The inventory and independent state checks remain readable. `E2E-STATE-UNCONFIRMED-INITIAL` uses original generated-template variants to prove this through inspection, state validation, aggregate, state resource and pre-release, and retains explicit setup returns, legacy state 1 and the independently documented hybrid default. [Source review](verification/FRAMEWORK_CHANGE_PROCESS.md#live-source-baseline--2026-10-02-utc).

## File generations

| Claim                | Generation       | Support   | Fixture                        |
| -------------------- | ---------------- | --------- | ------------------------------ |
| CLAIM-FILEGEN-MODERN | json-metadata    | supported | tests/fixtures/projects/modern |
| CLAIM-FILEGEN-LEGACY | inc-php-metadata | supported | tests/fixtures/projects/legacy |

## Runtimes and platforms

| Claim                  | Value          | Support     |
| ---------------------- | -------------- | ----------- |
| CLAIM-RUNTIME-NODE-22  | Node 22        | supported   |
| CLAIM-RUNTIME-NODE-24  | Node 24        | supported   |
| CLAIM-RUNTIME-NODE-20  | Node 20        | unsupported |
| CLAIM-PLATFORM-LINUX   | ubuntu-latest  | supported   |
| CLAIM-PLATFORM-MACOS   | macos-latest   | supported   |
| CLAIM-PLATFORM-WINDOWS | windows-latest | supported   |

Every supported runtime and platform combination runs the complete gate in CI. The claimed runtimes must match both the `engines` range and the CI matrix.

## Execution environment

| Claim                   | Value | Support   |
| ----------------------- | ----- | --------- |
| CLAIM-ENVIRONMENT-LOCAL | local | supported |

Every public capability is served by the user's local stdio process. Documentation and experimental Studio reads may make an explicitly enabled request across their reviewed network boundary; that does not turn them into remotely hosted capabilities. The environment claim lists every manifest capability to which it applies, and the compatibility gate rejects either an omitted local claim or an unclaimed remote environment.

## MCP protocol versions and transports

| Claim                     | Value             | Support     |
| ------------------------- | ----------------- | ----------- |
| CLAIM-PROTOCOL-2025-11-25 | 2025-11-25        | supported   |
| CLAIM-PROTOCOL-2026-07-28 | 2026-07-28        | unknown     |
| CLAIM-PROTOCOL-OTHER      | any other version | unsupported |
| CLAIM-TRANSPORT-STDIO     | stdio             | supported   |
| CLAIM-TRANSPORT-HTTP      | streamable-http   | unsupported |

The running server's negotiation constants, transport manifest, compatibility claim, and every capability's protocol list are checked compositionally. A seeded capability-level protocol mismatch must fail before the real matrix is accepted. Streamable HTTP exists only as loopback test infrastructure for the official conformance CLI; see [CONFORMANCE.md](CONFORMANCE.md).

The installed server negotiates `2026-07-28`, supports discovery, and now completes project-root setup through its in-band multi-round-trip flow. The compatibility claim remains `unknown` because the pinned official conformance suite has no applicable stdio set for that revision; public capability entries do not claim the protocol until release evidence deliberately establishes the complete contract.

The first release profile is separately frozen by [`config/release.json`](../config/release.json). Its package-manager-created `bga-mcp` command exposes only the seven historically verified local tools and three project resources on stdio and protocol `2025-11-25`; documentation, setup, Studio, and the implemented 2026 adapter remain available only in the development profile. BGA-414 was restored by exact-source candidate CI; signed rc.3 adds the BGA-431 correction and the bounded BGA-424 carry-forward. `E2E-RELEASE-PUBLIC-EXECUTABLE` compares real installed discovery with the inventory, and `GATE-RELEASE-INVENTORY` rejects a non-verified selection, executable drift, or candidate evidence from another commit or artifact.

## Clients

BGA-422 adds `GATE-SECURITY-AUDIT` and `INT-SECURITY-AUDIT-PREFLIGHT` to the release transport's evidence requirements. Release tooling needs a fresh, source-bound production and full-graph advisory assessment; the ordinary gate tests the security policy offline. The installed local server gains no network capability from this tooling check. See [dependency security verification](verification/DEPENDENCY_SECURITY.md).

| Claim                | Value                              | Support   |
| -------------------- | ---------------------------------- | --------- |
| CLAIM-CLIENT-SDK     | @modelcontextprotocol/client 2.0.0 | supported |
| CLAIM-CLIENT-EDITORS | editor and agent clients           | unknown   |

The [BGA-401 client matrix](CLIENTS.md) maintains the supported reference SDK flow and records a bounded native Codex app-server 0.159.2/macOS evaluation of the exact signed candidate. General editor/agent support remains unknown; the controlled smoke does not test GUI behavior or inference turns. New public support claims follow VERSIONING.md without rewriting the frozen signed candidate.

## Changing a claim

1. Add or update the claim in `config/compatibility.json`, including its fixture and scenarios.
2. Add the executable scenario that proves it, declaring the scenario identifier in the test title.
3. Update this file and the affected backlog item in the same change.
4. Run `pnpm check`. A claim without evidence fails the gate rather than shipping as a promise.

The `v1.0.0-rc.1` candidate passed exact-source CI across Ubuntu, macOS and Windows on Node 22 and 24. Its retained Ubuntu/Node 24 tarball was also installed independently on macOS and exercised through its package-manager-created public command. The [candidate verification record](verification/RELEASE_CANDIDATE.md) distinguishes source CI package hashes from the one immutable candidate and records the supported inventory. BGA-401 still owns real coding-client smoke claims.

BGA-404 release signing adds no network access or new transport to the installed server. Its ordinary scenarios check offline release policy; real signatures and fresh use of the verified original package are exercised by the separate manual workflow described in [release signing](verification/RELEASE_SIGNING.md).

BGA-407 distributes signed candidate verification metadata with exact frozen local-inventory coverage, explicit exclusions and no live Studio claim. It adds no installed-server transport or network access. Ordinary scenarios prove offline policy; the separate workflow proves public evidence download and signature acceptance.

BGA-400 extends CLAIM-CLIENT-SDK evidence: the generic stdio guide is exercised with the reference client on the CI platforms. This is not named coding-client support. The signed original candidate is separately evaluated through the same guide; only repeat installation, not cross-version upgrade, is currently measurable.

BGA-401 adds E2E-CLIENT-SDK-SMOKE and GATE-CLIENT-MATRIX to transport evidence. The gate refuses missing/version/environment/scenario claims and rejects changed controlled runners or candidate identities.

## Historical real-development counterexample

[BGA-424](verification/AGENT_EVALUATION.md) evaluated the signed rc.2 original on
three actual development tasks. BGA-431 reproduces phantom notification handlers
and PHP methods from comments through the installed public command. Existing
passing fixture claims do not establish correct executable-context handling for
that case. The rc.2 failure remains historical. BGA-431 supplies passing original packaged
regressions and [signed rc.3 carry-forward](verification/AGENT_EVALUATION_CARRY_FORWARD.md)
confirms the correction on the same real-project inputs. Unsupported
computed SQL and game-owned rules also remain outside a clean verdict.

## Executable contract context

CLAIM-CONTRACT-EXECUTABLE-CONTEXT covers BGA-431's original comment-only handler
and PHP-method regression, plus live modern/legacy controls beside comments,
strings, regex and templates. The installed scenarios exercise tools, aggregate,
resources and pre-release. JavaScript is parsed as a full script/module; typed
TypeScript, computed/conflicting registrations and unreadable grammar remain
unsupported, with dependent absence guesses suppressed. PHP is a bounded lexical
reader: unterminated contexts and closing tags/mixed HTML remain unsupported;
this is not full PHP syntax validation. The historical rc.2 failure above remains
valid for those original bytes. The replacement signed candidate and explicit frozen-task
carry-forward close BGA-424 for its bounded sample. See [implementation evidence](verification/EXECUTABLE_CONTRACTS.md).

BGA-411 extends CLAIM-TRANSPORT-STDIO with installed documentation checks: all shipped guide/help paths resolve, public and development discovery match generated names/counts/stabilities/boundaries, and omitted-file/stale-inventory controls fail. Templates and concrete resources are distinct. This adds no network, named-client, productivity or game-correctness claim.

BGA-406 extends CLAIM-TRANSPORT-STDIO only with reporting-policy safeguards. Live channel enablement is observed, but the external non-maintainer report lifecycle remains unverified. Admin-created drafts and synthetic controls cannot satisfy it; no runtime, client or security approval claim is added.

## Framework review holds

BGA-408 adds a separate [framework change process](FRAMEWORK_CHANGES.md). A changed, missing, unreachable or expired official source can hold affected claims stale for new publication while the recorded compatibility support contract is preserved. Source/fixture changes require official review and clean targeted retest. Process simulation does not certify live freshness; the initial ledger has no live baseline and refuses new candidates or inventory guidance until one is reviewed.

## Exact-candidate security review

BGA-405 replays selected security scenarios on the authenticated immutable candidate, with separate evidence from ordinary checkout tests. Held assessments do not grant security approval or expand the local-only capability set. Studio and adapters remain excluded; tests using stubs never stand in for live Studio evidence. [Security review scope](verification/RELEASE_SECURITY_REVIEW.md).

BGA-415 adds `GATE-PUBLICATION`, `INT-PUBLICATION-BOUNDARIES` and `E2E-PUBLICATION-CONSUMER` to stdio release evidence. These prove offline admission/permission/provenance policy and the installed shared-package guide. The actual registry package, OIDC publisher and public-consumer provenance remain unverified. No installed runtime transport or network capability changes.

BGA-421 extends CLAIM-TRANSPORT-STDIO with installed executable failure scenarios in both profiles. Usage/configuration failures exit 2; operational/internal failures exit 1. Dependency initialization, Studio preflight, protocol startup and shutdown collapse unexpected diagnostics, redact registered sessions and private paths, and avoid Node stack/cause output. Preflight refusal stays a terminal setup report. This is local process evidence; it adds no live Studio, network, client or game-correctness claim. See [CLI failure verification](verification/CLI_FAILURES.md).
