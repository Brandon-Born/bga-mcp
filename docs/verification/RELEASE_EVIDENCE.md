# Per-release evidence distribution — BGA-407

```verification-record
{
  "kind": "review",
  "scope": "BGA-407 authenticated public candidate evidence, exact frozen capability/environment coverage, isolated publication and retention"
}
```

The manual `Publish candidate verification evidence` workflow consumes the original [BGA-404 signed candidate](RELEASE_SIGNING.md). It distributes verification metadata on the individually reviewed candidate tag. The current selection is `v1.0.0-rc.4`; the original rc.1 record remains immutable historical evidence. It does not rebuild or distribute an npm tarball, grant security approval, or publish to a package registry. The signing identity and original source commit remain distinct from later distribution code.

## Packet and authentication

Twelve assets are required: the original `verification-evidence.json`, `release-candidate.json`, candidate schema, security report/policy and `SHA256SUMS`; the original `sigstore-bundle.json`; original digest-bound `capabilities.json` and `release-inventory.json`; original `evidence.schema.json`; and the derived `release-evidence.json` with its schema. None contains private developer projects, credentials or live Studio/player data.

The original evidence is already a signed subject of BGA-404's seven-subject retention attestation. The derived view is not newly signed: acceptance recomputes it from that signed evidence and the inventory/manifest digests in the verified original predicate. Consumers verify the original signing repository, workflow, main ref, exact signing/source commit, issuer and hosted-runner policy, all seven signed subjects (including the original tarball's digest), trusted schemas and original receipt. Schemas supplied in the packet cannot redefine acceptance; they must match schemas in the trusted original source or reviewed verifier checkout.

The view accounts for all 17 repository entries: the frozen seven tools, three resources and stdio transport have exact local capability/environment/scenario coverage; six other entries are explicitly excluded. Live Studio is `not-run`, with no advertised capabilities. Repository-local and scripted-source fixture successes are not live Studio evidence. Stale/failing selected evidence blocks acceptance; stale excluded entries are labelled. The original source/CI, artifact and dates are retained; later signing or publication does not renew dated observations.

## Validation

For rc.4, use the separately trusted distribution checkout `b5eb22c335953376bd6c3fc210881f4c7b3fe579` with full Git history, its frozen dependencies, GitHub CLI supporting artifact attestations and curl. Historical rc.1 validation uses its original trusted checkout `0c7564c2b872dc3e73eeb54561e542fa1023d118`; current receipt selection does not reinterpret that packet. Acquire trust roots through GitHub CLI independently of the packet. Do not execute verifier code supplied by an asset packet.

```sh
corepack pnpm release:evidence download /tmp/bga-public-release-evidence
```

This fetches twelve fixed public GitHub asset URLs without a token, cookies or private project data, validates both trusted schemas, verifies the existing Sigstore bundle and identity constraints, and proves exact frozen capability coverage. To validate an already downloaded directory:

```sh
corepack pnpm release:evidence verify /path/to/evidence-packet
```

The `verify` command always verifies signatures; there is no CLI bypass. Original raw evidence may include repository entries beyond the public inventory, so use the recomputed release-scoped view when assessing advertised support. Checksums alone do not authenticate assets. A candidate receipt or latest development evidence from another source/artifact cannot replace this original evidence.

## Publication and retention policy

Every distributed release must retain this complete evidence packet and pass public download validation. The current workflow is deliberately restricted to the reviewed `v1.0.0-rc.4` candidate and its tracked candidate/signing receipts. A later tag requires its own reviewed receipts and validation before distribution; this item does not automatically approve arbitrary future tags. BGA-415 must preserve this evidence requirement when publishing the package.

Prepare has read-only permissions, performs the full gate, authenticates the original signed archive, derives exact coverage and scans all assets. Only the publish job has repository contents-write; it installs no dependencies, uses only builtins and GitHub CLI, and verifies the prepared packet against a digest delivered through job outputs. It first creates a draft, checks each uploaded asset's server-reported digest and publishes the evidence-only prerelease only once all twelve assets are present. A retry can resume only an identical owned draft or accept an already identical complete record. Conflicts or foreign records fail without overwrite or deletion.

Retain release assets for the lifetime of their release, with no automatic expiry or replacement. Preserve signed historical observations; newer assessments require separately named records and their own review. Temporary prepared workflow artifacts last seven days; downloaded verification copies last 90 days. These are supplemental copies, not the durable release destination. Track public asset IDs/digests and source/signing identities in Git; keep a maintainer-controlled original local copy. GitHub availability and authorized deletion remain risks. Restoration must match the tracked digests and signatures, and no workflow in this item deletes assets or releases.

## Evidence

GATE-RELEASE-EVIDENCE, INT-RELEASE-EVIDENCE and INT-RELEASE-EVIDENCE-PACKET test isolation, exact coverage, exclusions/staleness, digest-bound handoff and conflict refusal offline using synthetic policy inputs. They do not generate signatures or establish live Studio compatibility. Actual workflow publication, independent public download and exact-source CI passed as recorded below; BGA-407 is verified.

## Observed verification, 2026-09-30

