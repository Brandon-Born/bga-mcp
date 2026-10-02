# Original candidate signing — BGA-404

```verification-record
{
  "kind": "review",
  "scope": "BGA-404 original-byte keyless signing, provenance, identity verification and fresh consumer evidence"
}
```

The separate manual `Sign retained release candidate` workflow signs the original BGA-403 candidate. It does not rebuild, publish, or renew security approval. Its prepare job runs the full gate and verifies the original producer, source CI, tag and artifact archive against the tracked [trusted candidate receipt](release-candidate-v1.0.0-rc.1.json). Its signing job independently rechecks that archive before extracting the seven original files. Only that job can request a short-lived signing identity; it installs no dependencies and executes no package code. Actions are pinned to reviewed commits and checkout credentials are not persisted.

The custom predicate `https://github.com/Brandon-Born/bga-mcp/predicates/release-candidate/v1` is a retention assertion. It binds the original tagged source `a2031afe9da6acbdcf1712007da8394bc0fdeef2`, producer run `36720091111`, source CI `36720062520`, original archive digest and all candidate material digests. It deliberately does not claim the later signing workflow built the candidate. All seven original files, including checksums, are signed as subjects of one DSSE/Sigstore bundle. `release-provenance.json` is a readable copy; acceptance uses the cryptographically verified predicate, not that unsigned copy.

## Verification instructions

Obtain the signed packet and the expected signing commit from the independently reviewed [signing receipt](release-signing-v1.0.0-rc.1.json). Obtain a trusted verifier checkout from that same reviewed commit (or a subsequently reviewed checkout), Node 24 and GitHub CLI with artifact-attestation support. Never run verification code or accept a trusted-root file supplied by the artifact packet itself.

The packet contains the original seven files plus `sigstore-bundle.json` and `release-provenance.json`. In the trusted repository checkout, run:

```sh
gh attestation trusted-root > /tmp/bga-independent-trusted-root.jsonl
node --experimental-strip-types scripts/release-signing.ts verify /path/to/signed-packet 5a3dc725adcf2bf914d8a0be09ab1a6207c46cde /tmp/bga-independent-trusted-root.jsonl
```

Replace the packet path and signing commit with the reviewed values. The verifier requires repository `Brandon-Born/bga-mcp`, workflow `.github/workflows/release-signing.yml`, `refs/heads/main`, the exact signing/source commit, GitHub OIDC issuer, hosted runners, the exact custom predicate and seven matching signed subjects. It then compares the original source, producer CI and all candidate bytes with the independently tracked candidate receipt. The signing commit is distinct from the original package source commit. Passing `gh attestation verify` without these policy checks is insufficient. `SHA256SUMS` alone does not authenticate bytes.

Trusted roots are acquired independently through GitHub CLI, then verification and negative probes use the local bundle and roots offline. A root snapshot cannot reveal later revocations; refresh roots when importing new signed material. The signature establishes identity and integrity, not quality, supported-client breadth or perpetual dependency clearance.

## Evidence

Ordinary `pnpm check` includes two offline scenarios: GATE-RELEASE-SIGNING rejects unsafe workflow permissions, triggers, dependencies, rebuilds and publication; INT-RELEASE-SIGNING rejects archive, checksum, source, subject and predicate substitution against synthetic retention-policy inputs. Those tests do not generate signatures.

The manual workflow separately runs `pnpm verify:signed-release` with a real bundle. It must cryptographically refuse changed tarball bytes, a wrong signing commit and a wrong workflow. A fresh consumer installs the verified original tarball, discovers seven tools and three resources, performs first use, refuses excluded tools, hashes the project before/after, checks clean process exit and removes the installed command. The retained result records the original digest and signing commit. BGA-404 is verified with the actual and independent evidence below.

## Observed verification, 2026-09-30

