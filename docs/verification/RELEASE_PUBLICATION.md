# BGA-415 first publication and immutable registry follow-up

```verification-record
{"kind":"review","scope":"BGA-415 selected GitHub publication/admission/provenance/permission guards and shared-package consumer guide; independent reporting, final approval and actual public package publication remain pending"}
```

The manual `release-publication.yml` workflow prepares one authenticated, security-approved original candidate, publishes that tarball under `candidate`, verifies the public artifact in a separate consumer job, then promotes only the version that passed. It never rebuilds the package or overwrites a version. A prerelease promotes to `next`; a stable candidate promotes to `latest`. Publishing a prerelease does not establish a stable release.

## Current first-channel decision and holds

The user selected **signed GitHub downloads first**: “Signed GitHub downloads sounds good to me.” [The authorization and existing repository observation](github-download-decision.json) record the selection without granting security approval. `config/publication.json` now selects `release-github.yml` and the actual clean rc.6 assessment/install/client/public-metadata/usefulness receipts for the unchanged signed original tarball. The independent private-reporting lifecycle remains the final external test; the user will arrange it. Fresh security approval, actual package upload, independent public installation verification and retained consumer success are still required. No installable package has been published.

The new workflow defaults to a read-only dry run on trusted main. Prepare runs the full gate and shared admission, checks the exact original signer/subjects, reads current owned ledgers, compares packed guide bytes and repeats the advisory audit from a clean original-candidate checkout. It never rebuilds the candidate. Explicit publish attaches only missing approved original files and the digest-bound [GitHub acquisition companion](GITHUB_DOWNLOADS.md) to the existing pinned public metadata release. It does not overwrite assets or create another release. The separate consumer downloads fixed public URLs without a token, verifies downloaded original signatures/provenance with independent roots and exercises the unchanged installed guide. Only a successful digest-bound receipt can be attached for release-lifetime retention. rc.6 stays a prerelease; there is no stable or registry promotion.

Both contents-write jobs use builtins and GitHub CLI, with no dependency installation, package execution, OIDC or npm token. Preparation and verification have read-only permissions. Errors require inspecting the exact release and preserving original assets; a conflict is an incident, never permission to clobber, delete, rebuild or change a version. A byte-identical partial upload may be reconciled after fresh admission. An expired audit/approval requires refresh; existing packages are not re-signed or rebuilt to achieve that. A failed consumer prevents success retention. Local policy controls and shared packaged lifecycle proof do not establish actual public delivery.

## Deferred npm path

The existing `release-publication.yml` implementation and historical npm records below remain available for a later owner-selected npm release. Its writer refuses while GitHub is selected. Package ownership/trusted-publisher configuration, first publication, certified npm provenance, public registry installation and dist-tag promotion remain unverified. There is no placeholder bootstrap or token fallback. npm's [trust prerequisites](https://docs.npmjs.com/cli/v12/commands/npm-trust/) require an existing package; [new-package staging](https://docs.npmjs.com/staged-publishing/) creates a public `0.0.0-stage` placeholder. The GitHub decision resolves the first distribution path without claiming to resolve npm setup.

## Admission and separated identities

Only a manual dispatch on trusted main can run preparation. The default `dry-run` never starts either OIDC job. Preparation runs the complete local gate without publication credentials. It fetches the separately retained original signing archive by pinned artifact identity, verifies archive digest and allowlisted paths, obtains independent trust roots and verifies the original signature with BGA-404's full identity policy. It rechecks the approved review and reporting/framework ledgers, current shipped guide bytes and a fresh registry-backed audit from a clean exact-candidate source checkout. Source, lockfile, package, workspace and audit-policy digests must match the independently pinned review plan.

All eleven admitted files, source candidate identity, original approval and fresh audit are bound to `plan.json`. Its digest passes as a job output, separately from the transferred artifact. Publisher source commit and run identify the release workflow, separately from original candidate source. Admission/audit and consumer promotion expire after one hour; approval retains BGA-405's own 24-hour limit. A delayed environment approval must repeat preflight rather than stretch freshness.

