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

AC-STUDIO-PLAYER-DATA needs a distinction this review originally missed. Studio has more than one kind of log, and they are not equally sensitive:

- **Your own Studio test tables.** You, playing your own game, with the dev accounts issued to you (`myusername0`, `myusername1`, …). Any identifier in those logs is yours. Reading them is reading your own work, and there is nothing sensitive about it.
- **Production errors and Sentry.** Real players of a published game. The documentation shows Sentry tagging issues with user IDs and listing affected users, and production error logs carrying request URLs and queries. Those are not the developer's data.

Only the second is an abuse case. The first is the ordinary thing a developer does all day.

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

**Studio logs, test tables, saved states, and player perspectives stay closed.** The reason is narrower than it first looks, and worth stating precisely, because the wrong reason would rule out something reasonable.

**The blocker is that there is no documented interface, and the rule against building on one is ours.** This needs saying plainly, because "not permitted" would imply an authority that has not spoken.

BGA has not prohibited any of this. `studio.boardgamearena.com/robots.txt` says `Allow: /`, with `Disallow` on `/table`, `/player`, `/play`, and `/report` — and `/studiogame`, the page carrying the logs, is not among them. Those directives address crawlers in any case, not a developer's own authenticated session. No Studio terms-of-use page was found, and nothing in the documentation read for this review says anything about automation, scripting, or scraping. As far as this review can establish, BGA has no stated position.

What does exist is this project's own non-goal, recorded before this review: "depending on undocumented Studio endpoints for core functionality". That is an engineering judgement, not a permission question. Every one of these features is a web page — logs are a panel at the bottom of the Studio game page, production errors are behind a button, Sentry has its own interface — so automating them means parsing HTML that nobody promised to keep stable, on someone else's platform, with a session that is itself a credential (AC-STUDIO-SESSION-REUSE). A capability built that way breaks silently when the page changes, and a developer finds out when their tooling quietly stops telling them the truth.

That reasoning applies to all of it equally, including the logs from your own test tables. It is not about sensitivity, and it is not about permission. It is about what this project is willing to promise it can keep working.

**Player data is a separate, narrower constraint.** It does not apply to a developer reading their own Studio test tables — those identifiers are their own dev accounts. It applies to production errors and Sentry, where the identifiers belong to real players. If a documented interface ever arrives, that distinction is the one to build to: own-table logs are ordinary developer data, production logs are not, and the second needs a decision about redaction that the first does not.

So BGA-305 has its answer: **no, on the current evidence**. Not because a developer should not read their own logs — they obviously should — and not because BGA has forbidden anything, but because this project will not put a core capability on an undocumented page it does not control. BGA-306 is blocked on that, and BGA-308 through BGA-311 carry the same finding.

This is not permanent. If BGA publishes an API for logs or tables, it is worth re-reading, and own-table logs would be the first thing to reconsider.

## Residual risk

- **RR-STUDIO-NO-UNDO** — SFTP has no version history. A guarded, previewed, confirmed sync that writes the intended file to the intended project can still overwrite something the developer wanted. Preview and confirmation reduce the chance; nothing on this side of the connection can undo it.
- **RR-STUDIO-SHARED-ACCOUNT** — the documentation describes multiple dev accounts per developer for multi-seat testing and says nothing about credential confidentiality or account sharing. A credential the developer has shared is outside this server's control entirely.

Both are reasons the Studio adapter stays opt-in, off by default, and previewed before it writes.

## What this review does not cover

Everything outside TB-STUDIO. The documentation boundary was reviewed separately on the same day; see the [documentation boundary review](DOCS_BOUNDARY_REVIEW.md).

## Addendum: the owner's decision, 2026-08-07

The review recommended not building log access. The project owner overturned that
the same day, on one condition: the capability must return no personal data
belonging to anyone else.

The recommendation was right about the fragility and wrong to let it decide the
question alone. Reading your own logs is an ordinary thing a developer wants, and
the review's own finding — that own-table identifiers are the developer's own dev
accounts — was the argument against its own conclusion.

What changed:

- **The boundary split.** TB-STUDIO now covers synchronization, which writes.
  TB-STUDIO-READ covers authenticated reads of the developer's own pages. They
  are different crossings and the write-side preconditions — confirmed target,
  upload scope, no remote delete — say nothing useful about a read.
- **The condition became a control.** TM-STUDIO-OWN-DATA-ONLY is an allowlist
  that fails closed. Every documented log line names its actor, so a line is
  returned only when that actor exactly matches a dev account the developer
  declared. A line about anyone else is withheld entirely rather than redacted,
  because a partially scrubbed line about a stranger is still about a stranger.
  A line whose owner cannot be read is withheld too. With no declared account,
  nothing is returned at all.
- **Production logs and Sentry are still never fetched.** The condition rules
  them out on its own terms, and nothing about this decision reopens them.
- **The fragility is stated, not hidden.** The capability is `experimental`, off
  unless asked for, and its own description tells the developer it scrapes an
  unversioned page and can break. `RR-STUDIO-UNDOCUMENTED-PAGE` records that.

`TM-NO-STUDIO-LOGS` stays as written for test tables, saved states, and player
perspectives, which nobody has asked for and which involve real tables.
