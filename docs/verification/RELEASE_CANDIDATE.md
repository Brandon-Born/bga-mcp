# Release-candidate verification — BGA-403

## Original rc.6 producer and independent consumer — 2026-10-02 UTC

[Candidate run 37067227890](https://github.com/Brandon-Born/bga-mcp/actions/runs/37067227890) produces original `v1.0.0-rc.6` from clean source `36a7d86f8b112c5025826e4b8aee5f7c7b7e5bd1`. The full tagged gate passes 768 tests / 234 scenarios and the fresh exact-source production/full-graph audit reports zero findings. The producer proves byte-for-byte Ubuntu/Node 24 reconstruction before retention. [Exact-tag CI 37067230778](https://github.com/Brandon-Born/bga-mcp/actions/runs/37067230778) passes all six platform/Node jobs; every downloaded sealed record independently validates schema, integrity, clean exact source, scenarios, conformance and installed artifact identity. Cross-platform packing hashes differ; no cross-platform byte reproducibility is claimed.

The independently downloaded archive is artifact `11252987277`, archive `sha256:81e509db2f451e4ed4a2bed975c0cb2f0db1e3ff62444350c6fbbd75eb72fc97`, with original tarball `sha256:9ac83f5f3d643296581d10f2dd426221c792426315b6a2b468c5d3c45fd928ea`. Hosted retention expires `2026-12-31T21:30:24Z`. All six checksums, trusted schemas, sealed evidence, derived manifest, source/audit/lock identities, public executable and six packed guides are independently verified. Original bytes are preserved under `.artifacts/release-candidates/v1.0.0-rc.6/`; [the new producer receipt](release-candidate-v1.0.0-rc.6.json) preserves exact identities without modifying older receipts.

The original unsigned archive passes the [installation recipes](install-guide-v1.0.0-rc.6-unsigned.json) and native Codex 0.159.2 macOS/Node 22 consumer: seven tools/three resources, schema/outside-root/exclusion refusals, both uncertain state-class entry controls, unchanged project/configuration, process exit and removal. [Dino Racer](rc6-dino-racer-rerun.json) remains clean at `83e2e50`; the whole-root inspection retains explicit source-scope uncertainty. This is a read-only rerun, not game correctness or BGA-424 carry-forward. Native-client stderr activity is recorded as observed; no raw stderr is retained or empty-stderr claim made.

The signing selector now names the actual original rc.6 receipt. The app currently shadows the evaluated client with a different alpha binary. The unsigned consumer therefore invokes the separately pinned 0.159.2 binary explicitly. The retained controlled-client runner and rc.5 claim remain unchanged until the new signed candidate can be re-executed; its prepared executable-pinning change belongs to that later handoff, not this signing preparation. All six relevant generated 0.159.2 schemas match the prior reviewed bytes. Reviewed exact rc.6 receipt paths are registered as release bookkeeping; changing that dependency map holds current reviewer admission until fresh integrated CI and explicit review. None of these reviewer preparations rebuilds the original tagged archive. Signing, supported-client renewal, public evidence, frozen-task usefulness, final security approval, publisher setup and the final independent reporting lifecycle remain their distinct gates.

## rc.6 preparation — 2026-10-02 UTC

The first-release scope remains the existing `first-local-only` inventory: seven local tools, three project resources, stdio and protocol `2025-11-25`. Package, metadata and capability-manifest versions now select `1.0.0-rc.6`. The public executable and contract are unchanged. This candidate will include the integrated correctness and lifecycle changes after rc.5; no existing rc.5 signature, installation, client, usefulness or security receipt is evidence for these new bytes.

Before tagging, the integrated gate and fresh exact-source CI must pass, and all affected framework pages must be explicitly admitted against that post-observation evidence. The existing producer must then retain one original tarball, prove its frozen-lockfile reconstruction, and record exact source, audit, manifest and checksums. Independent consumers, signing, public evidence and security review must consume that original artifact without rebuilding it. Candidate-specific selectors advance only when their actual replacement receipts exist. The unresolved `main` integration approval, independent reporting lifecycle and publisher setup remain separate holds; no candidate or publication is claimed by this preparation.

The integrated local `corepack pnpm check` passes at dirty preparation based on `1fd29af1792ad7a8b3b6b1bc7afd67a0dc5ba9bd`: 768 tests, 234 required scenarios, 103 retained claims and 17 capabilities; packaging, official applicable conformance and safety pass. The observed test package is `sha256:e74e1b5ae05f7f9174b31e6831defcc7e02ea35a7f540fb39c4caf8cdf13a906`; sealed evidence at `2026-10-02T21:16:36.460Z` hashes to `sha256:b7c6eb062978e5c11ff8f79a02f9df2cd763e0d90bbdd20137668cc76e6a5d73`, and the full log hashes to `sha256:3cb6084368212dd421fbd5c867026c4b57ad9637098c4d679dd3d320f8e295e7`. These are local preparation results, not an original tagged producer artifact or clean CI admission. The later workflow-only instruction placing the independent report last received formatting and diff checks; it changes no acceptance requirement or package bytes.

[Exact-source CI 37066111972](https://github.com/Brandon-Born/bga-mcp/actions/runs/37066111972) passes all six Ubuntu/macOS/Windows Node 22/24 jobs at `667883c`; each downloaded record independently validates the trusted schema, intact digest, clean exact source, 768 tests / 234 required scenarios, conformance and one consistent installed package per job. The review block retains their individual identities. The owner explicitly approved [PR #8](https://github.com/Brandon-Born/bga-mcp/pull/8), which merged as `de5e492`. All eight refreshed pages were explicitly admitted against the post-observation Ubuntu/Node 24 record through the actual review command; the actual framework release guard succeeds with zero holds. This clears source preparation for tagging, not signature/security approval or registry publication. The user will arrange the independent reporting lifecycle as the final gate.

```verification-record
{
  "kind": "review",
  "scope": "BGA-403 actual tagged non-publishing candidate workflow and independent artifact verification",
  "rc6Preparation": {
    "sourceCi": {
      "url": "https://github.com/Brandon-Born/bga-mcp/actions/runs/37066111972",
      "commit": "667883c5521b483da548f2fc4a2f8c864e0fc61c",
      "conclusion": "success",
      "jobs": [
        {
          "job": "verification-macos-latest-node-22",
          "evidenceDigest": "sha256:c1d2843e26e3ca5cd824bd871acd95f54764bdd8af17b44e0f7f2fcc777796c1",
          "packageDigest": "sha256:e74e1b5ae05f7f9174b31e6831defcc7e02ea35a7f540fb39c4caf8cdf13a906",
          "generatedAt": "2026-10-02T21:25:40.995Z",
          "node": "v22.23.2",
          "platform": "darwin",
          "testsPassed": 768,
          "scenariosPassed": 234
        },
        {
          "job": "verification-macos-latest-node-24",
          "evidenceDigest": "sha256:722570bbea549a44016588db578556e790c79d13877f4450cf13cfadd9864fc1",
          "packageDigest": "sha256:e74e1b5ae05f7f9174b31e6831defcc7e02ea35a7f540fb39c4caf8cdf13a906",
          "generatedAt": "2026-10-02T21:24:33.994Z",
          "node": "v24.20.0",
          "platform": "darwin",
          "testsPassed": 768,
          "scenariosPassed": 234
        },
        {
          "job": "verification-ubuntu-latest-node-22",
          "evidenceDigest": "sha256:62a443a4698cb5178deb5e803f45201d5598ceef6626e421958ca03d136435e2",
          "packageDigest": "sha256:9ac83f5f3d643296581d10f2dd426221c792426315b6a2b468c5d3c45fd928ea",
          "generatedAt": "2026-10-02T21:23:57.991Z",
          "node": "v22.23.3",
          "platform": "linux",
          "testsPassed": 768,
          "scenariosPassed": 234
        },
        {
          "job": "verification-ubuntu-latest-node-24",
          "evidenceDigest": "sha256:1e005913cbf142b3b1ca731fdae92a7b084fbd528a6df0032a545aba23dbe56a",
          "packageDigest": "sha256:9ac83f5f3d643296581d10f2dd426221c792426315b6a2b468c5d3c45fd928ea",
          "generatedAt": "2026-10-02T21:22:51.555Z",
          "node": "v24.21.0",
          "platform": "linux",
          "testsPassed": 768,
          "scenariosPassed": 234
        },
        {
          "job": "verification-windows-latest-node-22",
          "evidenceDigest": "sha256:86d4ebeb1a4dceafec4d11c56682256a73bda8c3b820893916c0f30e2ebbb2e9",
          "packageDigest": "sha256:481f192847cdc028e86229eb1122665f75516714e15e6d6a7b24041b96267702",
          "generatedAt": "2026-10-02T21:25:23.730Z",
          "node": "v22.23.3",
          "platform": "win32",
          "testsPassed": 768,
          "scenariosPassed": 234
        },
        {
          "job": "verification-windows-latest-node-24",
          "evidenceDigest": "sha256:fd549d30862406633fe3ece9a0a460f45d0e2ddf6854022715442bbdd7312798",
          "packageDigest": "sha256:481f192847cdc028e86229eb1122665f75516714e15e6d6a7b24041b96267702",
          "generatedAt": "2026-10-02T21:26:07.780Z",
          "node": "v24.21.0",
          "platform": "win32",
          "testsPassed": 768,
          "scenariosPassed": 234
        }
      ]
    },
    "approvedIntegration": {
      "pullRequest": "https://github.com/Brandon-Born/bga-mcp/pull/8",
      "mergeCommit": "de5e4927aaa5537f32ffa454f791344c6cdd1b82",
      "mergedAt": "2026-10-02T21:25:28Z"
    },
    "frameworkAdmission": {
      "reviewer": "Codex",
      "sourcePages": 8,
      "evidenceCommit": "667883c5521b483da548f2fc4a2f8c864e0fc61c",
      "ciRun": "37066111972",
      "actualReleaseGuard": "passed",
      "holds": 0
    }
  }
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

BGA-404 subsequently [signed and independently verified the same original rc.5
files](release-signing-v1.0.0-rc.5.json), with actual cryptographic negatives and
hosted/macOS fresh-consumer checks. Its exact-signer-source CI passes all six
jobs. The producer receipt above remains its historical unsigned observation;
the new signing receipt supplies the distinct signature evidence. BGA-407's
rc.5 distribution and the remaining candidate-specific release gates are separate.

## rc.12 source preparation after the October27 dependency hold — BGA-458

PR48's normal merge `4bb8ea485852229ce2703b5bad513d51b45c2983` retains the
reviewed dependency fixes and original proof commits. Frozen unsigned rc.11
remains security-held; none of its original bytes, tag or past review receipts
is replaced. The next selected package/server version is `1.0.0-rc.12`.

This source preparation changes only the three version fields and records its
bounded procedure. The patched lockfile, public contract, test/deadline/retry
settings, security policies, signer selection and public release metadata are
preserved. A local or CI test tarball is development evidence, not the original
rc.12 candidate. No original candidate or its digest is claimed before the
existing tag-gated producer succeeds.

Before production, retain a passing integrated gate, fresh canonical audits,
independent source review, clean exact-source CI and current framework
admission. The separate preparation PR needs its own normal merge approval;
then verify merged main and its checks, create `v1.0.0-rc.12` only if absent,
and dispatch the existing read-only release-candidate workflow. Keep the
original hosted archive and independently verify its API digest, inner
checksums, manifest/source/lock identities, sealed evidence, reproducibility,
audit scopes and exact-byte installed behavior. Genuine independent artifact
review and later signing/publication decisions cannot be inherited from rc.11.

The rc.12 implementation is commit
`2304c717af673561e64d4bab21d11b3314e157a8` (tree
`ff793e4c35494986211de0876273ea8aaf763ee0`). Its integrated local gate
passed 1,030 tests / 279 required scenarios while the five preparation files
were dirty on base `4bb8ea4`; that evidence is not relabeled as clean CI.
An independent source review bound all five committed file hashes with no
actionable findings (report SHA-256
`2115d2c41ba9722cc1fba7dacbbcf42edede074b97bb5274b3911cbcb67e856d`).
The canonical clean-source registry audit at `2026-10-27T17:29:17.571Z`
reported zero production and full-graph findings, without exceptions.

[Exact-source CI 40551058531](https://github.com/Brandon-Born/bga-mcp/actions/runs/40551058531)
passed all six platform/Node jobs. All six original archive hashes match the
GitHub API; independently extracted sealed records validate schema, integrity,
clean implementation source, 1,030 tests / 279 scenarios, passing conformance,
lock identity and installed test-artifact identity. Each macOS test package
matches the local development test artifact. Those packages are not an
original rc.12 candidate. After re-reading relevant wording on all eight
mapped official pages, the unchanged framework review command admitted this
actual source CI and reduced eight source-identity holds to zero. The original
October21 observation times/digests remain historical and unchanged.

This follow-up changes only framework process metadata and this receipt.
The implementation proof remains explicitly bound to `2304c71`; automatic
follow-up PR CI must finish and be verified separately. Owner merge,
original-candidate production, exact-byte review, signing and publication
remain separate stages. PR48's merged main `4bb8ea4` separately passed
[all six post-merge jobs](https://github.com/Brandon-Born/bga-mcp/actions/runs/40550210841),
with all six original archive hashes and sealed exact-main records verified.

## rc.12 failed live preflight and distinct rc.13 source correction — BGA-459

PR49 normally merged as `054e4fd69a8316b448021c005462df9986590db4` with
[all six merged-main jobs passing](https://github.com/Brandon-Born/bga-mcp/actions/runs/40557831224).
All six original archive/API hashes and sealed exact-main records independently
verified. The new `v1.0.0-rc.12` tag remains fixed at that source.

[Producer 40559714945](https://github.com/Brandon-Born/bga-mcp/actions/runs/40559714945)
returned success from its complete gate, then failed live security preflight on
moderate `GHSA-6pq8-jhm2-2vcw`. It retained only the actual advisory assessment;
no original rc.12 package, manifest or packet was uploaded. There is no original
tarball digest to review or sign. The failed run has not been retried. The
[producer hold](rc12-producer-hold-2026-10-27.json) preserves its actual audit,
archive identity and scope. Source CI success does not waive this failure.

The remaining vulnerable path is development conformance/SDK through Express
5.2.1 to qs 6.16.0. Body-parser 2.4.0 already resolves fixed qs 6.16.1.
The narrow correction extends the existing override to the mature fixed version,
removes only that old lock resolution and selects `1.0.0-rc.13` in the three
version fields. Existing gates, release-age settings, security exceptions,
public contract and all BGA behavior remain unchanged. Ordinary source tests,
canonical fresh audits, independent source review, exact-source CI and current
framework admission must pass before the separate owner merge and unsigned
rc.13 production decision. No rc.13 tag, producer dispatch, signature or public
publication is performed by this source correction.

The rc.13 correction implementation is
`d1a4d1322628bda11869c1e4b5fb04a7c9456a16` (tree
`7d52272b689153fff2b3e5f60825e0f4a32c4327`). Its integrated full gate
passed 1,030 tests / 279 required scenarios with the preparation dirty on base
`054e4fd`; the retained evidence keeps that actual identity. The independent
review bound all ten committed paths with no actionable findings (report
SHA-256 `0d0b0ce9c74d80bb5b2563dcbb12a4602ad99857943ad29f3b8204a136f96cd7`). Six separate library checks reproduce the two vulnerable
comma-serialization paths on qs 6.16.0, verify fixed 6.16.1 and preserve benign
controls; they do not assert public stdio exploitability.

The canonical clean correction-source audit generated at
`2026-10-27T18:40:11.518Z` reports zero production and full-graph findings
without exceptions. All four dependency/security materials match the correction.
[Exact-source CI 40562120780](https://github.com/Brandon-Born/bga-mcp/actions/runs/40562120780)
passed all six platform/Node jobs. All six original archive/API hashes and sealed
records independently validate schema, integrity, clean actual source, 1,030
passing tests, 279 scenarios, passing applicable conformance, lock identity and
installed development test-artifact identity. Each macOS test package matches
the local development artifact; no original rc.13 candidate is inferred.

Relevant wording from all eight mapped official sources was re-read October27.
The unchanged framework review command admitted only that genuine exact-source
CI, reducing eight source-identity holds to zero. October21 page observations
and digests remain historical and unchanged. This follow-up changes only the
framework process metadata and this receipt. Implementation proof remains
explicitly bound to `d1a4d13`; automatic PR checks and the final actual tested
tree are verified separately in the owner handoff. No failing producer is
retried or relabeled. The rc.12 tag stays fixed, with no original packet, and
rc.13 still needs its separate normal-merge and unsigned-production approval.
Signing and publication remain separate stages.

The final receipt-head PR run
[40564533890](https://github.com/Brandon-Born/bga-mcp/actions/runs/40564533890)
at `5031489e24c662379fafebb342cc9a57f6ce8fb2` failed Windows Node22;
the other five jobs passed. That job passed 1,029 of 1,030 tests, with the
adopted-roots recovery `check_setup` returning `policy.timeout.exceeded`
under its real 100 ms deadline. Earlier injected cancellation, quiescence and
transport assertions passed. This failure is retained and blocks merge readiness;
the successful implementation/initial PR runs above do not clear it.

The narrow test-observer correction keeps one append descriptor for the probe's
transcript, opened before timed work and closed on child exit. Each event remains
synchronously visible, with existing real native operations, deadlines, assertions,
fake-clock behavior and mutation witnesses unchanged. This removes repeated
observer path opens/closes from measured work. CI did not retain inner native
timings, so it does not prove logging was the sole cause or eliminate all scheduler
variability. Affected tests, a new integrated gate, independent review and fresh
source/PR CI must pass before new framework admission or an owner decision.

The observer correction source `963e475d5ab2152ee90a136fc97645212e29dc0b`
subsequently passed [all six exact-source jobs](https://github.com/Brandon-Born/bga-mcp/actions/runs/40568270079);
the original six archive/API hashes and sealed clean-source records verify.
[Its PR run](https://github.com/Brandon-Born/bga-mcp/actions/runs/40568222985)
passed five jobs but failed the strict installed-executable absence assertion on
macOS Node22 after successful `pnpm remove`; 1,029 of 1,030 tests passed.
All deadline-matrix cases passed, including both Windows jobs. The failed PR run
is retained without an unchanged retry, and still blocks readiness.

Independent controls against the actual unmodified pnpm 11.15.1 binary reproduce
a possible manifest-read/dependency-removal race that leaves its executable shim.
The same control against independently downloaded, registry-integrity-verified
pnpm 11.28.5 verifies manifest read before removal and no leftover shim. The
[official fixed source](https://github.com/pnpm/pnpm/blob/v11.28.5/pnpm11/installing/linking/modules-cleaner/src/removeDirectDependency.ts)
awaits executable cleanup before dependency deletion. The exact CI ordering was
not retained; these controls establish the possible defect and upstream correction,
not the sole cause of that particular incident. Version 11.28.5 was published
October6 and is over twenty days old. Current development tooling, ordinary CI consumers and
prerequisite guidance select it without changing age/security settings, application
dependencies, removal assertions, deadlines or retries. Historical receipts and
frozen guides remain unchanged. Historical signed/native replay runners retain
their reviewed tooling pins and receipt identities; retargeting and replaying them
is a later actual-candidate stage. An initial overbroad pin edit correctly stopped
at the controlled-client runner guard before runtime tests; the final preparation
keeps those historical runner bytes unchanged instead of relabeling their review.
A new integrated gate, independent source review,
exact-source/PR CI and authentic framework admission are required. No original
rc.13 package or approval is inferred from these source/tool checks.

The first narrowed integrated tooling run passed 1,029 of 1,030 tests; its
publication-prerequisite positive control assumed the historical selected receipt
still matched the current guide. The real guard correctly rejected the changed
pnpm prerequisite. The integration control now authenticates the selected
candidate's guide directly from its recorded Git source, preserves that authentic
positive case, explicitly verifies current mismatch and digest-substitution
refusal, and tests mixed receipts against the authentic guide. This does not alter
the publication guard, any historical receipt, or an approval. A changed source
guide continues to require actual replacement-candidate installation evidence.
