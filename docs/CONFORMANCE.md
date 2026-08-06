# MCP conformance coverage

Snapshot: 2026-08-05

`bga-mcp` pins `@modelcontextprotocol/conformance@0.1.16` and runs the official `server-initialize` scenario for protocol `2025-11-25`. The candidate run uses the production server factory behind a loopback-only, test-only Streamable HTTP adapter with host and origin validation. A deliberately malformed initialize response must fail immediately before the candidate is allowed to pass.

The official conformance CLI at this pinned version accepts a URL and offers active server scenarios for protocol versions through `2025-11-25`; it does not launch or accept a stdio command and does not list `2026-07-28` scenarios. Therefore:

- Official conformance currently covers the common server factory's `2025-11-25` initialization semantics over its supported HTTP harness boundary.
- Packaged-artifact E2E independently verifies the product's supported stdio transport with real SDK clients pinned to `2025-11-25` and `2026-07-28`.
- Streamable HTTP is test infrastructure only and is not an advertised `bga-mcp` product transport.
- BGA-011 must remain `implemented`, not `verified`, until the official framework can exercise the complete claimed stdio/version matrix. Dependency upgrades are exact and reviewed; they never float silently.

Run `pnpm test:conformance`. Machine output is written beneath `conformance-results/`, which CI retains as non-secret evidence.
