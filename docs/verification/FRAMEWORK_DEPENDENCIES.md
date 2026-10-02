# Framework dependency review

```verification-record
{ "kind": "review", "scope": "BGA-433 interpretation and proof dependency gate" }
```

BGA-433 replaces repository admission's broad implementation digest with separate semantic and proof identities. It changes no MCP surface, supported BGA grammar, original signed candidate, security approval or publication authorization. The exact-path map and trusted schemas are reviewed with the gate implementation. The bounded source-CI/admission record is [bga433-source-ci.json](bga433-source-ci.json); it states actual results and source identities, including any pending step.

## Mapping and refusal controls

| Input                                                                                                                           | Identity / hold                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Shared reader, policy, governing claim/catalog, source decision, dependency map or gate                                         | Semantic review and affected proof                                                                                           |
| Affected claim fixture                                                                                                          | Semantic review for its mapped sources; unmapped fixture roots conservatively shared                                         |
| Runnable affected scenario and relative import closure                                                                          | Proof refresh; original interpretation reviewer/date/evidence commit preserved                                               |
| Unit controls, explicitly shared tests without a source-specific scenario mapping, and shared test/evidence/conformance tooling | Shared proof refresh                                                                                                         |
| Explicitly mapped publication selector or historical receipt                                                                    | No interpretation/proof change unless reached as an actual import dependency; independent release/security gates still apply |
| New/unmapped, renamed, deleted, ignored or untracked relevant file                                                              | Conservative hold; no path-wide exemption                                                                                    |
| Missing runnable scenario, ambiguous assignment, computed/unresolved module import or non-regular dependency                    | Conservative hold                                                                                                            |
| Expired/unavailable/changed official page                                                                                       | Existing source hold, independent of dependency identities                                                                   |

The cross-file model is deliberately shared across all eight sources. This implementation does not claim precise per-parser isolation: it removes unrelated release bookkeeping and distinguishes proving-test changes, while fixtures and runnable scenario paths provide finer impact scopes. A future narrowing needs reviewed dependencies and counterexamples. Broad governing documents still conservatively participate. Only a fenced Markdown `verification-record` count block is omitted from semantic text; all surrounding prose remains significant and the evidence gate checks the block independently.

The one generated import in the installed-package test is explicitly mapped by exact expression to its source API closure, build inputs and installation oracle. Unknown/edited expressions and all runtime computed imports hold; the independent installed artifact digest check remains required.

Twenty new mutation/inventory controls use the real repository map and original fixtures. They exercise reader/shared policy, fixture, governing claim/catalog, source decision, publication selector, receipt, proof change, unknown/new/untracked/ignored input, rename/delete, symlink, ambiguous import, import overriding an exemption, missing runnable declaration, schema/integrity, legacy migration and source freshness. The proof-refresh function is tested for preserving the original interpretation provenance and refusing a changed reader. The updated installed lifecycle uses version-2 scoped identities while still inspecting the original generated-template statistics forms through the public MCP. Its source-change and evidence objects are synthetic process controls, not a live framework admission.

## Migration and evidence boundaries

Migration archives the version-1 ledger once, preserves observation digests/times, clears its broad reviews and requires new scoped reviews. It does not attach current identities to historical evidence. Successful review/retest still requires trusted-schema and integrity-checked, clean post-observation exact-source CI evidence, passing targeted scenarios/conformance, a successful complete named CI run, an ancestor source and matching affected paths. Proof refresh cannot change an interpretation review or clear changed-source holds.

Status names current/reviewed identities, changed semantic/proof paths, affected sources/claims/scenarios and hold reasons. It retains both the original interpretation commit and latest proof commit. Carry-forward never claims old evidence is an exact-HEAD run and never transfers artifact/signature/security approval. The full implementation handoff runs one complete gate; the bounded metadata-only CI/admission handoff uses scoped checks without a recursive receipt-for-receipt CI requirement.

## Sources

[Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference) and [migration guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) were fetched and read on 2026-10-02. The file reference says “These files are deprecated”; the guide says “Then you can safely delete the gameoptions.inc.php file”. Existing independently migrated legacy/modern forms are retained. This mapping is repository policy and adds no BGA semantic rule. The six remaining official construct/version pages were fetched and their affected existing wording checked the same day before scoped baseline admission; state-class initial fallback still says “to be confirmed” and remains unsupported rather than guessed.
