# rc.10 original-byte signing preparation

```verification-record
{"kind":"review","scope":"Exact approved unsigned rc.10 receipt and pre-signature selector/security integration, identity-free preparation checks and the owner signing disclosure; no signature or publication approval"}
```

The [candidate receipt](release-candidate-v1.0.0-rc.10.json) selects original
`v1.0.0-rc.10` at `646de4671974b163a7447b1e0647119091109643`, producer
[39320808831](https://github.com/Brandon-Born/bga-mcp/actions/runs/39320808831),
attempt 1, artifact `12220660768`. Its original tarball is
`sha256:33e3a657b1af0276cdf3422833b5d3bc5ecacab0d1db80c396d33df547a0e295`;
the original ZIP is
`sha256:35e53b55f6235f69ddb6fd8b0165893b0ac36a15f78d5cb3769bf9a04e494c76`.
Exact-main CI, producer evidence, audit and all six packed guides bind those bytes.
The retained artifact expires `2027-01-17T20:37:10Z`; unavailable or mismatched
originals must stop signing. Rebuilding cannot replace the original.

The [independent unsigned review](rc10-unsigned-independent-review.json) approves
these exact bytes for signing preparation with no high, medium or low findings.
It records the report hash and review turn. The retained report does not identify
the task-selected model and says runtime model identity was not exposed. Both
model fields therefore remain unknown; a task selection is not runtime identity
verification. The reviewer checked retained records locally without fetching
GitHub, executing Linux/Windows, or rerunning the full suite. Earlier rc.8/rc.9
approvals do not transfer.

## Integration and remaining security stage

The signing helper, signed-consumer helper and concurrency group select rc.10.
`config/security-review.json` explicitly binds a pending unsigned rc.10 target to
both receipts. Its historical signed rc.8 assessment and rejection hold remain
unchanged. The unsigned target independently blocks publication and stops the
signed-security runner before it can reuse rc.8's signer or signature. No rc.10
signer commit, signature, signed-security approval or native-client result exists
in this preparation. Authentic signing evidence must precede replacing the
historical signed-plan fields and rerunning the candidate-specific signed gates.

Application/package bytes, packed guides, dependencies and old receipts/tags stay
unchanged. Ordinary preparation tests exercise current verification code; they do
not turn the original producer's 1,026 tests into a new original artifact.

## Concrete owner decision after this PR passes

Review and integrate this single preparation PR. After exact-main CI and framework
admission pass, authorize one manual `release-signing.yml` dispatch on that exact
main commit, retaining the selected rc.10 original and running its prepare/sign/
verify jobs. No tag, candidate rebuild, package/release publication, deployment or
Dino Racer work is included. A changed main source requires checking the actual
signer identity before dispatch; do not guess a future signer SHA.

Preparation runs the full gate, downloads the reviewed archive and rechecks its
producer, CI, tag, archive digest and packet. Only the isolated signing job has
`id-token: write` and `attestations: write`; prepare/verify have read-only contents
and Actions access. The signer uses trusted Node builtins, installs no dependencies
and executes no candidate. Verification independently acquires trust roots,
checks exact subjects/provenance/signer/ref/workflow/issuer, rejects tampering and
wrong signer/workflow, and installs/removes the unchanged original. Failure holds
the result rather than authorizing a retry or publication.

## Signing permissions, disclosures and terms

This repository is public. The pinned
[actions/attest implementation](https://github.com/actions/attest/blob/1e69f48acb82d1966a394da916b4c1698aa569d6/README.md)
uses a short-lived Sigstore certificate and uploads the signed attestation to
GitHub. The OIDC permission mints the workflow identity used for the certificate;
attestation write permission stores the attestation. No long-lived signing key,
package/contents write permission, registry token or additional credential is
introduced. Registry push and artifact storage-record creation remain disabled.
Those settings do not disable GitHub attestation upload or public transparency.

As described by [GitHub's artifact-attestation documentation](https://docs.github.com/en/actions/concepts/security/artifact-attestations),
public-repository attestations use Sigstore's public-good instance and write a
bundle to GitHub and a publicly readable immutable transparency log. The seven
subject file names/hashes, workflow/OIDC certificate identity and custom retention
predicate become attestation data. This predicate includes the repository,
source/tag, original producer and CI URLs, artifact ID/archive digest, and candidate
identity/material digests. Account or workflow identity metadata can be public;
private local project contents are not inputs to this predicate. Original packets
are also retained as GitHub Actions artifacts: intermediate archive 7 days,
signed packet and verification result 90 days. The public log has a different,
immutable retention boundary; deleting an Actions artifact does not erase it.

[LF Hosted Project Tools terms](https://lfprojects.org/policies/hosted-project-tools-terms-of-use/)
state that API/tool use accepts the agreement and requires authority to act for an
organization. Submitted content has no confidentiality expectation and carries a
broad perpetual, sublicensable license, subject to the stated open-source exception.
The terms include acceptable-use, privacy and responsibility provisions. The
[immutable-record notice](https://lfprojects.org/policies/hosted-project-tools-immutable-records/)
explains indefinite retention and disallows submitting other people’s personal data or highly sensitive personal information; the linked
[privacy policy](https://lfprojects.org/policies/privacy-policy/) also applies.
Owner authorization should expressly cover these signing-service terms and public
metadata disclosures. This preparation does not accept them through a signing
operation or grant merge/signing/publication permission.
