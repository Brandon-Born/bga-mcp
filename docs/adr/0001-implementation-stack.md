# ADR 0001: Implementation stack

- **Status:** accepted
- **Date:** 2026-08-05
- **Backlog:** BGA-002

## Context

`bga-mcp` needs a distributable local MCP server, a real client for subprocess end-to-end tests, strict schemas, deterministic packaging, and a path to the official MCP conformance framework. The stack must support macOS, Linux, and Windows without requiring the BGA developer to install PHP or Python solely for this server.

The decision was rechecked against primary sources on 2026-08-05 because the MCP 2026 protocol and TypeScript SDK v2 were newly released:

- The official TypeScript packages `@modelcontextprotocol/server` and `@modelcontextprotocol/client` are at `2.0.0`: <https://www.npmjs.com/package/@modelcontextprotocol/server>
- The SDK provides stdio server/client transports and is ESM-first: <https://github.com/modelcontextprotocol/typescript-sdk>
- The official conformance framework is published as `@modelcontextprotocol/conformance`: <https://github.com/modelcontextprotocol/conformance>
- Node recommends supported LTS lines for production; Node 22 and 24 are LTS on the decision date: <https://nodejs.org/en/about/previous-releases>

## Options considered

### TypeScript on Node.js with the official v2 SDK

Advantages: one language for the server and E2E client, first-party protocol types, mature subprocess/filesystem tooling, straightforward npm packaging, and close alignment with the BGA JavaScript/TypeScript ecosystem.

Risks: v2 is newly released, so exact versions must remain pinned and conformance plus packaged-artifact E2E must catch regressions before upgrades.

### TypeScript on Node.js with the v1 SDK

Advantages: older and widely deployed.

Rejected for new development because it would start on the previous SDK generation immediately after v2 general availability and create planned migration work before the first release.

### Python with the official Python SDK

Advantages: strong parsing and scripting ecosystem.

Rejected for the initial implementation because it adds a second runtime ecosystem for BGA developers and does not improve the core stdio, packaging, or test requirements enough to offset that cost.

## Decision

- Language: TypeScript 6.0.2 with strict compiler settings.
- Runtime: Node.js 22.13 or newer on the Node 22 line, and Node.js 24 LTS or newer. Node 24 is the primary development and release line; Node 22 remains in CI while supported.
- Module format: native ESM (`NodeNext`).
- MCP packages: `@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/client@2.0.0`.
- Schema library: `zod@4.4.3`.
- Package manager: `pnpm@11.15.1` with an immutable lockfile.
- Build: `tsc` to ESM JavaScript plus declarations in `dist/`.
- Tests: Vitest 4.1.10 for unit, integration, and E2E orchestration; the official MCP client drives public stdio tests.
- Quality: ESLint 10 with typescript-eslint, Prettier, TypeScript strict checks, coverage gates, Publint, and the official MCP conformance CLI where its supported transports apply.

All direct dependency versions are exact. Upgrades require a dedicated change with the complete gate rerun.

## Verification decision

The stack is not considered proven by this ADR. BGA-002 is verified only when CI exercises a test-only MCP capability over stdio using the real client on both supported Node LTS lines. The distributable package is separately verified by BGA-003 and BGA-010.
