# Safety and compatibility milestone verification

> [!CAUTION]
> Historical evidence only. The [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md) reopened the associated backlog and manifest claims. Do not treat this record as current release verification.

Recorded: 2026-08-06. Covers BGA-009, BGA-013, BGA-014, BGA-015, and BGA-016.

This record states what was proven, on what evidence, and what deliberately remains unproven. It uses the vocabulary defined in [TESTING.md](../TESTING.md).

## What passed

The complete local gate passed on Node 22.17.1 (macOS) in this order:

`format:check` → `lint` → `typecheck` → `verify:quality-gates` → `verify:threat-model` → `verify:compatibility` → `verify:scenarios` → `test:coverage` → `check:package` → `test:conformance` → `verify:safety-gates`

- 77 tests across 15 files, with 99.20% statement, 95.74% branch, 98.38% function, and 99.18% line coverage of `src`.
- The official conformance `server-initialize` scenario for protocol `2025-11-25` passed after rejecting a seeded malformed initialize response.
- The packaged artifact was packed, installed into an isolated directory, served over both supported protocol eras, refused five unsafe configurations, and was uninstalled.

## Verified items

### BGA-009 — Compatibility matrix

18 claims across layouts, file generations, runtimes, platforms, protocols, transports, and clients. 13 are supported; unsupported and unknown combinations are stated explicitly rather than left silent.

The gate compares supported protocol claims against `SUPPORTED_PROTOCOL_VERSIONS` and the capability manifest, supported transports against the manifest, and supported runtimes and platforms against the CI matrix and the `engines` range. It seeds a missing fixture, an undocumented claim, and a `2099-01-01` protocol claim, and fails on each before passing the real matrix. `GATE-COMPATIBILITY-MATRIX` re-checks the same agreement from an executable test.

### BGA-013 — Threat model

7 trust boundaries, 6 actors, 7 assets, 15 abuse cases, 24 mitigations, and 5 residual risks. Every automated mitigation names scenarios that exist as declaring tests; every manual mitigation names an owner, a cadence, and its evidence.

TB-DOCS-NETWORK and TB-STUDIO are recorded as unreviewed. The gate fails if any adapter or capability is advertised while a network or mutating boundary is unreviewed, so the documentation and Studio abuse cases are held closed by a shipping gate rather than by a promise. The gate seeds an unknown mitigation reference, an ownerless manual control, an advertised Studio adapter, and an undocumented control, and fails on each.

### BGA-014 — Secret and artifact safety gates

`pnpm verify:safety-gates` writes its seeded credential to a temporary directory outside the repository, proves the scanner detects it in artifact content and in a log line, proves the printed finding is masked, and only then scans the repository and each retained artifact directory. Because the seed never lives inside the repository or an artifact path, a failing scan cannot cause the sensitive fixture to be uploaded.

`GATE-SECRET-SCAN-SOURCE` covers all eight credential rules, `GATE-SECRET-SCAN-ARTIFACT` covers retained CI output including binary and clean files, `GATE-LOG-REDACTION` covers stderr, and `GATE-FIXTURE-SAFETY` covers publisher artwork and secrets in fixtures. CI runs the scan as its own step and skips the artifact upload unless that step succeeded.

## Implemented, not verified

### BGA-015 — Policy boundary

`src/policy.ts` is the single gate for project roots, traversal, symlink escape, remote allowlists, network permission, mutation intent, operation deadlines, and output budget. Defaults are local, read-only, and network-off, and invalid configuration fails at startup rather than at first use. An ESLint rule and `GATE-POLICY-IMPORT-BOUNDARY` prevent any other module from importing filesystem, network, or subprocess APIs.

Every decision is covered by `INT-POLICY-*` scenarios against a real filesystem, including a directory link that escapes its root, and the packaged artifact refuses five unsafe configurations through `E2E-POLICY-CONFIG-FAILS-CLOSED` and `E2E-POLICY-ROOT-UNAVAILABLE`.

It stays `implemented` because no public capability exists yet. BGA-015 requires packaged end-to-end coverage of traversal, symlink escape, unlisted roots, unlisted remotes, missing mutation confirmation, timeout, and oversized output **through a tool call**, and the first tool arrives in BGA-102. The gap is recorded as RR-POLICY-NO-TOOL-EVIDENCE.

### BGA-016 — Errors and redaction

`src/errors.ts` publishes a versioned public error contract with 14 stable codes; unknown failures collapse to `internal.unexpected` with no stack trace, library internals, or unredacted values. `src/redaction.ts` removes private keys, AWS and GitHub tokens, bearer credentials, session identifiers, connection credentials, assigned secrets, player identifiers, email addresses, and out-of-root filesystem paths, while keeping in-root paths readable so findings stay actionable.

It stays `implemented` for the same reason: the verification criterion is that every public capability inherits negative end-to-end scenarios seeded with sensitive values, and there is no public capability yet.

## Known gaps

- BGA-012 machine-readable verification evidence is still not emitted, so this record and the backlog remain the evidence of record. BGA-012 is blocked behind BGA-011, which the pinned official conformance CLI cannot complete; see [CONFORMANCE.md](../CONFORMANCE.md).
- Secret scanning recognizes known credential formats only (RR-SECRET-SCAN-COVERAGE).
- Scenario coverage is verified by declaration and by the tests running in the same gate, not yet by per-run machine-readable results.
