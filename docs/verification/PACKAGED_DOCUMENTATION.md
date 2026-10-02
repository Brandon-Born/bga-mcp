# BGA-411 packaged documentation

```verification-record
{"kind":"review","scope":"BGA-411 consumer documentation, generated inventories and installed-package negative controls"}
```

The package ships README, installation, canonical agent, contribution, security and versioning guides. Repository-only references use immutable public URLs at reviewed handoff `35f90c924f29951a3f137af0edd82e38e25b2e09`. These historical links do not represent later repository changes; repository agents use current checkout documents.

`corepack pnpm docs:inventory` generates the inventory blocks in README, INSTALL and AGENTS from the manifest, frozen release selection, fixed topic table and policy defaults. `corepack pnpm verify:documentation` checks those blocks and local Markdown/help paths. Both treat templates separately from concrete resources and retain implemented/experimental status. Unknown trust boundaries/templates cannot silently inherit a classification.

Public discovery is seven tools, zero templates, three concrete resources and zero prompts: ten verified entries and no network-backed entries. Development discovers ten tools, one template, eleven concrete resources and zero prompts: ten verified, eleven implemented and one experimental entry, eleven of which require explicit network permission. Eight network-backed concrete resources include seven fixed topic expansions and framework version; the template is counted separately. These are discovery-entry counts, not manifest capability counts or measured productivity.

`E2E-DOCUMENTATION-PUBLIC` installs the shared freshly packed tarball, resolves shipped Markdown/help paths, checks generated blocks against the packed manifest and compares actual public MCP discovery. `E2E-DOCUMENTATION-DEVELOPMENT` checks installed development help/discovery and documentation refusal without network permission. Both check clean exit. `E2E-DOCUMENTATION-NEGATIVE` deletes the installed guide, checks README/help failure and restores it; it seeds stale counts, template/resource confusion, names, stability, boundaries and missing reference links. `E2E-INSTALL-GUIDE` verifies the shipped guide equals the exercised guide and follows install, first-use, refusal, repeat-install, immutability, shutdown and removal. This is not a cross-version upgrade test.

Acquisition instructions identify the immutable signed rc.3 original, digest and finite retention. Signature verification uses independently trusted verifier instructions and receipts. Packing this documentation change produces different bytes; it does not replace rc.3 or inherit its signature. No candidate tag, original packet, signing receipt or registry publication changes here.

README cites BGA-424's rc.3 candidate, native Codex client, frozen diagnosis/feature/review tasks and adjudication. Six SQL checks remain unsupported, the game-owned reload defect was not detected, and live gameplay/general correctness/measured time savings remain unestablished. Frozen tasks were repeated, not newly implemented.

## Sources

Official [file reference](https://en.doc.boardgamearena.com/Studio_file_reference) and [migration guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) were fetched before revising layout prose on 2026-10-01. They retain deprecated forms and independently staged migrations. No BGA reader or rule changes in this item.

## Validation

The complete local `corepack pnpm check` passes: 654 tests, 196 required scenarios, package checks, applicable official conformance, safety and acceptance-map checks. The acceptance map proves 184 of 186 cases across 55 backlog items; its two existing gaps remain explicit. Only count fields in six identified current-run summaries were refreshed from the actual passing run; historical prose and candidate receipts remain unchanged.

The [original rc.3 guide receipt](install-guide-bga411-rc.3.json) additionally records install, first use, root refusal, repeat install, unchanged project, shutdown and removal using the same previously independently authenticated original tarball. This flow checks identity/checksums against its tracked receipt; it does not claim fresh cryptographic verification. Newly packed checkout E2E separately verifies the shipped guides. The [native-client helper refresh](codex-client-bga411-refresh.json) repeats the unchanged rc.1 client matrix after helper changes; it does not transfer that claim to rebuilt bytes. Both record the implementation runner's dirty-tree state rather than implying a clean source release.

[Exact-source CI 36958128036](https://github.com/Brandon-Born/bga-mcp/actions/runs/36958128036) passed all six Ubuntu/macOS/Windows Node 22/24 jobs at `8c034d8cd1596ac3265b40b9fed6419a54f9efd5`, each with 654 tests and 196 required scenarios. The [sanitized source-CI receipt](bga411-source-ci.json) retains independently downloaded evidence digests and platform package identities. BGA-411 is verified for this bounded documentation scope. No new signed candidate or package publication is claimed.

## Original signed rc.5 documentation repeat

The [candidate-specific receipt](packaged-documentation-v1.0.0-rc.5.json) records a fresh consumer check of original signed `v1.0.0-rc.5`, artifact SHA-256 `b7cc226a512a4aab433f8daddf49f54ee00323f3dc7da6960490be1c0727eeac`. Independent signature, subject and provenance verification, including modified-artifact, wrong-signer and wrong-workflow refusals, preceded installation. The original tarball was consumed without rebuilding.

All six original packed guides are byte-identical to the current checkout. The replacement therefore contains the two guide corrections that original rc.4 lacked. README and INSTALL retain the explicitly historical rc.3 acquisition example: its concrete acquisition commands were not exercised as rc.5 acquisition and do not identify the latest candidate. Their immutable repository references remain historical rather than silently advancing to a later source.

An isolated install checks every local Markdown/help path and all three generated inventory blocks against the installed manifests. Actual public discovery returns seven tools, zero templates, three concrete resources and zero prompts; actual development discovery returns ten tools, one template, eleven concrete resources and zero prompts. Network, stability and experimental classifications match the generated blocks. Development documentation requests without permission refuse with `policy.network.disabled`. Development discovery is evidence for this documentation inventory, not a new supported transport or live Studio claim.

The consumer deletes an installed guide and observes both README and help-path failures. Ten actual installed inventory mutations fail: tool/template/resource/prompt counts, implemented/experimental/network counts, a tool name, a trust boundary and a stability classification. Missing reference-definition paths and mutable repository URLs also fail. Modified installed copies are restored byte for byte and the positive path check is repeated. This path check verifies immutable URL form, not remote URL availability.

Marked install/version/client/first-use/root-refusal/repeat-install/removal recipes also pass on the same original artifact. The inspected fixture stays unchanged, all servers exit and both owned temporary installations are removed. This repeats the same candidate; cross-version upgrading is untested.

The packed README's usefulness example remains explicitly tied to historical rc.3. The current [rc.5 evaluation ledger](agent-evaluation-v1.0.0-rc.5.json) independently retains all 23 frozen-task calls and adjudication. Neither source establishes measured productivity, complete game correctness or live Studio gameplay. SQL uncertainty and game-owned persistence/scoring checks remain explicit.

The unchanged committed helpers were exercised from clean source `ed02a9583fe51a3eeee6a90b3392d259b6abc284`. [Exact-source CI 37002702895](https://github.com/Brandon-Born/bga-mcp/actions/runs/37002702895) passed all six Ubuntu/macOS/Windows Node 22/24 jobs, each with 674 tests and 209 required scenarios. Downloaded evidence records pass schema, integrity, clean exact-source, CI-environment and conformance checks. The full local handoff gate passes with 674 tests and 209 required scenarios, package/safety checks and applicable official conformance. The acceptance map retains six unproven cases. This handoff only adds documentation and a receipt; the existing framework admission remains separate, as do security approval, external private-report lifecycle and publication.