[Publication workflow 36747466711](https://github.com/Brandon-Born/bga-mcp/actions/runs/36747466711) at `0c7564c2b872dc3e73eeb54561e542fa1023d118` passed prepare, publish and public-download verification. The [candidate evidence prerelease](https://github.com/Brandon-Born/bga-mcp/releases/tag/v1.0.0-rc.1) is release `400250086`, with twelve metadata assets and no npm tarball. The publisher resumed that same existing draft after authenticated discovery; it created no duplicate and overwrote no asset. All asset IDs, public URLs and SHA-256 digests are retained in the [distribution receipt](release-evidence-v1.0.0-rc.1.json).

[Exact-source CI 36747467733](https://github.com/Brandon-Born/bga-mcp/actions/runs/36747467733) passed all six supported platform/Node jobs, each with 595 tests and 179 required scenarios. These are distribution-code checks. The published signed original observations retain their own source `a2031afe9da6acbdcf1712007da8394bc0fdeef2`, date and 590-test/174-scenario results; their bytes were preserved. The original signing source remains `5a3dc725adcf2bf914d8a0be09ab1a6207c46cde`.

The hosted Ubuntu verifier and independent macOS verifier downloaded the fixed public asset URLs without a token and independently acquired trust roots. Both passed original signature/identity, trusted schema and exact eleven-entry local coverage with six exclusions and no live Studio claim. Independent probes on copies of the public packet refused omission of an advertised capability, invented Studio support, a permissive replacement schema and changed signed evidence through the actual cryptographic verifier. Local copies remain ignored under `.artifacts/published-release-evidence/v1.0.0-rc.1/`; release assets are retained for the release lifetime under the policy above. BGA-400, BGA-401, BGA-405 and BGA-415 retain install guides, client breadth, release security review and package publication ownership.

## Sources

- [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) documents tag-based release records and download assets.
- [GitHub CLI release creation](https://cli.github.com/manual/gh_release_create) documents existing-tag refusal, drafts and prereleases.
- [Release assets API](https://docs.github.com/en/rest/releases/releases) documents asset identities and SHA-256 digests.
- [BGA-404 signature policy](RELEASE_SIGNING.md) retains the original attestation sources and independently constrained signing identity.

## Current documentation and BGA-432 replacement: rc.4 preparation

The current manual workflow and its read-only verifier/builtin-only publisher
select [the independently verified rc.4 candidate](release-candidate-v1.0.0-rc.4.json)
and [its independently verified signature](release-signing-v1.0.0-rc.4.json).
Its existing tag identifies original source
`5c4eebd782f3e1bb2251bd8aad4a6826038ddb15`, package SHA-256
`662c23199cdfd62365b1e94c6ec28bb61374e9d11eafd606f1f29ba1ec6ad200`,
and signer `b593b76dc56fbb6affc1264b3b5ee53a338c209b`.
Only reviewed receipt selectors and the candidate-specific concurrency group
advance. The twelve metadata assets, immutable identity/schema/coverage checks,
isolated write job and refusal of foreign/conflicting records remain unchanged.
No tarball is distributed by this workflow.

This preparation does not claim live distribution. The candidate-specific
packet must first pass local preparation and the full gate, then the actual
manual workflow, independent public download/refusal controls and exact-source CI.
The original rc.1 public record and every earlier receipt remain historical;
they do not supply rc.4 public download proof or package/security approval.

### Observed rc.4 public distribution, 2026-10-02 UTC

[Workflow 36982958202](https://github.com/Brandon-Born/bga-mcp/actions/runs/36982958202)
at `b5eb22c335953376bd6c3fc210881f4c7b3fe579` passed preparation,
publication and public-download verification. Attempt one passed preparation,
then failed publication, leaving matching empty draft `401642719`.
Authenticated reconciliation confirmed the exact title, notes and retained plan;
attempt two resumed that same draft, uploaded all twelve metadata assets and
published the [rc.4 evidence prerelease](https://github.com/Brandon-Born/bga-mcp/releases/tag/v1.0.0-rc.4).
The generic first failure message does not establish its underlying cause.
No duplicate was created and no asset was overwritten.

The hosted Ubuntu verifier and independent macOS Node 22 verifier acquired the
public assets without token flags and independently acquired trust roots.
Original signature/identity, trusted schemas and exact eleven-entry local
coverage passed, with six exclusions and live Studio `not-run`. All twelve
public files match both independently prepared packets byte for byte.
Probes on copies refused omitted advertised coverage, invented Studio support,
a permissive replacement schema and modified signed evidence. The last probe
also failed the actual cryptographic verifier; all original public-copy digests
were unchanged after the probes.

[Exact distribution-source CI 36982923705](https://github.com/Brandon-Born/bga-mcp/actions/runs/36982923705)
passed all six Ubuntu/macOS/Windows Node 22/24 jobs. Every downloaded evidence
record passed schema and integrity checks, names the clean exact source, and
records 674 passing tests, 209 passing required scenarios and passing applicable
conformance. The original signed evidence retains its own candidate source
`5c4eebd782f3e1bb2251bd8aad4a6826038ddb15`, 674 tests and 209 scenarios;
distribution did not rebuild the candidate or renew its dated security audit.
The eight unchanged previously read framework decisions were explicitly
re-admitted against the sealed clean distribution evidence; the actual release
guard passes without weakening its implementation/fixture boundary.

[The rc.4 distribution receipt](release-evidence-v1.0.0-rc.4.json) retains release
and asset IDs/digests, original and distribution identities, CI evidence hashes,
independent verification and refusal results, and lifetime retention policy.
Local public copies remain ignored under
`.artifacts/published-release-evidence/v1.0.0-rc.4/`. Historical receipts and
public rc.1 assets remain unchanged. This establishes candidate evidence
distribution, not registry package publication, security approval, live Studio
compatibility or whole-game correctness.
