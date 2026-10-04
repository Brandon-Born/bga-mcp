# MCP client smoke matrix

The machine-readable [matrix](../config/client-smoke.json) distinguishes maintained support, a bounded controlled evaluation, and untested candidates. `pnpm verify:clients` refuses omitted supported clients, unpinned versions, absent packaged scenarios, CI environment drift, missing controlled receipts, wrong candidate identities and changed controlled runners. It runs in the complete gate.

| Matrix row              | Client/version                                   | Environment                                                     | Evidence and scope                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLIENT-REFERENCE-SDK    | `@modelcontextprotocol/client` 2.0.0 — supported | Ubuntu/macOS/Windows, Node 22/24, stdio `2025-11-25`            | Each CI job installs its public package and runs E2E-CLIENT-SDK-SMOKE and E2E-INSTALL-GUIDE. Legacy, modern and hybrid fixtures; exact discovery, every released tool/resource, refusals, restart, unchanged project and cleanup.                                          |
| CLIENT-CODEX-APP-SERVER | Codex CLI/app-server 0.159.2 — evaluated         | macOS arm64, Node 22.17.1, exact signed `v1.0.0-rc.7` candidate | Actual Codex MCP stack exercised through documented app-server APIs. Controlled receipt binds the original artifact and runner digests. This is neither a GUI test nor an inference turn, and adds no general editor/agent support promise to the frozen package contract. |
| CLIENT-OTHER-EDITORS    | Other editor and agent clients — candidates      | Untested                                                        | Claude Code/Desktop, VS Code, Cursor, Codex GUI and other versions/platforms have no maintained evidence.                                                                                                                                                                  |

The existing [compatibility claim](COMPATIBILITY.md), CLAIM-CLIENT-SDK, remains the only broad supported-client claim. CLAIM-CLIENT-EDITORS remains unknown. A connection smoke does not establish that an agent makes useful development decisions; BGA-424 owns the real-game evaluation. The signed original is immutable: current-source CI packages and controlled original-candidate observations are recorded separately.

## Configure and test the reference client

Follow [INSTALL.md](INSTALL.md) for authenticated candidate acquisition, platform-specific public command configuration, first use and removal. Tests use the pinned SDK as an actual stdio client, not a mocked transport. The matrix is checked against the pinned dependency, compatibility claim, transport scenarios, runnable packaged tests, fixtures and CI platform/Node dimensions. Unsupported candidates cannot claim a test result.

## Configure Codex

After installing an independently verified candidate, configure a stdio server using the public command. On macOS/Linux, the documented configuration shape is:

```toml
[mcp_servers.bga]
command = "/absolute/path/to/bga-mcp-install/node_modules/.bin/bga-mcp"
args = ["--project-root", "/absolute/path/to/your/game"]
required = true
```

Do not treat that example as evidence for untested Codex versions/platforms. Windows users need the command-interpreter configuration in INSTALL.md and their own client smoke evidence. No Studio credential belongs in this configuration.

The controlled runner uses command-line settings instead of editing the user's configuration. It reads the effective configuration first, disables inherited MCP servers before creating an ephemeral local smoke context, disables apps/plugins and analytics for that invocation, and refuses interactive requests. It starts no model turn. The app-server may perform its own startup/service activity; this test does not assert that Codex itself is network-free. The installed BGA MCP server remains local and read-only.

The runner lists the native client's exact tools/resources, calls all seven tools, reads all three resources, refuses invalid input, an outside project root and an excluded tool, hashes the fixture project, checks unchanged user configuration, shuts down the app-server and its child processes, restarts for another first-use call and removes the package. Raw configuration, stderr, fixture responses and protocol transcripts are not retained; the receipt contains allowlisted observations and hashes only.

After independently verifying the original signature/provenance as in [RELEASE_SIGNING.md](verification/RELEASE_SIGNING.md), run this from a trusted checkout on the recorded macOS host:

```sh
BGA_MCP_SIGNED_CANDIDATE=/absolute/path/to/signed-packet corepack pnpm test:client-codex
```

This requires Codex CLI 0.159.2. Set `BGA_MCP_CODEX_CLIENT` to its absolute executable path when the default CLI differs. The runner refuses a version mismatch. It uses its real MCP implementation without making a model request. Copy the sanitized `.artifacts/codex-client-smoke.json` into the tracked receipt only after review, and run the full gate. The receipt and matrix must match the actual version/environment. A changed runner, candidate, client version or claimed environment requires another observation; do not copy old results onto new bytes.

## Updating the matrix

1. Keep untested clients as candidates.
2. For a maintained support claim, pin the exact client, add its compatibility entry and fixture, declare runnable packaged scenarios, and bind the claimed platform/runtime pairs to CI or controlled evidence.
3. Preserve the public versioning contract. New public support claims require its change procedure and, when applicable, a replacement candidate; do not rewrite the retained signed candidate.
4. Run `pnpm verify:clients` and `pnpm check`, then record exact-commit CI and any controlled run.

## Sources

- [Official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) documents `[mcp_servers.<server-name>]`, stdio commands, arguments and startup policy.
- [Official Codex app-server API](https://learn.chatgpt.com/docs/app-server) documents version-generated schemas, initialization, ephemeral contexts, MCP catalog listing, resource reads and tool calls. It describes tool calls as “call a tool on a thread’s configured MCP server.”
- The installed 0.159.2 binary's generated schemas confirm the exact request fields used by the controlled runner; no API shape is guessed.
