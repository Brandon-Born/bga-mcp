# BGA-405 exact-candidate security review

```verification-record
{"kind":"review","scope":"BGA-405 authenticated original rc.3, rc.4 and rc.5 security replays, fresh exact-source dependency assessments and owned publication holds; no final security approval"}
```

The [retained assessment](security-review-v1.0.0-rc.3.json) applies to original signed `v1.0.0-rc.3`, source `c7ad5c2962e608a82b532dd0d1882040d1ba31ea`, tarball `sha256:598cad2186c60e8110d8906ffb91739893c357ebed69cad0529c8a5a367907a3`. It does not transfer to a newly packed checkout. The review authenticates the original packet with refreshed independent trusted roots and BGA-404's exact repository/workflow/signer/provenance constraints before installation. The tarball and its signed packet remain unchanged.

## Reproduce the assessment

Use a clean isolated checkout of that exact candidate source, installed from its frozen lockfile. Use the trusted current reviewer checkout for the review tooling and the independently retained signed packet. Choose a new output directory outside the packet; existing assessments are never overwritten.

```
BGA_MCP_SECURITY_SOURCE=/absolute/path/to/exact-candidate-source \
BGA_MCP_SIGNED_CANDIDATE=/absolute/path/to/authenticated-signed-packet \
BGA_MCP_SECURITY_REVIEW_OUTPUT=/absolute/path/to/new-assessment \
corepack pnpm review:security
```

The plan in `config/security-review.json` selects the reviewed candidate/signing receipts and security suites. The command reacquires independent trust roots, verifies signature and all original subjects, runs the registry-backed production/full-graph audit in the exact candidate source and checks every source/configuration digest against the signed original assessment. Unavailable, expired or undisposed advisories prevent approval; changing advisories never replaces immutable package bytes.

The package scan checks its entry paths, public executable, bounded text files and known secret patterns. The harness's explicit retained-artifact mode requires both an original path and authenticated digest, refuses altered bytes before installation, skips packing and writes `security-review-artifact.json`/`security-review-runs` separately from ordinary checkout evidence. Every selected suite proves the installed digest. Only sanitized scenario IDs, counts and digests enter retained/public metadata; raw canary-bearing output is not copied into the report.

## Scope and observed results

The actual rc.3 replay passes **27 tests and 11 required security scenarios**: public discovery/exclusion, every local capability with network denied and project contents/metadata unchanged, denial-harness self-test, hostile input/root refusal, output redaction, traversal/object bounds, final output limits, deterministic filesystem race barriers, delayed listing/descriptor cancellation and synchronous parser expiry. **270 packaged text files** pass the known-secret scan. The fresh exact-source audit reports **zero production and zero full-graph findings** at the timestamp in the assessment; that is a historical registry observation, not permanent dependency clearance.

The full profile may be exercised as a supplement because it is shipped internally, but only the seven local public tools, three resources and stdio are reviewed for release. No Studio capability or adapter enters the release. Stubbed documentation/Studio tests supply shared-control evidence only and do not establish live Studio safety. Portable Node checks retain the documented repeated-swap/openat and incomplete-native-syscall cancellation limits. Client overtrust and novel/encoded-secret detection limits retain their existing accountable threat-model dispositions. Documentation/Studio residual risks are excluded from the local release and cannot silently reenter through approval.

The risk register names every canonical residual risk's existing owner and disposition, then holds three concrete release gates:

- **Candidate documentation:** Signed rc.3 predates BGA-411/BGA-406. Build and sign a distinct replacement candidate containing current self-contained guides and reporting policy; never rewrite rc.3.
- **Private reporting:** BGA-406 still needs the independent harmless-report lifecycle.
- **Framework freshness:** BGA-408 needs official-page observation/review and clean post-observation retest before new publication.

The initial retained assessment additionally records that its reviewer implementation was uncommitted. Approval refuses that condition rather than attributing the harness to the base commit. The [clean committed repeat](security-review-v1.0.0-rc.3-clean.json) records reviewer `c8b5411cfbb901c6c2745b3d134d9ce437d2b7d8` with `sourceClean: true`; it passes the same 27 tests, 11 scenarios and 270-file scan and preserves all three approval holds.

## Approval is separate

