# Diagnostic contract

`bga-mcp` diagnostic producers share one versioned wire contract so agents can interpret validation results without capability-specific parsing. Version 1 is defined at runtime in `src/diagnostics.ts` and distributed as `config/diagnostics.schema.json`.

## Result shape

Every result contains:

- `schemaVersion`: currently `1`; consumers must reject versions they do not support.
- `status`: `passed` for no findings, `unsupported` when every finding reports unsupported syntax, or `findings` otherwise.
- `summary`: exact error, warning, information, and unsupported counts.
- `findings`: ordered structured findings.

Runtime parsing verifies that `status` and every summary count agree with the findings. The checked-in JSON Schema defines the structural wire format and is generated from the same Zod schemas; a drift test requires exact equality.

## Finding kinds

### Certain issue

`kind: "issue"` reports a supported rule's factual result. It has a stable `code`, an `error`, `warning`, or `information` severity, and `certainty: "certain"`. Its evidence cannot be heuristic.

### Heuristic

`kind: "heuristic"` reports a possible result that could not be proven statically. It must use `certainty: "likely"` or `"possible"` and include at least one `heuristic` evidence item. A heuristic must never be presented as a certain fact.

### Unsupported syntax

`kind: "unsupported-syntax"` means the analyzer recognized a boundary it cannot interpret safely. It identifies the language and unsupported construct, remains separate from errors and warnings, and prevents a clean result from being reported.

## Facts, evidence, and suggestions

The finding `message`, `locations`, and `evidence` describe what was observed. Remediation advice exists only in the `suggestions` array. Strict schemas reject undeclared fields, so a suggestion cannot masquerade as an observed fact.

Locations use a URI plus optional one-based start and end positions. An end position cannot precede its start. Evidence records its basis as `source`, `relationship`, `runtime`, or `heuristic` and may point to its own location.

## Public package API

The package exports the individual schemas and inferred TypeScript types, plus:

- `parseDiagnosticResult(value)` for structural and semantic runtime validation.
- `getDiagnosticResultJsonSchema()` for the generated version 1 JSON Schema.
- `DIAGNOSTIC_CONTRACT_VERSION` and `DIAGNOSTIC_SCHEMA_ID` for negotiation and identity.

Changing an existing field's meaning or removing or narrowing an accepted value requires a new contract version. Compatible additive evolution must still update the generated schema, contract tests, MCP serialization proof, and packaged-artifact E2E evidence together.

## Verification

Unit tests cover valid round trips, schema drift, version rejection, strict fact/suggestion separation, certainty rules, aggregate consistency, and invalid ranges. A real stdio MCP fixture serializes success, error, warning, heuristic, and unsupported results. Packaged E2E imports both public functions from the installed tarball and verifies that the distributed schema matches the runtime contract. [CI run 31101182339](https://github.com/Brandon-Born/bga-mcp/actions/runs/31101182339) passes this complete gate on Ubuntu, macOS, and Windows with Node 22 and 24.
