# Documentation boundary review

Reviewed: 2026-08-07. Boundary: TB-DOCS-NETWORK. Backlog: unblocks Phase 2 (BGA-200 through BGA-206).

This is the review the threat model required before any capability may retrieve BGA documentation. It records what crosses the boundary, what an attacker controls, what must be built before anything crosses it, and what stays unresolved.

## What crosses

Outbound: an HTTPS request to a documentation host, carrying a search term or a topic identifier.

Inbound: HTML or text written by people outside this project — official BGA Studio pages, wiki pages anyone can edit, and community examples — which then enters an agent's context window.

The asymmetry matters. The request is small and controlled. The response is arbitrary text that will be read by a model that acts on text.

## What an attacker controls

- **A wiki editor** controls page content, including text shaped to read as instructions to an agent.
- **A compromised or hostile host** controls everything in the response.
- **The MCP client** controls the search term, and therefore what leaves the machine and what a third party can infer.

## Abuse cases the review added

Two were already recorded: prompt injection through retrieved content (AC-DOC-PROMPT-INJECTION) and source exfiltration once the network is on (AC-SOURCE-EXFILTRATION). The review found five more:

| Abuse case            | The problem                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| AC-DOC-SSRF           | A fetch aimed at a loopback or private address turns the server into a proxy into the developer's network |
| AC-DOC-REQUEST-LEAK   | A search built from file content sends unreleased game code out in a URL                                  |
| AC-DOC-OVERSIZED      | A slow or enormous response floods the agent context or hangs the server                                  |
| AC-DOC-STALE-SNAPSHOT | Cached documentation served as current, so a developer follows guidance the framework has since changed   |
| AC-DOC-TRACKING       | Query terms and timing reveal which game and which problem a developer is working on                      |

## Preconditions: what must exist before anything crosses

The boundary is now **reviewed**, which is not the same as open. It records seven preconditions, all currently `planned`, and the gate refuses to advertise any capability on this boundary until every one of them is implemented:

| Precondition              | Requirement                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------ |
| TM-DOC-HOST-ALLOWLIST     | Allowlisted hosts only, HTTPS only, redirects confined to the allowlist              |
| TM-DOC-NO-LOOPBACK        | A host resolving to loopback, link-local, or private address is refused              |
| TM-DOC-REQUEST-CONTENT    | A request carries only the client's explicit query, never project file content       |
| TM-DOC-RESPONSE-BUDGET    | Response size and time bounded by the policy boundary                                |
| TM-DOC-PROVENANCE         | Every result carries source URL, snapshot date, and official or community provenance |
| TM-DOC-UNTRUSTED          | Retrieved content is labelled as untrusted content, never as instruction             |
| TM-DOC-SNAPSHOT-INTEGRITY | Cached content carries its snapshot date and is never served as current without one  |

## How the gate now enforces this

Before this review, the gate could only ask whether a boundary was reviewed. Marking one reviewed would have opened it completely — which is why nothing had been reviewed.

Three changes fix that:

1. **Every capability names the boundary it crosses.** The manifest requires it; the current seven tools and three resources all name TB-LOCAL-FILESYSTEM.
2. **A boundary may record preconditions.** A reviewed boundary with planned preconditions is a closed boundary.
3. **The gate refuses a capability whose boundary is unreviewed _or_ whose preconditions are still planned**, and proves it by seeding a `search_bga_docs` capability on TB-DOCS-NETWORK and requiring the gate to reject it.

So the review unblocks Phase 2 _work_ without unblocking Phase 2 _shipping_. Building the retrieval capability is now permitted; advertising it still requires the seven mitigations to exist.

## Residual risk

Two things the review could not resolve, both now recorded:

- **RR-DOC-INJECTION-RESIDUAL** — labelling content as untrusted does not stop an agent from acting on it. No server-side control can. The mitigation reduces the chance an agent treats documentation as instruction; operator judgement carries the rest.
- **RR-DOC-ALLOWLIST-TRUST** — an allowlisted host that is itself compromised serves attacker content over a channel the server trusts. Provenance and untrusted labelling limit the damage; the allowlist cannot prevent it.

Neither is a reason to refuse the boundary. Both are reasons the network stays off by default and the retrieval capability stays optional.

## What this review does not cover

TB-STUDIO remains **unreviewed**. Credential handling, wrong-target writes, and session reuse are untouched by this review, and every Studio capability remains blocked by the same gate.
