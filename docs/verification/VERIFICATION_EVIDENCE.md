# Verification evidence

Recorded: 2026-08-07. Covers BGA-012, the last Phase 0 item.

Every `verified` in this repository has so far been a claim a reader had to take on trust: the gate passed on someone's machine, and the backlog says so. This artifact is that claim written down by the run itself.

## What is recorded

`pnpm check` ends by writing `.artifacts/verification-evidence.json`, described by [`config/evidence.schema.json`](../../config/evidence.schema.json):

- **Where it came from** — the commit, and whether the tree was clean. A dirty tree is recorded rather than refused, because the field is what tells a reader the run is not reproducible from the commit alone.
- **What was run** — the package version, the `pnpm-lock.yaml` digest, the Node version, platform, architecture, package manager, and whether it was CI.
- **What the protocol did** — the supported versions, the transports, and every conformance check the official CLI recorded for the candidate.
- **What each capability proved** — every entry in the capability manifest, with the result of each scenario it requires, down to the test file and title that produced it.

## The three properties that make it evidence

**It records absence.** A required scenario with no test in the run is `missing`, not omitted. A capability with a missing or failed scenario cannot be `passed`, and the gate fails when something advertised as `verified` is anything less. `GATE-EVIDENCE-COVERAGE` proves this on a manifest requiring two scenarios where only one ran: the artifact reports the other as `missing` and the capability as `missing`, rather than looking complete by leaving it out.

**It is sealed.** `integrity` is a SHA-256 digest over a canonical serialization of the document with that field removed, so key order cannot change it and any later edit breaks it. `GATE-EVIDENCE-TAMPER` relabels a failed scenario as passed — the edit a reader would most want to catch — and shows the digest no longer matches, while a document reserialized with every object's keys reversed still seals identically.

**It is scanned before it is written.** A test title or a file path is the plausible way a credential reaches a published artifact, so the emitter refuses to write a document containing a known credential format, and the gate scans the file again. `GATE-EVIDENCE-REDACTION` seeds a credential into a test title and shows it is found and reported masked. Both scenarios belong to `TM-ARTIFACT-SCAN`, which now covers the evidence file as well as the conformance and coverage output.

## The gate fails on demand

Like every other `pnpm verify:*` command, `pnpm verify:evidence` builds five defective documents and requires itself to reject each one before it looks at the real artifact: a wrong schema version, a capability dropped from the document, a scenario that did not run, a field edited after sealing, and a credential in a test title.

## What it does not do

`pnpm evidence` records a run; it never creates one. It reads the Vitest results and conformance output `pnpm check` has already produced, so the artifact always describes the run that gated the change rather than a second, different run. It follows that evidence produced without a preceding test run describes that stale run — the `generatedAt`, `source.commit`, and `source.clean` fields are what a reader checks before trusting it.

Signing and per-release publication are BGA-404 and BGA-407. This item produces the artifact and proves it cannot quietly lie; distributing it with a signature is release work.

## Current run

11 capabilities, 75 required scenarios, all passed; 284 tests passed; conformance passed on protocol 2025-11-25.
