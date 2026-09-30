# Per-release evidence distribution — BGA-407

```verification-record
{
  "kind": "review",
  "scope": "BGA-407 authenticated public candidate evidence, exact frozen capability/environment coverage, isolated publication and retention"
}
```

The manual `Publish candidate verification evidence` workflow consumes the original [BGA-404 signed candidate](RELEASE_SIGNING.md). It distributes verification metadata on the existing `v1.0.0-rc.1` GitHub prerelease record. It does not rebuild or distribute an npm tarball, grant security approval, or publish to a package registry. The signing identity and original source commit remain distinct from later distribution code.

## Packet and authentication

Twelve assets are required: the original `verification-evidence.json`, `release-candidate.json`, candidate schema, security report/policy and `SHA256SUMS`; the original `sigstore-bundle.json`; original digest-bound `capabilities.json` and `release-inventory.json`; original `evidence.schema.json`; and the derived `release-evidence.json` with its schema. None contains private developer projects, credentials or live Studio/player data.

The original evidence is already a signed subject of BGA-404's seven-subject retention attestation. The derived view is not newly signed: acceptance recomputes it from that signed evidence and the inventory/manifest digests in the verified original predicate. Consumers verify the original signing repository, workflow, main ref, exact signing/source commit, issuer and hosted-runner policy, all seven signed subjects (including the original tarball's digest), trusted schemas and original receipt. Schemas supplied in the packet cannot redefine acceptance; they must match schemas in the trusted original source or reviewed verifier checkout.

The view accounts for all 17 repository entries: the frozen seven tools, three resources and stdio transport have exact local capability/environment/scenario coverage; six other entries are explicitly excluded. Live Studio is `not-run`, with no advertised capabilities. Repository-local and scripted-source fixture successes are not live Studio evidence. Stale/failing selected evidence blocks acceptance; stale excluded entries are labelled. The original source/CI, artifact and dates are retained; later signing or publication does not renew dated observations.

## Validation

Use a separately trusted, reviewed repository checkout with full Git history, its frozen dependencies, GitHub CLI supporting artifact attestations and curl. Acquire trust roots through GitHub CLI independently of the packet. Do not execute verifier code supplied by an asset packet.

```sh
corepack pnpm release:evidence download /tmp/bga-public-release-evidence
```

This fetches twelve fixed public GitHub asset URLs without a token, cookies or private project data, validates both trusted schemas, verifies the existing Sigstore bundle and identity constraints, and proves exact frozen capability coverage. To validate an already downloaded directory:

```sh
corepack pnpm release:evidence verify /path/to/evidence-packet
```

The `verify` command always verifies signatures; there is no CLI bypass. Original raw evidence may include repository entries beyond the public inventory, so use the recomputed release-scoped view when assessing advertised support. Checksums alone do not authenticate assets. A candidate receipt or latest development evidence from another source/artifact cannot replace this original evidence.

## Publication and retention policy

Every distributed release must retain this complete evidence packet and pass public download validation. The current workflow is deliberately restricted to the reviewed `v1.0.0-rc.1` candidate and its tracked candidate/signing receipts. A later tag requires its own reviewed receipts and validation before distribution; this item does not automatically approve arbitrary future tags. BGA-415 must preserve this evidence requirement when publishing the package.

Prepare has read-only permissions, performs the full gate, authenticates the original signed archive, derives exact coverage and scans all assets. Only the publish job has repository contents-write; it installs no dependencies, uses only builtins and GitHub CLI, and verifies the prepared packet against a digest delivered through job outputs. It first creates a draft, checks each uploaded asset's server-reported digest and publishes the evidence-only prerelease only once all twelve assets are present. A retry can resume only an identical owned draft or accept an already identical complete record. Conflicts or foreign records fail without overwrite or deletion.

Retain release assets for the lifetime of their release, with no automatic expiry or replacement. Preserve signed historical observations; newer assessments require separately named records and their own review. Temporary prepared workflow artifacts last seven days; downloaded verification copies last 90 days. These are supplemental copies, not the durable release destination. Track public asset IDs/digests and source/signing identities in Git; keep a maintainer-controlled original local copy. GitHub availability and authorized deletion remain risks. Restoration must match the tracked digests and signatures, and no workflow in this item deletes assets or releases.

## Evidence

GATE-RELEASE-EVIDENCE, INT-RELEASE-EVIDENCE and INT-RELEASE-EVIDENCE-PACKET test isolation, exact coverage, exclusions/staleness, digest-bound handoff and conflict refusal offline using synthetic policy inputs. They do not generate signatures or establish live Studio compatibility. Actual workflow publication, independent public download and exact-source CI remain pending; BGA-407 is implemented until those gates pass.

## Sources

- [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) documents tag-based release records and download assets.
- [GitHub CLI release creation](https://cli.github.com/manual/gh_release_create) documents existing-tag refusal, drafts and prereleases.
- [Release assets API](https://docs.github.com/en/rest/releases/releases) documents asset identities and SHA-256 digests.
- [BGA-404 signature policy](RELEASE_SIGNING.md) retains the original attestation sources and independently constrained signing identity.
