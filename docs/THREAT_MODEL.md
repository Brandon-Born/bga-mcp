# Threat model

Reviewed: 2026-08-06. Backlog item: BGA-013.

This document is the human-readable view of [`config/threat-model.json`](../config/threat-model.json), which is the machine-checked source of truth. `pnpm verify:threat-model` fails when the two disagree, when a recorded element is unreferenced, when a manual control has no owner, or when a capability is advertised across an unreviewed boundary. `pnpm verify:scenarios` fails when a mitigation claims an automated control whose scenario is not declared by an executable test.

## Scope

The model covers the shipped server (`bga-mcp` over stdio), its configuration, its verification harness, and the release supply chain. It also covers the documentation and Studio components that are designed but deliberately unimplemented, because their boundaries decide what may ship later.

## Assets

| ID                       | Asset                             | Why it matters                                                            |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------- |
| ASSET-LOCAL-SOURCE       | Local BGA project source          | Unreleased game code the developer chose to expose to one server.         |
| ASSET-LOCAL-PRIVATE      | Local files outside project roots | SSH keys, environment files, and unrelated repositories on the same disk. |
| ASSET-STUDIO-CREDENTIALS | BGA Studio credentials            | Authenticates writes to a live Studio project.                            |
| ASSET-STUDIO-PROJECT     | Remote Studio project             | Shared, hard to restore, and visible to other developers.                 |
| ASSET-PLAYER-DATA        | Player data                       | Personal data the project has no reason to copy or retain.                |
| ASSET-RELEASE-ARTIFACT   | Release artifacts and evidence    | Published packages and CI output that anyone can download.                |
| ASSET-CLIENT-CONTEXT     | MCP client context                | Whatever the server returns may be stored and acted on by an agent.       |

## Actors

| ID                    | Actor                               | Trust        |
| --------------------- | ----------------------------------- | ------------ |
| ACTOR-DEVELOPER       | BGA developer                       | trusted      |
| ACTOR-MCP-CLIENT      | MCP client or agent                 | semi-trusted |
| ACTOR-PROJECT-CONTENT | Project file content                | untrusted    |
| ACTOR-DOC-CONTENT     | Documentation and community content | untrusted    |
| ACTOR-STUDIO-SERVICE  | BGA Studio service                  | semi-trusted |
| ACTOR-DEPENDENCY      | Dependency and CI supply chain      | semi-trusted |

The client is only semi-trusted on purpose. Tool arguments may be model-generated, so the server must treat them as hostile input even when the developer is trusted.

## Trust boundaries

| ID                  | Boundary                       | Gates             | Status     |
| ------------------- | ------------------------------ | ----------------- | ---------- |
| TB-CLIENT-INPUT     | MCP client to server           | local-read        | reviewed   |
| TB-LOCAL-FILESYSTEM | Server to local filesystem     | local-read        | reviewed   |
| TB-PROCESS          | Server process perimeter       | subprocess        | reviewed   |
| TB-OUTPUT           | Server to client and artifacts | local-read        | reviewed   |
| TB-DOCS-NETWORK     | Documentation retrieval        | network           | unreviewed |
| TB-STUDIO           | BGA Studio adapter             | network, mutation | unreviewed |
| TB-SUPPLY-CHAIN     | Build and release supply chain | supply-chain      | reviewed   |

An unreviewed boundary is a shipping gate, not a note. No tool, resource, prompt, or adapter that crosses TB-STUDIO may be advertised until that boundary is reviewed and this file records the result.

A **reviewed** boundary is not automatically an open one. TB-DOCS-NETWORK was reviewed on 2026-08-07 and records preconditions: the mitigations that must be implemented before any capability may cross it. Every capability in the manifest names the boundary it crosses, and the gate refuses a capability whose boundary is unreviewed _or_ whose preconditions are still planned. See the [documentation boundary review](verification/DOCS_BOUNDARY_REVIEW.md).

## Abuse cases and mitigations

