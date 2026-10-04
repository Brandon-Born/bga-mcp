# MCP agent functionality wishlist

Started 2026-10-01 at the owner's request. The MCP should make an agent's BGA
development work easier. This note records work I still have to do around it,
the result I would like it to provide, and how we could test the benefit.

Observed friction now includes the three executed tasks in the
[BGA-424 evaluation](verification/AGENT_EVALUATION.md), as well as preparation and
generated-template regressions. Proposed benefits remain hypotheses; no time
savings have been measured.
This is a feedback log, not an executable backlog or a promise of support.
[BACKLOG.md](BACKLOG.md) remains the implementation queue.

## Read code without treating examples as code

**Observed during diagnosis and review.** Rc.2 reported a comment-only notification
method as a live handler and a comment-only PHP method in its action trace. I had
to inspect the actual JavaScript prototype and extract an original installed-command
reproducer to distinguish executable declarations from examples. A missing-handler
warning was suppressed; a clean-looking trace was insufficient evidence.

**Wish and owner.** BGA-431 must remove these phantom contracts while preserving
real supported methods, bindings and lexical contexts. This is a correctness fix
to existing tools, not a new capability. Its historical rc.2 correctness probe fails. The BGA-431 implementation
adds passing installed regressions; independently verified signed rc.3 and the explicit frozen-task repeat now
confirm the correction. See [carry-forward evidence](verification/AGENT_EVALUATION_CARRY_FORWARD.md). Explicit uncertainty is preferable when a reader
cannot establish executable context.

## Observations from the executed tasks

| Task      | Observed manual work                                                                                                               | Desired decision support                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnosis | Freeze a failing game assertion, inspect source separately, compare unchanged MCP diagnostics, adjudicate a phantom handler.       | Correct executable traces and a clear distinction between framework coverage and game-owned assertions. BGA-431 owns the parser miss; BGA-425 owns test-evidence research.                    |
| Feature   | Prepare selected roots, bind their digests, compare action/state/payload results and retrieve official framework pages separately. | A source receipt and a compact before/after comparison without hiding changed coverage. Existing action traces already supplied useful argument relationships.                                |
| Review    | Bind the frozen diff, run independent scoring/end-condition tests, interpret six SQL checks without verdicts.                      | Explain repeated unsupported causes and put independently identified test evidence beside the bounded framework verdict. No measured savings or new report-reading capability is established. |

