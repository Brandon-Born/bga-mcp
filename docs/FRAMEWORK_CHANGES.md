# BGA framework changes

Brandon-Born owns framework monitoring, compatibility decisions and emergency response. Review the mapped official pages at least weekly, before candidate creation and before publishing new framework guidance. This is a maintainer cadence, not a background crawler: each network lookup requires one explicit selected page. `config/doc-sources.json` continues to forbid bulk crawling, local indexing and full-text retention. The local MCP still performs no network access.

## Detect and hold

`corepack pnpm framework:status` lists the official pages derived from the rule catalog plus the file reference, migration guide and Studio overview. It maps each page to existing BGA support claims and their scenario IDs. Foundational pages and any unmapped rule source conservatively affect all BGA claims. Node, operating-system and MCP protocol claims are separate. This mapping expresses review scope, not a new framework rule.

For one URL printed by status, run:

```
corepack pnpm framework:observe https://en.doc.boardgamearena.com/Studio_file_reference
```

Read that page and follow its construct-specific references before changing a parser or rule. The command keeps only a text digest and observation time in `config/framework-review.json`; page text is held in memory only. Changed text marks affected claims stale. Failed retrieval, absent baseline, expired observation or implementation/fixture changes hold publication as well. Fetch recovery and reverting a page to its old text do not silently clear a detected hold.

Existing compatibility `support` values and immutable signed releases are preserved. A hold is a separate review state, not a silent downgrade to `unknown`, a declaration that an older release stopped working, or a claim that the current local validators changed. `corepack pnpm framework:release` refuses any remaining hold. Candidate creation and inventory guidance generation call that same guard before writing new output. BGA-415 must use this guard before future package publication, and any later guidance publisher must do the same. Offline `pnpm check` checks the process and its tests; it cannot certify live source freshness.

The old `docs:drift --record` bulk baseline operation is retired. `docs:drift status`, `docs:drift observe URL` and `docs:drift review URL EVIDENCE REVIEWER CI_RUN` now use this same ledger. There is no implicit all-page fetch or automatic approval.

## Review, original fixtures and retest

Record the exact official quote, URL and ambiguity in the owning backlog item. Review deprecation and migration independently per file. The file reference says “These files are deprecated” about view/template files; the migration guide says “Then you can safely delete the gameoptions.inc.php file” after generating replacements. Neither means legacy forms disappeared. Keep old forms and partially migrated fixtures unless documented removal satisfies `docs/VERSIONING.md` and the version policy: a preceding minor deprecation, at least 90 days, verified successor and the next major. Ambiguous new syntax is unsupported until documented; never invent a rule to fill the gap.

Create or update original regression fixtures for the affected construct and its legacy/hybrid neighbours. Run the listed targeted scenarios first, then the complete `corepack pnpm check` on the committed implementation, and retain clean exact-source CI evidence. A passing fixture alone cannot release a hold. For each observed page, a named reviewer who has read the official wording can record admission:

```
corepack pnpm framework:review https://en.doc.boardgamearena.com/Studio_file_reference /absolute/path/verification-evidence.json Brandon-Born ACTUAL_CI_RUN_ID
```

The named run must be completed successful CI for that exact evidence source; the command reads only that run through the GitHub CLI. The evidence must match the trusted schema, retain its integrity digest and passing conformance, postdate the observation, have a clean ancestor source, pass the full gate, and include every mapped targeted scenario. Current source, scripts, configuration and original fixtures must match that evidence commit. The ledger retains the page, implementation and evidence digests, evidence commit, reviewer, fixture paths and passing scenario IDs. Changing implementation/fixtures invalidates admission. Commit the review metadata, rerun the offline gate and check `framework:release` before proceeding. The weekly observation can renew unchanged guidance without rereview; content changes or retrieval failure require a new review and post-observation retest.

## Emergency response

Within 24 hours of a credible breaking change, observe the exact official page, retain the affected release hold and open an owned backlog item with documented scope. Stop new affected guidance and packages immediately. Reproduce with original fixtures, report unsupported syntax rather than confident false findings, review security impact, and either fix and retest or explicitly disable/remove the capability under the compatibility/version policy. Coordinate disclosure through `SECURITY.md` if there is a vulnerability. Resume publication only after the same review admission and release guard pass. Notification to external people remains a human decision.

## Sources

[Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference) and [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) were fetched and read on 2026-10-02 UTC before implementation. Official sources determine BGA semantics; ownership, timing and publication holds above are this repository's process policy. This implementation adds no BGA parsing rule.
