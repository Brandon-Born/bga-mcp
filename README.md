# bga-mcp

An unofficial Model Context Protocol (MCP) server for Board Game Arena Studio development.

> [!IMPORTANT]
> This project is in early implementation. The installable stdio server advertises one verified capability, `inspect_project`. The remaining tools and resources below are still proposals.

`bga-mcp` aims to give MCP-compatible coding agents structured, safe access to the information and workflows needed to build and maintain games for Board Game Arena (BGA). The goal is not to generate an entire game autonomously. The goal is to make an experienced developer faster and help a new BGA developer avoid framework-specific mistakes.

## Why this exists

BGA development spans local PHP, JavaScript or TypeScript, SQL, BGA's state machine, SFTP synchronization, browser-based testing, and Studio logs. General-purpose coding agents can edit the files, but they do not automatically understand how those pieces relate.

This server will focus on the gaps that benefit from structured BGA knowledge and purpose-built operations:

- Inspecting a project and explaining its BGA-specific structure.
- Validating state definitions, transitions, actions, notifications, and database usage across files.
- Searching curated, version-aware BGA development documentation.
- Running repeatable project and pre-release checks.
- Previewing and synchronizing changes to BGA Studio safely.
- Reading and filtering Studio diagnostics without pasting logs into an agent conversation.

## Capabilities

Available now, local and read-only:

- `inspect_project` — detects the project layout, reports metadata, components, and the state machine where it can be read, and returns explicit findings for anything missing, uncertain, or unsupported.
- `validate_state_machine` — checks the entry state, duplicate identifiers and names, unknown state types, transition targets, unreachable states, dead ends, and whether the methods a state names exist in readable PHP source. Structural findings are facts; cross-file handler findings are heuristics that carry their known limitations.
- `validate_action_contracts` — traces each player action from the client call, to the entry point in the action class, to the game method, and reports actions no state allows, missing entry points and methods, and arguments the two sides disagree about.
- `validate_notifications` — compares the notifications the server sends with the handlers the client declares, including payload keys. A notification nobody handles fails silently at runtime; this finds it before a player does.
- `audit_database_usage` — compares `dbmodel.sql` with the queries the PHP sources run, reporting undeclared tables and columns, unused columns, and queries that interpolate a value instead of escaping it.
- `validate_project` — runs every validator, or the groups you select, and combines the results. A validator that fails is reported as failed and makes the run incomplete rather than leaving it looking clean.

Planned for the first useful release:

- `run_pre_release_audit`
- `search_bga_docs`

Later releases may add authenticated Studio operations:

- `preview_studio_sync`
- `sync_to_studio`
- `read_studio_logs`
- Test-table and saved-state workflows where they can be implemented reliably and responsibly.

The names above are proposals, not a stable API.

## Design principles

- **Verified, not assumed:** no tool or resource is complete until its public behavior passes end-to-end tests through a real MCP client.
- **Local first:** source code and credentials stay on the developer's machine by default.
- **Read-only by default:** inspection and validation should not change a project or Studio state.
- **Preview before mutation:** uploads and other state-changing operations expose an exact dry run first.
- **Structured results:** tools return actionable findings with locations, evidence, and severity.
- **Agent neutral:** any client with suitable MCP support should be able to use the server.
- **Current, attributable guidance:** documentation results retain their source and update metadata.
- **Narrow permissions:** project roots and remote targets are explicitly configured and allowlisted.

## Project status

Six BGA-facing capabilities are live and verified. `inspect_project` describes a project; `validate_state_machine` and `validate_action_contracts` find real cross-file defects in it — a transition to a state that does not exist, an unreachable state, an action the client sends that no state allows, a notification nobody handles, a query against a table the schema never declares. All six run against the packed and installed artifact through a real MCP client and prove the project directory is unchanged after every call. See the [first capability](docs/verification/FIRST_CAPABILITY.md), [state-machine validation](docs/verification/STATE_MACHINE_VALIDATION.md), [action contract](docs/verification/ACTION_CONTRACTS.md), [notification contract](docs/verification/NOTIFICATIONS.md), [database audit](docs/verification/DATABASE_AUDIT.md), and [aggregate validation](docs/verification/AGGREGATE_VALIDATION.md) records.

Underneath it: a strict TypeScript package that builds and packs, a versioned [diagnostic contract](docs/DIAGNOSTICS.md) and public error contract, the [policy boundary](src/policy.ts) every capability routes through, and a [threat model](docs/THREAT_MODEL.md) and [compatibility matrix](docs/COMPATIBILITY.md) enforced by CI gates.

See the executable [implementation backlog](docs/BACKLOG.md), [testing policy](docs/TESTING.md), [threat model](docs/THREAT_MODEL.md), [compatibility matrix](docs/COMPATIBILITY.md), [conformance coverage](docs/CONFORMANCE.md), [roadmap](docs/ROADMAP.md), and [architecture notes](docs/ARCHITECTURE.md).

## Develop locally

Requirements: Node.js 22.13 or newer on the Node 22 line, or Node.js 24 LTS or newer; Corepack; and Git.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

Build and inspect the local executable:

```sh
corepack pnpm build
node dist/cli.js --help
node dist/cli.js --version
```

An MCP client can launch a development checkout after it has been built:

```json
{
  "command": "node",
  "args": [
    "/absolute/path/to/bga-mcp/dist/cli.js",
    "--project-root",
    "/absolute/path/to/a/bga-project"
  ]
}
```

Configuration is the policy boundary. Defaults are local, read-only, and network-off, and every relaxation is an explicit flag:

| Option                        | Effect                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| `--project-root <path>`       | Allow one local project root. Repeatable. A missing root fails at startup. |
| `--allow-remote-project <id>` | Allowlist a BGA Studio project for a future mutation. Repeatable.          |
| `--operation-timeout-ms <n>`  | Deadline for a single operation.                                           |
| `--max-output-bytes <n>`      | Maximum bytes one result may return.                                       |
| `--allow-network`             | Permit network access. Off by default.                                     |
| `--allow-mutations`           | Permit explicitly confirmed mutating operations. Off by default.           |

`inspect_project` reads only from the roots given here. The server writes only MCP frames to stdout, and every stderr line is redacted before it is written.

## Verification commands

- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` enforce source quality.
- `pnpm test:coverage` runs unit, integration, fixture-integrity, harness self-tests, and packed-server E2E with coverage thresholds.
- `pnpm check:package` builds, packs, and checks package metadata.
- `pnpm test:conformance` proves the official suite rejects a seeded violation and accepts the candidate for its supported scenario.
- `pnpm verify:threat-model`, `pnpm verify:compatibility`, and `pnpm verify:scenarios` prove the threat model, the compatibility matrix, and every claimed scenario stay consistent with the code and the tests. Each seeds its own defect first and fails on it.
- `pnpm verify:safety-gates` proves the secret scanner detects a seeded credential without printing it, then scans the repository and every retained CI artifact.
- `pnpm check` is the complete local gate.

## Contributing

Early feedback from active BGA developers is particularly valuable. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

Security-sensitive reports should follow [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE).

## Unofficial project

`bga-mcp` is an independent, unofficial community project. It is not affiliated with, endorsed by, or operated by Board Game Arena or its owners. Board Game Arena, BGA, and related names and marks belong to their respective owners.