**Signed rc.5 frozen-task confirmation, 2026-10-02 UTC.** The explicit
[BGA-424 repeat](verification/AGENT_EVALUATION_CARRY_FORWARD.md#signed-rc5-frozen-task-repeat)
again required constructing all five frozen source roots, checking each selected
file digest, comparing the 23 task calls and running independent game assertions.
Declaration inventories now match the independent oracles, while source selection,
compact before/after comparison, repeated SQL uncertainty and game-test context
remain manual work. The three task observations above still apply; no new
capability or measured saving is inferred from this repeat.

## Explain and select the source set

**Observed.** The mixed working folder, tracked export, and production subset
produce different coverage. I prepared separate roots and recorded selected
paths and digests manually, including 17-, 18- and 20-file roots in the formal tasks. BGA-429 fixes outside-source contamination, but
copies inside `modules/` remain eligible for contract reading. The rc.3 repeat
again required manual exports of the exact 17-, 18- and 20-file roots and private
digest comparisons; correctness is repaired, while this preparation friction remains.

**Current rc.4 rerun, 2026-10-02 UTC.** The original unsigned rc.4 artifact
`662c23199cdfd62365b1e94c6ec28bb61374e9d11eafd606f1f29ba1ec6ad200`
was used through native Codex on clean Dino Racer revision `83e2e50`.
The [separate current-root/export receipts](verification/rc4-dino-racer-rerun.json)
show 32 unsupported audit checks on the mixed root and six on an explicitly
selected 18-file production export. State/action/notification validators pass on
that export; computed SQL remains incomplete and one database audit check fails.
I still had to assemble a temporary root, retain every selected file digest and
keep the omitted local sources visible as a different coverage scope. There is
no source-selection MCP feature or measured effort saving in this observation.
This repeats the existing wish rather than assigning a new implementation owner.

**rc.5 confirmation, 2026-10-02 UTC.** The verified original rc.5 artifact
repeats this friction on the same clean Dino Racer revision `83e2e50`.
[Its separate root/export receipt](verification/rc5-dino-racer-rerun.json)
again records 32 unsupported checks on the whole root and six on the explicit
18-file export, with one failed database check in each. I still assembled and
digest-bound the export manually. This adds current-artifact evidence to the
existing source-selection and unchecked-SQL wishes; it does not establish a new
feature or a measured effort saving.

**Wish.** One readable receipt showing which files supplied each contract, which
were excluded and why, and which have unknown scope. An explicit caller-selected
source set could reduce snapshot preparation, provided omitted files remain
visible as a coverage limit. Git ignore and directory names must not silently
decide runtime scope.

**Next evidence.** Test whether I can identify the intended contracts and their
limits from that receipt without assembling a separate inventory. The current
[source-scope workflow](verification/PROJECT_SOURCE_SCOPE.md) is the workaround;
selection controls need a separate backlog owner and contract review.

**BGA-436 bounded follow-up, 2026-10-03.** Source-set investigation exposed a silent contract-read budget: an oversized eligible module stopped later reads without recording uncertainty. The shared loader now retains omitted paths and limits, reads later sources that fit, and prevents partial coverage from supporting absence-based conclusions. This improves existing validators and their located diagnostics; it does not yet provide a complete source receipt or caller-selected source set. The unchanged Dino Racer before/after comparison and installed boundary controls remain required evidence.

**BGA-437 bounded implementation, 2026-10-04.** Inspection and summary now expose
the complete bounded PHP/client/configuration eligibility, editor exclusions,
unknown-scope sources and other inventory in existing signal fields. Contract
reads consume the same PHP/client selection. This supplies source identification
on the full root without preparing an export; it does not remove unknown-scope
holds, determine which modules execute, or provide caller exclusions/content
hashes. Installed same-root and negative-control verification remain required.

## Explain what remains unchecked

**Observed.** One unreadable setup query leaves multiple pre-release checks
unsupported. I have to connect aggregate counts to the underlying limitation
and determine what evidence would close it. Scope uncertainty also repeats
across validation groups.

**Wish.** For each finding, show the relevant source ranges, the cross-file
reasoning, the checks blocked by uncertainty, and the smallest useful next step.
Group repeated causes while retaining their affected checks. Diagnostics already
have location, evidence, and suggestion fields; improve their content before
inventing another output format. Where a framework rule applies, link its reviewed
official source and distinguish a documented rule from a heuristic.

**Next evidence.** During diagnosis, record whether the output lets me choose a
correct next action without manually reconstructing the dependency. BGA-113 owns
explicit uncertainty; any richer explanation work needs scoped triage.

**BGA-435 implementation, 2026-10-03.** Pre-release explanations now use actual
validator-group unsupported findings, including their source positions and
suggestions, before aggregate truncation. Existing check reasons carry the
coverage limitation; the text groups repeated reasons with affected checks.
These remain group-level limitations, not independently proven per-check causes.
Installed layout/privacy/budget controls and the same-source Dino Racer rerun
are the required evidence. This does not measure effort savings or establish
game correctness.

## Read more generated SQL safely

**Observed.** Computed setup SQL in the unchanged generated baseline remains
unreadable, including in the selected production subset. I inspect it separately;
the MCP's database verdict remains partial.

**Wish.** Recognize additional bounded literal SQL construction patterns when
their table and column structure can be established statically. A literal format
string with placeholders is a candidate for research, not a verified parser rule.
Keep unresolved structure unsupported and never execute PHP or SQL to resolve it.

**Next evidence.** Fetch the relevant official documentation, extract an original
minimal fixture, and demonstrate both a readable pattern and an ambiguous case.
The [regression record](verification/GENERATED_TEMPLATE_REGRESSIONS.md) and
[source-scope rerun](verification/PROJECT_SOURCE_SCOPE.md) establish the remaining
limitation; BGA-434 now owns bounded reading of invariant formatted INSERT targets. Dynamic VALUES and possible suffixes remain explicit limits; no arbitrary SQL-construction support is promised.

**Setup-code follow-on, BGA-438, 2026-10-04.** The current setup call already has
a readable invariant INSERT target. Nested tuple `vsprintf` and joined VALUES
remain runtime-built, with suffix/escaping uncertainty. The bounded next step is
coverage triage against the installed trace and original controls; source selection
cannot establish statement completeness. Dynamic SQL support is not inferred.

## Follow one action or state

**Proposed.** Existing tools expose action and state relationships. I would like
a focused view for a named action or state: its client call, accepted arguments,
server entry point, readable transitions, and associated notification evidence,
with unresolved links marked explicitly.

**Next evidence.** Use an actual feature or diagnosis task to compare this focused
view with the existing full results. Add work only if it changes a decision or
removes repeated manual searching; this is not a claim that tracing is absent.

## Show what changed after an edit

**Observed workaround; proposed improvement.** During diagnosis and feature work I
compared private call results manually; the reload repair left structural findings
unchanged, while replacing sample notification sends changed the feature result.
After changing a game, I would like a comparison of new, resolved,
and unchanged findings, plus any gained or lost coverage. Bind both sides to
their source sets and server artifacts so a changed root or parser cannot look
like a successful game fix.

**Next evidence.** Record how I currently compare results during BGA-424, then
test whether a bounded comparison helps review. Existing validators remain the
baseline; no incremental-analysis capability or savings are established.

## Bring test evidence into the decision

**Proposed.** The formal diagnosis and review confirmed that framework checks alone
cannot settle scoring, turns, or end conditions. I would like a concise view of developer-owned test results beside
the diagnostics, identifying the tested revision, assertions, failures, and
stale or incomplete evidence. The agent would still run the tests.

**Existing owner.** [BGA-425](BACKLOG.md#bga-425--research-how-agents-receive-game-specific-runtime-test-evidence)
already asks whether a read-only report reader adds value beyond the agent's
existing tools. Use a real task to answer that question before adding a capability.
A passed test must not imply the whole game is correct.

## Get the relevant documentation with the finding

**Observed workaround and proposed improvement.** Framework adjudication required
separate official-page retrieval during preparation. I would like a finding to
lead directly to the relevant documented construct, including migration wording,
provenance, and an honest no-answer result when the documentation is silent.

**Existing owners.** Documentation retrieval exists in the development profile;
it is outside the local-only public release. BGA-211 and BGA-313 own relevance
and live evaluation, while BGA-411 owns accurate public and agent documentation.
Record whether retrieval actually answers the development question before
proposing diagnostic integration or expanding the release inventory.

**BGA-211 preparation, 2026-10-02 UTC.** A direct retrieval/cache probe on
BGA-423 source `e20e866`, using only original synthetic text, reproduces two
limitations: a warm lookup for a second question returns the first question's
passage although a cold lookup finds the second passage; a warm 1,200-character
request returns the 1,507-character excerpt previously selected at a 2,000-character
limit. The cache records page URL alone. This is supporting component evidence,
not an installed MCP result or a captured-page relevance evaluation. BGA-211's
next bounded step is an installed same-client, same-page two-question regression
and independent search/topic budget checks, followed by its reviewed minimal
captures and unchanged scoring thresholds. Search and resources currently have
separate caches and fixed per-reader limits; the component budget probe does not
establish a public cross-reader cache leak. Preserve page authority, retention,
untrusted labelling and the existing no-full-text storage boundary.

**Installed follow-up, 2026-10-02 UTC.** On clean source `0ac0055`, the actual
installed development MCP discovers search and reproduces the query-change miss
with original HTML/API responses: the same client asks `quasar navigation` then
`nebula orbital` for one page, and the second cached passage omits `orbital`; a
fresh client selects the passage containing it. Both clients exit with empty
stderr. The [bounded preparation receipt](verification/bga423-source-ci.json)
binds the unchanged package digest and source. This proves the warm-query defect
through installed stdio, not captured BGA relevance, live DNS/TLS or a public
documentation capability. BGA-211 still needs its regression, reviewed captures,
A/B scoring and live acceptance; no implementation or threshold change follows.

**Framework review observation, 2026-10-02 UTC.** The BGA-408 live baseline still
required a separate read of the Complete Walkthrough beside the canonical state
page to establish that BGA-419's conflict remains unresolved. A source link alone
does not answer which wording governs a finding. Preserve competing sources and
the unsupported decision together when considering this wish; the current
baseline maps eight catalog/foundational pages, not the entire wiki. No new
retrieval or supported-form claim follows from this review.

**BGA-211 implementation, 2026-10-02.** The installed development MCP now
separates cached excerpt selections by question, budget and final source; uses
reviewed paragraph/section hints; excludes navigation; and scores failed lookups
as failures even for no-answer cases. A deliberate installed live run passes all
nine unchanged questions and seven topics. Minimal attributed captures and an
installed negative control make the development loop offline. The original
historical five-question/three-topic replay remains unproven: the real old
package has a different failure set against current minimal captures. The next
bounded step is a reviewed historical source/ranking replay, retaining actual
source revisions and refusing invented evidence. Full source gates and separate
release admission still apply. See [relevance scope](verification/DOCUMENTATION_RELEVANCE.md).

## Capture wishes during real work

Whenever I need a workaround during BGA-424, add or update an entry here with:

- The task and identified artifact/source set, using only sanitized references.
- The actual MCP call or missing result, and what I had to do instead.
- The desired result and the development decision it should help me make.
- Whether the need is observed or proposed, and what evidence would test its value.
- Its existing backlog owner, or the decision that a new owner is needed.

Revisit entries after each feature, diagnosis, and review task. Keep resolved
observations with links to their fixes rather than erasing the history. Prefer
improvements to existing tools when they solve the need. Promote a wish into
BACKLOG.md only after defining scope, source-backed acceptance, verification,
version impact, and any trust-boundary changes. These wishes do not authorize
project writes, test execution by the server, or Studio operations.

## Refresh current-run evidence summaries safely

**Observed maintenance friction.** BGA-406, BGA-408 and BGA-405 each added valid scenarios or mitigations. Six typed current-run verification summaries then needed manual count updates after observing the full test/evidence output. On BGA-405, the new threat mitigation changed retained claims from 100 to 101 and exposed another stale counter after the tests passed. BGA-415 repeated the same named-six-file update after observing 673 passing tests, 208 required scenarios and 102 retained claims. Historical receipts and prose must stay frozen, so a broad replacement is unsafe.

**Wish.** A repository command that reads actual emitted evidence and previews precise updates to only explicitly typed current-run summary fields. It should preserve historical records, scoped review claims and statuses, refuse ambiguous markers, and never manufacture a passing test or promote a backlog item. This is repository maintenance tooling, not a new game-inspection MCP capability.

**Next evidence.** Compare that command with the named-six-file manual workflow and seed historical, ambiguous and stale-result inputs. BGA-017 owns evidence integrity; BGA-411 owns public inventory documentation and does not already automate these run-summary fields. A separate scoped maintenance backlog proposal is needed before implementation.

## See release holds across the candidate receipts

**Observed and addressed in BGA-415.** Readiness was spread across the security assessment, private-report lifecycle, framework ledger, client smoke, install-guide, public evidence and usefulness receipts. Comparing their actual candidate digests exposed rc.1 client/public-distribution records alongside rc.3 security/usefulness evidence. `pnpm release:status` now gathers those owned holds and requires candidate-specific receipts before publication. This is repository release tooling; adding a game-inspection MCP tool would not improve this task. The actual registry and publisher setup remain separately unverified.

## Advance one reviewed candidate without scattered selectors

**Additional observed bookkeeping, 2026-10-02.** The BGA-326 matrix raised the passing suite total from 674 to 712. The final evidence gate then refused six active verification-summary headers with the old total, requiring manual numeric edits although their dated scenario results and framework interpretations were unchanged. Desired help is a single generated current-run summary beside immutable historical observations. The next bounded step is to inventory which records are current summaries and which are historical, then propose generation and refusal controls that preserve source/artifact identity rather than rewriting dated evidence. This is repository verification tooling, not a project-writing MCP capability; no generator or gate change is implemented by this note.

**BGA-433 implementation, 2026-10-02.** The exact-path framework dependency gate now separates interpretation and proof identities, retains original review provenance and exempts reviewed release metadata from semantic invalidation. Unknown/shared inputs still hold; version-1 reviews require explicit migration. Focused mutation and installed lifecycle controls pass; full CI and actual admission are retained in the bounded BGA-433 record. Central candidate selection and a generated current-run summary remain separate wishes. This does not grant publication approval.

**Observed during rc.4 signing preparation.** Selecting the verified original
packet requires matching receipt constants in `release-signing.ts` and
`test-signed-release.ts`, plus the workflow concurrency group. Downstream
publication, security and evidence owners also retain their own candidate
identities. I have to audit those separately so a new signature cannot silently
carry an old candidate's approval. The framework ledger conservatively hashes
verification scripts too, so these signing-only constant changes require another
explicit eight-source re-admission after clean exact-source CI even though no
framework reader changed.

**rc.5 confirmation, 2026-10-02 UTC.** Advancing the independently verified
rc.5 packet again required both script constants and the concurrency group, then
explicit re-admission of eight unchanged decisions against fresh signer-source
CI. [The signing receipt](verification/release-signing-v1.0.0-rc.5.json) retains
that actual guard result. The preparation friction persists; no selection or
impact-scoped reuse feature has been implemented.

**BGA-400 confirmation, 2026-10-02 UTC.** The standalone installation runner
still selected rc.3 after the signing verifier advanced to rc.5. Its selector is
now aligned, and a clean committed run authenticates original rc.5 before
executing the unchanged guide recipes. The same broad framework digest again
requires eight unchanged decisions to be admitted against exact-source CI. This
is another observed instance of the existing wish, not an implemented central
selection feature.

**BGA-401 confirmation, 2026-10-02 UTC.** Advancing the native client
observation to signed rc.5 required the runner receipt selector, an independent
matrix candidate pin, the evaluated-receipt path and the identity-control test
selection. The actual clean native run passes; historical rc.1 and rc.4 identities
are refused even with current runner digests. This confirms why selection must
remain explicit without silently carrying old client evidence forward. The
central selection and impact-scoped review wish remains unimplemented.

**BGA-405 confirmation, 2026-10-02 UTC.** The security plan and offline
assessment verifier still selected rc.4 after install/client/usefulness evidence
advanced to rc.5. Selecting the authenticated rc.5 packet and refusing an actual
historical rc.4 assessment again requires exact-source CI and eight unchanged
official-page admissions. Publication prerequisites deliberately remain pinned
to historical receipts until their own handoff. This is further evidence for the
existing selection/impact wish; the actual broad guard is retained.

**BGA-415 confirmation, 2026-10-02 UTC.** Publication still selected rc.4
security/install/client/evidence/usefulness records after the five rc.5 owners
completed their separate observations. The explicit references now align with
rc.5, and each real historical rc.4 prerequisite is refused independently.
The publisher decision and external lifecycle remain null; alignment does not
advance either. This is another instance of scattered candidate selection,
not an implemented shared selector or impact-scoped admission feature.

**Wish.** A single reviewed, immutable candidate selection receipt with an
explanation of the downstream identities that still differ. Any impact-scoped
review reuse should show which implementation and fixture dependencies changed,
retain completed exact-source CI, and prove that changes to every actual framework
reader or applicable test still invalidate its mapped source decisions. An
arbitrary caller-selected receipt must never reach the identity-bearing job.
This is repository release tooling, not a game-inspection MCP capability.

**Next evidence.** Compare with the existing BGA-415 readiness report and current
BGA-404 constants before proposing an executable change. BGA-404 owns signing
selection, BGA-408 owns framework invalidation, and BGA-415 owns publication holds.
These observations do not relax the existing broad guard or transfer any approval.

**Additional observed release friction, 2026-10-02 UTC.** BGA-407's first rc.4
publication attempt passed preparation but emitted only a generic failure. I
had to separately fetch the retained plan and authenticated release list,
validate the exact plan/title/notes and inspect missing assets before safely
resuming the same empty draft. The underlying cause remains unknown; a
successful retry does not identify it.

**rc.5 repeat, 2026-10-02 UTC.** The same generic publication failure recurred
after successful preparation and left one matching empty draft, `401721181`.
I again fetched the hosted plan, compared both prepared packets, authenticated
the exact title/notes/identity and counted missing assets before resuming failed
jobs in the same run. [The rc.5 distribution receipt](verification/release-evidence-v1.0.0-rc.5.json)
records successful completion of that same record and independent public
validation. The first failure's cause remains unknown. This confirms the existing
bounded-stage-diagnostics wish; successful recovery does not implement it.

**Wish.** Bounded stage diagnostics for release tooling that identify which
operation failed and which reviewed record was reconciled, while withholding
tokens, private reports and unbounded subprocess output. Seeded errors should
prove both useful stage attribution and redaction before implementation.
BGA-407 owns this publication path; this is repository tooling, not a missing
game-inspection MCP capability. Existing identity and conflict refusals must
remain intact.

**Candidate guide observation, 2026-10-02 UTC.** The verified rc.4 packet still
carried a README calling rc.3 the latest candidate. Updating that phrase after
each signing would force another immutable candidate because shipped-guide
freshness compares exact bytes. BGA-411 now uses an explicitly versioned verified
acquisition example and asks readers to obtain another version's independent
receipt and matching verifier. The correction requires one new candidate;
future candidate creation alone need not rewrite this historical example.
This is documentation/release maintenance, not a new MCP inspection tool.

## See which operation phase remains after a timeout

**Observed debugging friction, 2026-10-02 UTC.** The Windows descriptor-read
probe returned a deadline failure with no read-start transcript. Distinguishing
expiry before the intended read from cleanup of a pending read required a
pre-imported test shim recording setup, primitive entry, expiry, completion and
response publication. The current timeout error identifies the operation and
budget but does not expose that phase or cleanup outcome. This observation
comes from repository regression debugging, not a measured real-game slowdown.

**Wish.** Opt-in, bounded timeout diagnostics identifying the operation phase,
elapsed time and whether cleanup settled or reached its ceiling. They should
contain no file contents, SQL values, credentials or private paths, and should
identify any unsupported or producer-observed field. Such a trace cannot imply
OS-level cancellation or whole-game correctness.

**Existing owner and next evidence.** BGA-326 owns cancellation and its
remaining native matrix. A public diagnostic addition requires a scoped
proposal, output/privacy review, updated contracts and installed-command cases
before implementation; this wish adds no public capability. Compare any
proposed trace with the independent controlled-probe oracle, including expiry
before I/O, pending completion, cleanup-ceiling and minimum-output-budget cases.

## Safe failures through the advertised executable

**Observed, 2026-10-02.** A missing-root Studio preflight bypassed the normal startup handler and printed an absolute path, Node stack and nested filesystem cause. The pinned stdio router also reports some startup/cleanup failures through callbacks, making a successful-looking close insufficient evidence. An agent reading these terminals needs an actionable stable refusal without private diagnostic data.

**Bounded next step and owner.** BGA-421 now supplies a common runner boundary, dependency-loading fallback, live credential registry and installed fault probes for both profiles. Its [bounded receipt](verification/bga421-source-ci.json) now records the passing full handoff and all six exact-source CI jobs on `4b9f889`, including every executable fault scenario. The process probes keep stdin open and use boolean leak assertions, so debugging a regression does not retain the seeded private transcript. This changes no BGA grammar or live Studio capability; a future terminal path must join the same boundary and fault suite.

**Observed CI diagnostic gap, 2026-10-02.** The post-BGA-433 metadata run `37025759118` failed Windows/Node 24's resource-root scenario because Node reported FileHandle garbage-collection cleanup. This run is not passing evidence. The current policy closes project/session descriptors in finally blocks, but that alone does not explain the observed warning. BGA-326's bounded follow-up is descriptor creation/explicit-close tracing in the installed resource scenario, with warning/leftover-handle controls and sanitized evidence. Do not suppress the warning or use an unchanged replay as proof of repair. This is lifecycle diagnosis, not a new game-inspection feature.

**Observed documentation authority gap, 2026-10-02.** During BGA-423 inspection, both the catalog and search independently classified pages by a raw URL prefix, and the policy returned the original source after redirects. An agent could therefore receive a neighbour's content labelled with Cookbook authority and retention, or a redirect destination with its starting source. Desired help is one final-page decision shared by requests, citations and caches. BGA-423 verifies that bounded correction with original installed network fixtures, raw-prefix refusal controls and [all six source-CI jobs](verification/bga423-source-ci.json) on `7a84f79` at 752 tests / 223 required scenarios. BGA-211 relevance and the remaining lifecycle scope stay open. Alias routing remains unreviewed rather than inferred.

## Avoid a full documentation fetch before a matching cache lookup

**Observed need, BGA-211, 2026-10-02.** Search and fixed-topic resources fetch a
page through policy before calling excerpt retrieval. A warm `cached: true`
selection therefore still incurs the upstream request. The corrected cache
prevents another question's excerpt from leaking into the answer; it does not
currently reduce those page requests or make an unreachable upstream available
through MCP readers.

**Wish and next bounded step.** Under BGA-203/BGA-211's existing cache-lifecycle
scope, design an installed test for warm request counts, conditional refresh,
expiry and unavailable-upstream fallback without guessing redirect destinations
or carrying an old page's authority to a new page. Keep final-source policy,
explicit dates, per-source retention and no full-page storage. This is a new
observed gap, not a claim that this behavior is already implemented.

**Implementation, 2026-10-02.** The [bounded reader lifecycle](verification/DOCUMENTATION_CACHE_LIFECYCLE.md) now checks exact final-page excerpts before page requests and covers refresh, outage fallback, question separation, final authority and refusal/deadline behavior through installed MCP. Redirect aliases remain live requests because their destinations are unknown; search API discovery also stays live. The unconditional-fetch control reproduces the warm request-count defect. No full-page or persistent cache is added. The complete local gate passes 768 tests / 234 scenarios, and the changed installed tarball passes live relevance at 9/9 questions and 7/7 topics. All six exact-source CI jobs pass on `e75be74a24de80b412cecaa9198dfdbfbcc3c6e9`; the [receipt](verification/bga208-cache-lifecycle.json) retains independently validated records and the earlier cancellation-observer failure/correction. The historical BGA-211 replay requirement remains open. Next bounded lifecycle work would require an observed API-discovery outage need; broader search-result caching would need separate ranking/freshness design rather than retaining API responses implicitly.
