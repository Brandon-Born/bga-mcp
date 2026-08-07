# Aggregate validation verification

Recorded: 2026-08-06. Covers BGA-112.

`validate_project` runs the four validators together. An aggregator is easy to build and easy to get quietly wrong, because the failure modes are all invisible: a part that silently drops out, a finding whose certainty is flattened on the way through, a truncated list that looks complete. This record states what stops each of those.

## The three guarantees

### A failed validator cannot hide

If a validator throws, its group is reported as `failed` with its public error code, and the run as a whole becomes `incomplete` — never `passed`, never merely `findings`. The groups that did run keep their findings, so a partial result is still useful without pretending to be whole.

An unexpected failure collapses to `internal.unexpected` through the same public error contract every capability uses, so a stack trace or a filesystem path cannot leak through the aggregate.

### Findings are reordered, never rewritten

Every finding arrives with the evidence, certainty, locations, and suggestions its validator produced, and leaves with them unchanged. A unit scenario compares a finding before and after aggregation for exact equality; `E2E-VALIDATE-PROJECT-MATCHES-PARTS` calls all four tools individually in the same connection and proves the aggregate agrees with each of them, group by group and finding by finding.

### A bounded result says what it dropped

When `maxFindings` truncates, the **least severe** findings are dropped first, so errors survive and information notes go first. Three things keep that honest:

- `truncation.omitted` reports how many were dropped.
- The merged summary describes exactly what was returned, so it stays consistent with the findings list.
- The per-group breakdown reports each validator's **full** finding count, so the totals reveal what the bounded list does not show.

## Evidence

The complete gate passed on Node 22.17.1 (macOS): 230 tests across 34 files, 96.34% statement, 87.30% branch, 98.82% function, and 96.24% line coverage of `src`, plus official conformance and every verification gate.

| Scenario                             | Proves                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------- |
| E2E-VALIDATE-PROJECT-MATCHES-PARTS   | The aggregate matches all four validators run individually                |
| E2E-VALIDATE-PROJECT-GROUP-SELECTION | Only the requested groups run; the rest are reported as skipped           |
| E2E-VALIDATE-PROJECT-BOUNDED         | The two errors survive a two-finding limit; the omitted count is reported |
| E2E-VALIDATE-PROJECT-PARTIAL-FAILURE | One validator fails, three still run, the run is `incomplete`             |
| E2E-VALIDATE-PROJECT-CLEAN           | A project every validator accepts is reported as `passed`                 |
| E2E-VALIDATE-PROJECT-INVALID-INPUT   | Five malformed inputs are rejected, including an unknown group name       |
| E2E-VALIDATE-PROJECT-UNLISTED-ROOT   | An unlisted root is refused, with the path redacted                       |

### Seeding a real partial failure

The partial-failure scenario does not use a mock. It copies the broken fixture and replaces `dbmodel.sql` with a file larger than the policy read budget, so `policy.output.too-large` is raised inside the database group and nowhere else. The other three validators complete normally against the same project.

That produces the exact evidence BGA-112 asks for — safe partial-failure reporting — through the real policy boundary rather than an injected error.

## Deliberate limits

- **Group selection is coarse.** Groups are whole validators; there is no per-rule selection. A rule catalog fine enough for that is BGA-110's work.
- **Truncation ranks by severity only.** Within a severity, ordering stays deterministic by code and location, but the tool does not try to judge which of two errors matters more.
- **The aggregate inherits every validator's limits.** It is legacy-layout only, because its parts are.
