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

Obtain the signed packet and the expected signing commit from the independently reviewed signing receipt. Obtain a trusted verifier checkout from that same reviewed commit (or a subsequently reviewed checkout), Node 24 and GitHub CLI with artifact-attestation support. Never run verification code or accept a trusted-root file supplied by the artifact packet itself.

The packet contains the original seven files plus `sigstore-bundle.json` and `release-provenance.json`. In the trusted repository checkout, run:

```sh
gh attestation trusted-root > /tmp/bga-independent-trusted-root.jsonl
node --experimental-strip-types scripts/release-signing.ts verify /path/to/signed-packet EXPECTED_SIGNING_COMMIT /tmp/bga-independent-trusted-root.jsonl
```

Replace the packet path and signing commit with the reviewed values. The verifier requires repository `Brandon-Born/bga-mcp`, workflow `.github/workflows/release-signing.yml`, `refs/heads/main`, the exact signing/source commit, GitHub OIDC issuer, hosted runners, the exact custom predicate and seven matching signed subjects. It then compares the original source, producer CI and all candidate bytes with the independently tracked candidate receipt. The signing commit is distinct from the original package source commit. Passing `gh attestation verify` without these policy checks is insufficient. `SHA256SUMS` alone does not authenticate bytes.

Trusted roots are acquired independently through GitHub CLI, then verification and negative probes use the local bundle and roots offline. A root snapshot cannot reveal later revocations; refresh roots when importing new signed material. The signature establishes identity and integrity, not quality, supported-client breadth or perpetual dependency clearance.

## Evidence

Ordinary `pnpm check` includes two offline scenarios: GATE-RELEASE-SIGNING rejects unsafe workflow permissions, triggers, dependencies, rebuilds and publication; INT-RELEASE-SIGNING rejects archive, checksum, source, subject and predicate substitution against synthetic retention-policy inputs. Those tests do not generate signatures.

The manual workflow separately runs `pnpm verify:signed-release` with a real bundle. It must cryptographically refuse changed tarball bytes, a wrong signing commit and a wrong workflow. A fresh consumer installs the verified original tarball, discovers seven tools and three resources, performs first use, refuses excluded tools, hashes the project before/after, checks clean process exit and removes the installed command. The retained result records the original digest and signing commit. Hosted execution and independent verification are pending; BGA-404 remains implemented until they pass.

## Sources

- [actions/attest](https://github.com/actions/attest) documents custom predicates, multiple subjects, bundle output and "a short-lived Sigstore-issued certificate".
- [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) documents job permissions and verification.
- [GitHub CLI verification](https://cli.github.com/manual/gh_attestation_verify) documents signer/source/workflow/issuer policy flags and explicit bundles.
- [Offline verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline) documents independently acquired trusted roots and their limitations.
