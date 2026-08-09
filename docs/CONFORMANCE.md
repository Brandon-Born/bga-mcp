# MCP conformance coverage

Snapshot: 2026-08-07. Backlog item: BGA-011.

`bga-mcp` pins `@modelcontextprotocol/conformance@0.2.0-alpha.11` and runs the official suite against the **packaged binary over its real transport**. `pnpm test:conformance` proves the suite rejects a deliberately malformed initialize response before the candidate is allowed to pass.

## What the suite runs against

The official `server` command speaks Streamable HTTP only — `--url` is a required option — while `bga-mcp` ships stdio only. [`tests/fixtures/conformance-stdio-proxy.ts`](../tests/fixtures/conformance-stdio-proxy.ts) closes that gap: each HTTP session spawns `dist/cli.js` as a subprocess and relays JSON-RPC frames between the two, unchanged in either direction. The relay never negotiates, rewrites, or answers anything, so initialization, capabilities, protocol version, errors, and notifications are all the shipped binary's.

This replaced an in-process adapter that built a server object from the same factory the product uses. That adapter proved something about a factory rather than about the artifact a developer installs, and it held a single session for the whole process, so the first scenario claimed it and every scenario afterwards was answered `Session not found` — which made any multi-scenario run measure the harness instead of the server.

## Coverage by revision

| Revision   | Official suite | How it is measured                                                      |
| ---------- | -------------- | ----------------------------------------------------------------------- |
| 2025-11-25 | passed         | Full frozen requirement set (33 scenarios) against the packaged binary. |
| 2026-07-28 | not applicable | Not measurable for a stdio product; packaged E2E covers it instead.     |

### 2025-11-25

Run as `--requirements 2025-11-25`, the set frozen when the revision shipped, against [`config/conformance-baseline-2025-11-25.yml`](../config/conformance-baseline-2025-11-25.yml). 41 checks pass. 26 scenarios are baselined, each with a stated reason falling into three groups:

- **Capabilities the server does not advertise** — prompts, logging, completions, resource subscriptions, sampling, elicitation. It answers `Method not found`, which is correct for a capability it never offered.
- **Scenarios that need the suite's reference fixture** — they call a tool or resource by a name only the "everything" server has, such as `test_simple_text` or `test://static-text`. A product server cannot pass them without impersonating that fixture.
- **Streamable HTTP semantics the product does not ship** — currently `server-session-lifecycle`, which tests HTTP session termination codes and therefore measures the proxy.

The baseline is enforced in both directions: an unlisted failure fails the run as a regression, and a listed scenario that starts passing fails it as a stale entry. It cannot quietly outlive its reasons.

### 2026-07-28

The official server scenarios for this revision test the **stateless** Streamable HTTP model: per-request `_meta` carrying the protocol version, stateless session handling, HTTP caching, and header validation. Those are transport semantics, not server behaviour. Measured through the loopback proxy the whole set fails, and every one of those failures belongs to the harness — a run against it would be a claim about the proxy, not about `bga-mcp`.

Making it pass would mean the proxy synthesizing an initialize handshake for the stdio child, at which point the suite would be measuring the proxy's protocol work. That is the opposite of why the proxy exists, so the revision is recorded as **not applicable** with that reason, in `conformance-results/candidate-2026-07-28/not-applicable.json` and in the verification evidence.

The stdio evidence for this revision is `E2E-STDIO-MODERN-DISCOVER` and its neighbours, which negotiate `2026-07-28` with a real SDK client against the packaged artifact and exercise discovery and tool calls over it. That is genuine observed-behavior evidence, and it is weaker than official conformance; the support constant, transport manifest, capability entries, and evidence artifact therefore exclude this revision until BGA-017 and BGA-318 pass.

## Why BGA-011 is still `implemented`

Its deliverable is conformance for every supported protocol version **and transport**. One of the two claimed versions cannot be measured by the official suite for the transport this product ships. Calling that verified would mean deciding that a version we advertise does not need the evidence the item asks for.

It becomes `verified` when either the suite gains a stdio server mode, or its 2026-07-28 server scenarios separate transport semantics from server behaviour. Re-check when `0.2.0` leaves prerelease.

## Prerelease dependency

`0.2.0-alpha.11` is a prerelease, adopted deliberately on 2026-08-07: it is the first release carrying the frozen `--requirements` sets and the per-check baseline mechanism this coverage depends on. The pin is exact and upgrades are reviewed like any other, with one extra obligation — the requirement sets can move between alphas, so an upgrade re-reads both the baseline and this document.

Run `pnpm test:conformance`. Machine output is written beneath `conformance-results/`, which CI retains as non-secret evidence, and `pnpm evidence` records the per-revision outcome in the verification artifact.
