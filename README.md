# bga-mcp

An unofficial Model Context Protocol (MCP) server for Board Game Arena Studio development.

> [!IMPORTANT]
> This project is in early implementation. The installable stdio server currently advertises 10 tools and 11 concrete resources. **Ten of them are verified**: seven local tools and the three project resources, on protocol `2025-11-25` over stdio. A [2026-08-08 installed-package adversarial review](docs/verification/ADVERSARIAL_REVIEW_2026-08-08.md) had reopened every one of them; the readers it faulted were corrected against the official documentation, every acceptance case is proven through the installed server, results are minimized and redacted on the way out, and every payload is bounded. `check_setup` and the documentation capabilities remain `implemented`, and the Studio log reader remains `experimental` and off by default.

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

Available now, local and read-only, implemented on protocol `2025-11-25`:

- `inspect_project` — detects the project layout, reports metadata, components, and the state machine where it can be read, and returns explicit findings for anything missing, uncertain, or unsupported.
  Layout detection recognizes legacy, modern, and part-migrated projects. The validators have readers for both generations, but the current review found false or unsupported results for documented modern state, action, notification, and query forms. Every reader was corrected against the official documentation under BGA-124 through BGA-127, and BGA-128 proved each affected acceptance case through the installed server, so the modern and part-migrated layouts are inside the compatibility contract again. Every claim here is backed by a CI run of a commit in this history, which the evidence gate checks rather than assumes.

- `validate_state_machine` — checks the entry state, duplicate identifiers and names, unknown state types, transition targets, unreachable states, dead ends, and whether the methods a state names exist in readable PHP source. Structural findings are facts; cross-file handler findings are heuristics that carry their known limitations.
- `validate_action_contracts` — traces each player action from the client call, to the entry point in the action class, to the game method, and reports actions no state allows, missing entry points and methods, and arguments the two sides disagree about.
- `validate_notifications` — compares the notifications the server sends with the handlers the client declares, including payload keys. A notification nobody handles fails silently at runtime; this finds it before a player does.
- `audit_database_usage` — compares `dbmodel.sql` with the queries the PHP sources run, reporting undeclared tables and columns, unused columns, and queries that interpolate a value instead of escaping it.
- `validate_project` — runs every validator, or the groups you select, and combines the results. A validator that fails is reported as failed and makes the run incomplete rather than leaving it looking clean.

It also serves three read-only resources describing the single configured project: `bga://project/summary`, `bga://project/states`, and `bga://project/diagnostics`.

- `run_pre_release_audit` — runs the catalogued pre-release checks and reports passed, failed, unsupported, and manual-required separately. A check whose validator could not read part of the project stays unsupported: it is never counted as a pass, and never as a failure.

Available behind explicit network permission, implemented but not verified:

- `search_bga_docs`, seven fixed documentation-topic resources, and `bga://framework/version`. A search that could not reach a source now fails as a failed lookup instead of reporting that nothing matched, and it reports what it searched, what it attempted, and what failed. The version resource reads the Studio page's `Software Versions` section, returns every value with the line it came from, and states a disagreement rather than picking one. The maintained live retrieval evaluation still fails on excerpt selection; see BGA-211.

Also available:

- `check_setup` — reports local, documentation, and experimental Studio setup state. The 2026 protocol-era roots/input flow remains BGA-318.
- `read_studio_logs` — experimental, off by default, and now **blocked** rather than merely unverified. A live run on 2026-08-10 established that the Studio page it reads serves 99% script and none of the log: the panel a developer sees is rendered in their browser, so fetching HTML cannot read it at any budget. The tool refuses with that limit stated. Its credential handling, identifier, and output privacy are settled (BGA-320, BGA-321, BGA-327, BGA-328); its mechanism is not. See BGA-312. Output privacy (BGA-319) and address normalization (BGA-323) are corrected: nothing belonging to another developer or a player reaches any output surface, proven through the installed package.

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

Ten tools and eleven concrete resources are discoverable. Seven local tools and the three project resources are `verified`: their acceptance cases are mapped to assertions against the installed package, their scenarios passed in the run that produced the retained evidence, and [CI run 31439224886](https://github.com/Brandon-Born/bga-mcp/actions/runs/31439224886) passed the six-job matrix on the commit they were verified against. The control that had held all of them back — successful results were neither minimized nor redacted — landed on 2026-08-10 (BGA-327), and the [threat model](docs/THREAT_MODEL.md) no longer records an open surface that every result crosses. `check_setup` and the documentation capabilities stay `implemented` on their own evidence. The Studio log reader stays experimental and not live-verified; BGA-322 and BGA-326 remain open against it, while BGA-319, BGA-320, BGA-321, BGA-327, and BGA-328 closed its identifier, output-privacy, and credential-handling defects. The corrections to search accounting (BGA-209), framework-version reading (BGA-210), and address normalization (BGA-323) are verified as corrections, but the documentation capabilities that use them are not: their maintained retrieval evaluation still fails on excerpt selection, and BGA-324, BGA-326, and BGA-328 hold recorded defects open against the boundaries they run on. See the [2026-08-08 adversarial review](docs/verification/ADVERSARIAL_REVIEW_2026-08-08.md) and the [implementation backlog](docs/BACKLOG.md).

Underneath it: a strict TypeScript package that builds and packs, a versioned [diagnostic contract](docs/DIAGNOSTICS.md) and public error contract, the [policy boundary](src/policy.ts) every capability routes through, a [threat model](docs/THREAT_MODEL.md), [compatibility matrix](docs/COMPATIBILITY.md), and [version policy](docs/VERSIONING.md) enforced by CI gates, and a [verification evidence artifact](docs/verification/VERIFICATION_EVIDENCE.md) each run emits and checks.

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

| Option                         | Effect                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `--project-root <path>`        | Allow one local project root, as an absolute path. Repeatable. A missing root fails at startup.                    |
| `--allow-remote-project <id>`  | Allowlist a BGA Studio project for a future mutation. Repeatable.                                                  |
| `--operation-timeout-ms <n>`   | Deadline for the public response; underlying work may continue until BGA-326 passes.                               |
| `--max-output-bytes <n>`       | Budget for one result payload, successful or not, in bytes. Minimum 137, the smallest failure the server can send. |
| `--allow-network`              | Permit network access. Off by default.                                                                             |
| `--experimental-studio-logs`   | Enable the experimental Studio log reader. Off by default.                                                         |
| `--studio-dev-account <name>`  | A Studio dev account you own. Repeatable. Only lines about these accounts are returned, on every output surface.   |
| `--studio-session-file <path>` | Read the Studio session from a small regular file only its owner can read. Refused as unsupported on Windows.      |
| `--allow-mutations`            | Permit explicitly confirmed mutating operations. Off by default.                                                   |

Every tool reads only from the roots given here. `projectRoot` may be omitted when exactly one root is configured, and then means that root; with none or several configured, the call is refused with a stable error code rather than guessing which project was meant.

The server reserves stdout for MCP frames. Shared protocol/shutdown logging uses redaction, Studio output is screened on every surface, and successful results are redacted and minimized before they leave the process; session-file handling remains incomplete under BGA-328.

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
