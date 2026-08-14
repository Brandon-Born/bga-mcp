# Packaged public-boundary matrix verification

Recorded: 2026-08-09. Covers BGA-128, the completeness owner for the verification findings of the [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md).

```verification-record
{
  "kind": "run",
  "capabilities": 17,
  "scenarios": 164,
  "claims": 95,
  "tests": 564
}
```

## What was missing

The review reopened BGA-100, BGA-102 through BGA-114, and BGA-116 through BGA-123 because their acceptance criteria were not proven where they claimed to be proven. Nothing in the repository could say which criterion lacked which evidence: the backlog stated criteria in prose, the manifest listed scenarios, and no gate connected the two.

## The map

[`config/acceptance-map.json`](../../config/acceptance-map.json) holds every literal acceptance case of those items — 76 across 25 backlog items — and, for each, the assertions that prove it and the boundary it must be proven at. `pnpm verify:acceptance-map` refuses a case whose scenario:

- no runnable test declares,
- is declared outside `tests/e2e/` when the case says `packaged` — a source-launched server does not prove a packaged case,
- the retained evidence does not record, or records as anything but passed,
- or was proven against an artifact other than the one this run packed.

Six seeded defects — one per rule — must be rejected before it reports, and it prints the covered and uncovered counts on every run.

Enforcing it immediately found a dilution: three unit tests carried `E2E-PRE-RELEASE-…` identifiers, so the retained result for those scenarios included assertions that never started a packaged server. They keep their coverage and stop claiming to be the packaged evidence.

## What the fixtures now prove

`tests/fixture-integrity.test.ts` runs the readers and all four validators over every fixture and compares the outcome with the fixture's declared model and finding sets, so a fixture can no longer agree only with itself. Each fixture also states, in `represents`, which BGA behavior it stands for. The rule-catalog gate cross-checks `failingModern` against the modern defective fixture exactly as it already did for the legacy one.

## The cases closed here

| Case                                                          | Proven by                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| An empty project directory, and a partial layout              | E2E-INSPECT-PROJECT-EMPTY, E2E-INSPECT-PROJECT-PARTIAL                                                                          |
| A project whose files cannot be read, and a nested root       | E2E-INSPECT-PROJECT-UNREADABLE-FILES, E2E-INSPECT-PROJECT-NESTED-ROOT                                                           |
| Every capability against the part-migrated layout             | E2E-VALIDATE-{STATES,ACTIONS,NOTIFICATIONS}-HYBRID, E2E-AUDIT-DATABASE-HYBRID                                                   |
| A state declared in both sources is taken from the class      | E2E-INSPECT-PROJECT-HYBRID                                                                                                      |
| The four state rules that had no failing fixture              | E2E-VALIDATE-STATES-RULE-COVERAGE                                                                                               |
| Dynamic action, notification, and database syntax             | E2E-VALIDATE-ACTIONS-UNSUPPORTED-SYNTAX, E2E-VALIDATE-NOTIFICATIONS-UNSUPPORTED-SYNTAX, E2E-AUDIT-DATABASE-UNREADABLE-STATEMENT |
| Resource generations, bounds, unsupported syntax, and refresh | E2E-RESOURCE-STATES-GENERATIONS, E2E-RESOURCE-SUMMARY-BOUNDED, E2E-RESOURCE-DIAGNOSTICS-UNSUPPORTED, E2E-RESOURCE-REFRESH       |
| Redaction and default-root behavior for every project tool    | E2E-TOOLS-REDACTION, E2E-TOOLS-DEFAULT-ROOT                                                                                     |

Writing the permission-denied case found a real defect: a directory the process may not list made `inspect_project` fail with `internal.unexpected`. A refused directory is now recorded in the listing and reported as `project.listing.unreadable`, so what could not be read is visible instead of either crashing the call or silently vanishing from the result.

## What this does not claim

Every acceptance case of the reopened items is now proven at the boundary it names. That is completeness of coverage, not release verification: a capability still cannot be `verified` until CI has run the commit being claimed and conformance covers every protocol version it advertises, which BGA-005 and BGA-017 own.
