# Dependency security preflight — BGA-422

```verification-record
{
  "kind": "run",
  "capabilities": 17,
  "scenarios": 188,
  "claims": 99,
  "tests": 618
}
```

Implementation reviewed on 2026-09-29. This record describes the gate and the local development graph, not an approved or published release candidate. On 2026-09-30, [exact-source CI 36720062520](https://github.com/Brandon-Born/bga-mcp/actions/runs/36720062520) and [candidate workflow 36720091111](https://github.com/Brandon-Born/bga-mcp/actions/runs/36720091111) closed the outstanding evidence for `v1.0.0-rc.1` at `a2031af`; BGA-422 is now verified. The candidate retained its own fresh zero-finding audit and policy. [Candidate verification](RELEASE_CANDIDATE.md) records the source and digests. Future approval/publication requires a fresh assessment; the original report is dated evidence, not a perpetual clearance.

## Dependency remediation

The production-only audit initially had no findings. The full graph had 26 findings across validation, test, conformance and release tooling. Direct Ajv is now 8.20.0; Vitest and coverage are 4.1.11. Exact same-major overrides cover every affected transitive copy:

| Package               | Selected patched version |
| --------------------- | ------------------------ |
| ajv                   | 8.20.0                   |
| nanoid (3.x)          | 3.3.19                   |
| fast-uri (3.x)        | 3.1.8                    |
| brace-expansion (5.x) | 5.0.12                   |
| qs (6.x)              | 6.16.0                   |
| undici (7.x)          | 7.30.0                   |
| hono (4.x)            | 4.13.11                  |
| ip-address (10.x)     | 10.7.2                   |

The first remediation pass surfaced four additional findings in fast-uri and brace-expansion; the final patched graph reports zero production and zero full-graph findings. No exception suppresses an advisory. The exact Hono security patch is exempted from the package manager's release-age delay; broader release-age policy is unchanged.

## Gate and evidence

- The ordinary commit gate remains offline. `GATE-SECURITY-AUDIT` proves clean production cannot hide vulnerable tooling, high/critical findings cannot be waived, lower findings need disposition, and exceptions expire and require current passing evidence.
- `INT-SECURITY-AUDIT-PREFLIGHT` exercises the real offline command and candidate bundle writer: vulnerable or mismatched reports prevent retention, while clean reports and policies are retained with checksums and a manifest digest. Synthetic findings prove refusal behavior, not registry currency.
- `pnpm audit:security` is the live truth check. It separately queries production and the full graph and writes `.artifacts/security-audit.json`, bound to source and configuration digests. It strips raw titles, paths and error content and stops on malformed/unavailable responses or source changes.
- The candidate builder requires the live preflight after the complete gate and before retaining candidate bytes. Weekly/manual review runs the same command. Both workflows scan retained output before upload, including on failure, and have read-only repository permissions.
- Before final security review and publication, run a fresh assessment of the exact candidate source. Retain it alongside the original immutable artifact; changing advisories never justifies rebuilding or replacing candidate bytes.

## Sources

- [pnpm audit](https://pnpm.io/cli/audit) documents separate production auditing and JSON output, and advises: “use overrides to force versions that are not vulnerable.”
- [pnpm dependency overrides](https://pnpm.io/settings#overrides) describes root-level resolution controls.
- [Ajv advisory GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) and [Nano ID advisory GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) own the original backlog findings.
- The sanitized live report records the current advisory identifiers and severities; zero findings means no advisory currently reported for that locked graph, not proof that dependencies have no defects.