Only explicit publish and promote jobs request OIDC identity in `npm-publication`. They use Node 24 compatible with pinned npm 12.2.0, installed with lifecycle scripts disabled; no repository dependencies or package code run in those jobs. Their builtin-only runner rejects wrong repository/ref/workflow/run, altered cross-job plans/files, absent decisions and token fallback. Publication sends the exact `.tgz` with `--ignore-scripts --provenance --tag candidate`, a fixed registry and isolated npm configuration. Provenance identifies this publisher workflow; it does not pretend that workflow built the retained candidate.

## Independent public consumer

The separate verification job receives no publication identity. Its subprocesses use fresh HOME, cache and npm configuration, without inherited registry or repository tokens. It reads the exact public package version from the fixed registry, downloads the fixed HTTPS tarball, verifies SHA-256 equality to the original signed candidate and registry SHA-512 integrity, and requires registry signatures/provenance. A fresh named-version npm installation checks the resolved URL and lock integrity. Pinned `npm audit signatures --json --include-attestations` must succeed before any returned bundle is decoded.

Policy requires the exact npm subject/archive, supported SLSA v1 shape, main workflow, hosted builder, publisher commit and run. The extracted npm bundle is additionally verified cryptographically by GitHub CLI with SHA-512, independent roots, exact certified workflow identity, repository, main source ref/digest, signer digest, issuer and hosted-runner constraints. User-controlled predicate strings cannot substitute for certified identity. Original candidate signature verification separately binds the archive to its source/build evidence. Unknown provenance shapes fail closed; synthetic decoder tests supply no real signature or publisher proof.

The authenticated public tarball is then exercised through the existing installation guide: exact installed discovery, documented first use, root refusal, repeated installation, unchanged fixture project, process exit and removal. The temporary registry installation is also removed and checked for credential files. Only sanitized identities, digests and successful outcomes enter the retained consumer receipt. Scratch state is removed on failure as well. No developer game source or live Studio operation enters this procedure.

Promotion depends on successful verifier completion plus its separately emitted receipt digest. It rejects missing/stale receipts or any failed provenance, signature, inventory, use, mutation, removal or credential check. The receipt and admitted packet are retained for 90 days in Actions; download them into the tracked release record and distribute approved non-secret evidence through BGA-407 for release-lifetime retention. Observe and record the resulting public dist-tag before marking BGA-415 verified. Ordinary source CI and local package tests do not supply that live record.

## Recovery

If publication returns an error or an ambiguous outcome, stop and inspect that exact public name/version. Do not blindly repeat publication, rebuild, overwrite, unpublish or reuse its version. An existing version is immutable; an authenticated byte-identical result may be investigated with the independent consumer command and retained original admission/evidence. A collision with different bytes is a release incident and cannot be adopted.

If public verification or promotion fails, preserve the version, candidate tag, original packet and failure logs. Leave promotion stopped. Determine whether the registry is temporarily unavailable, the signature/provenance policy failed or the artifact/guide is defective. Retry bounded read-only verification only after resolving the cause; require a fresh admitted audit and approval if the one-hour window has expired. A package defect requires a new reviewed version through BGA-403/404/405/407 and a fresh consumer run. Any deprecation, tag rollback or unpublish is a separate owner-authorized recovery action. This workflow performs none automatically.

## Verification scope

`GATE-PUBLICATION` seeds automatic triggering, credential fallback, permission expansion, unpinned tooling, rebuild and premature promotion. `INT-PUBLICATION-BOUNDARIES` checks decision/admission, file substitution, expiry, registry identity/integrity, provenance policy, local invocation refusal and unsuccessful consumer receipts. `E2E-PUBLICATION-CONSUMER` exercises the shared installed tarball through a real MCP client and its documented guide. All 673 tests and 208 required scenarios pass locally, including the packaged guide wrapper; packaging, applicable official conformance and safety checks pass. [Exact-source CI](bga415-source-ci.json) passed all six Ubuntu/macOS/Windows Node 22/24 jobs at `d2e4efbc1593ced293530501a1b32c015a22a94b`. The [actual manual default dry run](bga415-dry-run.json) passed preparation checks/source installation, then was refused at the owned admission gate. Its workflow conclusion is honestly recorded as `failure`; all three downstream jobs were skipped, including both identity-bearing jobs. This verifies an actual publication hold, not a registry publication. Actual trusted-publisher setup, registry publication, certified npm provenance and live promotion remain explicitly missing acceptance cases. BGA-415 is implemented, not verified.