| ID                        | Abuse case                                           | Boundary            | Mitigations                                                               |
| ------------------------- | ---------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| AC-PATH-TRAVERSAL         | Client requests a path outside a configured root     | TB-CLIENT-INPUT     | TM-POLICY-ROOTS, TM-POLICY-TRAVERSAL, TM-POLICY-SINGLE-GATE               |
| AC-SYMLINK-ESCAPE         | In-root link resolves outside the root               | TB-LOCAL-FILESYSTEM | TM-POLICY-SYMLINK                                                         |
| AC-UNCONFIGURED-ROOT      | Server answers project questions with no root        | TB-CLIENT-INPUT     | TM-POLICY-FAIL-CLOSED                                                     |
| AC-ARGUMENT-INJECTION     | Arguments reach a shell, URL, or raw filesystem call | TB-PROCESS          | TM-POLICY-SINGLE-GATE, TM-POLICY-TRAVERSAL                                |
| AC-RESOURCE-EXHAUSTION    | Pathological project floods the client or hangs      | TB-PROCESS          | TM-POLICY-TIMEOUT, TM-POLICY-OUTPUT-LIMIT                                 |
| AC-SECRET-IN-OUTPUT       | Secrets or player data appear in results or errors   | TB-OUTPUT           | TM-REDACTION, TM-ERROR-COLLAPSE                                           |
| AC-SECRET-IN-ARTIFACT     | Retained CI output carries a credential              | TB-OUTPUT           | TM-SOURCE-SECRET-SCAN, TM-ARTIFACT-SCAN, TM-LOG-REDACTION                 |
| AC-ARTWORK-REDISTRIBUTION | Publisher artwork enters the repository              | TB-SUPPLY-CHAIN     | TM-FIXTURE-ASSET-BAN                                                      |
| AC-FALSE-VERIFICATION     | A release claims verification the tests never ran    | TB-SUPPLY-CHAIN     | TM-EVIDENCE-COVERAGE, TM-EVIDENCE-INTEGRITY                               |
| AC-CREDENTIAL-AS-ARGUMENT | Studio credential passed as a tool argument          | TB-STUDIO           | TM-CREDENTIAL-PROVIDER, TM-BOUNDARY-REVIEW                                |
| AC-STUDIO-WRONG-TARGET    | Synchronization writes to the wrong project          | TB-STUDIO           | TM-POLICY-REMOTE-ALLOWLIST, TM-POLICY-MUTATION-INTENT, TM-BOUNDARY-REVIEW |
| AC-STUDIO-SESSION-REUSE   | Browser session or undocumented endpoint used        | TB-STUDIO           | TM-NO-BROWSER-SESSION, TM-BOUNDARY-REVIEW                                 |
| AC-DOC-PROMPT-INJECTION   | Retrieved documentation instructs the agent          | TB-DOCS-NETWORK     | TM-DOC-PROVENANCE, TM-DOC-UNTRUSTED, TM-BOUNDARY-REVIEW                   |
| AC-DOC-SSRF               | A fetch is aimed at an internal or loopback service  | TB-DOCS-NETWORK     | TM-DOC-HOST-ALLOWLIST, TM-DOC-NO-LOOPBACK                                 |
| AC-DOC-REQUEST-LEAK       | Project content leaves inside a request              | TB-DOCS-NETWORK     | TM-DOC-REQUEST-CONTENT, TM-NETWORK-OFF-DEFAULT                            |
| AC-DOC-OVERSIZED          | A response is slow or enormous                       | TB-DOCS-NETWORK     | TM-DOC-RESPONSE-BUDGET                                                    |
| AC-DOC-STALE-SNAPSHOT     | Cached documentation is served as current            | TB-DOCS-NETWORK     | TM-DOC-SNAPSHOT-INTEGRITY, TM-DOC-PROVENANCE                              |
| AC-DOC-TRACKING           | Requests reveal what a developer is working on       | TB-DOCS-NETWORK     | TM-NETWORK-OFF-DEFAULT, TM-DOC-REQUEST-CONTENT                            |
| AC-SOURCE-EXFILTRATION    | Network capability sends local source away           | TB-DOCS-NETWORK     | TM-NETWORK-OFF-DEFAULT, TM-BOUNDARY-REVIEW                                |
| AC-DEPENDENCY-COMPROMISE  | Dependency or CI action replaced                     | TB-SUPPLY-CHAIN     | TM-PINNED-DEPENDENCIES, TM-PINNED-CI-ACTIONS                              |
| AC-CLIENT-OVERTRUST       | Agent executes an unrequested mutation               | TB-CLIENT-INPUT     | TM-POLICY-MUTATION-INTENT, TM-CLIENT-TRUST-DOC                            |

## Mitigations and their evidence

Automated controls name the scenarios that must exist as executable tests. Manual controls name an owner and a cadence.

