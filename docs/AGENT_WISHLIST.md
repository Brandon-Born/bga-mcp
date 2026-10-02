# MCP agent functionality wishlist

Started 2026-10-01 at the owner's request. The MCP should make an agent's BGA
development work easier. This note records work I still have to do around it,
the result I would like it to provide, and how we could test the benefit.

Observed friction comes from project preparation and the generated-template
regression runs. The formal [BGA-424 evaluation](AGENT_DEVELOPMENT_PLAN.md) has
not run. Proposed benefits are hypotheses; no time savings have been measured.
This is a feedback log, not an executable backlog or a promise of support.
[BACKLOG.md](BACKLOG.md) remains the implementation queue.

## Explain and select the source set

**Observed.** The mixed working folder, tracked export, and production subset
produce different coverage. I prepared separate roots and recorded selected
paths and digests manually. BGA-429 fixes outside-source contamination, but
copies inside `modules/` remain eligible for contract reading.

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

**Proposed.** After changing a game, I would like a comparison of new, resolved,
and unchanged findings, plus any gained or lost coverage. Bind both sides to
their source sets and server artifacts so a changed root or parser cannot look
like a successful game fix.

**Next evidence.** Record how I currently compare results during BGA-424, then
test whether a bounded comparison helps review. Existing validators remain the
baseline; no incremental-analysis capability or savings are established.

## Bring test evidence into the decision

**Proposed.** Framework checks alone cannot settle scoring, turns, or end
conditions. I would like a concise view of developer-owned test results beside
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
