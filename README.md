# bga-mcp

An unofficial, read-only Model Context Protocol server for inspecting Board Game Arena game projects. It reports cross-file defects and uncertainty to a coding agent; it never writes to the inspected project or executes its game code.

The public `bga-mcp` command uses the frozen local release profile on stdio, protocol `2025-11-25`. The source development entry point exposes additional, separately reviewed documentation and experimental Studio reads. See the exact inventory below before configuring either profile.

## Install and use

Signed public packages are available through [GitHub releases](https://github.com/Brandon-Born/bga-mcp/releases). Use the selected release's attached signed-download companion and successful public-consumer receipt to authenticate its original package, then follow the packaged [installation guide](docs/INSTALL.md) for client configuration, updating, removal and troubleshooting. No registry package has been published. The installation guide retains signed `v1.0.0-rc.3` as a verified, versioned evaluation example; [its original-byte signing receipt](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/verification/release-signing-v1.0.0-rc.3.json) identifies that package's digest and finite artifact retention.

The guide example does not identify the latest candidate or approve a release. Use the independently verified candidate-specific receipt and matching trusted verifier for another version. Packing a checkout produces a new artifact and requires its own signature; it cannot replace or inherit the signature of an existing candidate. Candidate signing and package publication remain separate steps.

Configure an absolute, authorized project root and start with `inspect_project`. Review explicit unsupported findings before drawing conclusions. `validate_project` combines selected validators; `run_pre_release_audit` distinguishes passed, failed, unsupported and manual-required checks. A clean result cannot establish game correctness outside the syntax and checks the server reads.

You can inspect a complete repository. Inspection and `bga://project/summary` partition its bounded file inventory into PHP, client and configuration candidates, editor exclusions, unknown source scope and other files. The PHP/client readers use the same candidate groups. These are source-location decisions, not proof of execution; unknown outside source and files omitted by read limits remain explicit coverage blockers. Structured signals retain all bounded paths, while text previews show a limited selection with its remaining count.

Pre-release checks explain the actual coverage blockers and identify the owning validator. An invariant formatted INSERT target can be read while its runtime-built VALUES, possible suffix and escaping remain unknown. Three database facts can be established independently: audit availability after a schema read and a readable query reference, and duplicate-table/duplicate-column absence for a fully read schema containing only blank lines and ordinary `--` comments. Those passes state their limited evidence; all query-dependent checks retain incomplete coverage. The server does not execute PHP or SQL.

The readers cover the documented legacy, modern and independently migrated file forms, with bounded syntax support. [Compatibility evidence](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/COMPATIBILITY.md) records the specific claims; the official [file reference](https://en.doc.boardgamearena.com/Studio_file_reference) and [migration guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) remain the framework authority.

## Capability inventory and permissions

<!-- inventory:start -->

Generated in a repository checkout by `corepack pnpm docs:inventory` from the capability manifest, release selection, topic table and policy defaults; installed MCP discovery checks both profiles.

Network access is off by default. The public command excludes network surfaces and refuses network/Studio flags. In the development profile, `--allow-network` enables documentation search, topic reads and framework-version reads; Studio reads additionally require `--experimental-studio-logs`, an authorized account and session. The experimental Studio reader cannot read the browser-rendered log panel. No profile provides synchronization, uploads or other mutations.

Resource templates are URI patterns returned by `resources/templates/list`; concrete resources are individually listed URIs returned by `resources/list`. Counts below include each separately, including the fixed documentation-topic expansions.

**Public command (bga-mcp)**

Tools: 7; resource templates: 0; concrete resources: 3; prompts: 0. Discovery entries by manifest stability: verified 10, implemented 0, experimental 0. Network-backed entries: 0 (permission off by default).

| Kind      | Discovery name / URI        | Manifest stability | Trust boundary      | Network permission |
| --------- | --------------------------- | ------------------ | ------------------- | ------------------ |
| resources | `bga://project/diagnostics` | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/states`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/summary`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `audit_database_usage`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `inspect_project`           | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `run_pre_release_audit`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_action_contracts` | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_notifications`    | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_project`          | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_state_machine`    | verified           | TB-LOCAL-FILESYSTEM | local              |

**Development entry point (dist/cli.js)**

Tools: 10; resource templates: 1; concrete resources: 11; prompts: 0. Discovery entries by manifest stability: verified 10, implemented 11, experimental 1. Network-backed entries: 11 (permission off by default).

| Kind      | Discovery name / URI        | Manifest stability | Trust boundary      | Network permission |
| --------- | --------------------------- | ------------------ | ------------------- | ------------------ |
| resources | `bga://docs/client`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/cookbook`       | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/file-reference` | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/game-logic`     | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/migration`      | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/states`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/studio`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://framework/version`   | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://project/diagnostics` | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/states`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/summary`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| templates | `bga://docs/{topic}`        | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| tools     | `audit_database_usage`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `check_setup`               | implemented        | TB-LOCAL-FILESYSTEM | local              |
| tools     | `inspect_project`           | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `read_studio_logs`          | experimental       | TB-STUDIO-READ      | explicit opt-in    |
| tools     | `run_pre_release_audit`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `search_bga_docs`           | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| tools     | `validate_action_contracts` | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_notifications`    | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_project`          | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_state_machine`    | verified           | TB-LOCAL-FILESYSTEM | local              |

Manifest stability describes the recorded scenario coverage, not general game correctness. Implemented and experimental entries are excluded from the public release. The development protocol adapter remains implemented; it is not a verified public transport.
<!-- inventory:end -->

The server reads only authorized roots. With exactly one configured root, tools may omit `projectRoot`; with multiple roots, select one explicitly. File/read budgets, timeouts and result-size limits apply. It creates no persistent project state or telemetry. Package acquisition and dependency installation may use the network independently of MCP calls. Server stdout is reserved for MCP frames; result and diagnostic output is screened and redacted.

## What the real-project evaluation established

BGA-424 evaluated diagnosis, feature work and review on Dino Racer with native `codex-cli 0.159.2`. Signed rc.2 exposed a false handler and comment-only PHP method; BGA-431 corrected those readers. Signed rc.3 (SHA-256 `598cad2186c60e8110d8906ffb91739893c357ebed69cad0529c8a5a367907a3`) then passed the explicit repeat of all 23 frozen task calls on the same five source snapshots. Independent JavaScript declaration and PHP lexical oracles adjudicated the corrected inventories. See the [bounded evaluation and task identities](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/verification/AGENT_EVALUATION_CARRY_FORWARD.md) and [sanitized ledger](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/verification/agent-evaluation-v1.0.0-rc.3.json).

This supports bounded cross-file inspection usefulness. The review still had six unsupported SQL checks, one informational unavailable-audit failure and eight manual checks. The MCP did not identify the game-owned reload defect. There was no comparable effort baseline, measured time saving, live Studio gameplay, or general proof of game rules, scoring or conservation. Fixture coverage and client smoke tests do not establish those outcomes.

## Develop and contribute

Use a source checkout for development. Requirements: Node `^22.13.0 || >=24.0.0`, Corepack, Git and pinned pnpm 11.15.1.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm build
node dist/cli.js --help
```

`dist/cli.js` is the development profile; installed users launch the package-manager-created public `bga-mcp` command. Its help points to the packaged guide. Run `corepack pnpm docs:inventory` after inventory changes; `corepack pnpm verify:documentation` rejects drift, and installed E2E compares both profiles with actual MCP discovery.

Read the canonical [agent instructions](AGENTS.md), [contribution rules](CONTRIBUTING.md), [security policy](SECURITY.md) and packaged [version policy](docs/VERSIONING.md). Repository-only references are pinned to the reviewed handoff: [backlog](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/BACKLOG.md), [testing](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/TESTING.md), [threat model](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/THREAT_MODEL.md), [architecture](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/ARCHITECTURE.md), and [roadmap](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/ROADMAP.md). They describe that revision, not future repository changes.

Licensed under [Apache License 2.0](LICENSE). This independent community project is not affiliated with or endorsed by Board Game Arena or its owners.