## Sources

- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/) accepts “a gzipped tarball” and states “that specific name and version combination can never be used again.” Explicit tags avoid default `latest` promotion.
- [Trusted publishing](https://docs.npmjs.com/trusted-publishers/) uses “short-lived, cryptographically-signed tokens”; direct publication and dist-tag authorization are separate configuration choices. Public GitHub OIDC publication automatically produces provenance.
- [npm audit signatures](https://docs.npmjs.com/cli/v11/commands/npm-audit/) documents `--json --include-attestations` and verification of registry signatures and provenance. The actual pinned npm 12.2.0 distribution was inspected for `verified[].attestationBundles` and SLSA statement construction; unsupported formats are refused.
- [GitHub CLI verification](https://cli.github.com/manual/gh_attestation_verify) states “only the `signature.certificate` and the `verifiedTimestamps` properties contain values that cannot be manipulated”; exact certificate/source/signer policy is enforced in addition to predicate checks. It supports SHA-512 artifact digests.
- [Sigstore bundles](https://docs.sigstore.dev/about/bundle/) distinguish signed envelopes from certificate verification material. Decoding an envelope supplies no cryptographic verification by itself.

## Original rc.5 prerequisite alignment

`config/publication.json` now selects the separate clean rc.5 security assessment
and the actual rc.5 signed-install, native-client, public-evidence and frozen-task
usefulness receipts. The original candidate is source
`286f2bbb1bfff28726378098d9883058f19841e9`, artifact
`sha256:b7cc226a512a4aab433f8daddf49f54ee00323f3dc7da6960490be1c0727eeac`.
No historical receipt or original package is overwritten, rebuilt or relabelled.

`INT-PUBLICATION-BOUNDARIES` checks all four real retained receipts unchanged
against the selected clean assessment and current installation-guide digest.
It then substitutes each actual historical rc.4 receipt independently and
observes refusal. Synthetic decoder/admission controls remain explicitly
synthetic and cannot supply a real reporting lifecycle, security approval,
publisher setup or registry provenance.

The actual read-only preparation status no longer reports candidate-prerequisite
mismatches. It still holds on BGA-406's independent report lifecycle, BGA-405
approval and the null package/registry/trusted-publisher decision. Changing
configuration and its refusal test required clean exact-source CI and
explicit framework re-admission under the existing broad implementation guard.
[CI 37006603439](rc5-publication-preparation-ci.json) passes all six jobs at
`ee9483a16c8a5ac9551d0b46d2a8c22e7a6749f0`, each with 674 tests and 209
required scenarios. Every downloaded sealed record passes trusted-schema,
integrity, clean source, CI-environment and conformance checks. All eight
unchanged previously read official decisions are explicitly re-admitted and
the actual framework release guard passes.
[The preparation observation](publication-prerequisites-v1.0.0-rc.5.json)
retains the clean source, actual receipt digests, four historical substitutions
and the earlier pre-admission framework hold; it is not rewritten to imply
that the later admission had already happened.
The private reporter, publisher setup, registry publication and independent
public consumer remain unverified. [Hosted dry run 37007946342](bga415-rc5-dry-run.json) on clean baseline
`50d19f103c0eb1fca49373220e2e374ab6b47527` passed the complete gate
(674 tests / 209 required scenarios), checked out original rc.5 source and
installed its frozen lockfile. Admission then refused the actual reporting,
security approval and publisher-decision holds. Its overall conclusion is
`failure`; all three downstream jobs were skipped. No packet acquisition,
fresh admitted audit, publisher identity, registry consumer or promotion is
claimed. The separate prerequisite checks and real hosted refusal are retained
as separate evidence scopes; BGA-415 stays implemented.

[Clean baseline CI 37007946504](rc5-publication-baseline-ci.json) concludes
successfully at `50d19f1` after one unchanged failed-job replay. All six sealed
records validate trusted schema, integrity, exact clean source, CI environment,
674 tests / 209 required scenarios and conformance. The initial Windows/Node 24
failure had no injected `read:start` event before the 100 ms deadline. Its
failure and log digest remain recorded under BGA-326; setup timing is plausible,
not a confirmed root cause or a repaired deterministic probe.

## Final-probe security receipt handoff

The publication preflight now selects the [separate final-probe assessment](security-review-v1.0.0-rc.5-final-probes.json)
from clean reviewer `b07ea15`. It authenticates and tests the same immutable
original rc.5 artifact using the strengthened filesystem probes, with all
27 security tests, 11 required scenarios and 274 text-file scans passing.
Fresh exact-source dependency audits report zero findings. The four existing
candidate-specific prerequisite receipts remain unchanged and are checked
against this selected assessment; historical substitutions remain refused.

This is a receipt-reference change, not an approval or publication decision.
The selected assessment is held on the independent private-report lifecycle,
and the package/registry/trusted-publisher decision remains null. Changing
configuration also requires clean exact-source CI and explicit framework
re-admission before the framework release guard clears. No registry or account
operation is performed by this handoff; the earlier hosted dry-run observation
retains its original source and does not claim to test this later reference.

[Exact-reference CI 37015716008](bga415-final-probes-reference-ci.json) passes
all six platform/Node jobs at `a34f7cf`, each with 674 tests and 209 required
scenarios. All downloaded records validate trusted schema, integrity, clean
exact source, matching matrix environment, applicable conformance and unchanged
platform package digests. The eight unchanged, fresh, previously read official
decisions are explicitly re-admitted against that evidence; the actual
framework release guard passes. The read-only publication status then reports
only the existing reporting, security-approval and publisher-setup holds,
without a candidate-prerequisite or framework mismatch; `published` is false.
This does not repeat the hosted dry run or execute any identity-bearing job.

## rc.6 publication prerequisites — 2026-10-02 UTC

Publication now selects the actual clean rc.6 security assessment, signed installation recipe, native-client receipt, publicly verified metadata and verified frozen-task usefulness ledger. All records identify the same original signed tarball. The reference update follows actual distribution and independent validation; no placeholder receipt or historical result is relabeled.

[Metadata workflow 37076418295](https://github.com/Brandon-Born/bga-mcp/actions/runs/37076418295) completes prepare, publication and public verification at `cad8dd8` after exact empty-draft reconciliation and failed-job recovery. [The distribution receipt](release-evidence-v1.0.0-rc.6.json) preserves both the earlier stale-pin failure and this run's recovery. All six exact-source CI records at `cad8dd8` are independently validated. The actual installation, native-client and game-task observations retain their original source and artifact identities.

The clean security assessment remains held for the final independent benign-report lifecycle. Publisher decision/setup remains unresolved: npm's trusted-publisher setup requires an existing package, and policy still forbids placeholder bootstrap or token fallback. The channel/policy decision is pending. The user will arrange independent reporting last. No installable package has been distributed or security approval granted.

## GitHub preparation handoff — 2026-10-03 UTC

The owner-selected GitHub path passes the complete integrated local gate: 775 tests, 234 required scenarios, 103 retained claims, package, safety and applicable conformance. The [bounded decision/preparation record](github-download-decision.json) preserves the actual dirty preparation source, Mac package identity, logs and earlier threat-table/evidence-metadata failures; none is relabeled as clean CI or as the signed Linux original. All eight current official pages were freshly observed unchanged after the local gate. The new exact-path mapping and changed governing documentation still require exact-source CI and explicit framework admission. The same bounded record retains those actual observations and the manual dry-run result when available. No publish dispatch, security approval or public installable package is claimed by this handoff.
