# Architecture

This document records the initial architectural direction for `bga-mcp`. It is intentionally concrete enough to guide an MVP while remaining open to changes discovered during implementation.

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

### Documentation index

Retrieves or builds a curated index of relevant BGA Studio documentation. Every result should include its canonical source URL, retrieval or snapshot date, and relevant framework version when known.

The index must distinguish official documentation from community examples. A code example is evidence of an implementation pattern, not automatically proof of a supported public API.

### Studio adapter

Optional component for authenticated Studio access. The first adapter should use documented SFTP behavior and SSH keys. Browser-session or undocumented endpoint automation requires separate review because it is more fragile and may create policy or compatibility risk.

### Policy boundary

Applies configured project roots, remote project allowlists, operation timeouts, output redaction, and mutation safeguards before an adapter runs.

## Proposed MCP surface

### Resources

- `bga://project/summary`
- `bga://project/states`
- `bga://project/diagnostics`
- `bga://docs/{topic}`
- `bga://framework/version`

### Read-only tools

- `inspect_project`
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

Validation tools should return a shared finding shape:

```json
{
  "ruleId": "state.transition.target-exists",
  "severity": "error",
  "message": "Transition 'next' targets undefined state 42.",
  "file": "states.inc.php",
  "line": 37,
  "evidence": {
    "sourceState": 10,
    "transition": "next",
    "targetState": 42
  },
  "suggestion": "Define state 42 or change the transition target."
}
```

Findings must separate facts from suggestions. If a rule is heuristic, the result should say so.

## Credential and data handling

- Prefer SSH keys through the user's SSH agent or a configured key path.
- Never accept credentials as ordinary tool arguments when a safer credential provider is available.
- Never include secrets, session identifiers, or full connection strings in tool output.
- Do not upload files outside an explicitly mapped local and remote project pair.
- Do not publish or index project source code, private logs, or publisher artwork.
- Keep network access off for commands that only inspect local source.

## Compatibility strategy

BGA projects exist in legacy and modern layouts. Detection should be capability-based rather than assuming one template. A supported-layout matrix and fixture projects will be added before the first release.

Unknown syntax should produce an explicit unsupported or uncertain result, not a clean bill of health.

