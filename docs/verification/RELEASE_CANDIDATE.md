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

## BGA-431 replacement: rc.3

The original `v1.0.0-rc.3` tarball was produced from exact source
`c7ad5c2962e608a82b532dd0d1882040d1ba31ea` by
[candidate run 36954183424](https://github.com/Brandon-Born/bga-mcp/actions/runs/36954183424).
[Source CI 36953654315](https://github.com/Brandon-Born/bga-mcp/actions/runs/36953654315)
passed all six platform/Node jobs, each with 651 tests and 193 required scenarios.
The producer required identical Ubuntu/Node 24 reconstruction and fresh production
and full-graph audits, both with zero findings. Cross-platform packing retains
individual hashes; no cross-platform byte-equality claim is made.

The [rc.3 receipt](release-candidate-v1.0.0-rc.3.json) binds original tarball
SHA-256 `598cad2186c60e8110d8906ffb91739893c357ebed69cad0529c8a5a367907a3`,
archive digest, six source receipts, lockfile, manifest, sealed evidence and audit.
Independent download verified all six checksum entries and their source
relationships. A fresh native Codex 0.159.2 consumer discovered/called all seven
tools, read all three resources, refused malformed/outside/excluded requests,
proved unchanged project/configuration and exited cleanly. Removal removed the
command. The original BGA-431 public-command/prototype probe also passed against
these exact bytes; [the fixed observation](bga431-fixed-v1.0.0-rc.3.json) remains
separate from rc.2's historical failure.

Only after this verification are signing selectors advanced to rc.3. Signing and
frozen BGA-424 carry-forward remain subsequent observations. Original rc.1/rc.2
packets and receipts remain unchanged; no package is published.

## Current documentation and BGA-432 replacement: rc.4 preparation

The checkout now identifies `1.0.0-rc.4`, including the public installation and
private reporting documentation changes plus BGA-432's conservative treatment
of the unconfirmed class-only initial state. Only package/server/manifest version
metadata changes in this preparation; the selected seven local tools, three
project resources, stdio protocol and public schemas remain unchanged.

Changing package identity invalidates the eight previous framework implementation
admissions. The replacement requires passing clean exact-source CI, explicit
review re-admission against that evidence, a distinct clean tag, actual immutable
production and independent original-byte consumer checks. Signing, candidate-specific
client/usefulness/public evidence and security approval remain subsequent gates.
No rc.4 candidate is claimed yet; the verified rc.3 install guide and historical
receipts continue to identify their original bytes. No package is published.

### Preparation CI and framework admission

[Preparation CI 36976614262](rc4-preparation-ci.json) at
`c2d8d9d6411011a8589281556be659386ccba50a` completed successfully in all six
Ubuntu/macOS/Windows Node 22/24 jobs, each with 674 tests and 209 scenarios.
Each sealed receipt identifies a clean checkout. All eight unchanged, previously
read source decisions were explicitly re-admitted against that post-observation
evidence; the actual framework release guard passes for the new implementation.
The following handoff commit retains those admissions so a distinct clean tag
can pass the producer guard. Actual candidate production and consumer verification
remain pending. The earlier signed candidates and their historical receipts are
unchanged.

### Original rc.4 produced and independently consumed

[Candidate workflow 36977454907](https://github.com/Brandon-Born/bga-mcp/actions/runs/36977454907)
completed successfully for `v1.0.0-rc.4` at
`5c4eebd782f3e1bb2251bd8aad4a6826038ddb15`. It ran the complete gate,
fresh zero-finding production and full-graph audits, and byte-for-byte
Ubuntu/Node 24 reconstruction. [Exact-tag source CI 36977410122](https://github.com/Brandon-Born/bga-mcp/actions/runs/36977410122)
passed all six platform/Node jobs with 674 tests and 209 required scenarios.
Cross-platform CI retains individual package digests; no cross-platform
byte-equality claim is made.

The original package SHA-256 is
`662c23199cdfd62365b1e94c6ec28bb61374e9d11eafd606f1f29ba1ec6ad200`.
[The rc.4 receipt](release-candidate-v1.0.0-rc.4.json) records original archive
ID `11214430454`, archive digest, finite retention, six checksums, trusted
manifest/schema, sealed evidence, source/audit relationships and consumer results.
The original seven files are retained locally in ignored
`.artifacts/release-candidates/v1.0.0-rc.4/`.

A fresh native Codex 0.159.2 consumer on macOS/Node 22 called all seven local tools,
read all three resources and refused malformed, outside-root and excluded-tool
requests. Installed BGA-432 variants for state IDs 2 and 12 retained located
uncertainty through every consumer, without initial/reachability false findings;
explicit setup returns resolved both IDs. Project and user-configuration hashes
were unchanged, native processes exited and package removal succeeded.
The [unsigned original installation recipe run](install-guide-v1.0.0-rc.4-unsigned.json)
also passed install, version, first use, unconfigured-root refusal, repeat
installation and removal. Acquisition/signature policy is still pending BGA-404;
these consumer results do not supply cryptographic verification.

[The current Dino Racer rerun](rc4-dino-racer-rerun.json) is separately scoped:
all seven tools and three resources were exercised without changing the clean
`83e2e50` game revision. The whole working root reported source-scope uncertainty
and an audit of 0 passed / 1 failed / 32 unsupported / 8 manual checks. An explicitly
selected, digest-bound 18-file temporary production export reported 26 passed /
1 failed / 6 unsupported / 8 manual checks; state, action and notification validators
passed, while database coverage remains incomplete. The excluded tests, scripts
and disabled client files are a visible source-set change, not a clean whole-root
verdict. This is not game correctness, live Studio gameplay or a repeat of the
complete frozen BGA-424 evaluation. The source-selection workaround and computed
SQL limitation remain in [the agent wishlist](../AGENT_WISHLIST.md).

Only these bounded producer/consumer observations are complete. The original
rc.4 candidate is unsigned; signing selectors still identify rc.3 until the
replacement handoff is reviewed and advanced. No package or registry metadata
was published. Earlier immutable tags, signed packets and receipts are unchanged.

BGA-404 subsequently [signed the same original rc.4 files](release-signing-v1.0.0-rc.4.json)
and passed independent cryptographic verification. The unsigned producer receipt
above remains its historical observation. [The explicit frozen-task repeat](AGENT_EVALUATION_CARRY_FORWARD.md#signed-rc4-frozen-task-repeat)
uses those signed bytes; it is separate from the current-project source-scope
comparison and does not establish general game correctness or publication.

## Versioned-guide replacement: rc.5 preparation

Package, runtime version and manifest identify `1.0.0-rc.5`. This distinct
candidate is intended to include README/INSTALL's corrected historical-example
wording after the clean rc.4 security assessment identified those two guide
mismatches. The guide no longer needs to change just because a newer candidate
exists. No public tool, resource, schema, protocol/support contract or BGA reader
behavior changes with this version metadata.

The current retained rc.4 candidate, signature, security review and all four
publication prerequisites remain original-byte evidence, not proof of rc.5.
Version preparation must first pass the full local gate and clean exact-source
CI. The existing broad implementation digest also requires explicit framework
re-admission against that passing final preparation source before a clean new
tag can enter the non-publishing producer. Prior clean-reference CI is retained
separately, not reused to cover the new version metadata. Original candidate
creation, independent consumer checks, signing, public evidence, usefulness,
security and owned external release gates still require rc.5-specific proof.

[Preparation CI 36987676558](rc5-preparation-ci.json) passed all six jobs at
`e04810a45721008cec95f5b190252d08cbf48c4f`, each with 674 tests and 209 scenarios.
All downloaded records passed trusted schema, clean exact-source, integrity and
applicable-conformance checks. The eight unchanged previously read framework
source decisions were explicitly re-admitted using that sealed evidence;
the actual release guard passes. This ledger handoff precedes tagging, the
immutable producer and independent original-byte consumption.

## Original rc.5 producer and consumer handoff

The [original rc.5 receipt](release-candidate-v1.0.0-rc.5.json) binds clean tag
`v1.0.0-rc.5` to source `286f2bbb1bfff28726378098d9883058f19841e9` and
tarball SHA-256 `b7cc226a512a4aab433f8daddf49f54ee00323f3dc7da6960490be1c0727eeac`.
[Producer 36988666944](https://github.com/Brandon-Born/bga-mcp/actions/runs/36988666944)
passes the full gate, fresh zero-finding production/full audits and byte-for-byte
reconstruction on Ubuntu / Node 24. Original artifact `11218194859` expires on
2026-12-31 at 09:14:48 UTC. Its archive digest, six checksums, trusted source
schema, evidence integrity and source/material relationships were independently
verified before consumption. The original seven-file packet is retained locally
under `.artifacts/release-candidates/v1.0.0-rc.5`.

[Exact-source CI 36988582807](https://github.com/Brandon-Born/bga-mcp/actions/runs/36988582807)
passes all six Linux/macOS/Windows jobs on Node 22/24, with 674 tests and 209
scenarios each. These are separate source-CI observations; reproducibility is
claimed only for the producer's Ubuntu / Node 24 reconstruction.

An independent macOS arm64 consumer installs the original tarball through native
Codex CLI 0.159.2. All seven tools and three resources match the installed
inventory and are exercised; schema, outside-root and excluded-tool calls are
refused. Both state-class entry-point controls retain uncertainty without false
initial/reachability defects, then resolve their explicit setup return. Project
and user configuration bytes remain unchanged; native processes exit and the
installation is removed. This smoke does not renew the supported-client matrix
or replace the full BGA-424 frozen-task evaluation.

The [unsigned installation recipe run](install-guide-v1.0.0-rc.5-unsigned.json)
passes installation, version/discovery, first use, unconfigured-root refusal,
repeat installation and removal. All six packed guides match the clean candidate
checkout byte-for-byte, including the corrected historical-example wording.
The current marked recipes consume original rc.5 bytes; the separate historical
rc.3 acquisition example is not relabeled as a current rc.5 acquisition test.

The [current Dino Racer rerun](rc5-dino-racer-rerun.json) records every public
tool/resource against the unchanged whole checkout and a separately prepared
18-file production export. The whole-root audit has 0 passed, 1 failed, 32
unsupported and 8 manual-required checks. The explicit export has 26 passed,
1 failed, 6 unsupported and 8 manual-required checks. Its state, action and
notification validators pass, while computed SQL remains unsupported. Selected
file digests and omissions are retained; this manual export is not an MCP source
selection feature or proof of game correctness, gameplay or productivity.

BGA-403's original rc.5 handoff is complete. BGA-404 must next sign these retained
bytes without rebuilding; signing selectors still identify historical rc.4.
The unsigned receipt preserves that observation. No rc.5 signature, public
evidence distribution, security approval or registry publication is claimed.
