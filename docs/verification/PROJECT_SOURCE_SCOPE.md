# Project source scope — BGA-429

Reviewed 2026-10-01. This decision fixes copied local source contaminating MCP
contracts while preserving the distinction between source inventory and execution.

```verification-record
{
  "kind": "review",
  "scope": "BGA-429 production-contract source selection, preserved API and local policy boundaries"
}
```

## Decision and sources

Fetched the [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference)
first, then its [main logic](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php)
and [client logic](https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js) pages.
The reference's modules section permits additional PHP includes and JavaScript;
its other-files section says additional files are not published in production:
“If you need them use modules/ directory.” It separately describes `misc/` as
storage not needed on production. This is a documented publishing boundary, not
proof of which files a development session executes.

The main-logic page documents PHP classes in `modules/php`, including subdirectories
and PSR-4 autoloading. The client page retains root `<game>.js` as legacy usage.
The [migration guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide)
retains older root game/action/view and configuration forms until individually
migrated. The [VSCode setup guide](https://en.doc.boardgamearena.com/Setting_up_BGA_Development_environment_using_VSCode)
gives synchronization examples and generator examples; those settings and Git
ignore files are not authoritative execution graphs.

Contract sources are therefore all PHP/JS/TS under `modules/`, and documented
root PHP/configuration/client forms, retaining both generations independently.
Existing root IDE helper and declaration-file exclusions remain in effect.
Additional local source remains inventoried, but supplies a located
`project.source.unsupported-syntax` finding instead of game contracts. The finding
explicitly says its execution scope is unknown and identifies the caller's choices.
Every individual validator retains that uncertainty; aggregate/resources and
pre-release cannot silently turn it into a clean verdict.

This does not determine dynamic imports or execute PHP/JavaScript. A copied or
unused module inside `modules/` remains eligible; neither a directory named
`tests` nor a Git ignore entry proves it is inactive. A source outside the documented
production locations may be used in Studio or by a local generator. Such execution
is outside the supported production-contract model, not declared impossible.

## Version and policy review

This is a behavior correction preserving the retained release contract. No tool,
resource, schema, export, declaration, CLI flag or configuration is added or changed.
Existing support for module subdirectories, legacy and hybrid projects is retained;
unknown local source is explicitly reported. The original signed candidate is
immutable and does not inherit this development build's verification.

The boundary remains TB-LOCAL-FILESYSTEM/TB-OUTPUT. Selection happens after normal
bounded inventory and before source-body reads consume the contract budget.
No Git/sync settings are read. Every source read still passes the existing policy,
root confinement, cancellation and output checks. The server never prepares or
writes a snapshot. Existing listing truncation/link/unreadability findings remain.

## Explicit source selection workflow

For an agent working in a mixed development folder:

1. Inspect the working root first and retain the located scope findings. They are
   evidence that its source set differs from the intended game source, not game defects.
2. Identify the canonical game source with the developer. Preserve runtime modules,
   including needed untracked or ignored files. A Git revision is a reproducible
   source selection only when it is actually the intended source set.
3. If needed, prepare a separate snapshot outside the mixed root using ordinary
   development tools. Record the original revision, selected relative paths and
   file digests. Never call it the same source set after excluding files.
4. Configure the existing `--project-root` with that snapshot's absolute path, then
   call inspection/validators through the installed public command. A root argument
   cannot expand the configured policy allowlist; omitted roots still follow the
   existing ambiguity rules.
5. Record findings and before/after digests against that exact root. Keep the
   original mixed-root findings alongside the snapshot result. Regenerate the
   selected snapshot when source changes; an old clean verdict says nothing about
   a newer working tree.

A clean snapshot is a bounded workaround for copies inside `modules/`, not an
implicit exclusion feature. A configurable exclusion model or execution-graph
reader would need its own backlog owner, version decision and threat-model review.

## Original regression evidence

`modern-source-scope-unreadable` extends only original repository fixtures. It
contains copied synthetic game sources, a generator, a disabled client example,
an ignored real module and the existing original IDE examples. No private game
source or publisher assets are copied into this repository.

- `E2E-PROJECT-SOURCE-SCOPE` invokes all seven tools and project resources through
  the installed public command. Inventory retains outside source; runtime traces
  contain no invented actions, duplicate notifications or false SQL from it.
  Unknown scope propagates into pre-release unsupported verdicts.
- `E2E-PROJECT-SOURCE-SELECTION` binds a clean verdict to a separately prepared,
  configured canonical root, refuses a different root and keeps the client usable.
  Legacy/hybrid root forms remain readable. Whole-source digests remain unchanged.
- `E2E-PROJECT-SOURCE-MODULES` detects a real notification in an ignored module
  outside `modules/php`, alongside retained outside-source uncertainty. A large
  unclassified source cannot consume the contract-read budget and hide that module.

## Executed local gate and real-project rerun

The complete local `pnpm check` passed on 2026-10-01: 617 tests, 188 required
retained scenarios, 17 capabilities, 99 claims, the unchanged installed public
contract, package checks, coverage, safety and applicable 2025-11-25 conformance.
The output-size regression discovered during implementation was corrected and
`E2E-RESOURCE-SUMMARY-BOUNDED` passes alongside the source-scope cases.

The separately installed development artifact SHA-256 is
`dcc306a935864ecdad783cdaccd09c4324e2b25758025f4fcfcd16fdb99ceb23`.
Its bytes match the artifact tested by the complete local gate. A real
`@modelcontextprotocol/client` 2.0.0 stdio client discovered and called all seven
local tools on each explicitly identified source set. All calls succeeded;
before/after recorded source digests matched per call and per session, and stderr
was empty. Raw reports and selected-path digests remain private.

The game revision is unchanged at `12ff03affa31545c1e115530c97027a3c5a37f09`.
The working-root digest record covers 68 game/template files, including the copied
baseline; Git, test cache and unrelated private receipts are outside that digest
record. The full tracked export contains 42 files. The canonical production subset
is a separate caller-prepared root: 20 unchanged baseline files in root/module/art/
storage locations, explicitly excluding the five other template build-input files.
Every selected file matches the original baseline manifest's digest. These are
three different source sets; a clean subset verdict is not a clean working-root verdict.

| Source set                 | Observed production-contract result                                                                                              | Scope uncertainty                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Mixed working root         | Actual sends/queries only; backup notification duplication, helper calls and SQL duplication removed.                            | One located scope finding identifies 16 outside sources in every individual validator. |
| Full tracked export        | Same actual runtime findings; tests, compiler inputs, scripts and standalone rule source supply no BGA contracts.                | One located scope finding identifies 7 outside sources.                                |
| Explicit production subset | Project/state/action checks have zero findings. Existing unmatched `pass` notification and unreadable computed setup SQL remain. | None from source selection.                                                            |

Aggregates retain each requested group's scope uncertainty, so the same scope
finding may appear for multiple groups; it is not a duplicate runtime contract.
The mixed/tracked pre-release audits report 0 passed, 2 failed, 31 unsupported and
8 manual-required. The selected production subset reports 25 passed, 2 failed,
6 unsupported and 8 manual-required. No source set is claimed release-ready.

Exact-source [CI 36932134751](https://github.com/Brandon-Born/bga-mcp/actions/runs/36932134751)
passed all six Ubuntu/macOS/Windows jobs on Node 22/24 at implementation commit
`02257ed9291a208be00edfc4b9eb0db9de651477`. Retained evidence identifies clean
source, 617 passing tests and 188 passing required scenarios in every environment.
BGA-429 is verified for the bounded production-contract scope above.
The original signed candidate remains unchanged and unpromoted. This regression
rerun does not complete BGA-424's independent development evaluation.

## Contract-source read limits — BGA-436

The shared contract loader now reports each eligible PHP/client source omitted
by its existing shared 262,144-byte or 200-file limit as
`project.source.read-limit`. It records relative locations, the applicable limit
and language without reading skipped bodies. An oversized file is skipped;
later files that fit remain eligible. Empty files count toward the file limit.
These limits cover the contract-source pass; they are not a claim about every
structural-model read or OS primitive.

Individual validators and the state/diagnostics resources retain these findings.
Pre-release checks retain group-wide uncertainty with BGA-435's explanations.
Readable traces and independent state/schema defects remain visible; conclusions
that require missing declarations or all queries are withheld. Notification
heuristics are conservatively withheld on partial source coverage. Omitted PHP
also prevents action naming/argument comparisons where unread resolution could
change the applicable entry point. A model-only inspection/summary is a distinct
structural inventory and does not pretend to have requested every contract body.

The source-set workflow above still applies. No caller exclusion, snapshot write,
network permission, new public schema or whole-game correctness is introduced.
The installed byte-limit scenario covers modern/legacy/hybrid projects; the
file-limit scenario covers the modern layout, redaction and output refusal.
Controlled original modules prove this limit; unchanged Dino Racer currently
fits within it and remains a separate before/after verification subject.

## Complete-repository source receipt — BGA-437

Point the installed public MCP at the complete game root and call `inspect_project`
first. `detection.signals` now contains a complete partition of the bounded listed
files (the older layout/component lists remain display-capped):

| Signal                          | Meaning                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `source.selected.php`           | Eligible PHP contract inputs, including all modules and retained root forms            |
| `source.selected.client`        | Eligible JS/TS contract inputs, excluding declarations                                 |
| `source.selected.configuration` | Root schema and JSON/JSONC configuration candidates; contents are not all validated    |
| `source.excluded.editor`        | Root `_ide_helper.php` and all TypeScript declarations                                 |
| `source.unknown`                | Outside PHP/JS/TS whose execution scope is unsupported; bodies do not supply contracts |
| `source.inventory.other`        | All remaining listed paths, including assets and tooling; no assertion they are unused |

The contract loader consumes the two eligible contract groups. Inspection and the
summary resource show eligibility, not a receipt of every body read by every
validator. Contract-read limits retain their omitted paths; listing truncation,
skipped links and unreadable directories retain independent findings. A location
inside `modules/` establishes eligibility, not execution. Git ignore and naming a
folder `tests` cannot exclude a module. No path list is silently shortened: final
output refusal applies to the entire receipt. Text previews six paths per group
and names the number retained in structured signals.

An agent can now identify and inspect the production-contract candidates directly
from the full root without exporting files first. Run the validators on that same
root and retain unknown-scope/coverage findings. This does not clear full-root
uncertainty. A separately prepared snapshot remains a different source identity
under the earlier workflow; its verdict must never replace the full-root verdict.
The published original rc.6 archive is unchanged and does not acquire this behavior.

## Independent database facts — BGA-439

Full-root scope and contract-read omissions still hold every query-dependent
database check. The [bounded database-check witness](DATABASE_CHECK_COVERAGE.md)
can independently establish availability from an actual schema read and query
reference, plus duplicate-declaration absence for a wholly inert schema. Those
limited passes do not clear source/read uncertainty, validate runtime SQL or
replace the full-root verdict with a selected snapshot's verdict. The existing
database trace and diagnostic resources retain their unsupported findings.
