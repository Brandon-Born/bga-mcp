# Candidate installation walkthrough — BGA-400

```verification-record
{
  "kind": "review",
  "scope": "BGA-400 executable installation guide, public-command first use, repeat installation and removal"
}
```

The [installation guide](../INSTALL.md) uses the original signed `v1.0.0-rc.1` tarball, not a source clone or an unpublished registry package. Download and authentication remain governed by the independently reviewed [signing receipt](release-signing-v1.0.0-rc.1.json). Public metadata assets are not an installable package, and the Actions artifact expires on 2026-12-29.

`E2E-INSTALL-GUIDE` reads the actual marked guide blocks, substitutes fresh consumer paths, and executes their commands and platform configuration. It installs the same tarball as the complete gate, checks the package-manager-created public command/version, discovers exactly the installed inventory, calls `inspect_project`, verifies missing-root refusal, closes each server process, repeats installation and first use, hashes the project before/after, removes the package, and checks both the public shim and dependency entry are absent. Its CI matrix is Ubuntu/macOS/Windows with Node 22/24. No named editor or agent support is inferred from this reference-client test.

After independently verifying the signed original with `pnpm verify:signed-release`, run `BGA_MCP_SIGNED_CANDIDATE=/absolute/path/to/signed-packet pnpm exec tsx scripts/test-install-guide.ts` from a trusted verifier checkout. The runner checks the original candidate's identity/checksums against the tracked receipt and exercises the same guide against those original bytes. Its sanitized `.artifacts/install-guide-original.json` binds the exact artifact and guide digests, Node/platform and observations. It does not independently perform signature verification; that is the explicit prerequisite above. Raw paths and transcripts are not retained.

Only repeat installation is measured. A cross-version update needs another reviewed candidate. Package-manager cache and client-owned history are distinct from the MCP server's persistent state, which is absent. Acquisition and installation may use GitHub/package-registry networking; the installed MCP server remains local and read-only. BGA-411 still owns comprehensive installed documentation and inventory-derived drift checks.

## Observed verification

The independent macOS/Node 22.17.1 run on 2026-09-30 reverified the original signature and provenance through the BGA-404 verifier, then followed this guide against the original tarball. The [sanitized receipt](install-guide-v1.0.0-rc.1.json) records passing installation, exact discovery, first use, root refusal, repeat installation, unchanged project, server exit and package removal. Exact-commit CI remains required before marking this item verified.
