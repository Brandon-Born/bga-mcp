# Client smoke verification — BGA-401

```verification-record
{
  "kind": "review",
  "scope": "BGA-401 maintained client matrix, real packaged reference-client flow and bounded native Codex original-candidate evaluation"
}
```

[CLIENTS.md](../CLIENTS.md) and [config/client-smoke.json](../../config/client-smoke.json) define the exact scope. The maintained reference client is pinned to SDK 2.0.0 and runs through the installed public command in all six CI platform/Node jobs. `E2E-CLIENT-SDK-SMOKE` performs exact discovery, calls every release tool, reads every release resource, checks schema/root/excluded-tool refusal, restarts, hashes the project and shuts down for each legacy/modern/hybrid fixture. `E2E-INSTALL-GUIDE` separately verifies installation and removal.

`GATE-CLIENT-MATRIX` and `pnpm verify:clients` reject seeded unsupported versions, missing scenarios, CI drift, missing controlled receipts and unsupported claims. The gate also compares controlled candidate identity and runner digests; source changes cannot silently reuse the native-client observation.

The native Codex evaluation uses the actual installed CLI/app-server MCP stack and its documented APIs, with no inference turn. Its [controlled receipt](codex-client-v1.0.0-rc.1.json) binds the exact signed original candidate, version/platform, exercised inventory, refusals, restart, project/configuration snapshots, process cleanup, removal and runner hashes. Raw private configuration and transcripts are absent. This does not verify Codex GUI behavior, model-driven tool selection, other versions/platforms, or real-game development usefulness. General editor support stays unknown in the frozen public compatibility contract.

## Observed verification

[Exact-commit CI 36777743287](https://github.com/Brandon-Born/bga-mcp/actions/runs/36777743287) passed every Ubuntu/macOS/Windows Node 22/24 job at `7e97256b42ac9c43931008c4d79dcb6b460bfbd8`, each with 598 tests and all 182 required scenarios. This covers the maintained reference SDK flow and seeded matrix refusals.

The independent native Codex run on macOS arm64/Node 22.17.1 used CLI 0.159.2 and the clean committed runner at that same source. The retained receipt names the actual client binary digest and runner hashes, original candidate source `a2031af`, and original package digest `sha256:a3472a97916bbd793fe32ffb847ced3d9638fe2c45cc112867b0af0a15f3acfa`. Exact discovery, all seven tool calls, all three resource reads, schema/outside-root/excluded-tool refusals, unchanged project and user configuration, clean app-server/child-process exit, restart and removal passed. Codex emitted startup diagnostics; raw stderr was discarded rather than represented as a clean stream. No inference turn or GUI interaction occurred. Configuration-change assertions compare bytes internally and expose only a boolean failure, so a failed check cannot print configuration contents.

BGA-401 is verified within these scopes. It makes no claim for other clients, platforms, versions or replacement candidate bytes. BGA-424 is the next release item and requires an owner-authorized real game project and reviewed development tasks.

## Runner refresh for replacement candidate preparation

On 2026-10-01, BGA-430 corrected the installation runner's hardcoded rc.1 version
assertion. The actual native Codex smoke was repeated against the unchanged signed
rc.1 package using committed runner source `aa30ad4`. The
[refresh receipt](codex-client-v1.0.0-rc.1-refresh.json) records the new runner
digests and passing discovery, all calls, refusals, restart, immutable project and
user configuration, process cleanup and removal. The original receipt is retained.
This refresh does not transfer native-client evidence to rc.2 bytes.

## BGA-411 helper refresh

The [new controlled receipt](codex-client-bga411-refresh.json) repeats the same native Codex 0.159.2 macOS arm64 / Node 22 smoke on immutable signed rc.1 after installation-guide helper changes. All seven tools and three resources, refusals, restart, unchanged project/configuration, process exit and removal passed. It records the runner commit and explicitly dirty implementation tree plus exact helper digests. Original receipts remain unchanged. This refresh does not transfer named-client compatibility to a rebuilt documentation package or establish GUI interaction, inference, productivity or game correctness.

## Original rc.4 controlled refresh, 2026-10-02 UTC

[The preparation receipt](codex-client-v1.0.0-rc.4-preparation.json) records an
actual native Codex 0.159.2 macOS arm64 / Node 22 repeat on independently
authenticated original signed rc.4. Discovery matches all seven tools and three
resources; all calls, schema/outside-root/excluded-tool refusals, restart,
unchanged project/configuration, server exit and removal passed. The initial
runner tree was dirty and its exact runner digests are retained. The matrix and
its independent candidate pin now select this actual candidate, and controls
refuse historical candidate identities even when runner digests match.
Historical receipts are preserved. This is a bounded app-server observation,
not a new general supported-client claim, GUI or inference evaluation.

[The clean committed rc.4 repeat](codex-client-v1.0.0-rc.4-clean.json) passes
that same controlled flow at `6a0c3c66083de96e8d1dd78351de6b65b6ac1cf6` with
`runnerTreeDirty: false`. The current evaluated matrix references this separate
receipt. Both original and preparation observations remain intact; no other
client, version, platform, GUI or inference claim is added.

## Original rc.5 controlled refresh — 2026-10-02 UTC

The controlled runner and independent matrix candidate pin now select the original signed rc.5 packet. The [preparation receipt](codex-client-v1.0.0-rc.5-preparation.json) preserves the actual macOS arm64 / Node 22.17.1 / Codex 0.159.2 observation with its explicitly dirty runner tree. The [current controlled receipt](codex-client-v1.0.0-rc.5.json) records the separate clean committed repeat at `90565d57ea4cf9bbb25f35d79ea9727cc197a24d` with `runnerTreeDirty: false`. Historical rc.1 and rc.4 receipts remain intact.

Fresh independent signature verification with separately acquired roots passed before native-client use: exact signer/source, all original subjects and producer provenance matched, and cryptographic probes refused changed bytes, a wrong signer and a wrong workflow. Actual native discovery, all seven tool calls and three resource reads, schema/outside-root/excluded-tool refusals, restart, unchanged project/configuration, process exit and removal pass. No inference turn or GUI test occurred. The matrix controls reject both rc.1 and rc.4 identities even when current runner digests match. The clean committed native repeat passes, and the full local preparation gate passes with 674 tests / 209 required scenarios. [Exact-source CI 36999384205](https://github.com/Brandon-Born/bga-mcp/actions/runs/36999384205) passes all six Ubuntu/macOS/Windows Node 22/24 jobs at `90565d57ea4cf9bbb25f35d79ea9727cc197a24d`, each with 674 tests / 209 scenarios. Every downloaded record passes trusted-schema, sealed-integrity, clean-source, CI-environment, exact-commit, test/scenario and conformance checks. The current receipt retains those CI identities separately from the original candidate and clean native observation. Eight unchanged previously read framework decisions are explicitly re-admitted against this CI, and the actual framework release guard passes. BGA-424 owns the next rc.5-specific development-usefulness handoff; this smoke does not substitute for that evaluation.

The [official app-server documentation](https://learn.chatgpt.com/docs/app-server) was fetched again before this run. It describes `mcpServer/tool/call` as “call a tool on a thread’s configured MCP server.” The installed 0.159.2 binary generated its experimental JSON schemas; initialization, ephemeral thread, catalog, resource, tool and configuration fields used by the unchanged adapter were checked against those version-specific schemas. No API behavior or BGA framework reader changed.
