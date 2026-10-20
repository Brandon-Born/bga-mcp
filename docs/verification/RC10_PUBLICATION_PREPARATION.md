# rc.10 signed evidence and publication preparation

```verification-record
{"kind":"review","scope":"Authentic rc.10 signing, installation and native Codex consumer receipts; held original-byte signed-security preparation assessment; consumer selectors and historical refusal preservation. No publication readiness or public delivery claim."}
```

Original `v1.0.0-rc.10` remains source
`646de4671974b163a7447b1e0647119091109643`, tarball
`sha256:33e3a657b1af0276cdf3422833b5d3bc5ecacab0d1db80c396d33df547a0e295`.
The [real signing receipt](release-signing-v1.0.0-rc.10.json) records
[run 39426843155](https://github.com/Brandon-Born/bga-mcp/actions/runs/39426843155),
attempt 1, signer `de8cbf32`, signed artifact `12266606753` and
[attestation 57794948](https://github.com/Brandon-Born/bga-mcp/attestations/57794948).
All seven original files are byte-identical. Hosted Ubuntu and independent Mac
cryptographic verification, wrong-signer/workflow/tamper refusals and fresh
installed use/removal passed. No candidate is rebuilt or resigned by this change.

## Original seven publication holds

At main `de8cbf32`, `release:status` returned these exact failures:

| Failure                                                                                                                                                                                                                  | Cause and required correction                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review differs from independently pinned candidate/signing identity                                                                                                                                                      | Publication selected rc.7 review while the security plan pinned rc.8. Select a real rc.10 signed assessment against the original source and actual signer.                                                                  |
| Review dependency configuration differs from pinned original source                                                                                                                                                      | The selected rc.7 audit cannot represent rc.8 or rc.10. Run a fresh exact-source rc.10 audit; retain its actual identity.                                                                                                   |
| Unsigned replacement v1.0.0-rc.10 still needs authentic signing and a signed-candidate review                                                                                                                            | Signing completed, but its receipt was external and the active plan still declared unsigned preparation. Bind the authentic receipt and retain the real signed assessment; unsigned approval cannot become signed approval. |
| Candidate publication blocked: SEC-RC8-01 and SEC-RC8-02 reproduced against signed rc.8. Rejected for publication; runtime fixes require a new candidate and signature. See docs/verification/RC8_SECURITY_REJECTION.md. | This hold belongs to rejected rc.8. Preserve its exact plan and assessments; rc.10 has different fixed bytes and a new signature, and must independently pass approval.                                                     |
| Security report is stale or future-dated                                                                                                                                                                                 | A dated historical assessment cannot be renewed by changing a timestamp. Run the registry-backed audit against clean original rc.10 source.                                                                                 |
| Review is stale or future-dated                                                                                                                                                                                          | Run the actual signed-candidate assessment with a clean committed reviewer and current framework admission.                                                                                                                 |
| BGA-400/401/407/424 candidate-specific install, client, public evidence or usefulness prerequisites are incomplete                                                                                                       | Installation, native client, public evidence and frozen-task usefulness must identify rc.10. Old receipts cannot transfer automatically.                                                                                    |

## Authentic observations collected

The [installation receipt](install-guide-v1.0.0-rc.10-signed.json) records the
existing guide's fresh install, exact inventory, first use, root refusal,
repeated installation, unchanged fixture, process exit and removal on the
independently authenticated signed original. It does not test cross-version upgrades.

The [native receipt](codex-client-v1.0.0-rc.10.json) records the actual pinned
Codex CLI 0.159.2 app-server on macOS arm64, all seven tools and three resources,
malformed-input/outside-root/excluded-tool refusals, restart, process exit,
removal and unchanged project/user configuration. The first attempt stopped
before tests because the executable was absent from PATH. One infrastructure
retry used the existing binary after checking its historical SHA-256. This is
neither a GUI test nor an agent-development evaluation. Its dirty preparation
source and actual runner digests remain explicit.

The [held signed assessment](security-review-v1.0.0-rc.10-preparation.json)
authenticates the actual signature with independently acquired roots, runs a
fresh exact-source audit (zero production and full dependency findings), passes
68 tests covering all 11 required security scenarios against the original
tarball and scans 280 package text files with zero secret findings. The review
used an explicitly held proposed rc.10 plan in a dirty preparation checkout;
the historical selected plan was restored before integration. The resulting
`sourceClean: false`, framework gate failure, held risk and `status: held` are
preserved. This is useful replay evidence, **not approval**. A clean, committed,
currently admitted review is still necessary. The review runner and every
approval requirement remain unchanged.

The active security plan now binds actual rc.10 candidate/signing/audit identities
and publication selects this held assessment. The previous rejected rc.8 plan,
including its pending-unsigned refusal, is retained verbatim in
[the historical plan](security-review-plan-v1.0.0-rc.8-rejected.json).
Existing rejection and unsigned-runner controls still run against that plan in
an isolated checkout shape. Current-plan controls additionally reject old signed
assessments and validate the real selected record. No old assessment is relabeled.

## Why a merge is needed and what remains

The install, native-client, evidence producer and client-matrix verifier formerly
hardcoded rc.8. Their selectors now use rc.10. The offline security verifier now
reads the selected publication assessment instead of hardcoding rc.8; the same
schema, candidate identity, integrity, canonical risks and approval checks apply.
No permission, workflow trigger, assertion deadline or packed guide changes.
New receipt paths join the existing release-bookkeeping group; existing semantic
and proof paths keep their roles. The current framework guard remains authoritative.

GitHub's evidence and package publication workflows both require trusted main.
A local edit or branch push cannot update their main-only behavior. This change
therefore needs a reviewed merge before those workflows can prepare rc.10.
It is deliberately a draft while final admission is incomplete. No workflow is
dispatched and no public metadata/package is uploaded here.

The BGA-407 public metadata receipt and BGA-424 real frozen-task repeat remain
historical rc.7 selectors, so publication continues to fail closed. Do not create
placeholder rc.10 receipts. The remaining sequence is: clean committed reviewer
and exact-source CI/framework admission; actual signed-security approval; explicit
rc.10 frozen-task repeat/adjudication; main-only signed metadata publication and
independent public validation; authentic prerequisite integration; then the already
authorized unchanged-package GitHub prerelease and independent public consumer.
Public metadata publication precedes package delivery under the established gate.
No parallel PR series or automatic merge is authorized by this preparation.

No release currently exists in the GitHub release API and the original-tarball
download returns 404. An existing Git tag can render a release-style landing page
with HTTP 200; that page alone proves neither publication nor asset availability.
No npm publication, deployment, tag movement or Dino Racer change is involved.