[Signing workflow 36740988457](https://github.com/Brandon-Born/bga-mcp/actions/runs/36740988457) completed successfully at signing source `5a3dc725adcf2bf914d8a0be09ab1a6207c46cde`. [Attestation 51527596](https://github.com/Brandon-Born/bga-mcp/attestations/51527596) and its [public transparency entry](https://search.sigstore.dev?logIndex=3021662324) bind seven original subjects. [Exact-source CI 36740949025](https://github.com/Brandon-Born/bga-mcp/actions/runs/36740949025) passed all six Ubuntu/macOS/Windows Node 22/24 jobs, each with 592 tests and 176 passing required scenarios. CI checks later signing code and does not rebuild or replace the tagged release candidate.

The signed packet is GitHub artifact `11109319828`, named `signed-candidate-36740988457`, archive digest `sha256:3f2143b05960f69cbaf9a4798751e4d931ac7058957e303f42fb2174684fbc54`, retained until `2026-12-29T16:00:17Z`. Download it with `gh run download 36740988457 --name signed-candidate-36740988457 --dir /path/to/signed-packet`. It contains the original tarball digest `sha256:a3472a97916bbd793fe32ffb847ced3d9638fe2c45cc112867b0af0a15f3acfa`, plus the original manifest, schema, evidence, audit/policy and checksums, and the new bundle/readable predicate. All seven originals were independently compared byte for byte with the BGA-403 bundle. The tag and original source remain unchanged.

Both the Ubuntu hosted consumer and an independent macOS consumer acquired trust roots separately, verified the exact signing identity and original provenance/subjects, refused actual modified tarball bytes and wrong signing commit/workflow, and passed fresh installation, seven-tool/three-resource discovery, first use, excluded-call refusal, unchanged-project hashing, clean exit and removal. The [machine receipt](release-signing-v1.0.0-rc.1.json) retains digests and sanitized results; local original signed files are ignored under `.artifacts/signed-release-candidates/v1.0.0-rc.1/`. Finite workflow artifact retention is distinct from BGA-407's durable per-release evidence distribution. This signature adds no coding-client compatibility claim and does not approve publication or renew the dated security audit.

## Sources

- [actions/attest](https://github.com/actions/attest) documents custom predicates, multiple subjects, bundle output and "a short-lived Sigstore-issued certificate".
- [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) documents job permissions and verification.
- [GitHub CLI verification](https://cli.github.com/manual/gh_attestation_verify) documents signer/source/workflow/issuer policy flags and explicit bundles.
- [Offline verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline) documents independently acquired trusted roots and their limitations.

BGA-407 subsequently distributed the same signed original metadata, original bundle and digest-bound inventory/manifest as public release assets. [Distribution verification](RELEASE_EVIDENCE.md) records the durable destination and independent public download. This does not alter the historical signing receipt or approve package publication.

## Replacement candidate selection

For the authorized BGA-424 evaluation, the current main-only signer now selects
[the separately verified rc.2 receipt](release-candidate-v1.0.0-rc.2.json). Its
producer/source CI, original archive digest and seven material files are distinct
from rc.1. The receipt selector is a reviewed source constant, not caller input.
Historical rc.1 verification uses its recorded trusted verifier commit and
receipt; no rc.1 bytes, tags or receipts are replaced. Rc.2 signing and independent
cryptographic verification completed before evaluated calls, as recorded below.

## Replacement verification, 2026-10-02 UTC

[Signing workflow 36946659442](https://github.com/Brandon-Born/bga-mcp/actions/runs/36946659442)
passed at signer `2727208dee9a479ac0f4eca7fb15ed0e262552f9`.
[Attestation 52006599](https://github.com/Brandon-Born/bga-mcp/attestations/52006599)
binds the seven original rc.2 subjects. Its independently downloaded archive
matches `sha256:e9cf82299a09a9f630b9d0a03d8390ffcbe89226683201b404a5fa4c4140dda4`;
all signed packet files matched the downloaded archive, and all seven originals
matched the independently retained unsigned candidate byte for byte.

The [rc.2 signing receipt](release-signing-v1.0.0-rc.2.json) records the hosted
and independent macOS cryptographic consumers, exact signer/workflow refusals,
modified-tarball refusal, installation, discovery, first use, unchanged project,
clean exit and removal. [Exact signer-source CI 36946547409](https://github.com/Brandon-Born/bga-mcp/actions/runs/36946547409)
passed all six jobs with 618 tests and 188 required scenarios each. Retention of
the signed archive ends `2026-12-31T00:34:20Z`; this is distinct from durable
per-release distribution. No package was published or original candidate rebuilt.

The [real development evaluation](AGENT_EVALUATION.md) subsequently found BGA-431.
Cryptographic verification remains valid, but does not clear that release blocker
or transfer usefulness claims to a future replacement artifact.

## BGA-431 replacement: signed rc.3

[Signer workflow 36954957803](https://github.com/Brandon-Born/bga-mcp/actions/runs/36954957803)
passed at `e092d1d9cccccae2f38e4eff7129ad8f690fb3bf`, consuming the separately
verified original rc.3 candidate from `c7ad5c2`. Its preparation runs the complete
gate without signing identity; signing then rechecks the archive and attests the
seven unchanged original files. [Signer-source CI 36954958134](https://github.com/Brandon-Born/bga-mcp/actions/runs/36954958134)
passed all six platform/Node jobs with 651 tests and 193 required scenarios.

The [rc.3 receipt](release-signing-v1.0.0-rc.3.json) records signed archive
`bc95d082687e61345395c66881b593035aeb20341544b2acffdcbd09ba59f464`,
[attestation 52023946](https://github.com/Brandon-Born/bga-mcp/attestations/52023946),
finite hosted retention and independent packet/original-file comparison.
Hosted and macOS independent consumers produced equal results: signatures and
provenance matched, modified bytes and wrong signer/workflow were refused, fresh
installation/first use/unchanged project/process exit/removal passed. Original
package SHA-256 remains `598cad2186c60e8110d8906ffb91739893c357ebed69cad0529c8a5a367907a3`.

[Explicit BGA-424 carry-forward](AGENT_EVALUATION_CARRY_FORWARD.md) subsequently
repeated the frozen real-project calls on these verified bytes. Original rc.1/rc.2
receipts remain unchanged. No package was rebuilt during signing or published.

## Current documentation and BGA-432 replacement: rc.4 selection

The main-only prepare/sign/verify workflow now selects the independently checked
[original rc.4 candidate receipt](release-candidate-v1.0.0-rc.4.json), produced at
`5c4eebd782f3e1bb2251bd8aad4a6826038ddb15`. Its original tarball SHA-256 is
`662c23199cdfd62365b1e94c6ec28bb61374e9d11eafd606f1f29ba1ec6ad200`;
its original archive ID is `11214430454`, archive SHA-256
`0dadc28b8ff6ecd16736083eb22739f2a5cd34efc97e4adae026752226db689b`.
Only the reviewed receipt constants and candidate-specific concurrency group
advance. Every permission, action pin, trusted identity constraint, seven original
subject check, consumer/refusal probe and prohibition on rebuilding/publishing
remains in force.

This selection is preparation, not a signature claim. Actual main-only signing,
independent signature/subject/provenance verification, original-file equality and
exact-signer-source CI are still required before rc.4 signing is verified.
Historical rc.1/rc.2/rc.3 instructions use their recorded trusted verifier commits
and receipts. No prior tag, packet or receipt is replaced, and no publication or
security approval follows from a new signature.

### Observed rc.4 signing and independent verification

[Signing workflow 36979061792](https://github.com/Brandon-Born/bga-mcp/actions/runs/36979061792)
completed successfully at signer `b593b76dc56fbb6affc1264b3b5ee53a338c209b`.
[Attestation 52075839](https://github.com/Brandon-Born/bga-mcp/attestations/52075839)
binds all seven original subjects with the reviewed custom retention predicate.
The preparation job verified the source and original archive without signing
identity; the isolated signing job executed no candidate or dependency build.
[Exact-signer-source CI 36979053850](https://github.com/Brandon-Born/bga-mcp/actions/runs/36979053850)
passed all six Ubuntu/macOS/Windows Node 22/24 jobs, each with 674 tests and 209
required scenarios. All six sealed CI receipts were independently checked.

[The rc.4 signing receipt](release-signing-v1.0.0-rc.4.json) retains signed
archive ID `11215156020`, archive digest
`892e824429c3439248fefb0365499138a2ab77aed0a833de8f6f205890aa00c3`,
finite retention, bundle/predicate digests and actual hosted/independent results.
The independent download matched that archive digest, allowed exactly nine packet
files and compared all seven originals byte for byte with the unsigned producer
packet. Original package SHA-256 remains
`662c23199cdfd62365b1e94c6ec28bb61374e9d11eafd606f1f29ba1ec6ad200`.

Hosted Ubuntu and independent macOS consumers separately acquired trusted roots,
verified the exact signer/ref/workflow/issuer, matched all subjects and original
provenance, refused altered bytes and wrong signer/workflow identities, and passed
fresh install, first use, discovery, unchanged project, exit and removal. Their
retained result documents are equal. The current verifier source selects rc.4;
for this packet the expected signer is `b593b76dc56fbb6affc1264b3b5ee53a338c209b`,
distinct from original package source `5c4eebd782f3e1bb2251bd8aad4a6826038ddb15`.

The eight unchanged previously read framework decisions were explicitly
re-admitted against clean post-observation signer-source CI because the broad
implementation digest includes the changed selector scripts. The actual release
guard passes; no guard was weakened. [The rc.4 frozen-task repeat](AGENT_EVALUATION_CARRY_FORWARD.md#signed-rc4-frozen-task-repeat)
subsequently verified its own bounded usefulness scope rather than inheriting an
older candidate's result. Historical tags, packets and receipts remain unchanged.
Nothing was rebuilt during signing, no package was published and no security
approval follows from this signature.

## Versioned-guide replacement: rc.5 selection

The main-only signer and actual signed consumer now select the independently
verified [original rc.5 candidate receipt](release-candidate-v1.0.0-rc.5.json).
Its original package source is `286f2bbb1bfff28726378098d9883058f19841e9`,
archive ID is `11218194859`, archive SHA-256 is
`601f4d344639bd6ac7d1ea57793c32be0220f6672f5f2da89c484234f8d03bb2`,
and original tarball SHA-256 is
`b7cc226a512a4aab433f8daddf49f54ee00323f3dc7da6960490be1c0727eeac`.
[Handoff CI 36990226664](https://github.com/Brandon-Born/bga-mcp/actions/runs/36990226664)
passes all six jobs. Only the two reviewed receipt constants and the
candidate-specific concurrency group change; every identity, subject/provenance,
original-byte and consumer/refusal check remains in force. The public MCP/BGA
behavior is unchanged.

The official [actions/attest](https://github.com/actions/attest) documentation,
read again for this preparation, describes a "short-lived Sigstore-issued signing
certificate" and custom predicates. The isolated signing job retains its existing
reviewed custom retention predicate and signs the original seven files. The
[CLI verification reference](https://cli.github.com/manual/gh_attestation_verify)
continues to document source/signer/workflow policy and independent local trusted
roots used by the existing verifier. These sources justify no broader identity
permission or new publication path.

Actual main-only signing, independent signature verification and negatives,
original-file comparison, consumer installation/removal and exact-signer-source
CI must pass before rc.5 signing is verified. The earlier rc.4 selector text above
records its historical preparation and observation. Earlier trusted verifier
commits, candidate tags, original packets and receipts remain available for their
own versions. No security approval, usefulness carry-forward or registry
publication follows from selector preparation.
