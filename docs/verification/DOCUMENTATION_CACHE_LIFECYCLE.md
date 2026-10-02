# Documentation reader cache lifecycle

```verification-record
{"kind":"review","scope":"BGA-208/BGA-211 installed development reader cache request counts, question separation, source retention, refresh and dated fallback; no public network admission or historical relevance waiver"}
```

Reviewed 2026-10-02. Search and fixed-topic resources previously fetched a complete
upstream page before asking their excerpt cache, so `cached: true` did not reduce
requests and readers could not use their dated fallback during an outage.

The readers now share a page lookup that checks explicit network permission and
the existing lexical/source URL guard before consulting the cache. Each key binds
the exact final URL, original question, passage-selection query, excerpt budget,
source identifier and authority. Entries retain only the shown excerpt, dates and
provenance in the existing bounded process-local LRU. Whole-day age and existing
source limits are unchanged: expiry is past 7 days for Cookbook and past 30 days
for the maintained reference. Expiry triggers a full policy fetch; successful
refresh replaces the matching selection. No ETag/304 protocol, full-page retention,
API response cache, persistence, new permission or project write is introduced.

A matching expired selection can survive an upstream fetch failure, carrying its
original retrieval/last-modified dates and explicit stale age. Search records that
failed refresh as degraded; API edit dates are omitted on cached excerpts because
they do not date the retained content. Unmatched questions still fail when nothing
answers. Policy refusals and deadlines propagate without fallback.

Redirect aliases always fetch. The final page determines authority and retention;
its cache can be used only once policy establishes that destination. No alias map
is stored, and failed or refused alias requests cannot retrieve an earlier
destination. A direct page becoming a redirect invalidates its old selections
when the successful refresh establishes the change. A still-fresh direct entry
is a dated snapshot, not a statement that upstream has not changed since retrieval.

`tests/e2e/docs-cache-lifecycle.test.ts` installs the shared tarball, discovers and
calls actual development MCP with one live client per case. Original synthetic
upstream prose tests lifecycle rather than BGA framework semantics. Its external
date-construction clock is excluded from the package and leaves native timers and
`Date.now` unchanged. The scenario set proves:

- `E2E-DOC-CACHE-WARM`: cold/warm page counts, unchanged dates/provenance, distinct
  original questions, live API requests, warm outage reads, unmatched failures,
  request-content/network refusals and absence of the clock from the package.
- `E2E-DOC-CACHE-REFRESH`: exact 7/8- and 30/31-day boundaries, changed upstream
  content, failed refresh with dated fallback and search degradation, unmatched
  failure, cancellation refusal and same-client recovery.
- `E2E-DOC-CACHE-REDIRECT`: repeated alias requests, community/maintained ownership
  changes, different destinations, unavailable aliases and refused destinations.
- `INT-DOC-CACHE-LIFECYCLE`: supporting in-process integration of actual MCP handlers and policy/cache composition with scripted fetch responses. This supplies coverage and fault isolation; it is not evidence about installed stdio, DNS or TLS.
- `E2E-DOC-CACHE-MUTATION`: atomically replace an installed module to force fetches
  before warm lookup, observe the extra request, then restore the original bytes
  without writing to pnpm hardlinked peers.

The affected documentation/policy suites pass 52 tests before the added deadline
case. The first integrated attempt failed on the declaration inventory, refusal order and unmapped proof/review files. Internal declaration stripping, the retained refusal order and explicit dependency mapping correct those failures; all 38 focused regression tests pass and every declaration byte matches the retained package. The [bounded receipt](bga208-cache-lifecycle.json) preserves the failed integrated attempts. The second passes all 765 tests but misses unchanged coverage thresholds; the added supporting integration cases cover reader composition and refusal paths while retaining the installed cases as public-boundary evidence. The complete local `pnpm check` passes 768 tests / 234 required scenarios,
103 claims and 17 capabilities, with unchanged coverage thresholds (91.42%
statements, 81.56% branches, 92.44% functions and 91.51% lines), applicable
conformance, package and safety checks. The retained local tarball
`sha256:a4e8482fcb01f50b95d4dd7f79e75ac9e11a6237856a776c950b5926fe7f46e2`
exactly matches the installed-test artifact and passes a fresh live evaluation:
9/9 original questions and 7/7 topics at unchanged thresholds. Installed public
inspection of clean Dino Racer `83e2e50` again returns modern layout, zero
errors/warnings and one explicit source-scope limitation; tracked file digests,
Git state and empty stderr are verified before/after. This is inspection rather
than gameplay or a repeated BGA-424 evaluation. The bounded receipt retains
the dirty local source base, failed attempts and final observations. [Exact-source CI 37056579093](https://github.com/Brandon-Born/bga-mcp/actions/runs/37056579093)
passes all six OS/Node pairs on clean `e75be74a24de80b412cecaa9198dfdbfbcc3c6e9`,
each at 768 tests / 234 scenarios, 103 claims and 17 capabilities. The downloaded
records independently pass schema, integrity, source, installed-artifact,
cache/contract/cancellation scenario and conformance checks. The receipt
preserves each platform's actual package digest. The earlier cache-source CI
`37055009310` passed five jobs and failed macOS Node 22's existing cancellation
observer between iterator return and final directory close. The observer now
waits for final close, and both installed directory-next cases reject that
intermediate snapshot; unchanged resource, deadline and mutation controls pass.
This later source CI verifies that correction together with the cache implementation. The earlier relevance CI receipt at
`6f1d01d` proves that earlier implementation only. BGA-211 remains implemented
while its exact historical failure-identity replay remains unproven. This scope
does not promote development documentation, refresh framework admission, transfer
candidate/security approval or establish gameplay correctness.
