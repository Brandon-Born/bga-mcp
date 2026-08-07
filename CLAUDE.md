# Working in bga-mcp

`bga-mcp` is a local, read-only MCP server that inspects and validates BoardGameArena game projects. It reads a developer's project from disk and reports cross-file defects. It never writes to a project and never opens a network connection.

[docs/BACKLOG.md](docs/BACKLOG.md) is the executable source of truth for planned work. [CONTRIBUTING.md](CONTRIBUTING.md) states the contribution rules; everything below is in addition to them.

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

- A backlog item becomes `verified` only when the gates in [docs/TESTING.md](docs/TESTING.md) pass. Code existing is `implemented`, not `verified`.
- Never describe behavior as supported, complete, or working without a passing scenario. If something is not covered, say which part is not.
- A compatibility claim in `config/compatibility.json` needs a fixture and a passing scenario. `pnpm verify:compatibility` fails otherwise.
- A test that proves a manifest entry, mitigation, or claim declares its scenario identifier at the start of its title, e.g. `it('[E2E-INSPECT-PROJECT-HYBRID] …')`.

## Keep the documents in step

A change to public behavior updates, in the same change: the capability manifest (`config/capabilities.json`), its end-to-end scenario, the compatibility matrix (`config/compatibility.json` and `docs/COMPATIBILITY.md`), and the affected backlog item. Backlog IDs are permanent — supersede, never delete or reuse.

## Boundaries that fail CI if crossed

- Only `src/policy.ts` may import filesystem, network, or subprocess modules.
- Local capabilities do no network access. `tests/e2e/network-denied.ts` replaces every network primitive and records attempts.
- Crossing an unreviewed trust boundary in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) fails `pnpm verify:threat-model`. TB-STUDIO is unreviewed.
- Fixtures are original. Never copy a published game, and never add binary art or anything resembling a credential.

## Commands

```
pnpm check          # the full gate: format, lint, types, verifiers, coverage, package, conformance, safety
pnpm test           # all vitest suites
pnpm test:unit      # or test:integration, test:e2e
pnpm verify:compatibility   # and verify:scenarios, verify:rule-catalog, verify:threat-model
```

Run `pnpm check` before calling work done.
