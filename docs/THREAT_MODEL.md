# Threat model

Reviewed: 2026-08-08. Backlog item: BGA-013.

This document is the human-readable view of [`config/threat-model.json`](../config/threat-model.json), which is the machine-checked source of truth. The current `pnpm verify:threat-model` gate checks schema, identifiers, references, ownership, and named boundary preconditions; it does not yet compare every human and machine field semantically. BGA-018 owns that missing equality/composition check. `pnpm verify:scenarios` reserves scenarios for planned controls and requires implemented automated controls to have executable coverage.

## Scope

The model covers the shipped server (`bga-mcp` over stdio), its configuration, its verification harness, and the release supply chain. Documentation retrieval is implemented behind explicit network permission, own-account Studio log reading is discoverable as experimental, and Studio synchronization remains planned; all three external paths are included because their boundaries decide what may ship.

## Assets

| ID                       | Asset                             | Why it matters                                                            |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------- |
| ASSET-LOCAL-SOURCE       | Local BGA project source          | Unreleased game code the developer chose to expose to one server.         |
| ASSET-LOCAL-PRIVATE      | Local files outside project roots | SSH keys, environment files, and unrelated repositories on the same disk. |
| ASSET-STUDIO-CREDENTIALS | BGA Studio credentials            | Authenticates writes to a live Studio project.                            |
| ASSET-STUDIO-PROJECT     | Remote Studio project             | Shared and hard to restore; its observed default ACL exposes source.      |
| ASSET-PLAYER-DATA        | Player data                       | Personal data the project has no reason to copy or retain.                |
| ASSET-RELEASE-ARTIFACT   | Release artifacts and evidence    | Published packages and CI output that anyone can download.                |
| ASSET-CLIENT-CONTEXT     | MCP client context                | Whatever the server returns may be stored and acted on by an agent.       |

## Actors

| ID                           | Actor                               | Trust        |
| ---------------------------- | ----------------------------------- | ------------ |
| ACTOR-DEVELOPER              | BGA developer                       | trusted      |
| ACTOR-MCP-CLIENT             | MCP client or agent                 | semi-trusted |
| ACTOR-PROJECT-CONTENT        | Project file content                | untrusted    |
| ACTOR-DOC-CONTENT            | Documentation and community content | untrusted    |
| ACTOR-STUDIO-SERVICE         | BGA Studio service                  | semi-trusted |
| ACTOR-OTHER-STUDIO-DEVELOPER | Other BGA Studio developer          | untrusted    |
| ACTOR-DEPENDENCY             | Dependency and CI supply chain      | semi-trusted |

The client is only semi-trusted on purpose. Tool arguments may be model-generated, so the server must treat them as hostile input even when the developer is trusted.

## Trust boundaries

| ID                  | Boundary                       | Gates             | Status   |
| ------------------- | ------------------------------ | ----------------- | -------- |
| TB-CLIENT-INPUT     | MCP client to server           | local-read        | reviewed |
| TB-LOCAL-FILESYSTEM | Server to local filesystem     | local-read        | reviewed |
| TB-PROCESS          | Server process perimeter       | subprocess        | reviewed |
| TB-OUTPUT           | Server to client and artifacts | local-read        | reviewed |
| TB-DOCS-NETWORK     | Documentation retrieval        | network           | reviewed |
| TB-STUDIO           | BGA Studio synchronization     | network, mutation | reviewed |
| TB-STUDIO-READ      | BGA Studio own-account reads   | network           | reviewed |
| TB-SUPPLY-CHAIN     | Build and release supply chain | supply-chain      | reviewed |

An unreviewed boundary is a shipping gate, not a note. A reviewed boundary is also not a verification claim: the current gate checks only its named preconditions, while planned corrective controls referenced by abuse cases remain release blockers until BGA-018 makes that composition machine-enforced.

The 2026-08-08 adversarial review corrected the stale `TB-DOCS-NETWORK` row above: the machine model and prose below already recorded its 2026-08-07 review. The current verifier checked identifier presence but not field equality and therefore passed the contradiction. BGA-018 owns exact machine/human agreement and seeded drift failures.

