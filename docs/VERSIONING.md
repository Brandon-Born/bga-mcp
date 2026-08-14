# Versioning and compatibility policy

This policy starts with the first stable `bga-mcp` release. Until a release candidate is approved, source and packed development builds stay at `0.0.0-development` and must not be published under a stable registry tag. The first stable contract is `1.0.0`; a release candidate may use `1.0.0-rc.N` under the `next` tag, but a prerelease does not begin a stable support window. Only the approved stable artifact may use `latest`.

[`config/version-policy.json`](../config/version-policy.json) is the machine-readable policy. [`config/contracts/1.0.0.json`](../config/contracts/1.0.0.json) is the retained first-release contract. `pnpm verify:version-policy` validates both documents, their lifecycle, package metadata, source attribution, and seeded failure cases. `E2E-CONTRACT-COMPATIBILITY` installs the shared tarball, connects through the real MCP client, and compares installed discovery and shipped schemas with that retained contract.

## The public contract

The stable public API includes all of these surfaces in the BGA-414 release profile:

- Package name, executable, exports, generated TypeScript declarations, server name, and release entry point.
- MCP protocol and transport claims.
- Tool names, titles, descriptions, annotations, input schemas, and output schemas.
- Resource descriptors, resource-template names, and prompt names.
- The release-selected capability manifest fields: stability, layouts, environments, protocol versions, Studio requirement, and trust boundary.
- Every JSON Schema shipped in the package, plus the runtime public-error schema.
- Every supported, unsupported, and unknown entry in the BGA, runtime, platform, client, transport, and MCP compatibility matrix.
- The machine-readable version and support policy itself, excluding only the pointer to the newest retained snapshot.

The retained contract stores canonical SHA-256 fingerprints for large schemas and descriptions. A fingerprint is evidence of exact equality, not a compatibility opinion: if the installed artifact differs, the gate fails before code can decide that the change is patch, minor, or major.

## Package versions

Stable versions follow Semantic Versioning 2.0.0:

| Version | Allowed change                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Patch   | A behavior fix, documentation clarification, dependency update, or refactor that preserves the retained public contract.                                     |
| Minor   | A backward-compatible addition, a new evidenced capability or support claim, a public metadata clarification, or a deprecation that retains the old surface. |
| Major   | A removal, rename, replacement, input/output schema change, export or entry-point break, protocol removal, or narrowing of a supported compatibility claim.  |

Adding a tool, resource, prompt, protocol, or supported BGA form is minor because existing consumers retain their contract. Removing one is major. Changing an existing tool input or output schema is deliberately treated as major even when a looser compatibility analysis might accept it; this avoids assuming how agents validate strict schemas. A changed schema marked `schema-version` must also receive a new schema contract version. Reusing the old version with different bytes is rejected even at a package-major boundary.

Manifest evidence identifiers and CI run URLs are not themselves a consumer API and may advance without a package bump. The release-facing manifest fields listed above are part of the contract. Moving an included capability away from `verified`, removing a supported layout or protocol, changing its trust boundary, or making it require Studio is major.

## Deprecation and removal

A stable public surface must be deprecated in a minor release before removal. The retained contract names the exact surface, the announcing version, its replacement, an earliest removal version in a later major, and an earliest removal date. The minimum window is both:

- one complete minor release in which old and replacement surfaces coexist; and
- 90 days from the deprecation release.

The removal gate requires both limits to have passed. A security problem does not authorize a silent incompatible patch: stop or withhold the affected release, document the impact, and either restore compatibility or make the explicit major-version decision.

## Support windows

The current stable package major receives fixes. When a successor major is published, the immediately previous major receives feasible critical security fixes for 180 days. Older artifacts may remain installable, but they are unsupported and receive no routine fixes.

An MCP protocol revision remains supported throughout every package major that claims it. Removing it needs a verified successor, a prior minor deprecation, 90 days, and the next package major. MCP revisions are independent of package SemVer: the protocol uses date identifiers for backwards-incompatible revisions, and client and server still negotiate one supported revision per session.

A supported BGA layout or file generation also remains supported throughout the claiming package major. BGA migration is per construct: the official reference labels older forms deprecated, while the migration guide tells developers when each old file can safely be deleted. Therefore a new BGA form is not evidence that its predecessor vanished, and no release may silently collapse legacy, modern, and part-migrated support into one project shape.

If BGA changes invalidate a claim, publication of the affected release is frozen while the claim is rechecked against official documentation and fixtures. A removal needs official-source evidence, an updated compatibility matrix and capability manifest, the deprecation window, a package major, and passing installed-package scenarios for the new boundary. BGA-408 owns the later monitoring and emergency-response workflow; this policy defines the compatibility boundary it must preserve.

## Change procedure

1. Run the installed contract scenario before editing and keep the previous snapshot immutable.
2. Classify the intended change using this policy. If an existing public schema changes, design a versioned replacement rather than overwriting its contract version.
3. For a deprecation, retain the old surface and add its exact reference, replacement, earliest major, and earliest date to the new contract.
4. Add a new `config/contracts/<version>.json`; never rewrite a published snapshot. Update the policy's `current` pointer.
5. Update the capability manifest, compatibility matrix, public documentation, backlog item, and installed-package scenarios together.
6. Run `pnpm check`. BGA-403 must consume this gate before creating a release candidate.

## Sources

- **SEMVER-2:** [Semantic Versioning 2.0.0](https://semver.org/) defines `MAJOR.MINOR.PATCH`, requires a minor version for deprecation, and reserves incompatible public API changes for a major.
- **MCP-VERSIONING:** [MCP Versioning](https://modelcontextprotocol.io/docs/learn/versioning) defines date-based incompatible revisions and says client and server “MUST agree on a single version” for a session.
- **BGA-FILE-REFERENCE:** [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference) labels `states.inc.php` deprecated while documenting State classes, and says a production database change “requires migration.”
- **BGA-MIGRATION:** [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) describes migrating older projects one file or construct at a time and says an old file can be safely deleted only after its replacement is ready.
