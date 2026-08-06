# Contributing

Thank you for helping improve `bga-mcp`.

The project is currently implementing its local read-only foundation. The highest-value contributions are reproducible BGA workflow examples, small representative fixtures, validation-rule proposals, and feedback on tool contracts.

## Before opening an issue

- Search existing issues for the same workflow or failure.
- Remove credentials, player information, private source, table identifiers, and publisher assets from examples.
- State whether the behavior concerns a legacy or modern BGA project layout.
- Link to the relevant BGA documentation when proposing a framework rule.

## Good validation-rule proposals

A proposed rule should include:

1. The developer mistake it detects.
2. Evidence that the pattern is invalid or risky.
3. A minimal failing example.
4. A minimal valid example.
5. Expected severity and any known false positives.

Rules based on convention rather than documented framework behavior must be labeled as heuristics.

## Pull requests

Keep changes focused and explain the user-visible outcome. New behavior must include tests or fixtures that fail without the change and pass with it.

Any change that adds or alters a public tool, resource, prompt, transport, configuration path, or external adapter must also update its end-to-end scenario and capability-manifest entry. A mocked test is useful supporting evidence, but it does not satisfy this requirement.

Changes that add, complete, supersede, or invalidate planned work must update [docs/BACKLOG.md](docs/BACKLOG.md). Backlog IDs are permanent and must not be deleted or reused.

Do not describe a capability as implemented, supported, complete, or verified until its packaged-server end-to-end test passes. Studio-backed behavior additionally requires a passing test against the dedicated Studio test project.

Do not introduce network access, credential handling, remote mutations, telemetry, or new data retention without documenting the threat model and obtaining maintainer agreement first. [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) records which trust boundaries are reviewed; crossing an unreviewed one fails CI.

Privileged access belongs to the policy boundary. Only `src/policy.ts` may import filesystem, network, or subprocess modules, and both ESLint and the `GATE-POLICY-IMPORT-BOUNDARY` scenario enforce that.

A test that provides evidence for a manifest entry, a threat-model mitigation, or a compatibility claim declares the scenario identifier at the start of its title, for example `it('[INT-POLICY-TIMEOUT] aborts a slow operation', …)`. `pnpm verify:scenarios` fails when a required scenario has no test and when a declared scenario belongs to nothing.

## Development commands

Install exactly from the lockfile with `corepack pnpm install --frozen-lockfile`. Run `corepack pnpm check` before submitting. The complete gate includes formatting, linting, strict typing, seeded quality-gate self-tests, threat-model, compatibility, and scenario-coverage verification, coverage, unit/integration/E2E tests, package linting, the applicable official MCP conformance scenario, and the secret and artifact safety gates.

Individual commands and the reason for each layer are listed in [README.md](README.md) and [docs/TESTING.md](docs/TESTING.md).

See [docs/TESTING.md](docs/TESTING.md) for the required test layers and release gates.

## Licensing contributions

Unless you explicitly state otherwise, contributions submitted for inclusion in this project are provided under the Apache License 2.0, as described in section 5 of the license.
