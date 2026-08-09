# bga-mcp

An unofficial Model Context Protocol (MCP) server for Board Game Arena Studio development.

> [!IMPORTANT]
> This project is in early implementation. The installable stdio server currently advertises 10 tools and 11 concrete resources. A 2026-08-08 installed-package adversarial review reopened every formerly verified public capability-manifest entry and the affected backlog claims; unrelated foundation decisions remain verified. The Studio log reader remains experimental. See the [review record](docs/verification/ADVERSARIAL_REVIEW_2026-08-08.md).

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

Available now, local and read-only, with verification reopened:

- `inspect_project` — detects the project layout, reports metadata, components, and the state machine where it can be read, and returns explicit findings for anything missing, uncertain, or unsupported.
  Layout detection recognizes legacy, modern, and part-migrated projects. The validators have readers for both generations, but the current review found false or unsupported results for documented modern state, action, notification, and query forms. The state readers and rules were corrected under BGA-124, the action tracing under BGA-125, and the notification tracing under BGA-126; treat modern and hybrid validation as unverified until BGA-127 and BGA-128 pass as well.

- `validate_state_machine` — checks the entry state, duplicate identifiers and names, unknown state types, transition targets, unreachable states, dead ends, and whether the methods a state names exist in readable PHP source. Structural findings are facts; cross-file handler findings are heuristics that carry their known limitations.
- `validate_action_contracts` — traces each player action from the client call, to the entry point in the action class, to the game method, and reports actions no state allows, missing entry points and methods, and arguments the two sides disagree about.
- `validate_notifications` — compares the notifications the server sends with the handlers the client declares, including payload keys. A notification nobody handles fails silently at runtime; this finds it before a player does.
- `audit_database_usage` — compares `dbmodel.sql` with the queries the PHP sources run, reporting undeclared tables and columns, unused columns, and queries that interpolate a value instead of escaping it.
- `validate_project` — runs every validator, or the groups you select, and combines the results. A validator that fails is reported as failed and makes the run incomplete rather than leaving it looking clean.

It also serves three read-only resources describing the single configured project: `bga://project/summary`, `bga://project/states`, and `bga://project/diagnostics`.

- `run_pre_release_audit` — runs the catalogued pre-release checks and reports passed, failed, unsupported, and manual-required separately. A check whose validator could not read part of the project stays unsupported: it is never counted as a pass, and never as a failure.

Available behind explicit network permission, implemented but not verified:

- `search_bga_docs`, seven fixed documentation-topic resources, and `bga://framework/version`. The maintained live evaluation currently fails, and the version resource has a confirmed extraction bug; see BGA-209 through BGA-211.

Also available:

- `check_setup` — reports local, documentation, and experimental Studio setup state. The 2026 protocol-era roots/input flow remains BGA-318.
- `read_studio_logs` — experimental, off by default, and not live-verified. A dedicated private project now exists, but BGA-319 through BGA-323 and BGA-326 through BGA-328 block a safe successful read: output privacy, project identifiers, file sessions, default source ACLs, address normalization, cancellation, successful-result redaction, and session-file handling remain open.

Later releases may add authenticated Studio operations:

- `preview_studio_sync`
- `sync_to_studio`
- Test-table and saved-state workflows where they can be implemented reliably and responsibly.

Current discovery names are not yet a stable release API. Future capability names are proposals.

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

Ten tools and eleven concrete resources are discoverable. The package lifecycle, legacy roots path, refusal behavior, read-only policy, and clean shutdown have real installed-client evidence. No public capability is currently release-verified: Phase 0 evidence claims and Phase 1 correctness/coverage were reopened after common documented BGA constructs produced false findings. See the [2026-08-08 adversarial review](docs/verification/ADVERSARIAL_REVIEW_2026-08-08.md) and the [implementation backlog](docs/BACKLOG.md).

Underneath it: a strict TypeScript package that builds and packs, a versioned [diagnostic contract](docs/DIAGNOSTICS.md) and public error contract, the [policy boundary](src/policy.ts) every capability routes through, a [threat model](docs/THREAT_MODEL.md) and [compatibility matrix](docs/COMPATIBILITY.md) enforced by CI gates, and a [verification evidence artifact](docs/verification/VERIFICATION_EVIDENCE.md) each run emits and checks.

See the executable [implementation backlog](docs/BACKLOG.md), [testing policy](docs/TESTING.md), [threat model](docs/THREAT_MODEL.md), [compatibility matrix](docs/COMPATIBILITY.md), [conformance coverage](docs/CONFORMANCE.md), [roadmap](docs/ROADMAP.md), and [architecture notes](docs/ARCHITECTURE.md).

## Install it

See the [installation guide](docs/INSTALL.md) for setup, configuration, updating, removal, and troubleshooting. The short version, once built: point your client at `dist/cli.js` and pass an explicit project root. Client-offered roots work on the 2025 protocol era; the 2026 input-required flow remains open in BGA-318.

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

| Option                         | Effect                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--project-root <path>`        | Allow one local project root, as an absolute path. Repeatable. A missing root fails at startup.                                         |
| `--allow-remote-project <id>`  | Allowlist a BGA Studio project for a future mutation. Repeatable.                                                                       |
| `--operation-timeout-ms <n>`   | Deadline for the public response; underlying work may continue until BGA-326 passes.                                                    |
| `--max-output-bytes <n>`       | Successful-result payload budget; failure results bypass it until BGA-325 passes.                                                       |
| `--allow-network`              | Permit network access. Off by default.                                                                                                  |
| `--experimental-studio-logs`   | Enable the experimental Studio log reader. Off by default.                                                                              |
| `--studio-dev-account <name>`  | A Studio dev account you own. Repeatable. The MCP result filter keeps only matching parsed lines; BGA-319 covers other output surfaces. |
| `--studio-session-file <path>` | Read the Studio session from a file instead of `BGA_STUDIO_SESSION`; do not use with a real credential until BGA-321 and BGA-328 pass.  |
| `--allow-mutations`            | Permit explicitly confirmed mutating operations. Off by default.                                                                        |

Every tool reads only from the roots given here. `projectRoot` may be omitted when exactly one root is configured, and then means that root; with none or several configured, the call is refused with a stable error code rather than guessing which project was meant.

The server reserves stdout for MCP frames. Shared protocol/shutdown logging uses redaction, but CLI/setup and successful-result output coverage remains incomplete under BGA-319, BGA-327, and BGA-328.

## Verification commands

- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` enforce source quality.
- `pnpm test:coverage` runs unit, integration, fixture-integrity, harness self-tests, and packed-server E2E with coverage thresholds.
- `pnpm check:package` builds, packs, and checks package metadata.
- `pnpm test:conformance` proves the official suite rejects a seeded violation and exercises the measured 2025 stdio scenario set. The suite does not currently provide applicable 2026 stdio evidence.
- `pnpm evidence` and `pnpm verify:evidence` write and check `.artifacts/verification-evidence.json`, which records what the run actually proved: see [docs/TESTING.md](docs/TESTING.md#verification-evidence).
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
