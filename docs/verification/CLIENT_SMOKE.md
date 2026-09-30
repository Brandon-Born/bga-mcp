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

Controlled execution and exact-commit CI will be recorded after the completed implementation passes its gates. BGA-401 remains implemented until then.
