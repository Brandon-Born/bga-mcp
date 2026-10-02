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

**Wish.** One readable receipt showing which files supplied each contract, which
were excluded and why, and which have unknown scope. An explicit caller-selected
source set could reduce snapshot preparation, provided omitted files remain
visible as a coverage limit. Git ignore and directory names must not silently
decide runtime scope.

**Next evidence.** Test whether I can identify the intended contracts and their
limits from that receipt without assembling a separate inventory. The current
[source-scope workflow](verification/PROJECT_SOURCE_SCOPE.md) is the workaround;
selection controls need a separate backlog owner and contract review.

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
limitation; no new implementation owner has been assigned.

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

**Framework review observation, 2026-10-02 UTC.** The BGA-408 live baseline still
required a separate read of the Complete Walkthrough beside the canonical state
page to establish that BGA-419's conflict remains unresolved. A source link alone
does not answer which wording governs a finding. Preserve competing sources and
the unsupported decision together when considering this wish; the current
baseline maps eight catalog/foundational pages, not the entire wiki. No new
retrieval or supported-form claim follows from this review.

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

**Observed during rc.4 signing preparation.** Selecting the verified original
packet requires matching receipt constants in `release-signing.ts` and
`test-signed-release.ts`, plus the workflow concurrency group. Downstream
publication, security and evidence owners also retain their own candidate
identities. I have to audit those separately so a new signature cannot silently
carry an old candidate's approval. The framework ledger conservatively hashes
verification scripts too, so these signing-only constant changes require another
explicit eight-source re-admission after clean exact-source CI even though no
framework reader changed.

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
