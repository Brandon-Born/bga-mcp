# Compatibility matrix

Updated: 2026-08-06. Backlog item: BGA-009.

[`config/compatibility.json`](../config/compatibility.json) is the machine-readable source of truth; this file is its human-readable view. `pnpm verify:compatibility` fails when the two disagree, when a supported claim has no fixture or scenario, or when runtime behavior claims support outside this matrix. `pnpm verify:scenarios` fails when a claimed scenario is not declared by an executable test.

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

## MCP protocol versions and transports

| Claim                     | Value             | Support     |
| ------------------------- | ----------------- | ----------- |
| CLAIM-PROTOCOL-2025-11-25 | 2025-11-25        | supported   |
| CLAIM-PROTOCOL-2026-07-28 | 2026-07-28        | supported   |
| CLAIM-PROTOCOL-OTHER      | any other version | unsupported |
| CLAIM-TRANSPORT-STDIO     | stdio             | supported   |
| CLAIM-TRANSPORT-HTTP      | streamable-http   | unsupported |

The supported protocol list is checked against `SUPPORTED_PROTOCOL_VERSIONS` and the capability manifest, so the running server cannot negotiate a version this matrix does not claim. Streamable HTTP exists only as loopback test infrastructure for the official conformance CLI; see [CONFORMANCE.md](CONFORMANCE.md).

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
