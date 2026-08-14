# Compatibility matrix

Updated: 2026-08-14. Backlog items: BGA-009, BGA-402, and BGA-414.

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

A layout being inside the compatibility contract is not the same as every capability being release-verified. The manifest now names all three supported layouts on each of the ten project tools and resources, and each supported layout claim independently lists the capabilities and packaged scenarios that prove that exact pairing. `pnpm verify:compatibility` compares those sources and seeds both an omission and an overclaim before accepting the real manifest. Retained evidence also copies layouts and environments from the manifest and rejects drift. BGA-006 and BGA-017 remain `implemented` until exact-commit CI passes this composition change; the semantic readers and compatibility claims remain supported on their existing evidence.

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

The first release profile is separately frozen by [`config/release.json`](../config/release.json). Its installed entry point exposes only the seven verified local tools and three verified project resources on stdio and protocol `2025-11-25`; documentation, setup, Studio, and the implemented 2026 adapter remain available only in the development profile. `E2E-RELEASE-LOCAL-ONLY` compares real installed discovery with that inventory, and `GATE-RELEASE-INVENTORY` rejects a non-verified selection or candidate evidence from another commit or artifact.

## Clients

| Claim                | Value                              | Support   |
| -------------------- | ---------------------------------- | --------- |
| CLAIM-CLIENT-SDK     | @modelcontextprotocol/client 2.0.0 | supported |
| CLAIM-CLIENT-EDITORS | editor and agent clients           | unknown   |

No editor or agent client is claimed as supported yet. BGA-401 introduces the maintained smoke matrix that would allow such a claim.

## Changing a claim

1. Add or update the claim in `config/compatibility.json`, including its fixture and scenarios.
2. Add the executable scenario that proves it, declaring the scenario identifier in the test title.
3. Update this file and the affected backlog item in the same change.
4. Run `pnpm check`. A claim without evidence fails the gate rather than shipping as a promise.
