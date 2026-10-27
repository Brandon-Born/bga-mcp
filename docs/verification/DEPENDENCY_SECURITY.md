# Dependency security preflight — BGA-422

```verification-record
{"kind":"run","capabilities":17,"scenarios":279,"claims":107,"tests":1030}
```

Implementation reviewed on 2026-09-29. This record describes the gate and the local development graph, not an approved or published release candidate. On 2026-09-30, [exact-source CI 36720062520](https://github.com/Brandon-Born/bga-mcp/actions/runs/36720062520) and [candidate workflow 36720091111](https://github.com/Brandon-Born/bga-mcp/actions/runs/36720091111) closed the outstanding evidence for `v1.0.0-rc.1` at `a2031af`; BGA-422 is now verified. The candidate retained its own fresh zero-finding audit and policy. [Candidate verification](RELEASE_CANDIDATE.md) records the source and digests. Future approval/publication requires a fresh assessment; the original report is dated evidence, not a perpetual clearance.

## Dependency remediation

The production-only audit initially had no findings. The full graph had 26 findings across validation, test, conformance and release tooling. Direct Ajv is now 8.20.0; Vitest and coverage are 4.1.11. Exact same-major overrides cover every affected transitive copy:

| Package               | Selected patched version |
| --------------------- | ------------------------ |
| ajv                   | 8.20.0                   |
| nanoid (3.x)          | 3.3.19                   |
| fast-uri (3.x)        | 3.1.8                    |
| brace-expansion (5.x) | 5.0.12                   |
| qs (6.x)              | 6.16.0                   |
| undici (7.x)          | 7.30.0                   |
| hono (4.x)            | 4.13.11                  |
| ip-address (10.x)     | 10.7.2                   |

The first remediation pass surfaced four additional findings in fast-uri and brace-expansion; the final patched graph reports zero production and zero full-graph findings. No exception suppresses an advisory. The exact Hono security patch is exempted from the package manager's release-age delay; broader release-age policy is unchanged.

## Gate and evidence

- The ordinary commit gate remains offline. `GATE-SECURITY-AUDIT` proves clean production cannot hide vulnerable tooling, high/critical findings cannot be waived, lower findings need disposition, and exceptions expire and require current passing evidence.
- `INT-SECURITY-AUDIT-PREFLIGHT` exercises the real offline command and candidate bundle writer: vulnerable or mismatched reports prevent retention, while clean reports and policies are retained with checksums and a manifest digest. Synthetic findings prove refusal behavior, not registry currency.
- `pnpm audit:security` is the live truth check. It separately queries production and the full graph and writes `.artifacts/security-audit.json`, bound to source and configuration digests. It strips raw titles, paths and error content and stops on malformed/unavailable responses or source changes.
- The candidate builder requires the live preflight after the complete gate and before retaining candidate bytes. Weekly/manual review runs the same command. Both workflows scan retained output before upload, including on failure, and have read-only repository permissions.
- Before final security review and publication, run a fresh assessment of the exact candidate source. Retain it alongside the original immutable artifact; changing advisories never justifies rebuilding or replacing candidate bytes.

## Sources

- [pnpm audit](https://pnpm.io/cli/audit) documents separate production auditing and JSON output, and advises: “use overrides to force versions that are not vulnerable.”
- [pnpm dependency overrides](https://pnpm.io/settings#overrides) describes root-level resolution controls.
- [Ajv advisory GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) and [Nano ID advisory GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) own the original backlog findings.
- The sanitized live report records the current advisory identifiers and severities; zero findings means no advisory currently reported for that locked graph, not proof that dependencies have no defects.

## October21 advisory refresh and frozen rc.10 hold — BGA-454

PR44 merged as `98fe1e6b6b456b757c9f79c5f3b1c35936768838`. Its original six-job CI passed; the new main run [39688001533](https://github.com/Brandon-Born/bga-mcp/actions/runs/39688001533) failed because the selected October20 approved security assessment expired. The October21 exact-candidate audit then established a substantive security hold: production has two high and one moderate findings; the full graph has five high, ten moderate and one low findings. The earlier clean audit is preserved as dated evidence.

The original rc.10 tarball remains `sha256:33e3a657b1af0276cdf3422833b5d3bc5ecacab0d1db80c396d33df547a0e295`, source/tag `646de4671974b163a7447b1e0647119091109643`. Its signature and provenance do not remove newly disclosed dependency risks. No installable package publisher has been dispatched. The existing [metadata prerelease](https://github.com/Brandon-Born/bga-mcp/releases/tag/v1.0.0-rc.10), release ID 418703388, retains its twelve metadata assets.

Future development source upgrades server/client to 2.3.1, SDK to 1.32.0, Vitest/coverage to 4.1.12 and Vite to 8.2.4. These upstream fixes remove all currently reported production/full-graph advisories in the local patched graph. This is a different dependency identity; it does not repair or authorize publication of the frozen candidate. No advisory exception or package-manager release-age exclusion is added.

The reviewer now distinguishes a complete normalized blocked audit from an unavailable or invalid audit. It may collect and retain actual original-byte test/scan/signature evidence with status `held` after the former; the latter still aborts. `--approve` retains the held result and exits nonzero when approval fails. Candidate creation and publication still require a successful live preflight, and the approval verifier still refuses every high/critical finding. Engineering checks can validate the structure of an honestly held record without granting publication approval.

Primary upstream advisory ranges were read through GitHub's advisory API:

- [GHSA-46jr-4wx8-v453](https://github.com/advisories/GHSA-46jr-4wx8-v453): server before 2.3.0 and SDK before 1.32.0; high HTTP validation memory exhaustion.
- [GHSA-jm63-cq47-j5jp](https://github.com/advisories/GHSA-jm63-cq47-j5jp): server before 2.3.0; high cross-client delivery through shared HTTP instances.
- [GHSA-rvq5-wwqv-78pq](https://github.com/advisories/GHSA-rvq5-wwqv-78pq): server before 2.3.0 and SDK before 1.32.0; bearer audience validation.
- [GHSA-22jm-h49p-29qw](https://github.com/advisories/GHSA-22jm-h49p-29qw) and [GHSA-6prh-2h8m-c8cw](https://github.com/advisories/GHSA-6prh-2h8m-c8cw): fixed SDK 1.32.0/client 2.3.0.
- [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) and the retained audit's other Vite advisories: compatible 8.2.4 is patched.
- [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) and [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp): patched Vitest mocker 4.1.12.

The clean committed reviewer `83860be6792bc393f524ea0b05cd83d2e0cacd2f` retained the [fresh held original-byte assessment](security-review-v1.0.0-rc.10-blocked-2026-10-21.json) at 22:52:47 UTC on October21. The existing signature verified against independently obtained roots; all 68 installed security tests and 11 required scenarios passed, and 280 text files passed scanning. The exact original dependency audit retained its two high production findings and all 16 full-graph findings. `--approve` exited 1 after retaining this held report. Framework admission was honestly pending for the new development dependency identity. That observation remains dated evidence; it is not rewritten after later development admission.

`config/security-review.json` explicitly holds rc.10 publication for BGA-454 and `config/publication.json` selects the actual held assessment. The October20 approval is preserved in its original file. The new held receipt and exact archived contract are added to the existing framework map's release-bookkeeping group; no pre-existing path changes role, and the map/dependency/backlog changes require normal eight-source admission.

### Framework observation change inspected before admission

The October21 refresh stopped on the changed [Game.php page](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php). Official revision metadata identifies revision 31958 at 14:52:27 UTC, parent 31883. The official API comparison of those two revisions adds `bga->playerStats->setUseNo(bool $useNo)` and says: “Tell if the counter input will be player no (true) or player id (false)”. It also clarifies three player-statistics parameter names.

Source searches show no modeled `playerStats`, `tableStats`, `setUseNo` or `playerIdOrNo` method behavior in the server/rule catalog. Existing statistics support inventories and normalizes statistics definition files; it does not interpret those runtime counter methods. The modeled main-logic location, actions, notifications, SQL and fallback forms are unchanged by this delta. No new statistics-method support claim or parser rule is introduced. The new normalized page digest is `sha256:3f8ddd60efb86026a3a323a41fcdc249f0c18d62d4fc066f01415354a2e343ad`; admission still requires the current complete CI proof. Any further unexpected digest change stops observation again.

### Patched-source engineering evidence

The integrated local handoff passed 1,028 tests, all 279 required scenarios, package checks, safety and applicable conformance. The first full attempt correctly stopped on the old 2.2.0 client-matrix pin; the matrix/contract correction preceded the successful complete run. No failed runtime suite was retried unchanged.

[Exact-source CI 39690537639](https://github.com/Brandon-Born/bga-mcp/actions/runs/39690537639) passed all six OS/Node jobs on attempt 1 at source `dd8278cb1013ec8b9e8a48f48c3e2ca19b2a7137`. Each independently downloaded evidence record is clean, schema-valid and integrity-checked, with 1,028 passed tests, 279/279 scenarios, 107 passing claims and passing applicable conformance. Every installed run matches its own source package digest; the patched package differs from the original signed rc.10. Both Mac records also match the local patched artifact digest.

All eight official-source interpretations/proofs were explicitly admitted against that actual passing source and run. Seven source digests were unchanged; the specifically inspected Game.php statistics-only change uses its new digest. A later ledger/evidence-only commit retains the actual tested source rather than relabeling these results as a new test run. The normal merge must preserve that source ancestry.

The clean patched-source registry audit at 23:00:19 UTC reported zero production and zero full-graph findings with no exceptions. Its lock digest is `sha256:d3fbaee9f94822ff9824c9d7bf3dbdd75afff727473549de6632514a02a7328d`; policy digest remains `sha256:be837bd11c489f74024db6e99c7817db38b9fad9d2ae2b69f3ee56553f972bab`. A token-free independent download at 23:01:59 UTC rechecked all twelve public metadata assets and their original IDs/hashes/body; no package asset exists, and the original tag/tarball are unchanged. This engineering evidence does not clear the frozen-candidate publication hold.

### Distinct rc.11 source preparation — BGA-455

The rc.11 preparation changes only package/server version metadata plus its backlog record, preserving the patched lockfile, current public contract and all six packed guides. The integrated local gate passes 1,028 tests, 279 required scenarios, package, safety and applicable conformance. A fresh clean-source registry audit reports zero production and full-graph findings.

[Exact-source CI 39694955188](https://github.com/Brandon-Born/bga-mcp/actions/runs/39694955188) passed all six jobs on attempt 1 at `512f3b79d44c5ae860f0f857d2987d178f46fbc8`. All six downloaded records validate their schemas, integrity, clean source, complete tests/scenarios, applicable conformance and installed artifact identity. All eight interpretations/proofs are re-admitted against that actual source, using the October 21 official observations and the inspected Game.php revision 31958 scope. No parser interpretation or public contract changes.

This evidence establishes source preparation only. Original hosted rc.11 bytes, their own producer evidence, packet/guide/client/security observations and a distinct independent review must be recorded separately. No new signature, signing authorization or publication approval is asserted. The current rc.10 signer/security/publication selections and its explicit high-advisory hold remain untouched. A normal merge preserves the actual source-proof ancestry before any new immutable tag and nonpublishing producer.

PR46 subsequently retained a Windows / Node 22 five-second connection timeout in `E2E-CONTRACT-COMMENT-METHOD-MISSING` under [run 39696174905](https://github.com/Brandon-Born/bga-mcp/actions/runs/39696174905), with 1,027 passing tests. No failed rule assertion is observed and the startup cause is not conclusively diagnosed. The corrected policy caps Windows test-file workers at two; all assertions, test/scenario inventory, five-second connection deadline, operation/test deadlines and retry settings remain unchanged.

Five affected tests and a new integrated 1,028-test/279-scenario local gate pass. [New exact-source CI 39697633966](https://github.com/Brandon-Born/bga-mcp/actions/runs/39697633966) and [concurrent PR CI 39697635474](https://github.com/Brandon-Born/bga-mcp/actions/runs/39697635474) each pass all six jobs on attempt 1 at changed head `3c8e3ce771d66c312ebd6982811a6c1579c736db`. The exact-source records independently validate full tests, source/schema/integrity, applicable conformance and every installed artifact record. All eight framework interpretations/proofs are re-admitted against that actual changed source. The earlier source admission is preserved as historical evidence and is not substituted for this correction. No unchanged runtime retry or timing relaxation grants release admission.
