# First capability verification

> [!CAUTION]
> Historical evidence only. The [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md) reopened the associated backlog and manifest claims. Do not treat this record as current release verification.

Recorded: 2026-08-06. Covers BGA-100, BGA-101, and BGA-102, and closes part of BGA-015 and all of BGA-016.

`inspect_project` is the first capability `bga-mcp` advertises. This record states what it does, what proves it, and what it deliberately does not do yet.

## What the capability does

Given a project root the server was started with, `inspect_project` reports:

- the detected layout and, in plain language, why it was chosen;
- the game name and player counts, with the file they came from;
- which of twelve components are present, and which are expected for that layout but missing;
- the state machine where it can be read, including identifiers, types, actions, possible actions, and transitions;
- diagnostics in the shared contract for everything uncertain, missing, or unsupported.

It is read-only, uses no network, follows no links, and reads nothing outside the root.

## Evidence

The complete gate passed on Node 22.17.1 (macOS): 105 tests across 19 files, 92.00% statement, 89.67% branch, 92.12% function, and 92.14% line coverage of `src`, plus official conformance and every verification gate.

Eleven manifest-mapped scenarios run against the packed and installed artifact through a real MCP client:

| Scenario                           | Proves                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------- |
| E2E-INSPECT-PROJECT-MODERN         | Modern layout, metadata, components; directory hash unchanged          |
| E2E-INSPECT-PROJECT-LEGACY         | Legacy state machine read through the published schema; hash unchanged |
| E2E-INSPECT-PROJECT-UNRECOGNIZED   | An unknown layout is an error finding, never a clean result            |
| E2E-INSPECT-PROJECT-INVALID-INPUT  | Four malformed inputs are rejected by the published schema             |
| E2E-INSPECT-PROJECT-UNLISTED-ROOT  | A root the server was not started with is refused                      |
| E2E-INSPECT-PROJECT-UNCONFIGURED   | With no configured root, every project is denied                       |
| E2E-INSPECT-PROJECT-TRAVERSAL      | A path climbing out of an allowed root is refused                      |
| E2E-INSPECT-PROJECT-SYMLINK-ESCAPE | A link out of the root is reported and never followed                  |
| E2E-INSPECT-PROJECT-REDACTION      | A refusal carries a redacted path, not an absolute one                 |
| E2E-INSPECT-PROJECT-TIMEOUT        | Work beyond the deadline is aborted and reported                       |
| E2E-INSPECT-PROJECT-OUTPUT-LIMIT   | A result above the output budget is refused, not truncated silently    |

The two success scenarios hash the project directory before and after the call, so "read-only" is measured rather than asserted.

## What this closes

- **BGA-100** is `verified`. Detection scores nine independent signals; a project matching both templates or neither stays `unrecognized`, and a partial match is `likely` rather than `certain`.
- **BGA-102** is `verified`, with the manifest entry, the eleven scenarios, and runtime discovery agreeing.
- **BGA-016** is `verified`. The first public capability inherits the negative scenarios the item required: seeded key material behind a link and absolute paths in refusals are both proven absent from results.
- **BGA-015** moves from two proven decisions to seven-minus-two: traversal, symlink escape, unlisted roots, timeout, and output budget now fail through a real tool call. It stays `implemented` because unlisted remotes and missing mutation confirmation need a capability that reaches a remote or mutates something, which BGA-304 owns.

## What it does not do yet

- **Action contracts, notifications, and database usage** are absent from the model rather than reported as empty. Their parsers are BGA-107, BGA-108, and BGA-109, so BGA-101 stays `implemented`.
- **Modern class-based state definitions** are recognized and reported as unsupported syntax. No transitions are inferred from them; BGA-106 owns that work. The modern fixture therefore returns an `unsupported` diagnostic status, which is the intended honest result.
- **Metadata reading is textual.** Computed PHP values, constants, and includes are reported as unsupported constructs instead of being evaluated. The parsers never execute project code.
