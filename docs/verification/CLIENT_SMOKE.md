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