TB-STUDIO was reviewed on 2026-08-07. The review opens file synchronization behind eight preconditions, including an explicit disabled cross-developer readonly ACL on the dedicated private project. The 2026-08-08 live setup proved that selecting `Private` does not satisfy that condition by itself: BGA enables readonly source sharing by default. Log access remains a separate experimental own-account read boundary. See the [Studio boundary review](verification/STUDIO_BOUNDARY_REVIEW.md) and BGA-322.

A **reviewed** boundary is not automatically a verified one. TB-DOCS-NETWORK was reviewed on 2026-08-07 and records the minimum controls known at that review. Every capability in the manifest names the boundary it crosses, and the current gate refuses a capability whose boundary is unreviewed or whose _named_ preconditions are planned. The 2026-08-08 audit added narrower planned controls for address normalization, query privacy, and response lifecycle; BGA-018 must make those later findings self-closing rather than relying on prose. See the [documentation boundary review](verification/DOCS_BOUNDARY_REVIEW.md).

## Abuse cases and mitigations

| ID                           | Abuse case                                           | Boundary            | Mitigations                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-PATH-TRAVERSAL            | Client requests a path outside a configured root     | TB-CLIENT-INPUT     | TM-POLICY-ROOTS, TM-POLICY-TRAVERSAL, TM-POLICY-SINGLE-GATE                                                                                               |
| AC-SYMLINK-ESCAPE            | In-root link resolves outside the root               | TB-LOCAL-FILESYSTEM | TM-POLICY-SYMLINK, TM-POLICY-OBJECT-BOUND-READS                                                                                                           |
| AC-UNCONFIGURED-ROOT         | Server answers project questions with no root        | TB-CLIENT-INPUT     | TM-POLICY-FAIL-CLOSED                                                                                                                                     |
| AC-ARGUMENT-INJECTION        | Arguments reach a shell, URL, or raw filesystem call | TB-PROCESS          | TM-POLICY-SINGLE-GATE, TM-POLICY-COMPLETE-EFFECT-GATE, TM-POLICY-TRAVERSAL                                                                                |
| AC-RESOURCE-EXHAUSTION       | Pathological project floods the client or hangs      | TB-PROCESS          | TM-POLICY-TIMEOUT, TM-POLICY-CANCELLATION, TM-POLICY-OUTPUT-LIMIT, TM-POLICY-FINAL-OUTPUT-LIMIT, TM-POLICY-OBJECT-BOUND-READS                             |
| AC-SECRET-IN-OUTPUT          | Secrets or player data appear in results or errors   | TB-OUTPUT           | TM-REDACTION, TM-SUCCESS-OUTPUT-REDACTION, TM-ERROR-COLLAPSE                                                                                              |
| AC-SECRET-IN-ARTIFACT        | Retained CI output carries a credential              | TB-OUTPUT           | TM-SOURCE-SECRET-SCAN, TM-ARTIFACT-SCAN, TM-LOG-REDACTION                                                                                                 |
| AC-ARTWORK-REDISTRIBUTION    | Publisher artwork enters the repository              | TB-SUPPLY-CHAIN     | TM-FIXTURE-ASSET-BAN                                                                                                                                      |
| AC-FALSE-VERIFICATION        | A release claims verification the tests never ran    | TB-SUPPLY-CHAIN     | TM-EVIDENCE-COVERAGE, TM-EVIDENCE-INTEGRITY                                                                                                               |
| AC-CREDENTIAL-AS-ARGUMENT    | Studio credential passed as a tool argument          | TB-STUDIO           | TM-CREDENTIAL-PROVIDER, TM-BOUNDARY-REVIEW                                                                                                                |
| AC-STUDIO-WRONG-TARGET       | Synchronization writes to the wrong project          | TB-STUDIO           | TM-POLICY-REMOTE-ALLOWLIST, TM-POLICY-MUTATION-INTENT, TM-BOUNDARY-REVIEW                                                                                 |
| AC-STUDIO-SESSION-REUSE      | A synchronization reuses a browser session           | TB-STUDIO           | TM-NO-BROWSER-SESSION, TM-BOUNDARY-REVIEW                                                                                                                 |
| AC-STUDIO-UPLOAD-SCOPE       | A sync uploads files from outside the project        | TB-STUDIO           | TM-STUDIO-UPLOAD-SCOPE, TM-STUDIO-PREVIEW-FIRST                                                                                                           |
| AC-STUDIO-PLAYER-DATA        | Production logs carry real players' identifiers      | TB-STUDIO-READ      | TM-STUDIO-OWN-DATA-ONLY, TM-STUDIO-ALL-OUTPUTS-OWN-DATA, TM-STUDIO-SUCCESS-REDACTION, TM-STUDIO-NO-PRODUCTION-LOGS, TM-NO-STUDIO-LOGS, TM-BOUNDARY-REVIEW |
| AC-STUDIO-DESTRUCTIVE-SYNC   | A sync deletes or overwrites remote-only files       | TB-STUDIO           | TM-STUDIO-NO-REMOTE-DELETE, TM-STUDIO-PREVIEW-FIRST                                                                                                       |
| AC-STUDIO-PROJECT-DISCLOSURE | Default readonly ACL exposes private project source  | TB-STUDIO           | TM-STUDIO-READONLY-SHARING-DISABLED, TM-BOUNDARY-REVIEW                                                                                                   |
| AC-STUDIO-FILE-SESSION-LOG   | A file-sourced session reaches output or an artifact | TB-STUDIO-READ      | TM-STUDIO-SESSION-REDACTION, TM-STUDIO-FILE-SESSION-REDACTION, TM-STUDIO-FILE-SESSION-BLOCKED, TM-REDACTION                                               |
| AC-STUDIO-CREDENTIAL-LOG     | A sync credential reaches a result or artifact       | TB-STUDIO           | TM-STUDIO-CREDENTIAL-REDACTION, TM-REDACTION                                                                                                              |
| AC-STUDIO-READ-SSRF          | Studio read reaches a non-public resolved address    | TB-STUDIO-READ      | TM-STUDIO-READ-HOST-PINNED, TM-STUDIO-READ-ADDRESS-NORMALIZATION                                                                                          |
| AC-STUDIO-READ-EXHAUSTION    | Studio read work continues after failure             | TB-STUDIO-READ      | TM-STUDIO-FILE-SESSION-BLOCKED, TM-STUDIO-READ-CANCELLATION                                                                                               |
| AC-DOC-PROMPT-INJECTION      | Retrieved documentation instructs the agent          | TB-DOCS-NETWORK     | TM-DOC-PROVENANCE, TM-DOC-UNTRUSTED, TM-BOUNDARY-REVIEW                                                                                                   |
| AC-DOC-SSRF                  | A fetch is aimed at an internal or loopback service  | TB-DOCS-NETWORK     | TM-DOC-HOST-ALLOWLIST, TM-DOC-NO-LOOPBACK, TM-DOC-ADDRESS-NORMALIZATION                                                                                   |
| AC-DOC-REQUEST-LEAK          | Project content leaves inside a request              | TB-DOCS-NETWORK     | TM-DOC-REQUEST-CONTENT, TM-DOC-EXPLICIT-QUERY-PRIVACY, TM-NETWORK-OFF-DEFAULT                                                                             |
| AC-DOC-OVERSIZED             | A response is slow or enormous                       | TB-DOCS-NETWORK     | TM-DOC-RESPONSE-BUDGET, TM-DOC-RESPONSE-LIFECYCLE                                                                                                         |
| AC-DOC-STALE-SNAPSHOT        | Cached documentation is served as current            | TB-DOCS-NETWORK     | TM-DOC-SNAPSHOT-INTEGRITY, TM-DOC-PROVENANCE                                                                                                              |
| AC-DOC-TRACKING              | Requests reveal what a developer is working on       | TB-DOCS-NETWORK     | TM-NETWORK-OFF-DEFAULT, TM-DOC-REQUEST-CONTENT, TM-DOC-EXPLICIT-QUERY-PRIVACY                                                                             |
| AC-SOURCE-EXFILTRATION       | Network capability sends local source away           | TB-DOCS-NETWORK     | TM-NETWORK-OFF-DEFAULT, TM-BOUNDARY-REVIEW, TM-DOC-EXPLICIT-QUERY-PRIVACY                                                                                 |
| AC-DEPENDENCY-COMPROMISE     | Dependency or CI action replaced                     | TB-SUPPLY-CHAIN     | TM-PINNED-DEPENDENCIES, TM-PINNED-CI-ACTIONS                                                                                                              |
| AC-CLIENT-OVERTRUST          | Agent executes an unrequested mutation               | TB-CLIENT-INPUT     | TM-POLICY-MUTATION-INTENT, TM-CLIENT-TRUST-DOC                                                                                                            |

