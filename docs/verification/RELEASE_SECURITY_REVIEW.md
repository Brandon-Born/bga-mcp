# BGA-405 exact-candidate security review

```verification-record
{"kind":"review","scope":"BGA-405 authenticated original rc.3 security replay, fresh exact-source dependency assessment and owned publication holds; no final security approval"}
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

The initial retained assessment additionally records that its reviewer implementation was uncommitted. Approval refuses that condition rather than attributing the harness to the base commit. Repeating the assessment on a clean committed reviewer records that distinct provenance.

## Approval is separate

`GATE-SECURITY-REVIEW`, `INT-SECURITY-REVIEW-APPROVAL` and `INT-SECURITY-REVIEW-ARTIFACT` test evidence binding, altered archives, omitted security scenarios, open risks, stale audits, uncommitted reviewer code and incomplete external gates. Synthetic approval controls do not prove a live review decision. Offline `verify:security-review` validates historical held evidence; it does not renew its 24-hour lifetime.

An explicit `--approve` review requires every owned blocker and release gate cleared, fresh complete audit/scenario evidence and committed reviewer code. It records only a security decision; it never publishes. BGA-415 must bind future publication to that exact candidate digest and fresh approval. BGA-405 remains implemented until the replacement candidate is reviewed with resolved release gates and applicable exact-source CI. No package, advisory, CVE or Studio operation has been published or executed by this assessment.

The full local gate passes 664 tests and 205 required scenarios, including package, applicable official conformance, safety and acceptance checks. The acceptance map proves 190 of 194 scoped cases across 58 items and preserves four incomplete cases. Exact-source CI is pending. The new supply-chain mitigation and human threat-model table record the same scope.

## Sources

[GitHub CLI](https://cli.github.com/manual/gh_attestation_verify) documents exact signer identity and local-bundle verification; [pnpm audit](https://pnpm.io/cli/audit) documents JSON and separate `--prod` assessment. These sources were fetched 2026-10-02 UTC. BGA-404 and BGA-422 retain their original signature and audit trust policies. This change introduces no BGA parsing rule or game-project mutation.
