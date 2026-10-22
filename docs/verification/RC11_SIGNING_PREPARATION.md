# rc.11 original-byte signing preparation

```verification-record
{"kind":"review","scope":"Exact independently reviewed unsigned rc.11 original, signer selection and pending-unsigned security binding; identity-free checks and concrete owner merge/sign decision. No signature or publication authorization."}
```

The [candidate receipt](release-candidate-v1.0.0-rc.11.json) selects immutable
`v1.0.0-rc.11` at `a8838456f5c9143a8cb2364111f35899d60a8e8f`:

- [Original producer 39701663657](https://github.com/Brandon-Born/bga-mcp/actions/runs/39701663657), successful attempt 1, artifact `12392394262`.
- Original tarball: `sha256:d064f15233696bd876a8490007cb304d30aff425df805b9236176026022f4a55`.
- Original ZIP: `sha256:38aadc15b9fa69e92dd8ddc2c984010b0684291485fc46e1311cefef31342928`.
- Original manifest: `sha256:232941b79638628b87a278677e2ba8b73f369c684afa88f042c0e60a147a54c1`.
- [Exact-main CI 39700381851](https://github.com/Brandon-Born/bga-mcp/actions/runs/39700381851): all six jobs passed, each with 1,028 tests, 279 required scenarios, 107 claims and 17 capabilities. Both Linux archives match the original tarball; no cross-OS archive equality is claimed.
- Artifact expires `2027-01-20T00:46:04Z`. Missing, expired or mismatched originals hold signing; rebuilding cannot substitute for the original.

## Authentic independent review

The [schema-compatible review binding](rc11-unsigned-independent-review.json)
records actual completed review turn `01a163ee-6ba0-734d-9bc3-99ddc789d344`.
The [original report](RC11_INDEPENDENT_REVIEW_REPORT.txt) and
[original reviewer receipt](rc11-independent-review-source.json) are retained
verbatim. Report hash:
`sha256:ea5f1c9a4765622aea8360ba2436816d6da2b7487046577753e84eeacd94893d`;
original receipt hash:
`sha256:fb9cd56d09bbf808955a164da5adbbf66ecc47f0a57998f73a5b3b9b9d8aca02`.
The `.txt` extension preserves the report's original Markdown bytes through
formatting without changing its content or hash.

The reviewer freshly downloaded the original candidate and all six CI artifacts,
validated their identities and complete records, and compared 252 compiled files
to the original package. Its 73 selected installed tests and 50 independently
written adversarial checks passed; eleven other tests were unselected, not
locally passed. Fresh source production/full-graph and installed-consumer audits
reported zero advisories. The report retains setup/probe-oracle failures and the
resolved executor denial. It grants approval for signer preparation only;
accepted residual risks and narrower test limits remain explicit. No selected or
separately authenticated runtime model identity is inferred.

## Integration and remaining gates

Only the signing helper, signed-consumer helper and signing-workflow concurrency
selector advance to rc.11. `config/security-review.json` binds this exact pending
unsigned target to its actual candidate/review receipts. Its historical signed
rc.10 identity, held security assessment and publication hold remain unchanged.
The pending target independently refuses publication and prevents the signed
review runner from borrowing rc.10's signer/signature. No rc.11 signer commit,
signature, signed-security approval or publication result is invented.

Package/application files, dependencies, six packed guides, both frozen candidates
and existing tags/releases remain unchanged. Preparation's ordinary full checks
exercise the current harness; they do not rebuild or replace the reviewed
original. Source CI and framework admission for this handoff retain their actual
source, separate from the candidate source above.

## Concrete owner decision after checks pass

Approve normal merge of the exact passing preparation PR, followed by **one**
manual `release-signing.yml` dispatch on main after independently verifying the
resulting merge commit and its required checks. The signer commit is that actual
verified main commit; its future SHA cannot be guessed in this document. A changed
main or candidate identity requires checking the actual state before dispatch.

Prepare/sign/verify retain the original seven files. Prepare runs the full gate
and downloads/rechecks producer, source CI, tag, ZIP and packet. Only the isolated
signing job has short-lived `id-token: write` and `attestations: write`; its trusted
Node builtins install no dependencies and execute no candidate. Root, prepare and
verify retain read-only permissions. Verification independently obtains trusted
roots, checks subject/provenance/signer/ref/workflow/issuer, refuses tampering and
wrong signer/workflow, and installs/removes the exact retained package. Failure
holds the result and grants no retry or publication permission.

This decision includes no candidate rebuild, tag move, package/release publication,
npm operation, credential setting, deployment or Dino Racer change. Authentic
signed-candidate security/freshness, client/usefulness and public evidence gates
remain separate. Signing does not approve publication.

## Public record and signing-service terms

The pinned [actions/attest implementation](https://github.com/actions/attest/blob/1e69f48acb82d1966a394da916b4c1698aa569d6/README.md)
uses the workflow's short-lived identity and uploads an attestation to GitHub.
Registry push and storage-record creation remain disabled; those settings do not
disable attestation upload. No long-lived signing key or registry/contents-write
credential is introduced.

[GitHub documents](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
that public-repository attestations use Sigstore's public-good instance: bundles
are stored with GitHub and in a publicly readable immutable transparency log.
The seven subject names/hashes, workflow/certificate identity and custom retention
predicate expose repository, source/tag, producer/CI URLs, artifact/archive identity
and material digests. Private local project content is not an input. Actions
retention is seven days for the intermediate ZIP and 90 days for signed packet
and verification result; the transparency record has separate immutable retention.

The [LF Hosted Project Tools terms](https://lfprojects.org/policies/hosted-project-tools-terms-of-use/)
state that tool/API use accepts the agreement and requires authority when acting
for an organization. Submitted content has no confidentiality expectation and
carries the stated broad perpetual sublicensable license, subject to the
open-source exception. The [immutable-record notice](https://lfprojects.org/policies/hosted-project-tools-immutable-records/)
provides for indefinite public retention and prohibits submitting other people's
personal data. The [privacy policy](https://lfprojects.org/policies/privacy-policy/)
also applies. Owner approval must cover this public metadata disclosure and
these signing-service terms before the signing operation. Preparation itself
performs no signing-service submission or acceptance through such an operation.

## Observed preparation verification

The [actual BGA-456 receipt](bga456-source-ci.json) retains implementation source
`2fa4d4bbc8769e5cc96f1bbc487b2d5493108f5d` and
[CI39796495050](https://github.com/Brandon-Born/bga-mcp/actions/runs/39796495050):
all six jobs terminal and successful on attempt 1, with independently downloaded
archive digests, schemas, evidence seals and exact source checked. Every record
has 1,028 passing tests, 279 required scenarios, 107 claims, 17 capabilities and
applicable conformance passed. All eight mapped framework sources are admitted
against that real source; the release guard reports zero holds. Later metadata
commits do not rename this evidence's implementation or original candidate source.

Eight affected signer/security controls and the integrated local full gate passed.
The real identity-free `prepare` mode re-downloaded and validated the original ZIP
without signing or rebuilding. A fresh source-bound audit at the implementation
commit found zero production/full-graph advisories, with no exceptions.
Original reviewer report and receipt remain byte-identical after formatting.
GitHub delayed final job status after successful steps; all six terminal successes
were awaited before admission. No unchanged runtime retry occurred.

This is preparation evidence, not owner merge/signing approval or a signed result.
The final PR head, terminal automatic PR checks and proposed one-time operation
are supplied in the owner handoff once observed. After approved normal merge,
verify actual main and its required CI before that single signing dispatch.
