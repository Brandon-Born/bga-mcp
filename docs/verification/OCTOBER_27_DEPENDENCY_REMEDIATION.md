# October 27 dependency remediation and frozen rc.11 hold

```verification-record
{"kind":"review","scope":"Fresh unsigned rc11 audit failure and minimum future-build dependency remediation. No signature, signed-candidate approval, new candidate or publication authorization."}
```

Canonical fresh registry audits at candidate source
`a8838456f5c9143a8cb2364111f35899d60a8e8f` and signer source
`ec3fcfef0c6acec3d72da96f5f650badfeab0ef7` agree: one high production finding;
full graph three high, five moderate and two low findings. The
[actual unsigned hold](rc11-security-hold-2026-10-27.json) preserves both normalized
reports and their source/material identities. They are not signed assessments.
The October 22 independent review and clean audits remain immutable historical
observations; they cannot clear these new findings.

## Minimum future-build graph

| Package     | Prior  | Selected | Official finding                                                                                                                                                                                                                                                                          |
| ----------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| zod         | 4.4.3  | 4.6.6    | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)                                                                                                                                                                                                                  |
| body-parser | 2.3.0  | 2.4.0    | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)                                                                                                                                                                                                                  |
| fast-uri    | 3.1.8  | 3.1.9    | [scheme injection](https://github.com/advisories/GHSA-333x-w4r6-6crp), [scheme spoofing](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), [host confusion](https://github.com/advisories/GHSA-wjr9-j795-jxcr), [path normalization](https://github.com/advisories/GHSA-xhq7-xmqj-769h) |
| undici      | 7.30.0 | 7.30.1   | [EventSource memory](https://github.com/advisories/GHSA-4qv8-2p9j-2685), [integrity tokens](https://github.com/advisories/GHSA-f72v-6w45-q472), [content encoding](https://github.com/advisories/GHSA-xjj6-f33q-929c)                                                                     |
| ip-address  | 10.7.2 | 10.7.4   | [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5)                                                                                                                                                                                                                  |

The official Zod advisory range is below 4.6.6; its range was updated October 23,
after the retained clean review. Zod is a runtime dependency. Other findings
include development/release HTTP and schema tooling; exclusion from public
network surfaces does not exempt the full dependency graph from the audit policy.
Body-parser requires content-type 2.1.0 and qs 6.16.1; these additional lockfile
changes belong to the selected patch rather than an unrelated dependency refresh.

Official registry metadata was checked for exact publication times, integrity
and engine requirements. Selected versions were published October 11 (Zod and
ip-address), October 15 (undici), October 19 (fast-uri) and October 22 (body-parser).
The normal pinned pnpm 11.15.1 resolver accepted the lockfile without a new
release-age exclusion, advisory filter, security exception or credential change.
The five package changes retain the existing major lines; Zod advances within
major 4 to the first fixed version. Compatibility still requires actual tests.

## Contract regression and correction

The first integrated run retained its failure: 1,027 tests passed and the installed
contract scenario failed. Zod 4.6.6 compacts bare nullable-string unions from
`anyOf: [{type: "string"}, {type: "null"}]` to `type: ["string", "null"]`.
Independent discovery from the extracted original rc.11 and its locked dependencies
confirmed exactly three affected output-schema fingerprints; the contract snapshot
was not rewritten. Removing `propertyNames` was investigated and rejected because
it was not the difference. No such removal was applied.

The server's existing project-trust schema factory retains the original nullable
string representation through the [Standard JSON Schema output converter](https://standardschema.dev/json-schema).
The specification separates conversion from validation; the patched Zod validator
and its input converter remain intact. Only JSON Schema positions are traversed,
preserving examples/defaults/constants and existing union constraints. No BGA
parsing or framework interpretation changes. The [Zod conversion documentation](https://zod.dev/json-schema)
documents its conversion interface and the distinction between input and output.
Focused installed-contract and schema tests pass (five tests), including actual
discovery against the unchanged snapshot and validation equivalence controls.

## Evidence and release boundary

Lock resolution and frozen installation passed. The fresh modified-working-tree
production/full-graph audit passed with zero findings at 2026-10-27T15:27:15Z,
bound to changed package/lock/workspace digests and honestly marked dirty. It
does not clear the original. After the contract correction, the integrated run
passed all 1,030 tests, coverage, all 279 required scenarios, package validation,
conformance and safety. Its final evidence check found six stale test-count
summaries (1,028); these were corrected to 1,030 and the formatting, evidence and
acceptance gates then passed. Both stopped full-command logs are retained locally;
the resumed evidence-only correction does not assert an uninterrupted command pass.
Independent source review, exact-source CI and all eight framework admissions
remain pending until observed. No such passing result is asserted in advance.
A final uninterrupted `pnpm check` then passed with all 1,030 tests and 279 required
scenarios. Its honestly dirty source evidence and the two earlier failures are
retained separately; no result is relabeled as clean committed-source CI.
The original candidate stays at tag `v1.0.0-rc.11`, tarball
`sha256:d064f15233696bd876a8490007cb304d30aff425df805b9236176026022f4a55`.
Its seven files, archive, tag and earlier review must never be overwritten by
these new dependencies. rc.10 originals and its existing hold remain separate.

A source patch cannot make this original rc.11 safe. A distinct replacement
candidate must pass the actual version/source/producer, installed security/client,
freshness and independent-review gates before any new signing decision. The
signer/security/publication artifact selectors remain where they were; no future
version, signer, signature, approval or public release is invented here.
