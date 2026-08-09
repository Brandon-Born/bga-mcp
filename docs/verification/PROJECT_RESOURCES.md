# Project resource verification

> [!CAUTION]
> Historical evidence only. The [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md) reopened the associated backlog and manifest claims. Do not treat this record as current release verification.

Recorded: 2026-08-06. Covers BGA-103, BGA-104, and BGA-105.

Three read-only resources expose what the tools already compute, so an agent can read project context without spending a tool call. They are the first MCP surface in this project other than tools.

| Resource                    | Serves                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| `bga://project/summary`     | The normalized model: layout, metadata, components, state definitions            |
| `bga://project/states`      | State definitions, transitions, handlers, source locations, and their validation |
| `bga://project/diagnostics` | The aggregate of every validator, with the per-group breakdown                   |

All three return `application/json`, route through the policy boundary, run under the configured deadline, and are checked against the output budget — the same treatment every tool gets.

## The design decision worth recording

A resource takes no arguments. There is no `projectRoot` to pass, so a resource can only ever describe one project.

The rule is: **the single configured root is that project**. With no root configured, reading fails with `policy.root.unconfigured`. With more than one, it fails with `resource.project.ambiguous` and says how many are configured.

Refusing is the right answer rather than picking the first root. A developer running the server across two projects would otherwise get a confident description of the wrong one, with nothing in the output to reveal the mistake. The tools remain available for a project named explicitly, and the failure message says so.

The resources stay advertised in `resources/list` either way; only reading them fails. A client should be able to see what a correctly configured server would offer.

## Evidence

The complete gate passed on Node 22.17.1 (macOS): 238 tests across 35 files, 93.62% statement, 86.35% branch, 93.01% function, and 93.52% line coverage of `src`, plus official conformance and every verification gate.

| Scenario                  | Proves                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- |
| E2E-RESOURCE-DISCOVERY    | The advertised resources match the manifest, each with a mime type and description |
| E2E-RESOURCE-SUMMARY      | The summary carries the layout, metadata, and component set                        |
| E2E-RESOURCE-STATES       | The states carry definitions, source, unsupported constructs, and validation       |
| E2E-RESOURCE-DIAGNOSTICS  | The aggregate is served for both a clean and a defective project                   |
| E2E-RESOURCE-UNCONFIGURED | With no root, reading fails and the resources stay listed                          |
| E2E-RESOURCE-AMBIGUOUS    | With two roots, reading refuses and no absolute path appears in the error          |
| E2E-RESOURCE-IMMUTABLE    | Reading all three leaves the project directory hash unchanged                      |

An eighth scenario proves an unknown `bga://` URI is rejected rather than served.

Because resources cannot return a structured error the way a tool can, a failure is raised as a protocol error carrying the same stable code and redacted message a tool would have published. `E2E-RESOURCE-AMBIGUOUS` asserts the configured root paths do not appear in that message.

## Deliberate limits

- **One project per server.** See above. A resource template taking a root would work, but URL-encoding an absolute filesystem path into a URI is worse for a developer to read and no safer, since the policy boundary checks the root either way.
- **`bga://project/states` inherits the state machine's limits.** A modern project's class-based states are reported as unsupported, exactly as the tool reports them.
- **No subscriptions.** The resources are read on demand; there is no change notification yet. Nothing here depends on it, and adding it would mean watching the filesystem, which the policy boundary would have to review first.