## Mitigations and their evidence

Automated controls name the scenarios that must exist as executable tests. Manual controls name an owner and a cadence.

| ID                                   | Control   | Status      | Evidence                                                                     |
| ------------------------------------ | --------- | ----------- | ---------------------------------------------------------------------------- |
| TM-POLICY-ROOTS                      | automated | implemented | INT-POLICY-ROOT-NOT-ALLOWED, E2E-POLICY-ROOT-UNAVAILABLE                     |
| TM-POLICY-FAIL-CLOSED                | automated | implemented | INT-POLICY-ROOT-UNCONFIGURED, E2E-POLICY-CONFIG-FAILS-CLOSED                 |
| TM-POLICY-TRAVERSAL                  | automated | implemented | INT-POLICY-PATH-TRAVERSAL                                                    |
| TM-POLICY-SYMLINK                    | automated | implemented | INT-POLICY-SYMLINK-ESCAPE                                                    |
| TM-POLICY-OBJECT-BOUND-READS         | automated | planned     | Reserved for BGA-330                                                         |
| TM-POLICY-SINGLE-GATE                | automated | implemented | GATE-POLICY-IMPORT-BOUNDARY                                                  |
| TM-POLICY-COMPLETE-EFFECT-GATE       | automated | planned     | Reserved for BGA-329                                                         |
| TM-POLICY-TIMEOUT                    | automated | implemented | INT-POLICY-TIMEOUT                                                           |
| TM-POLICY-CANCELLATION               | automated | planned     | Reserved for BGA-326                                                         |
| TM-POLICY-OUTPUT-LIMIT               | automated | implemented | INT-POLICY-OUTPUT-LIMIT                                                      |
| TM-POLICY-FINAL-OUTPUT-LIMIT         | automated | planned     | Reserved for BGA-325                                                         |
| TM-POLICY-REMOTE-ALLOWLIST           | automated | implemented | INT-POLICY-REMOTE-NOT-ALLOWED                                                |
| TM-POLICY-MUTATION-INTENT            | automated | implemented | INT-POLICY-MUTATION-NOT-REQUESTED                                            |
| TM-NETWORK-OFF-DEFAULT               | automated | implemented | INT-POLICY-NETWORK-DISABLED                                                  |
| TM-REDACTION                         | automated | implemented | UNIT-REDACTION-CREDENTIALS, UNIT-REDACTION-PATHS, UNIT-REDACTION-PLAYER-DATA |
| TM-SUCCESS-OUTPUT-REDACTION          | automated | planned     | Reserved for BGA-327                                                         |
| TM-ERROR-COLLAPSE                    | automated | implemented | UNIT-ERROR-UNEXPECTED-COLLAPSE                                               |
| TM-LOG-REDACTION                     | automated | implemented | GATE-LOG-REDACTION                                                           |
| TM-SOURCE-SECRET-SCAN                | automated | implemented | GATE-SECRET-SCAN-SOURCE                                                      |
| TM-ARTIFACT-SCAN                     | automated | implemented | GATE-SECRET-SCAN-ARTIFACT, GATE-EVIDENCE-REDACTION                           |
| TM-FIXTURE-ASSET-BAN                 | automated | implemented | GATE-FIXTURE-SAFETY                                                          |
| TM-EVIDENCE-COVERAGE                 | automated | implemented | GATE-EVIDENCE-COVERAGE                                                       |
| TM-EVIDENCE-INTEGRITY                | automated | implemented | GATE-EVIDENCE-TAMPER                                                         |
| TM-PINNED-DEPENDENCIES               | automated | implemented | GATE-DEPENDENCY-PINNING                                                      |
| TM-PINNED-CI-ACTIONS                 | automated | implemented | GATE-CI-ACTION-PINNING                                                       |
| TM-BOUNDARY-REVIEW                   | manual    | implemented | Owner: Brandon Born, before any capability crosses an unreviewed boundary    |
| TM-CLIENT-TRUST-DOC                  | manual    | implemented | Owner: Brandon Born, every release                                           |
| TM-CREDENTIAL-PROVIDER               | automated | planned     | Reserved for BGA-301                                                         |
| TM-NO-BROWSER-SESSION                | manual    | planned     | Owner: Brandon Born, decision recorded in BGA-305                            |
| TM-DOC-PROVENANCE                    | automated | implemented | UNIT-DOC-PROVENANCE, UNIT-DOC-EVALUATION                                     |
| TM-STUDIO-CREDENTIAL-PROVIDER        | automated | planned     | Reserved for BGA-301                                                         |
| TM-STUDIO-HOST-PINNED                | automated | planned     | Reserved for BGA-302                                                         |
| TM-STUDIO-TARGET-CONFIRMED           | automated | planned     | Reserved for BGA-304                                                         |
| TM-STUDIO-UPLOAD-SCOPE               | automated | planned     | Reserved for BGA-303                                                         |
| TM-STUDIO-PREVIEW-FIRST              | automated | planned     | Reserved for BGA-303                                                         |
| TM-STUDIO-NO-REMOTE-DELETE           | automated | planned     | Reserved for BGA-304                                                         |
| TM-STUDIO-CREDENTIAL-REDACTION       | automated | planned     | Reserved for BGA-301                                                         |
| TM-STUDIO-READONLY-SHARING-DISABLED  | manual    | planned     | Owner: Brandon Born, BGA-322 blocks live Studio tests                        |
| TM-NO-STUDIO-LOGS                    | manual    | implemented | Owner: Brandon Born, decision recorded in the Studio boundary review         |
| TM-STUDIO-SESSION-FROM-ENVIRONMENT   | automated | implemented | INT-STUDIO-SESSION-NOT-AN-ARGUMENT                                           |
| TM-STUDIO-READ-HOST-PINNED           | automated | implemented | INT-STUDIO-HOST-PINNED                                                       |
| TM-STUDIO-OWN-DATA-ONLY              | automated | implemented | UNIT-STUDIO-LOG-PRIVACY, UNIT-STUDIO-LOG-PARSE                               |
| TM-STUDIO-ALL-OUTPUTS-OWN-DATA       | automated | planned     | Reserved for BGA-319                                                         |
| TM-STUDIO-READ-ADDRESS-NORMALIZATION | automated | implemented | E2E-STUDIO-READ-ADDRESS-NORMALIZATION                                        |
| TM-STUDIO-READ-CANCELLATION          | automated | planned     | Reserved for BGA-326                                                         |
| TM-STUDIO-SUCCESS-REDACTION          | automated | planned     | Reserved for BGA-327                                                         |
| TM-STUDIO-SESSION-REDACTION          | automated | implemented | Environment provider only: UNIT-STUDIO-SESSION-REDACTION; BGA-321 owns files |
| TM-STUDIO-FILE-SESSION-BLOCKED       | automated | planned     | Reserved for BGA-328                                                         |
| TM-STUDIO-FILE-SESSION-REDACTION     | automated | planned     | Reserved for BGA-321                                                         |
| TM-STUDIO-NO-PRODUCTION-LOGS         | automated | implemented | INT-STUDIO-NO-PRODUCTION-LOGS                                                |
| TM-DOC-UNTRUSTED                     | automated | implemented | UNIT-DOC-EXCERPT, UNIT-DOC-PROVENANCE, UNIT-DOC-SEARCH-PARSE                 |
| TM-DOC-HOST-ALLOWLIST                | automated | implemented | UNIT-DOC-HOST-ALLOWLIST, INT-DOC-HOST-ALLOWLIST, INT-DOC-NETWORK-OFF         |
| TM-DOC-NO-LOOPBACK                   | automated | implemented | UNIT-DOC-ADDRESS-BLOCKED, UNIT-DOC-ADDRESS-NORMALIZATION                     |
| TM-DOC-ADDRESS-NORMALIZATION         | automated | implemented | UNIT-DOC-ADDRESS-NORMALIZATION, E2E-DOCS-ADDRESS-NORMALIZATION               |
| TM-DOC-REQUEST-CONTENT               | automated | implemented | UNIT-DOC-REQUEST-CONTENT, INT-DOC-REQUEST-CONTENT                            |
| TM-DOC-EXPLICIT-QUERY-PRIVACY        | automated | planned     | Reserved for BGA-324                                                         |
| TM-DOC-RESPONSE-BUDGET               | automated | implemented | UNIT-DOC-RESPONSE-BUDGET, UNIT-DOC-CACHE-BOUNDED                             |
| TM-DOC-RESPONSE-LIFECYCLE            | automated | planned     | Reserved for BGA-326                                                         |
| TM-DOC-SNAPSHOT-INTEGRITY            | automated | implemented | UNIT-DOC-SNAPSHOT-DATE, UNIT-DOC-DRIFT                                       |