| ID                         | Control   | Status      | Evidence                                                                     |
| -------------------------- | --------- | ----------- | ---------------------------------------------------------------------------- |
| TM-POLICY-ROOTS            | automated | implemented | INT-POLICY-ROOT-NOT-ALLOWED, E2E-POLICY-ROOT-UNAVAILABLE                     |
| TM-POLICY-FAIL-CLOSED      | automated | implemented | INT-POLICY-ROOT-UNCONFIGURED, E2E-POLICY-CONFIG-FAILS-CLOSED                 |
| TM-POLICY-TRAVERSAL        | automated | implemented | INT-POLICY-PATH-TRAVERSAL                                                    |
| TM-POLICY-SYMLINK          | automated | implemented | INT-POLICY-SYMLINK-ESCAPE                                                    |
| TM-POLICY-SINGLE-GATE      | automated | implemented | GATE-POLICY-IMPORT-BOUNDARY                                                  |
| TM-POLICY-TIMEOUT          | automated | implemented | INT-POLICY-TIMEOUT                                                           |
| TM-POLICY-OUTPUT-LIMIT     | automated | implemented | INT-POLICY-OUTPUT-LIMIT                                                      |
| TM-POLICY-REMOTE-ALLOWLIST | automated | implemented | INT-POLICY-REMOTE-NOT-ALLOWED                                                |
| TM-POLICY-MUTATION-INTENT  | automated | implemented | INT-POLICY-MUTATION-NOT-REQUESTED                                            |
| TM-NETWORK-OFF-DEFAULT     | automated | implemented | INT-POLICY-NETWORK-DISABLED                                                  |
| TM-REDACTION               | automated | implemented | UNIT-REDACTION-CREDENTIALS, UNIT-REDACTION-PATHS, UNIT-REDACTION-PLAYER-DATA |
| TM-ERROR-COLLAPSE          | automated | implemented | UNIT-ERROR-UNEXPECTED-COLLAPSE                                               |
| TM-LOG-REDACTION           | automated | implemented | GATE-LOG-REDACTION                                                           |
| TM-SOURCE-SECRET-SCAN      | automated | implemented | GATE-SECRET-SCAN-SOURCE                                                      |
| TM-ARTIFACT-SCAN           | automated | implemented | GATE-SECRET-SCAN-ARTIFACT, GATE-EVIDENCE-REDACTION                           |
| TM-FIXTURE-ASSET-BAN       | automated | implemented | GATE-FIXTURE-SAFETY                                                          |
| TM-EVIDENCE-COVERAGE       | automated | implemented | GATE-EVIDENCE-COVERAGE                                                       |
| TM-EVIDENCE-INTEGRITY      | automated | implemented | GATE-EVIDENCE-TAMPER                                                         |
| TM-PINNED-DEPENDENCIES     | automated | implemented | GATE-DEPENDENCY-PINNING                                                      |
| TM-PINNED-CI-ACTIONS       | automated | implemented | GATE-CI-ACTION-PINNING                                                       |
| TM-BOUNDARY-REVIEW         | manual    | implemented | Owner: Brandon Born, before any capability crosses an unreviewed boundary    |
| TM-CLIENT-TRUST-DOC        | manual    | implemented | Owner: Brandon Born, every release                                           |
| TM-CREDENTIAL-PROVIDER     | automated | planned     | Reserved for BGA-301                                                         |
| TM-NO-BROWSER-SESSION      | manual    | planned     | Owner: Brandon Born, decision recorded in BGA-305                            |
| TM-DOC-PROVENANCE          | automated | implemented | UNIT-DOC-PROVENANCE                                                          |
| TM-DOC-UNTRUSTED           | automated | implemented | UNIT-DOC-EXCERPT, UNIT-DOC-PROVENANCE, UNIT-DOC-SEARCH-PARSE                 |
| TM-DOC-HOST-ALLOWLIST      | automated | implemented | UNIT-DOC-HOST-ALLOWLIST, INT-DOC-HOST-ALLOWLIST, INT-DOC-NETWORK-OFF         |
| TM-DOC-NO-LOOPBACK         | automated | implemented | UNIT-DOC-ADDRESS-BLOCKED                                                     |
| TM-DOC-REQUEST-CONTENT     | automated | implemented | UNIT-DOC-REQUEST-CONTENT, INT-DOC-REQUEST-CONTENT                            |
| TM-DOC-RESPONSE-BUDGET     | automated | implemented | UNIT-DOC-RESPONSE-BUDGET, UNIT-DOC-CACHE-BOUNDED                             |
| TM-DOC-SNAPSHOT-INTEGRITY  | automated | implemented | UNIT-DOC-SNAPSHOT-DATE                                                       |

## Residual risk

| ID                         | Residual risk                                                                                                                 | Accepted by  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------ |
| RR-POLICY-NO-TOOL-EVIDENCE | Policy is proven by unit, integration, and startup scenarios only. No public tool exists yet to prove it through a tool call. | Brandon Born |
| RR-STUDIO-UNREVIEWED       | Studio abuse cases are held closed by the shipping gate rather than by runtime controls.                                      | Brandon Born |
| RR-DOC-CONTENT-UNREVIEWED  | Prompt injection through retrieved documentation has no runtime control; the network-off default is the only barrier.         | Brandon Born |
| RR-CLIENT-BEHAVIOR         | The server cannot control what an agent does with a correct, redacted result.                                                 | Brandon Born |
| RR-SECRET-SCAN-COVERAGE    | Secret scanning recognizes known formats only; a novel or encoded secret can pass.                                            | Brandon Born |
| RR-DOC-INJECTION-RESIDUAL  | Labelling retrieved content as untrusted does not stop an agent acting on it. No server-side control can.                     | Brandon Born |
| RR-DOC-ALLOWLIST-TRUST     | An allowlisted documentation host that is itself compromised serves attacker content over a trusted channel.                  | Brandon Born |

## Operator responsibilities

- Start the server with the narrowest `--project-root` set that makes the work possible.
- Leave `--allow-network`, `--allow-mutations`, and `--allow-remote-project` unset unless the task needs them, and unset them afterwards.
- Treat any server result as content that may reach a remote agent provider.
- Rotate any credential that appears in a transcript or artifact, then report the leak through [SECURITY.md](../SECURITY.md).

## Review triggers

Re-review this model, and record the result here, when any of the following happens:

- A capability crosses TB-DOCS-NETWORK or TB-STUDIO for the first time.
- The policy boundary gains a new decision point or a new configuration flag.
- A new external adapter, transport, or credential provider is introduced.
- A dependency with filesystem, network, or subprocess reach is added.
