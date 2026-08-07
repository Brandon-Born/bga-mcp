# Security Policy

`bga-mcp` is intended to inspect local source code and may eventually connect to authenticated BGA Studio environments. Treat security and credential handling as core product behavior.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose credentials, private project source, publisher assets, Studio sessions, or remote modification capabilities.

Until a private reporting channel is published, contact the repository owner through the private contact options on the owner's GitHub profile and include:

- The affected version or commit.
- The configuration and MCP client involved.
- Reproduction steps or a minimal proof of concept.
- The potential impact.
- Any suggested mitigation.

Do not include real credentials, session cookies, private game code, or copyrighted artwork in a report.

## Security expectations

The project is designed around these requirements:

- Local inspection is confined to explicitly configured project roots.
- Read-only operations are the default.
- Remote mutations require an allowlisted destination and explicit execution.
- Synchronization presents a dry-run diff before upload.
- Credentials are obtained from dedicated providers such as SSH agents, not ordinary prompts or tool results.
- Logs and errors are redacted before being returned to an MCP client.
- Telemetry is off unless it is introduced later as an explicit opt-in feature.

These are design goals while the project is pre-release, not a claim that unreleased functionality has completed a security audit.

## Threat model

[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) records the assets, actors, trust boundaries, abuse cases, mitigations, and residual risks behind those requirements, together with the operator responsibilities that the server cannot enforce on its own. Its machine-readable form is checked in CI: a mitigation without evidence, a manual control without an owner, or a capability advertised across an unreviewed boundary fails the build.

The BGA Studio boundary is recorded as unreviewed, so no Studio capability may be advertised.

The documentation-retrieval boundary was reviewed on 2026-08-07. It is reviewed, not open: the review records the mitigations that must exist before any capability may retrieve documentation, and the same gate refuses to advertise a capability whose boundary preconditions are still outstanding.
