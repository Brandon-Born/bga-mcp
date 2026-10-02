# BGA framework changes

Brandon-Born owns framework monitoring, compatibility decisions and emergency response. Review the mapped official pages at least weekly, before candidate creation and before publishing new framework guidance. This is a maintainer cadence, not a background crawler: each network lookup requires one explicit selected page. `config/doc-sources.json` continues to forbid bulk crawling, local indexing and full-text retention. The local MCP still performs no network access.

## Detect and hold

`corepack pnpm framework:status` lists the official pages derived from the rule catalog plus the file reference, migration guide and Studio overview. It maps each page to existing BGA support claims and their scenario IDs. Foundational pages and any unmapped rule source conservatively affect all BGA claims. Node, operating-system and MCP protocol claims are separate. This mapping expresses review scope, not a new framework rule.

For one URL printed by status, run:

```
corepack pnpm framework:observe https://en.doc.boardgamearena.com/Studio_file_reference
```

Read that page and follow its construct-specific references before changing a parser or rule. The command keeps only a text digest and observation time in `config/framework-review.json`; page text is held in memory only. Changed text marks affected claims stale. Failed retrieval, absent baseline, expired observation or interpretation/proof dependency changes hold publication as well. Fetch recovery and reverting a page to its old text do not silently clear a detected hold.

Existing compatibility `support` values and immutable signed releases are preserved. A hold is a separate review state, not a silent downgrade to `unknown`, a declaration that an older release stopped working, or a claim that the current local validators changed. `corepack pnpm framework:release` refuses any remaining hold. Candidate creation and inventory guidance generation call that same guard before writing new output. BGA-415 must use this guard before future package publication, and any later guidance publisher must do the same. Offline `pnpm check` checks the process and its tests; it cannot certify live source freshness.

The old `docs:drift --record` bulk baseline operation is retired. `docs:drift status`, `docs:drift observe URL` and `docs:drift review URL EVIDENCE REVIEWER CI_RUN` now use this same ledger. There is no implicit all-page fetch or automatic approval.

## Review, original fixtures and retest

Record the exact official quote, URL and ambiguity in the owning backlog item. Review deprecation and migration independently per file. The file reference says “These files are deprecated” about view/template files; the migration guide says “Then you can safely delete the gameoptions.inc.php file” after generating replacements. Neither means legacy forms disappeared. Keep old forms and partially migrated fixtures unless documented removal satisfies `docs/VERSIONING.md` and the version policy: a preceding minor deprecation, at least 90 days, verified successor and the next major. Ambiguous new syntax is unsupported until documented; never invent a rule to fill the gap.

Create or update original regression fixtures for the affected construct and its legacy/hybrid neighbours. Run the listed targeted scenarios first, then the complete `corepack pnpm check` on the committed implementation, and retain clean exact-source CI evidence. A passing fixture alone cannot release a hold. For each observed page, a named reviewer who has read the official wording can record admission:

```
corepack pnpm framework:review https://en.doc.boardgamearena.com/Studio_file_reference /absolute/path/verification-evidence.json Brandon-Born ACTUAL_CI_RUN_ID
```

The named run must be completed successful CI for that exact evidence source; the command reads only that run through the GitHub CLI. The evidence must match the trusted schema, retain its integrity digest and passing conformance, postdate the observation, have a clean ancestor source, pass the full gate, and include every mapped targeted scenario. The affected interpretation and proof paths must match that evidence commit; explicitly unrelated receipts may differ. The version-2 ledger retains the page digest, semantic/proof dependency snapshots, original interpretation evidence commit, separate latest proof evidence, reviewer, fixture paths and passing scenario IDs. Commit the review metadata and run the offline policy gate plus `framework:release`; do not manufacture another exact-HEAD CI claim for that metadata-only commit. The weekly observation can renew unchanged guidance without rereview; content changes or retrieval failure require a new review and post-observation retest.

## Scoped dependency identity (BGA-433)

`config/framework-dependencies.json` is an exact-path, reviewed map. Semantic inputs include the shared cross-file readers/rules, governing claims, source decisions and the review gate itself. They remain conservative across all eight pages because the validators share one project model. Claim fixtures are mapped by the compatibility matrix; fixtures outside that mapping are shared conservatively. Proof inputs include affected runnable scenario declarations, unit controls, shared test/evidence/conformance tooling and relative import closure. Static imports, re-exports, type imports, literal dynamic imports and `require` participate. Computed or unresolved module dependencies hold admission except an exact reviewed proof-only generated-import expression with explicit tracked inputs. The installed-package API import has that bounded mapping; edited/new expressions fail closed and no runtime import receives an exemption. An imported dependency cannot hide behind an unrelated-file exemption.

Changed interpretation inputs need official-wording review and current proof. Changed proof inputs need current proof without replacing the original interpretation reviewer, date or evidence commit. Status reports affected URLs, claims, scenarios, separate changed paths and explicit hold reasons. It shows the reviewed semantic identity and original evidence commit alongside the latest proof commit; carry-forward is never described as exact-HEAD evidence.

Explicitly mapped publication/signing selectors, historical receipts and separate release tooling do not invalidate interpretations merely by changing. Their artifact, signature, security, private-report and publication gates remain independent and mandatory. New files receive no directory-wide exemption. Unknown inputs, missing mapped inputs, untracked or ignored relevant files, symlinks, absent runnable scenarios and ambiguous assignments hold conservatively. Run-count blocks in Markdown are omitted from semantic hashes only; `verify:evidence` still checks those counts, and every other prose byte remains significant. Broad shared documentation still requires review when its semantic prose changes; this is deliberately not an automatic interpretation of arbitrary documentation edits.

Version-1 digests are historical and cannot be reinterpreted as scoped approval. Explicitly run:

```
corepack pnpm framework:migrate
```

This writes the original ledger once to `docs/verification/framework-review-v1.json`, retains its observations in version 2, clears reviews and requires all eight scoped baselines. It refuses a second migration or an existing archive instead of overwriting history. After actual clean, successful exact-source CI, use `framework:review` for each affected page. No synthetic test, migration or local dirty run admits the live ledger.

For a proof-only change after a valid interpretation baseline, use:

```
corepack pnpm framework:retest OFFICIAL_URL /absolute/path/verification-evidence.json REVIEWER ACTUAL_CI_RUN_ID
```

It applies the same trusted-schema, evidence-integrity, post-observation, targeted-scenario, conformance, clean source, ancestor and completed exact-source CI checks as review. It refuses changed/missing interpretations or unresolved mappings and preserves the original interpretation provenance. There is no new MCP capability, network permission, project write or BGA grammar here. The original signed candidate is unchanged.

## Emergency response

Within 24 hours of a credible breaking change, observe the exact official page, retain the affected release hold and open an owned backlog item with documented scope. Stop new affected guidance and packages immediately. Reproduce with original fixtures, report unsupported syntax rather than confident false findings, review security impact, and either fix and retest or explicitly disable/remove the capability under the compatibility/version policy. Coordinate disclosure through `SECURITY.md` if there is a vulnerability. Resume publication only after the same review admission and release guard pass. Notification to external people remains a human decision.

## Sources

[Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference) and [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) were fetched and read on 2026-10-02 UTC before implementation. Official sources determine BGA semantics; ownership, timing and publication holds above are this repository's process policy. This implementation adds no BGA parsing rule.