The broad pre-audit control titles were split. `implemented` now describes only the observed partial behavior; the missing invariant has its own `planned` control owned by BGA-319 and BGA-321 through BGA-330. This prevents a dotted-address unit test, a timeout response, or failure-only redaction from being described as complete address, cancellation, or publication protection. BGA-018 separately strengthens the machine/human gate so later findings automatically close the affected boundary claim rather than relying on this prose.

## Residual risk

| ID                          | Residual risk                                                                                                                                          | Accepted by  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| RR-POLICY-NO-TOOL-EVIDENCE  | Packaged tool evidence exists for selected refusals, but not final failure bounds, cancellation, complete effect gating, or race-safe traversal.       | Brandon Born |
| RR-STUDIO-UNREVIEWED        | Both Studio boundaries are reviewed; synchronization is unimplemented and the experimental read remains unreleased behind open controls.               | Brandon Born |
| RR-STUDIO-NO-UNDO           | SFTP has no version history, so a previewed and confirmed sync can still overwrite something wanted. Nothing here can undo it.                         | Brandon Born |
| RR-STUDIO-SHARED-ACCOUNT    | The documentation says nothing about credential confidentiality; a credential already shared is outside this server's control.                         | Brandon Born |
| RR-STUDIO-UNDOCUMENTED-PAGE | The experimental log reader parses a page BGA does not version. It can break without warning; the privacy screen fails closed.                         | Brandon Born |
| RR-DOC-CONTENT-UNREVIEWED   | Retrieval is reviewed and implemented with network-off, provenance, and untrusted labels; arbitrary-query provenance and hostile prose remain limited. | Brandon Born |
| RR-CLIENT-BEHAVIOR          | The server cannot control what an agent does with a correct, redacted result.                                                                          | Brandon Born |
| RR-SECRET-SCAN-COVERAGE     | Secret scanning recognizes known formats only; a novel or encoded secret can pass.                                                                     | Brandon Born |
| RR-DOC-INJECTION-RESIDUAL   | Labelling retrieved content as untrusted does not stop an agent acting on it. No server-side control can.                                              | Brandon Born |
| RR-DOC-ALLOWLIST-TRUST      | An allowlisted documentation host that is itself compromised serves attacker content over a trusted channel.                                           | Brandon Born |

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
