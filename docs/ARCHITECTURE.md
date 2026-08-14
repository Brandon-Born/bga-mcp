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

Layout detection and readers for states, actions, notifications, and database use are implemented in `src/project/`. They are textual and never execute project code: `src/project/php.ts` masks string and comment content before reading structure, so a description containing brackets cannot move a reader off the end of a call, and identifiers written as constants are resolved from the source that declares them rather than by running anything. The 2026-08-08 review showed that the modern/hybrid fixtures omitted documented constructs and some readers derived certain findings from incomplete or merely SQL-looking syntax. BGA-124 corrected the state readers and rules — a rule that depends on the whole machine now stays silent when part of it could not be read — and BGA-125 through BGA-128 own the rest, so those layout claims remain `unknown`.

### Documentation retrieval

Performs guarded, explicit, one-page/search retrieval from an allowlisted official wiki and community source, with a bounded in-memory dated cache. BGA-201 rejected crawling and shipping a curated index because the reviewed sources do not permit bulk collection or full-text redistribution. Every result carries a canonical source URL, retrieval/snapshot date, provenance, and untrusted-content label.

The index must distinguish official documentation from community examples. A code example is evidence of an implementation pattern, not automatically proof of a supported public API.

### Studio adapter

Optional component for authenticated Studio access. Future synchronization should use documented SFTP behavior and SSH keys. A separate reviewed boundary permits one experimental own-account log reader over an undocumented authenticated page; BGA-319 through BGA-328 record why that reader remains unreleased and off by default.

### Policy boundary

Applies configured project roots, remote project allowlists, operation deadlines, output budgets/redaction, and mutation safeguards before an adapter runs. These mechanisms are implemented but not release-verified: BGA-323 through BGA-330 own reproduced address, request-content, error-budget, cancellation, successful-redaction, credential-file, import-gate, and filesystem-bounding gaps.

This component is implemented in `src/policy.ts`, and the current production source has no privileged-effect import outside it. `GATE-POLICY-COMPLETE-EFFECT-BOUNDARY` parses every production module and refuses any spelling that can name a privileged builtin — bare, `node:`, subpath, re-export, `import()`, `require()` — along with the globals that reach the network without importing anything, on an allowlist that fails closed. ESLint states the same rule for immediate feedback, and the two are compared. Traversal spends one budget on every entry it encounters and reports a listing it cut short as truncated; directory identity and containment are checked around `opendir` before entries are consumed. File reads compare pre-open pathname identity with descriptor identity, re-check containment and identity after open, read the descriptor's exact measured size plus an EOF probe, and re-stat before returning. Direct-policy integration barriers force an intermediate-directory replacement, a configured-directory replacement, and post-stat growth; each receives the stable refusal without marker content. BGA-330 still records the installed-artifact barrier as missing, and portable Node pathname checks are not equivalent to descriptor-relative `openat`, so repeated adversarial swaps remain an explicit residual risk. Defaults are local, read-only, and network-off.

Failures leave the process through the versioned public error contract in `src/errors.ts`. Known errors keep a stable code and redacted details; anything unexpected collapses to `internal.unexpected` with no stack trace. `src/redaction.ts` provides credential, session, connection-string, player-data, and path redaction. `src/publish.ts` applies it to every successful result: parse against the published schema, redact, parse again, render the summary from the redacted structure, redact that, and measure the budget last. Failures descend the same boundary's shrinking ladder and the transport applies the budget once more on the way out, so a payload the protocol library wrote is bounded too. A Studio session is registered for value-based redaction by whichever provider resolved it, in the same step that returns it.

### Verification harness

Starts the packaged server exactly as a user would, connects through a real MCP client, discovers its advertised capabilities, and exercises every public tool and resource. The harness owns isolated project fixtures and records machine-readable evidence for each capability.

Adapters for external systems require an additional live harness. A Studio-backed capability is not verified by a mocked SFTP client or a recorded HTTP response; it must pass against a dedicated BGA Studio test project before release.

## Proposed MCP surface

### Resources

- `bga://project/summary` (implemented; verification reopened)
- `bga://project/states` (implemented; verification reopened)
- `bga://project/diagnostics` (implemented; verification reopened)
- `bga://docs/{topic}` (implemented; live relevance failing)
- `bga://framework/version` (implemented; reads the rendered section, awaiting CI evidence)

### Read-only tools

- `inspect_project` (implemented; verification reopened)
- `validate_state_machine` (implemented; legacy-only capability claim pending full matrix)
- `validate_action_contracts` (implemented; legacy-only capability claim pending full matrix)
- `validate_notifications` (implemented; legacy-only capability claim pending full matrix)
- `audit_database_usage` (implemented; legacy-only capability claim pending full matrix)
- `validate_project` (implemented; aggregates the four validators)
- `run_pre_release_audit` (implemented; unsupported propagation bug open)
- `search_bga_docs` (implemented; live evaluation failing)
- `read_studio_logs` (experimental; live correctness/privacy blockers open)

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

[THREAT_MODEL.md](THREAT_MODEL.md) records the assets, actors, trust boundaries, abuse cases, mitigations, and residual risks, and it is machine-checked. The documentation and Studio boundaries are reviewed but remain gated by their recorded preconditions; review alone does not verify a capability. BGA-018 owns exact machine/human field agreement after the current identifier-only check missed a stale boundary status.

## Credential and data handling

- Prefer SSH keys through the user's SSH agent or a configured key path.
- Never accept credentials as ordinary tool arguments when a safer credential provider is available.
- Never include secrets, session identifiers, or full connection strings in tool output.
- Do not upload files outside an explicitly mapped local and remote project pair.
- Do not publish or index project source code, private logs, or publisher artwork.
- Keep network access off for commands that only inspect local source.

## Compatibility strategy

BGA projects exist along a range between the legacy and modern layouts rather than in one of two templates: the framework migrates metadata, game logic, states, and client logic independently, and keeps reading the older form of each. Detection is therefore capability-based and per component — it resolves a generation for each and derives the whole-project label from them, so a part-migrated project is read rather than refused. The same rule applies inside a component: the state machine's entry point comes from whatever form the project uses to declare it, and identifiers 1 and 99 belong to the framework in every generation. The modern and hybrid fixtures were structural inputs rather than support proof until BGA-124 rebuilt them on the documented constructs; modern and hybrid support stay `unknown` in [COMPATIBILITY.md](COMPATIBILITY.md) until BGA-125 through BGA-128 pass too.

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
