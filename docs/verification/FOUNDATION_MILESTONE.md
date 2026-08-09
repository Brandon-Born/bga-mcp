# Foundation milestone verification

> [!CAUTION]
> Historical evidence only. The [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md) reopened the associated backlog and manifest claims. Do not treat this record as current release verification.

- **Backlog scope:** BGA-001 through BGA-008, BGA-010, and BGA-011
- **Verification refreshed:** 2026-08-06 (America/Chicago)
- **Package:** `bga-mcp@0.0.0-development`
- **Verified commit:** `efcaa6dfbe38d6e2f1672f3e64e60327fa9666aa`

## Verified outcomes

| Outcome               | Evidence                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current BGA workflows | Source-attributed catalog covers project setup, SFTP, edit/refresh, states/actions, multiplayer testing, saved states, logs, automated tests, pre-release edges, and release workflow.                                                                                                                |
| Selected stack        | A real SDK client discovers and invokes `milestone_proof` over stdio and shuts the process down on Node 22.17.1 and Node 24.19.0.                                                                                                                                                                     |
| Distributable server  | E2E builds a tarball, installs it into an isolated root with a cache-first registry fallback, launches only the installed CLI, verifies it, uninstalls it, and removes temporary state.                                                                                                               |
| Observed stdio eras   | The installed artifact negotiates `2025-11-25` legacy initialization and pinned `2026-07-28` discovery. Only `2025-11-25` remains in the supported contract; an unrecognized pinned version is rejected.                                                                                              |
| Empty public surface  | Server identity, empty runtime capabilities, empty tool/resource/prompt discovery, errors, stdout discipline, and shutdown are asserted through the real client. There are currently no public BGA functions to invoke.                                                                               |
| E2E harness faults    | Real subprocess fixtures prove detection of startup, handshake, schema, response, side-effect, timeout, and cleanup failures.                                                                                                                                                                         |
| Capability manifest   | The packed schema and manifest validate and exactly match runtime discovery. Seeded unsupported stability, missing scenarios, duplicate names, and stale capabilities fail the gate.                                                                                                                  |
| Diagnostic contract   | Version 1 schemas distinguish certain, heuristic, and unsupported findings; enforce evidence, certainty, suggestion, location, and aggregate semantics; serialize all required cases over real MCP stdio; and ship in the installed package.                                                          |
| Fixture corpus        | Original modern and legacy layouts match declared baselines, remain byte-immutable, and contain no banned credential patterns or publisher-style assets.                                                                                                                                              |
| Quality gates         | Isolated bad formatting, a TypeScript error, and a failing Vitest test are each rejected. The normal lint, strict type, coverage, build, and package lint gates pass.                                                                                                                                 |
| Official conformance  | Pinned conformance 0.1.16 rejects a malformed initialize response and passes `server-initialize` for the candidate server factory at `2025-11-25`.                                                                                                                                                    |
| Hosted CI matrix      | [CI run 31101182339](https://github.com/Brandon-Born/bga-mcp/actions/runs/31101182339) passed the current foundation on all six Ubuntu, macOS, and Windows jobs on Node 22 and 24. The [controlled failure proof](CI_FAILURE_PROOF.md) records an isolated hosted failure for every required command. |

The complete local test run contains 33 passing tests with 100% covered statements, branches, functions, and lines for the in-process coverage scope. `src/cli.ts` is intentionally measured by subprocess E2E, as documented in the testing policy. The hosted matrix repeats the complete gate on Node 22 and 24 across all three supported operating systems.

## Commands run

```sh
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm verify:quality-gates
corepack pnpm test:coverage
corepack pnpm check:package
corepack pnpm test:conformance
corepack pnpm dlx node@24 node_modules/vitest/vitest.mjs run tests/integration tests/e2e
```

## Explicit remaining verification boundaries

- BGA-005 is verified: [CI run 31098519365](https://github.com/Brandon-Born/bga-mcp/actions/runs/31098519365) proves the clean matrix and the [controlled failure proof](CI_FAILURE_PROOF.md) proves every required check blocks completion.
- The pinned official conformance CLI accepts only URL targets and currently lists server scenarios only through `2025-11-25`. It cannot test the advertised stdio transport or `2026-07-28`; packaged E2E covers those boundaries, but BGA-011 remains `implemented` under the stricter backlog definition. See [CONFORMANCE.md](../CONFORMANCE.md).
- No Studio adapter or Studio-backed public function exists in this milestone, so live Studio E2E is not applicable.
