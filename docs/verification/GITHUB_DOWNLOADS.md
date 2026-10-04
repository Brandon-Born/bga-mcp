# Signed bga-mcp GitHub download: v1.0.0-rc.7

```verification-record
{"kind":"review","scope":"Owner-selected GitHub acquisition companion for original signed rc.7; publication requires final approval and a successful retained independent public-package verification"}
```

This is the first-download channel selected by the owner. It distributes a prerelease of the frozen local-only MCP: seven tools, three project resources and stdio protocol `2025-11-25`. npm publication is deferred. The source archives GitHub generates are not the signed installable package.

Use this guide only when the package assets are available and a successful `github-consumer-RUN.json` receipt is attached to the same release. If an asset is absent or verification fails, stop. The owner selection alone does not approve publication. The independent reporting lifecycle and fresh security approval remain required before the publishing workflow may admit the original tarball.

## Download and authenticate

Create an empty directory outside your game project for the nine-file original signed packet. In that directory, download these exact assets from [the rc.7 release](https://github.com/Brandon-Born/bga-mcp/releases/tag/v1.0.0-rc.7):

- `bga-mcp-1.0.0-rc.7.tgz`
- `release-candidate.json`
- `release-candidate.schema.json`
- `verification-evidence.json`
- `security-audit.json`
- `security-audit-policy.json`
- `SHA256SUMS`
- `sigstore-bundle.json`
- `release-provenance.json`

Every asset URL starts with `https://github.com/Brandon-Born/bga-mcp/releases/download/v1.0.0-rc.7/` followed by its exact filename. Downloads need no GitHub account. For example, in a POSIX shell:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' --max-time 60 --max-filesize 16777216 --output bga-mcp-1.0.0-rc.7.tgz https://github.com/Brandon-Born/bga-mcp/releases/download/v1.0.0-rc.7/bga-mcp-1.0.0-rc.7.tgz
```

The original tarball SHA-256 is `e1ac0af1a8f513a7fbd472a8fd1734ca91787d2f7d42f69f3382e037b15516de`. The source is `8bd773d2d597b7b2b2c3abd6316e41cd84c1a81c`; the certified signer is separately `c642ed05df566964b10a27a2009a7427e41ed6bd`. A checksum match alone is not signature verification.

Use Node 24 and GitHub CLI in an independently trusted verifier checkout whose rc.7 candidate/signing receipts select those identities. Obtain trust roots independently, then verify the downloaded packet, with no extra guide or consumer receipt inside it:

```sh
gh attestation trusted-root > /absolute/path/to/independent-roots.jsonl
node --experimental-strip-types scripts/release-signing.ts verify /absolute/path/to/signed-packet c642ed05df566964b10a27a2009a7427e41ed6bd /absolute/path/to/independent-roots.jsonl
```

The trusted verifier constrains issuer, repository, hosted signing workflow, main source ref, exact signer commit, original subjects and provenance. Its code is repository tooling, not code shipped inside the MCP package. Do not execute a verifier copied from an untrusted download or infer approval from a decoded signature payload. Retain authenticated original bytes for reinstalling; never substitute a source build.

## Install, configure and remove

Follow the tested [installation recipes](https://github.com/Brandon-Born/bga-mcp/blob/main/docs/INSTALL.md) using your dedicated installation directory and the verified `bga-mcp-1.0.0-rc.7.tgz`. That document explicitly retains rc.3 as a historical acquisition example; this companion supplies rc.7's independently pinned acquisition identities. The unchanged installation recipes are tested against rc.7. The installed version command must return `1.0.0-rc.7`.

For example:

```sh
corepack pnpm add --prefer-offline --dir "/absolute/path/to/bga-mcp-install" "/absolute/path/to/signed-packet/bga-mcp-1.0.0-rc.7.tgz"
corepack pnpm --dir "/absolute/path/to/bga-mcp-install" exec bga-mcp --version
```

Node 22.13 or later on Node 22, or Node 24, and pnpm 11.15.1 are the tested runtime/package-manager combination. Configure your client with the public installed command and an explicit authorized game root as the installation guide shows. Ask it to call `inspect_project`; discovery must show exactly the frozen seven tools and three resources. Unsupported findings remain uncertainty, not proof of game correctness. Network and Studio flags are refused.

Download, verification and dependency installation may use the network. The installed MCP remains local and read-only, with no Studio credential required. Use the guide's same-version repeat-install and removal recipes. After removal the public command must be absent and your project unchanged. A client may retain its own history; package-manager caches are separate from MCP state.

## Recovery and retention

If publication or public verification fails, preserve the exact release and original assets. No workflow overwrites or deletes them. A byte-identical partial upload can be reconciled by the maintainer under fresh admission; a conflicting asset is an incident. A package defect needs a newly reviewed candidate. A failed consumer prevents publishing its success receipt. This channel has no registry dist-tag or stable promotion, and rc.7 remains a prerelease.

The original packet and successful consumer receipt are retained as public release assets for the release lifetime. Keep your own authenticated copy as well; GitHub hosting does not itself make assets cryptographically immutable.
