# Working in bga-mcp

Instructions for any coding agent working in this repository, in the [AGENTS.md](https://agents.md) format. This file is canonical; `CLAUDE.md` points here so Claude Code reads the same rules. Change this file, not a copy of it.

`bga-mcp` is a local, read-only MCP server that inspects and validates BoardGameArena game projects. It reads a developer's project from disk and reports cross-file defects. It never writes to a project. Network access is off by default; explicitly enabled documentation and experimental Studio reads use the reviewed policy boundaries recorded in the threat model.

[docs/BACKLOG.md](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/BACKLOG.md) is the executable source of truth for planned work. [CONTRIBUTING.md](CONTRIBUTING.md) states the contribution rules; everything below is in addition to them.

For repository work, read the current checkout's `docs/BACKLOG.md`, `docs/TESTING.md` and `docs/THREAT_MODEL.md`; the immutable public links also serve installed-package readers.

## Current capability inventory and permissions

<!-- inventory:start -->

Generated in a repository checkout by `corepack pnpm docs:inventory` from the capability manifest, release selection, topic table and policy defaults; installed MCP discovery checks both profiles.

Network access is off by default. The public command excludes network surfaces and refuses network/Studio flags. In the development profile, `--allow-network` enables documentation search, topic reads and framework-version reads; Studio reads additionally require `--experimental-studio-logs`, an authorized account and session. The experimental Studio reader cannot read the browser-rendered log panel. No profile provides synchronization, uploads or other mutations.

Resource templates are URI patterns returned by `resources/templates/list`; concrete resources are individually listed URIs returned by `resources/list`. Counts below include each separately, including the fixed documentation-topic expansions.

**Public command (bga-mcp)**

Tools: 7; resource templates: 0; concrete resources: 3; prompts: 0. Discovery entries by manifest stability: verified 10, implemented 0, experimental 0. Network-backed entries: 0 (permission off by default).

| Kind      | Discovery name / URI        | Manifest stability | Trust boundary      | Network permission |
| --------- | --------------------------- | ------------------ | ------------------- | ------------------ |
| resources | `bga://project/diagnostics` | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/states`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/summary`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `audit_database_usage`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `inspect_project`           | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `run_pre_release_audit`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_action_contracts` | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_notifications`    | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_project`          | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_state_machine`    | verified           | TB-LOCAL-FILESYSTEM | local              |

**Development entry point (dist/cli.js)**

Tools: 10; resource templates: 1; concrete resources: 11; prompts: 0. Discovery entries by manifest stability: verified 10, implemented 11, experimental 1. Network-backed entries: 11 (permission off by default).

| Kind      | Discovery name / URI        | Manifest stability | Trust boundary      | Network permission |
| --------- | --------------------------- | ------------------ | ------------------- | ------------------ |
| resources | `bga://docs/client`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/cookbook`       | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/file-reference` | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/game-logic`     | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/migration`      | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/states`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/studio`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://framework/version`   | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://project/diagnostics` | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/states`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/summary`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| templates | `bga://docs/{topic}`        | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| tools     | `audit_database_usage`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `check_setup`               | implemented        | TB-LOCAL-FILESYSTEM | local              |
| tools     | `inspect_project`           | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `read_studio_logs`          | experimental       | TB-STUDIO-READ      | explicit opt-in    |
| tools     | `run_pre_release_audit`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `search_bga_docs`           | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| tools     | `validate_action_contracts` | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_notifications`    | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_project`          | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_state_machine`    | verified           | TB-LOCAL-FILESYSTEM | local              |

Manifest stability describes the recorded scenario coverage, not general game correctness. Implemented and experimental entries are excluded from the public release. The development protocol adapter remains implemented; it is not a verified public transport.
<!-- inventory:end -->

## Look up the BGA documentation before implementing a framework behavior

This project's entire value is that it models the BGA framework correctly. A rule built on a plausible-sounding assumption produces confident false positives in a developer's project, which is worse than reporting nothing.

So, before writing or changing any code that reads, parses, validates, or names a BGA construct — file layouts, state machines, action wiring, notifications, database access, metadata keys, client APIs, Studio behavior:

1. **Read the official documentation for that construct first.** Start at [the Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference) and follow it to the specific page. Fetch the page. Do not work from memory, from an existing fixture, or from the shape of the surrounding code.
2. **Quote what it actually says** in the backlog item, the code comment, or the commit message, and record the page URL under **Sources**.
3. **Read the deprecation and migration wording carefully.** The framework almost never removes an old form. "Deprecated", "legacy usage", and "you can then delete" mean both forms exist in real projects and both must be read. Assume the older form is still out there.
4. **Do not assume two options are exhaustive or coupled.** BGA migrations happen one file at a time. Two documented forms of five different files are more than two project shapes. This exact assumption — that a project is either wholly legacy or wholly modern — shipped and was wrong; see BGA-122.
5. **When the documentation is silent or ambiguous, say so.** Record it as an open question in the backlog item and make the code report unsupported syntax. Never guess and never let a guess become a rule that fires.

If a fetch fails or the page does not answer the question, stop and say what is unknown. Shipping an unverified assumption is not an acceptable fallback.

Community sources may inform a search but never justify a rule on their own. A rule based on convention rather than documented behavior is a heuristic and must be labeled one.

## Evidence, not assertion

- A backlog item becomes `verified` only when the gates in [docs/TESTING.md](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/TESTING.md) pass. Code existing is `implemented`, not `verified`.
- Never describe behavior as supported, complete, or working without a passing scenario. If something is not covered, say which part is not.
- A compatibility claim in `config/compatibility.json` needs a fixture and a passing scenario. `pnpm verify:compatibility` fails otherwise.
- A test that proves a manifest entry, mitigation, or claim declares its scenario identifier at the start of its title, e.g. `it('[E2E-INSPECT-PROJECT-HYBRID] …')`.

## Keep the documents in step

A change to public behavior updates, in the same change: the capability manifest (`config/capabilities.json`), its end-to-end scenario, the compatibility matrix (`config/compatibility.json` and `docs/COMPATIBILITY.md`), and the affected backlog item. Backlog IDs are permanent — supersede, never delete or reuse.

## Boundaries that fail CI if crossed

- Only `src/policy.ts` may import filesystem, network, or subprocess modules.
- Local capabilities do no network access. `tests/e2e/network-denied.ts` replaces every network primitive and records attempts.
- Crossing an unreviewed trust boundary in [docs/THREAT_MODEL.md](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/THREAT_MODEL.md) fails `pnpm verify:threat-model`. TB-STUDIO is unreviewed.
- Fixtures are original. Never copy a published game, and never add binary art or anything resembling a credential.

## Commands

```
pnpm check          # the full gate: format, lint, types, verifiers, coverage, package, conformance, safety
pnpm test           # all vitest suites
pnpm test:unit      # or test:integration, test:e2e
pnpm verify:compatibility   # and verify:scenarios, verify:rule-catalog, verify:threat-model
```

Run `pnpm check` before calling work done.
