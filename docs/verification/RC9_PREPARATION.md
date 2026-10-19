# Corrected local rc.9 preparation — BGA-450

```verification-record
{"kind":"review","scope":"rc.9 preparation boundaries following independent source-level remediation review; candidate-specific results and owner decisions remain separate"}
```

The owner approved independent re-review followed by fresh preparation. Both
SEC-RC8-01 and SEC-RC8-02 are fixed at merged main
`a151763a34e908ef1f52159daba9ea94fbf0976f` (fix `d84a367`).
[Main CI 39268556485](https://github.com/Brandon-Born/bga-mcp/actions/runs/39268556485)
passes all six macOS/Ubuntu/Windows and Node 22/24 jobs at that exact clean source:
1,024 tests, 279 required scenarios, 107 retained claims and 17 capabilities.
Downloaded records passed independent schema, integrity and identity validation.

Independent Daybreak source re-review on 2026-10-19 approves the two remediations.
It exercised the untagged, unsigned local test archive
`sha256:b065cb3e39eba19949231587ec076ca7a334289eaed229fc5c049311a4caef8f`:
client-only roots cannot grant authority, configured roots remain readable, and
all seven project tools and three resources carry invariant trust markers before
project-derived prose. This approval covers that source/test artifact only.
A future packet requires its own exact-artifact review; labeling still cannot
sandbox a consuming agent. BGA-314's old authority requirement is superseded.

## Current release disposition

Signed rc.8 remains [rejected](RC8_SECURITY_REJECTION.md). Its tag, original
archive, signature and historical receipts remain immutable; `publicationHold`
continues to block publication. No old security approval transfers to rc.9.

On the owner's separate instruction, GitHub release ID `403223911` for
`v1.0.0-rc.7` was reversibly returned to draft on 2026-10-19. Authenticated reads
confirm the draft retains all 16 original asset IDs, sizes and digests, unchanged
notes and title, and source tag `8bd773d2d597b7b2b2c3abd6316e41cd84c1a81c`.
The unauthenticated tag-release endpoint returns 404 and the public release list
omits rc.7. No tag, asset or receipt was deleted; no warning or advisory was added.
This action does not authorize republishing rc.7 or another candidate.

## Preparation admission

Refresh each of the eight mapped official pages, read the relevant current
wording and retain the actual observation identity. Shared root/output security
changes alter no BGA syntax or migration rule; existing original mixed-layout
fixtures and their passing scenarios must remain applicable. Clear each held
review only using successful, clean post-observation source CI and matching
semantic/proof dependencies. Never use a PR merge record as another commit's
proof, or waive the current framework guard.

The 2026-10-19 official observations match all eight prior page digests. The
[migration guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide)
retains “File still there” for metadata and describes legacy-to-modern migration;
[PHP logic](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) and
[client logic](https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js)
still call flat root filenames “legacy usage”. The
[file reference](https://en.doc.boardgamearena.com/Studio_file_reference),
[state arrays](https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php)
and [state classes](https://en.doc.boardgamearena.com/State_classes:_State_directory)
retain both forms and their separate migration conditions. The
[database model](https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql)
describes schema creation queries; no live database state is inferred. The
[Studio page](https://en.doc.boardgamearena.com/Studio) retains PHP 8.4 and separate
production/Studio database versions. The root/output correction changes authority
and labeling, not any of these framework interpretations. Original fixtures and
bounded unsupported-syntax treatment remain applicable; exact-source proof must
still pass before these observations earn admission.

Assemble this release preparation and backlog reconciliation before the complete
local gate. Retain actual failures. Push one tested preparation branch and one
draft PR, then validate all six source-CI records. Record admission in one bounded
ledger follow-up; evidence-only metadata does not make earlier CI cover a later
HEAD and does not require a recursive receipt-for-receipt loop.

This handoff stops before tagging. Retain the unsigned tested archive and fresh
isolated use/refusal/restart/immutability/exit/removal observations with their
actual identities. Framework admission and these observations make the next
candidate operation reviewable; they do not create a tagged candidate packet.

After tagging is separately authorized and admission is clear, use the existing
candidate builder at a clean source and a fresh write-once directory outside the
repository. It must run the complete gate, collect a fresh production/full-graph
dependency audit, compare the original packed archive with the tested digest and
require frozen-lockfile reconstruction to be byte-identical. Retain exact source,
environment and original packet/checksums. A failed or intermittent check blocks
preparation; an unchanged retry is not a fix.

## Remaining owner and artifact decisions

This preparation authorizes no merge, remote tag, hosted production, signature,
release publication or deployment. A local packet from a preparation branch is
not a trusted-main hosted original. The owner must review the draft and separately
authorize integration and an immutable remote tag before hosted production.
Candidate-specific signing and independent security/client/usefulness/public-
evidence gates must then evaluate the authentic original bytes. Publication is
a final, separate decision after those gates pass. No rejected rc.8 byte or
historical receipt may be overwritten to satisfy a new gate.

## Retained preparation failure

Exact-source run [39295263548](https://github.com/Brandon-Born/bga-mcp/actions/runs/39295263548)
at `6111e8f` failed its first Windows/Node 22 attempt: 1,023 tests passed and the
unqualified-wildcard test exceeded 30,000 ms. Its package installation plus three
independent layout sessions shared one test deadline. The correction moves that
installation to suite setup and makes each unchanged layout oracle a separate
test. No assertion, scenario, fixture or supported layout is removed; deadlines
and retry policy are unchanged. Failed-source logs remain retained and cannot
admit the ledger. New exact-source CI must prove this corrected harness.