`GATE-SECURITY-REVIEW`, `INT-SECURITY-REVIEW-APPROVAL` and `INT-SECURITY-REVIEW-ARTIFACT` test evidence binding, altered archives, omitted security scenarios, open risks, stale audits, uncommitted reviewer code and incomplete external gates. Synthetic approval controls do not prove a live review decision. Offline `verify:security-review` validates historical held evidence; it does not renew its 24-hour lifetime.

An explicit `--approve` review requires every owned blocker and release gate cleared, fresh complete audit/scenario evidence and committed reviewer code. It records only a security decision; it never publishes. BGA-415 must bind future publication to that exact candidate digest and fresh approval. BGA-405 remains implemented until the replacement candidate is reviewed with resolved release gates and applicable exact-source CI. No package, advisory, CVE or Studio operation has been published or executed by this assessment.

The full local gate passes 664 tests and 205 required scenarios, including package, applicable official conformance, safety and acceptance checks. The acceptance map proves 190 of 194 scoped cases across 58 items and preserves four incomplete cases. [Exact-source CI](bga405-source-ci.json) passed all six Ubuntu/macOS/Windows Node 22/24 jobs at that reviewer commit. The new supply-chain mitigation and human threat-model table record the same scope.

## Sources

[GitHub CLI](https://cli.github.com/manual/gh_attestation_verify) documents exact signer identity and local-bundle verification; [pnpm audit](https://pnpm.io/cli/audit) documents JSON and separate `--prod` assessment. These sources were fetched 2026-10-02 UTC. BGA-404 and BGA-422 retain their original signature and audit trust policies. This change introduces no BGA parsing rule or game-project mutation.

## rc.4 review preparation, 2026-10-02 UTC

The current plan and offline verifier select the independently authenticated
original rc.4 receipt, source `5c4eebd782f3e1bb2251bd8aad4a6826038ddb15`,
tarball SHA-256 `662c23199cdfd62365b1e94c6ec28bb61374e9d11eafd606f1f29ba1ec6ad200`
and signer `b593b76dc56fbb6affc1264b3b5ee53a338c209b`. The native Codex
client recipe also selects this original candidate; its separate initial repeat
passed the bounded controlled flow, with the dirty runner recorded explicitly. Historical rc.3 assessments and all original signed packets remain
unchanged. No candidate selector transfers approval.

[The initial rc.4 assessment](security-review-v1.0.0-rc.4.json) independently
verified signature, issuer, workflow, signer, provenance and original subjects.
A clean isolated checkout of the exact original source supplied a fresh
registry-backed production/full-graph audit with zero advisory findings. The
existing eight security suites installed the unchanged original tarball and
passed 27 tests / 11 required scenarios; 274 packaged text files passed scanning.
The initial reviewer tree was dirty and cannot supply approval. The broad
framework guard also holds until clean exact-source CI and explicit re-admission.

README and the installation guide now identify rc.3 as an immutable versioned
example rather than the latest candidate. Its acquisition commands, verifier,
signer, digest and finite retention remain bound to that historical example.
For another version, a reader must use its verified candidate-specific receipt
and matching trusted verifier, never just substitute a tag into the commands.
These two corrected packaged guides differ from rc.4, so a distinct replacement
candidate is required; the original cannot be overwritten. BGA-406's independent
harmless-report lifecycle remains unobserved. Clean reviewer replay and
candidate-specific prerequisite refresh still precede any approval decision.

The candidate-specific publication prerequisites now reference actual rc.4
installation, native-client, public-evidence and frozen-task receipts. The
[signature-authenticated current guide repeat](install-guide-v1.0.0-rc.4-signed.json)
passed install, discovery, first use, unconfigured-root refusal, repeat install,
unchanged project, server exit and removal. Candidate-specific prerequisite
alignment is distinct from approval: the initial security assessment is held,
the private-report lifecycle is null, and publisher selection/setup remains null.

During preparation the full gate correctly refused a changed native runner
without re-execution; the actual rc.4 repeat and independently pinned matrix
now supply that evidence. A later full suite observed installed-server startup
failures including a missing dependency file. All six affected suites then
passed separately (61 tests). The underlying cause is not established; only a
subsequent complete passing gate can close the preparation check.

The subsequent standalone full gate passed all 674 tests and 209 required
scenarios, plus package, applicable official conformance, safety and acceptance
checks. No startup-failure test was skipped or relaxed. Readiness now verifies
all four rc.4 prerequisite identities and current guide digest without the
former cross-candidate hold; dirty-reviewer, guide replacement, private-report,
framework re-admission and null publisher decision still hold approval. Clean
committed-source CI and repeat assessment remain separate next steps.

[Clean preparation CI 36985541238](rc4-security-preparation-ci.json) passed all
six platform/Node jobs at `293ef53333fadddfe2c2951819ea968feb61e92e`, each with
674 tests and 209 scenarios. Every downloaded record passed trusted schema,
clean exact-source, integrity and applicable-conformance checks. The eight
unchanged previously read framework decisions were explicitly re-admitted
against that sealed evidence; the actual release guard passes. The separate
clean reviewer repeat is still pending and cannot be inferred from this CI.

## Clean rc.4 repeat, 2026-10-02 UTC

[The separate clean assessment](security-review-v1.0.0-rc.4-clean.json) records
committed reviewer `6a0c3c66083de96e8d1dd78351de6b65b6ac1cf6` with
`sourceClean: true`. Fresh independent trust roots authenticate the same
original signed rc.4 packet and all original subjects/provenance. A new live
production/full-graph audit of clean original source again reports zero
findings; the original tarball again passes 27 tests / 11 required scenarios
and 274 text-file scans. No original signed or preparation receipt is replaced.

The actual framework guard passed during this clean assessment, clearing that
previous gate. Two security gates remain held: the immutable rc.4 package lacks
the two corrected current guides, and BGA-406's independent harmless-report
lifecycle remains null. The existing canonical residual dispositions still
apply only to the frozen local inventory. No `--approve` invocation or final
security decision was made.

[The clean native-client repeat](codex-client-v1.0.0-rc.4-clean.json) passes the
same actual seven-tool/three-resource flow, refusals, restart, unchanged
project/configuration, process exit and removal with Codex 0.159.2 from that
same clean committed source. The offline verifier, bounded evaluated-client
matrix and publication prerequisites now read these separately retained clean
receipts. This changes no public support claim or permission. Those reference
updates require their own clean CI/framework re-admission under the existing
broad guard before a new candidate may be created. Publisher selection/setup
remains null; historical audit validity is not renewed approval.

[Clean reference-source CI 36986917716](rc4-clean-security-ci.json) passed all
six platform/Node jobs at `49a32348bc1d7bf2f77df1c5c9cf65accad7ff48`, each with
674 tests and 209 required scenarios. All downloaded records passed schema,
clean exact-source, integrity and applicable-conformance checks. This proves
the clean rc.4 receipt references and their refusal controls; it does not
approve rc.4 or cover the later rc.5 version preparation. Framework admission
for the replacement candidate will use its own final preparation CI, avoiding
an intermediate admission that the version change would immediately invalidate.

## Original rc.5 preparation

The [separately retained rc.5 assessment](security-review-v1.0.0-rc.5.json)
consumes original signed artifact
`sha256:b7cc226a512a4aab433f8daddf49f54ee00323f3dc7da6960490be1c0727eeac`,
source `286f2bbb1bfff28726378098d9883058f19841e9` and signer
`a0ac5f3a919f2ded6c6c63ca74c494bb03fa0d94`. Fresh independent trust roots,
signature, subjects and producer provenance verification precede all package
tests. The exact candidate source is isolated, clean and installed from its
frozen lockfile; fresh registry-backed production and full-graph audits both
report zero findings. Source/configuration digests match the signed original
assessment. Original candidate and signing packets remain unchanged.

The original tarball passes 27 tests / 11 required security scenarios and 274
packaged text-file scans. Every selected suite records the authenticated
original digest. All six packed guides match current bytes, so the rc.4 guide
replacement hold is cleared for rc.5. The existing residual dispositions remain
limited to the local public inventory; Studio and external adapters are excluded.

The preparation reviewer is uncommitted and the changed selector invalidates
the broad implementation admission. A clean committed replay, exact-source CI
and explicit framework re-admission remain required. BGA-406's non-maintainer
private-report lifecycle is also still null. The plan and offline verifier now
select rc.5; an actual historical rc.4 assessment fails the new identity check.
Historical validity cannot supply current approval. BGA-415's historical rc.4
prerequisites have not been advanced or approved by this security preparation.
No `--approve` invocation, registry write or release promotion is made.

[Preparation CI 37004398077](rc5-security-preparation-ci.json) passed all six
Ubuntu/macOS/Windows Node 22/24 jobs at
`49dc413a2d0a3b00c09d8907f85f1fe163739528`, each with 674 tests and 209
required scenarios. Independently downloaded records pass trusted schema,
integrity, clean exact-source, CI-environment and applicable-conformance checks.
All eight mapped official pages were fetched again on 2026-10-02 UTC and match
the previously reviewed content digests. Their relevant wording was read before
explicit admission using that CI; the actual framework release guard passes.

In particular, the [state-class documentation](https://en.doc.boardgamearena.com/State_classes:_State_directory)
still labels the implicit initial-state fallback “to be confirmed”. The
[file reference](https://en.doc.boardgamearena.com/Studio_file_reference) still
says “These files are deprecated”, and the
[migration guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide)
retains independently staged replacements. Existing unsupported-syntax and
legacy/hybrid boundaries remain in force; no framework rule is changed.

## Clean original rc.5 repeat

The [clean committed assessment](security-review-v1.0.0-rc.5-clean.json)
repeats the original rc.5 review from
`9abd2162fafdb190ef407912a1de7ec7843d3e04` with `sourceClean: true`.
Independent trust roots, original signature, subjects and producer provenance
verify again. A fresh registry audit of the same clean exact candidate source
reports zero production and zero full-graph findings. The original artifact
again passes 27 tests / 11 required security scenarios and 274 text-file scans.
This clean assessment is a separate record; the initial dirty assessment and all
historical packets/reviews remain unchanged.

Both candidate-documentation and current-framework gates now pass. The sole
blocking assessment risk is `BLOCK-privateReportLifecycleVerified`: BGA-406's
independent reporter receipt/acknowledgement/triage/closure remains unobserved.
The assessment retains `status: held`; no explicit approval is requested or
granted. The offline security verifier still validates the separately retained
rc.5 preparation record structurally, which is not an approval check. BGA-415
must select its own matching current prerequisites and clean assessment before
admission, in addition to a real reporting lifecycle and publisher decision.

## Clean rc.5 assessment with final filesystem probes

The [separate final-probe assessment](security-review-v1.0.0-rc.5-final-probes.json)
records clean committed reviewer `b07ea15fe885cc3625e6542e5fe69d1d080c36e6`
and harness digest `sha256:7cfa3c5456a1ffb3004f9006c5b1f3691cbf4ef8c68276be9a9316a2fefaf85d`.
It repeats independent signature, original subjects and producer provenance
verification before testing the same immutable rc.5 tarball. The fresh audit at
2026-10-02T13:45:27.621Z matches the clean exact candidate source and signed
configuration, with zero production and full-graph findings. All 27 tests and
11 required security scenarios pass; all 274 packaged text files pass scanning.

The filesystem cases now use the [final issued-I/O probes](FILESYSTEM_DEADLINE_PROBES.md),
including both cleanup-await removal controls and restoration of the installed
module. The complete native filesystem matrix and operating-system cancellation
remain outside this evidence. The original tarball, original signed packet and
all preceding assessments remain unchanged. Current packed-guide and framework
guards pass; the independent private-report lifecycle remains the sole blocking
assessment risk. Status stays `held`, without explicit security approval or
publication. At assessment capture, BGA-415 still selected the earlier clean
assessment. Its [subsequent separate reference handoff](RELEASE_PUBLICATION.md#final-probe-security-receipt-handoff)
selects this newer record; retaining or selecting the evidence does not alter
publisher setup or waive its admission checks.

[Exact-reviewer CI 37015034964](bga405-final-probes-reviewer-ci.json) passes
all six Ubuntu/macOS/Windows Node 22/24 jobs at `b07ea15`. Each downloaded
sealed record validates trusted schema, integrity, exact clean source, matching
platform and Node major, CI environment, 674 tests, 209 required scenarios and
applicable conformance. Platform package digests match their prior baselines;
the Linux digest still matches the original rc.5. This is checkout verification
of the clean reviewer; the separate assessment above proves the original
candidate security replay. Neither scope supplies approval or registry evidence.
