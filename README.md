# bga-mcp

An unofficial Model Context Protocol (MCP) server for Board Game Arena Studio development.

> [!IMPORTANT]
> This project is in the planning and early implementation stage. Tool names and behavior are not stable yet.

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

## Planned capabilities

The first useful release will be local and read-only:

- `inspect_project`
- `validate_project`
- `validate_state_machine`
- `validate_action_contracts`
- `validate_notifications`
- `audit_database_usage`
- `run_pre_release_audit`
- `search_bga_docs`

Later releases may add authenticated Studio operations:

- `preview_studio_sync`
- `sync_to_studio`
- `read_studio_logs`
- Test-table and saved-state workflows where they can be implemented reliably and responsibly.

The names above are proposals, not a stable API.

## Design principles

- **Local first:** source code and credentials stay on the developer's machine by default.
- **Read-only by default:** inspection and validation should not change a project or Studio state.
- **Preview before mutation:** uploads and other state-changing operations expose an exact dry run first.
- **Structured results:** tools return actionable findings with locations, evidence, and severity.
- **Agent neutral:** any client with suitable MCP support should be able to use the server.
- **Current, attributable guidance:** documentation results retain their source and update metadata.
- **Narrow permissions:** project roots and remote targets are explicitly configured and allowlisted.

## Project status

We are defining the public contracts and validating the highest-value developer workflows before committing to an implementation API. See the [roadmap](docs/ROADMAP.md) and [architecture notes](docs/ARCHITECTURE.md).

## Contributing

Early feedback from active BGA developers is particularly valuable. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

Security-sensitive reports should follow [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE).

## Unofficial project

`bga-mcp` is an independent, unofficial community project. It is not affiliated with, endorsed by, or operated by Board Game Arena or its owners. Board Game Arena, BGA, and related names and marks belong to their respective owners.

