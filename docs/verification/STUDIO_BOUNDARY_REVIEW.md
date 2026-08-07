# Studio boundary review

Reviewed: 2026-08-07. Boundary: TB-STUDIO. Backlog: affects Phase 3 (BGA-300 through BGA-311).

This is the review the threat model required before any capability may reach a BGA Studio account. It records what crosses, what an attacker controls, what must exist first, and — the part that matters most here — which half of Phase 3 this review **does not** open.

## What crosses

Two very different things, and conflating them is how this boundary gets crossed badly.

**File synchronization.** SFTP to `1.studio.boardgamearena.com` on port 2022, authenticating with either the SFTP password issued at registration or an uploaded SSH key. Uploading a key disables password authentication for the account. Projects live under `home/<projectname>`. This is documented, stable, and addressed by name.

**Everything else developers do on Studio** — reading logs, creating test tables, restoring saved states, playing as a second seat — happens in an authenticated web interface at `studio.boardgamearena.com`. There is no documented API for any of it. The logs are a panel at the bottom of the game's Studio page; production errors are behind a button on the same page; Sentry sits behind its own interface.

## What an attacker, or an accident, controls

- **The MCP client** chooses the sync target. A wrong target overwrites someone's work in place, and SFTP has no undo.
- **The local filesystem** supplies what gets uploaded. A sync that walks the wrong root uploads whatever it finds, including files that were never meant to leave the machine.
- **The Studio server** returns paths, listings, and log text. All of it is third-party input that ends up in an agent's context.
- **Whoever holds the credential.** The SFTP password arrives by email and is distinct from the dev account password. A credential passed as a tool argument is logged by the client, kept in its transcript, and possibly sent to a model provider.

## Abuse cases

Three were already recorded: a credential passed as an ordinary tool argument (AC-CREDENTIAL-AS-ARGUMENT), a synchronization writing to the wrong project (AC-STUDIO-WRONG-TARGET), and browser-session or undocumented-endpoint use (AC-STUDIO-SESSION-REUSE). The review adds four:

| Abuse case                 | The problem                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| AC-STUDIO-UPLOAD-SCOPE     | A sync uploads files outside the project — keys, `.env`, notes — because the source scope was wider than intended      |
| AC-STUDIO-PLAYER-DATA      | Production logs and Sentry carry player identifiers, so reading logs pulls other people's data into an agent's context |
| AC-STUDIO-DESTRUCTIVE-SYNC | A sync deletes or overwrites remote files that exist only on Studio, with no local copy to restore them from           |
| AC-STUDIO-CREDENTIAL-LOG   | A credential, host, or account name reaches stderr, an error message, or a retained CI artifact                        |

AC-STUDIO-PLAYER-DATA is the one that changes the shape of Phase 3. The documentation shows Sentry tagging issues with user IDs and listing affected users, and production error logs carrying request URLs and queries. Those are not the developer's data.

## What this review opens

**The SFTP half, with preconditions.** Connection diagnostics, a preview of what a sync would do, and a guarded sync are all buildable against a documented mechanism with a documented address. Seven preconditions must exist before any of it may be advertised:

| Precondition                   | Requirement                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| TM-STUDIO-CREDENTIAL-PROVIDER  | Credentials come from the environment or an agent, never from a tool argument                                        |
| TM-STUDIO-HOST-PINNED          | Only the documented Studio host and port, over SFTP, with the host key verified against a stored fingerprint         |
| TM-STUDIO-TARGET-CONFIRMED     | A mutation names its exact remote project and the client repeats it back, or nothing happens                         |
| TM-STUDIO-UPLOAD-SCOPE         | Only files inside the configured project root are uploaded, resolved through the same policy that guards local reads |
| TM-STUDIO-PREVIEW-FIRST        | Every mutation has a dry run that lists exactly what would change, and execution requires explicit intent            |
| TM-STUDIO-NO-REMOTE-DELETE     | Deleting or overwriting a remote file that has no local counterpart is refused, not resolved                         |
| TM-STUDIO-CREDENTIAL-REDACTION | Credentials, hosts, and account names are redacted from every result, error, log line, and artifact                  |

The capability gate already enforces this shape: a reviewed boundary with planned preconditions is a closed boundary, and it refuses to advertise a capability whose preconditions are not implemented.

## What this review does not open

**Studio logs, test tables, saved states, and player perspectives stay closed, and not merely pending more work.** Three separate reasons, each sufficient on its own:

1. **There is no documented interface.** Every one of these is a web page. Automating them means driving an authenticated session and parsing HTML that BGA never promised to keep stable. "Depending on undocumented Studio endpoints for core functionality" is an explicit non-goal of this project, recorded before this review and unchanged by it.
2. **Production logs contain other people's data.** A capability that pipes them into an agent's context window exports player identifiers to wherever that context goes. No redaction rule this project can write makes that safe, because the server cannot tell which identifiers matter.
3. **A browser session is a credential.** Reusing one is the abuse case AC-STUDIO-SESSION-REUSE describes, and nothing in the documentation offers an alternative.

So BGA-305 has its answer: **no**. Studio log access is not a stable, permitted mechanism, and BGA-306 should not be built on the current evidence. BGA-308 through BGA-311 — test tables, player perspectives, saved states — are blocked for reason 1 and, where a real table is involved, reason 2.

This is not permanent. If BGA publishes an API for logs or tables, the decision is worth re-reading. Until then, the honest position is that the value of those capabilities does not exceed the cost of scraping an authenticated session belonging to someone else's platform.

## Residual risk

- **RR-STUDIO-NO-UNDO** — SFTP has no version history. A guarded, previewed, confirmed sync that writes the intended file to the intended project can still overwrite something the developer wanted. Preview and confirmation reduce the chance; nothing on this side of the connection can undo it.
- **RR-STUDIO-SHARED-ACCOUNT** — the documentation describes multiple dev accounts per developer for multi-seat testing and says nothing about credential confidentiality or account sharing. A credential the developer has shared is outside this server's control entirely.

Both are reasons the Studio adapter stays opt-in, off by default, and previewed before it writes.

## What this review does not cover

Everything outside TB-STUDIO. The documentation boundary was reviewed separately on the same day; see the [documentation boundary review](DOCS_BOUNDARY_REVIEW.md).
