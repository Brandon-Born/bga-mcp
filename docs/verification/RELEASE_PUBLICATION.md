# BGA-415 immutable registry publication

```verification-record
{"kind":"review","scope":"BGA-415 offline publication/admission/provenance/permission guards and shared-package consumer guide; registry decision, publisher setup and actual public publication remain pending"}
```

The manual `release-publication.yml` workflow prepares one authenticated, security-approved original candidate, publishes that tarball under `candidate`, verifies the public artifact in a separate consumer job, then promotes only the version that passed. It never rebuilds the package or overwrites a version. A prerelease promotes to `next`; a stable candidate promotes to `latest`. Publishing a prerelease does not establish a stable release.

## Current holds

`corepack pnpm release:status` reads current release decisions, the pinned BGA-405 review, the BGA-406 lifecycle and BGA-408 framework ledger without registry writes. `config/publication.json` retains `decision: null`: package name/registry/publisher selection and account setup are not asserted. The current original rc.3 assessment remains held. Its guides predate the current package, non-maintainer private reporting is unverified and a fresh official-page framework review is pending. A distinct replacement candidate, signing, applicable client/usefulness carry-forward, per-release public evidence and exact-artifact approval must precede publication. The gate reads candidate-specific installation, native-client, public-distribution and usefulness receipts; current rc.1 client/public-evidence receipts cannot approve rc.3 or a replacement candidate. Their paths are explicit in `config/publication.json` and historical records are preserved. Existing candidate tags and packets remain immutable.

The suggested decision is existing name `bga-mcp`, `https://registry.npmjs.org`, GitHub repository `Brandon-Born/bga-mcp`, workflow filename `release-publication.yml`, environment `npm-publication`. Record explicit owner authorization and non-secret evidence of package ownership and trusted-publisher configuration before replacing null. Configure direct `npm publish` and `npm dist-tag` permissions independently; stage-only permission cannot run this workflow. Do not add a token fallback. Account settings and initial package bootstrap have not been exercised; the documentation describes package settings but does not prove this account can establish the first package without an existing published version. Any required bootstrap must preserve the approved artifact and receive explicit authorization, never substitute a placeholder package or infer ownership from name availability.

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
configuration and its refusal test also requires clean exact-source CI and
explicit framework re-admission under the existing broad implementation guard.
The private reporter, publisher setup, registry publication and independent
public consumer remain unverified. A current hosted dry run must follow that
admission; no identity-bearing job or registry write is authorized by alignment.
