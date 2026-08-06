# Architecture

This document records the initial architectural direction for `bga-mcp`. The selected implementation stack is fixed by [ADR 0001](adr/0001-implementation-stack.md); proposed BGA capabilities remain open to evidence discovered during implementation.

## Scope

The server is a BGA-specific integration layer between an MCP client and three kinds of developer context:

1. A local BGA game project.
2. Curated BGA Studio documentation and framework references.
3. An optional authenticated BGA Studio environment.

Generic source editing, Git operations, rulebook interpretation, and image generation are outside the core server. Coding agents already provide those capabilities. `bga-mcp` should expose only the context and operations where BGA-specific semantics add material value.

## Initial deployment model

The MVP will run locally using MCP's standard input/output transport. A developer launches one process from an MCP-compatible editor or agent and explicitly configures the project roots it may inspect.

A remotely hosted MCP transport may be considered later for documentation-only capabilities. Source inspection, credentials, and Studio access should remain local unless a separate threat model justifies otherwise.

## Major components

### MCP interface

Defines tools and resources using stable schemas, validates inputs, and converts internal diagnostics into MCP results. Tool responses should remain useful to both an agent and a human reading a trace.

### Project model

Discovers supported BGA layouts and produces a normalized representation of:

- Metadata and options.
- State definitions and transitions.
- Server-side actions and game methods.
- Client-side action calls and notification handlers.
- Database tables and referenced queries.
- Statistics, templates, styles, modules, and tests.

Validation rules operate on this normalized model instead of relying on isolated regular-expression checks.

Layout detection and the first slice of the model are implemented in `src/project/`. Detection scores independent signals rather than matching one template, and the readers in `src/project/parse.ts` are textual: they never execute project code, and every construct they cannot interpret becomes an explicit unsupported finding. Action contracts, notifications, and database usage are absent from the model until their own parsers land.

### Documentation index

Retrieves or builds a curated index of relevant BGA Studio documentation. Every result should include its canonical source URL, retrieval or snapshot date, and relevant framework version when known.

The index must distinguish official documentation from community examples. A code example is evidence of an implementation pattern, not automatically proof of a supported public API.

### Studio adapter

Optional component for authenticated Studio access. The first adapter should use documented SFTP behavior and SSH keys. Browser-session or undocumented endpoint automation requires separate review because it is more fragile and may create policy or compatibility risk.

### Policy boundary

Applies configured project roots, remote project allowlists, operation timeouts, output redaction, and mutation safeguards before an adapter runs.

This component is implemented in `src/policy.ts` and is the only module permitted to import filesystem, network, or subprocess APIs; ESLint and the `GATE-POLICY-IMPORT-BOUNDARY` scenario enforce that. It resolves roots through the filesystem at startup, rejects traversal lexically, re-checks resolved locations after symlinks, and fails closed on unconfigured or invalid settings. Defaults are local, read-only, and network-off.

Failures leave the process through the versioned public error contract in `src/errors.ts`. Known errors keep a stable code and redacted details; anything unexpected collapses to `internal.unexpected` with no stack trace. `src/redaction.ts` removes credentials, sessions, connection strings, player data, and out-of-root paths from results, errors, and log lines.

### Verification harness

Starts the packaged server exactly as a user would, connects through a real MCP client, discovers its advertised capabilities, and exercises every public tool and resource. The harness owns isolated project fixtures and records machine-readable evidence for each capability.

Adapters for external systems require an additional live harness. A Studio-backed capability is not verified by a mocked SFTP client or a recorded HTTP response; it must pass against a dedicated BGA Studio test project before release.

## Proposed MCP surface

### Resources

- `bga://project/summary`
- `bga://project/states`
- `bga://project/diagnostics`
- `bga://docs/{topic}`
- `bga://framework/version`

### Read-only tools

- `inspect_project` (implemented and verified)
- `validate_project`
- `validate_state_machine`
- `validate_action_contracts`
- `validate_notifications`
- `audit_database_usage`
- `run_pre_release_audit`
- `search_bga_docs`
- `read_studio_logs`

### Mutating tools

- `sync_to_studio`

Mutating tools must support a dry-run mode. The server should reject a mutation unless the destination project is allowlisted and the client clearly requested execution rather than preview.

## Diagnostic contract

Validation tools return the versioned shared contract documented in [DIAGNOSTICS.md](DIAGNOSTICS.md). A representative certain finding is:

```json
{
  "kind": "issue",
  "code": "state.transition.target-exists",
  "severity": "error",
  "certainty": "certain",
  "message": "Transition 'next' targets undefined state 42.",
  "locations": [{ "uri": "file:///project/states.inc.php" }],
  "evidence": [{ "kind": "relationship", "message": "State 42 is not declared." }],
  "suggestions": [{ "message": "Define state 42 or change the transition target." }]
}
```

Facts and suggestions are structurally distinct. Heuristics expose reduced certainty, and unsupported syntax prevents a false clean result.

## Security model

[THREAT_MODEL.md](THREAT_MODEL.md) records the assets, actors, trust boundaries, abuse cases, mitigations, and residual risks, and it is machine-checked. The documentation and Studio boundaries are unreviewed, which blocks any networked or mutating capability from being advertised.

## Credential and data handling

- Prefer SSH keys through the user's SSH agent or a configured key path.
- Never accept credentials as ordinary tool arguments when a safer credential provider is available.
- Never include secrets, session identifiers, or full connection strings in tool output.
- Do not upload files outside an explicitly mapped local and remote project pair.
- Do not publish or index project source code, private logs, or publisher artwork.
- Keep network access off for commands that only inspect local source.

## Compatibility strategy

BGA projects exist in legacy and modern layouts. Detection should be capability-based rather than assuming one template. Original minimal modern and legacy fixture projects now establish the structural baseline. The supported-layout, runtime, platform, protocol, transport, and client claims are published in [COMPATIBILITY.md](COMPATIBILITY.md) and enforced against the running server by CI.

Unknown syntax should produce an explicit unsupported or uncertain result, not a clean bill of health.

## Verification boundary

The public MCP interface is the end-to-end test boundary. Tests must launch the built package, negotiate the supported MCP protocol, discover capabilities, invoke them through the client, and verify observable results and side effects.

Every advertised capability must have a test-manifest entry covering at least:

- A successful request.
- Invalid or incomplete input.
- A relevant boundary failure, such as a missing file or unavailable connection.
- Redaction of sensitive values where the capability can encounter them.
- Exact side effects and cleanup for any mutating operation.

Unit and integration tests remain required for fast, precise fault isolation, but mocks cannot be the only evidence used to mark a public capability verified. The complete policy is in [TESTING.md](TESTING.md).
