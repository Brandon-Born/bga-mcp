# Release-candidate verification — BGA-403

```verification-record
{
  "kind": "review",
  "scope": "BGA-403 actual tagged non-publishing candidate workflow and independent artifact verification"
}
```

## Preparation, 2026-09-30

The selected inventory remains the seven local tools, three project resources, stdio and protocol `2025-11-25` in `config/release.json`. Package, server metadata and capability manifest are aligned at `1.0.0-rc.1`. No public capability or permission is added.

[CI run 36665974043](https://github.com/Brandon-Born/bga-mcp/actions/runs/36665974043) passed all six Ubuntu, macOS and Windows jobs on Node 22 and 24 for `b260fb82ab04772a453a7d17491fe991b9e8a96f`. It exercises BGA-416 through BGA-420 through the installed public command and the BGA-422 offline gates. [Security review 36666038472](https://github.com/Brandon-Born/bga-mcp/actions/runs/36666038472) retained a report for that same source with zero production and full-graph findings. These are prerequisite observations, not evidence for candidate bytes that have not been built.

The candidate workflow must run the complete gate and fresh live audits on its own exact tagged source, preserve the original tarball, reconstruct equal bytes from the same tag and frozen lockfile, and retain checksums, manifest, sealed verification evidence, audit and exception policy. An independent download must verify those checksums and source/digest relationships and exercise the installed package command with a real MCP client before BGA-403 is marked verified.

## Observed verification, 2026-09-30

BGA-403 is verified for **`v1.0.0-rc.1`**, source **`a2031afe9da6acbdcf1712007da8394bc0fdeef2`**. [Candidate workflow 36720091111](https://github.com/Brandon-Born/bga-mcp/actions/runs/36720091111) completed successfully and retained the original candidate; [exact-source CI 36720062520](https://github.com/Brandon-Born/bga-mcp/actions/runs/36720062520) passed all six Ubuntu, macOS and Windows jobs on Node 22 and 24. Each CI report identifies that commit, a clean checkout, 590 passing tests and 174 passing required scenarios. The candidate's evidence records 27 packaged suites installing its exact tarball and passing applicable official conformance.

The workflow rebuilt from the same tag in an offline frozen-lockfile worktree and required byte-for-byte equality before retention. This observed reconstruction is scoped to Ubuntu/Node 24. The cross-platform CI reports retain their individual package hashes: macOS and Windows packing produced different hashes from Ubuntu. Source CI does not claim cross-platform byte equality. The independent macOS consumer below installed the original retained Ubuntu tarball, rather than a local repack.

### Immutable artifact identity

| Field                                  | Observed value                                                            |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Original tarball                       | `bga-mcp-1.0.0-rc.1.tgz`                                                  |
| Tarball SHA-256                        | `sha256:a3472a97916bbd793fe32ffb847ced3d9638fe2c45cc112867b0af0a15f3acfa` |
| Frozen lockfile SHA-256                | `sha256:a17c4c126275539fbea34035bf7af053881f5fca166de0cb51ad30941f5994fa` |
| Retained verification evidence SHA-256 | `sha256:cd1717e7c146e9588ed5b42d0607de071ac3b9826b015fcf3984f5c3eaa27eda` |
| Retained security report SHA-256       | `sha256:41dd84e3abea302827b1824fc951d6dff3a85953b8c42bab6d912e99ead0f4f1` |
| GitHub artifact ID                     | `11098152088`                                                             |
| GitHub artifact name                   | `bga-mcp-release-candidate-v1.0.0-rc.1`                                   |
| GitHub archive SHA-256                 | `sha256:d2bf5b3bc0234e1fe2f441956f218df23f9658de5e35e037cdd616f983571385` |
| Hosted retention expiry                | `2026-12-29T13:13:29Z`                                                    |

The candidate audit was generated at `2026-09-30T13:16:28.342Z` and reported zero production findings, zero full-graph findings and no exceptions. It identifies the exact source commit and lockfile, package, workspace and policy digests. The policy is retained under checksums. This closes BGA-422's candidate evidence; freshness and exception checks still apply before later security approval and publication.

### Independent consumer verification

A separate download verified all six `SHA256SUMS` entries, the manifest schema, the sealed evidence, the tarball's package identity/public executable, the packed inventory and capability-manifest digests, and audit identities against the tagged source. On macOS with Node 22.17.1, a fresh consumer installed the exact retained tarball and invoked its package-manager-created `bga-mcp` command through the real MCP SDK client. Discovery matched all seven tools and three resources with no resource templates or prompts. `inspect_project` and a project-summary resource read succeeded; setup, documentation and Studio calls and options were refused. Project contents were unchanged, stderr was empty, the server exited and package removal removed the installed command.

The synthetic missing-evidence, changed-artifact, failing-gate, dirty-source, wrong-version, exclusion and vulnerable-dependency probes also passed as part of the tagged complete gate. They establish refusal behavior separately from the hosted success observation.

### Handoff to BGA-404

The [machine-readable receipt](release-candidate-v1.0.0-rc.1.json) records the observed candidate, hosted artifact, CI package hashes, audit and independent consumer results. Original downloaded bytes are also retained locally under `.artifacts/release-candidates/v1.0.0-rc.1/`; they are deliberately ignored by Git. The source tag and this receipt are tracked handoff identities, while GitHub's artifact has the finite expiry above.

BGA-404 must download artifact `11098152088` from run `36720091111`, verify the recorded archive digest and bundle checksums, and consume the original `bga-mcp-1.0.0-rc.1.tgz`. Later documentation commits on `main` describe this candidate; they do not replace its tagged source or authorize a rebuild. Signing, attestations, public evidence distribution, supported coding-client smoke and publication retain their existing backlog owners. No package was published, no signature was claimed, and the candidate workflow has only `contents: read` with no publication credential or identity-token permission.

BGA-404 subsequently verified signing of these same seven original files; [the signing receipt and instructions](RELEASE_SIGNING.md) record the independent byte comparison and verified fresh consumer. The unsigned candidate receipt above remains the historical BGA-403 observation.

## Sources

- [pnpm pack](https://pnpm.io/cli/pack) says “Create a tarball from a package” and documents `--pack-destination`.
- [GitHub manual workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) documents `workflow_dispatch`, explicit inputs and selecting a workflow ref.
- [GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data) documents retained artifacts, retention limits and download digest validation. The workflow artifact is a candidate for later signing and review; this item grants no publication or identity-token permission.
