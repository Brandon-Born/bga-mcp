# November 10 development dependency remediation

```verification-record
{"kind":"review","scope":"November development-toolchain advisory remediation and compatibility checks. No replacement candidate, framework admission, signature or publication approval."}
```

The November 9 scheduled [security workflow](https://github.com/Brandon-Born/bga-mcp/actions/runs/42633964703)
completed its ordinary full gate at exact main source `4edf476e49ddb679ab3906442620fa7c94093f65`:
1,071 tests, 280 required scenarios and 108 claims. Its subsequent live registry
preflight failed. The [unchanged downloaded normalized report](november9-security-hold.json)
records zero production findings and three development findings. Fresh canonical
registry responses on November 10 reproduce the same advisory identities and paths.

| Dependency                   | Prior locked version | Selected version | Official finding                                                                   |
| ---------------------------- | -------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `@modelcontextprotocol/node` | 2.0.0                | 2.1.1            | [Unbounded HTTP bodies/batches](https://github.com/advisories/GHSA-f897-62hf-6gxq) |
| `@hono/node-server`          | 1.19.17 and 2.1.0    | 2.1.3            | [Static-path middleware bypass](https://github.com/advisories/GHSA-rmxm-3fg6-px4f) |
| `minimatch`                  | 10.2.6               | 11.0.1           | [Glob pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249)    |

The adapter is used only by the conformance HTTP-to-stdio relay. Its 2.1.1 server
peer range is `^2.3.0`, satisfied by the unchanged 2.3.1 server. The latest adapter
2.1.2 requires server `^2.4.0`; selecting it would unnecessarily change the runtime
graph. Node 2.1.1 was published October 2. Hono 2.1.3 was published September 29;
minimatch 11.0.1 October 27. Registry SHA-512 integrities match the lockfile and
all selected engine ranges include the repository's Node 22/24 environments.
Minimatch brings its declared pure matcher dependency
`@isaacs/nonrecursive-glob-match` 1.1.0, published November 5.

The Hono override crosses major 1 to 2 on the adapter path; the conformance SDK
already used major 2. The [upstream major release](https://github.com/honojs/node-server/releases/tag/v2.0.0)
changes request-body implementation and raises its Node floor. The [security fix](https://github.com/honojs/node-server/commit/9821792)
refuses remaining percent signs in routed static paths by default. The adapter's
actual request conversion and relay must therefore pass conformance after the
change. No HTTP/static-serving public capability is introduced.

Minimatch crosses major 10 to 11 in ESLint and TypeScript lint tooling. Its
[upstream fix](https://github.com/isaacs/minimatch/commit/77a0f5c)
bounds globstar/parent expansion and pairwise preprocessing; repository-wide lint
exercises the consumers' actual configuration and APIs. No glob matcher is added
to production project reading.

Frozen installation, lint and type checking pass. A [fresh canonical audit of the changed working tree](november10-working-tree-audit.json)
reports zero production and full-graph findings. The corrected integrated `pnpm check` passes all 1,071 tests, 280 required
scenarios and 108 claims, package lint, safety and the unchanged official
2025-11-25 conformance baseline through the actual upgraded relay. Local evidence
names dirty base commit `4edf476`, Node 22.17.1 and installed archive
`sha256:4c41c48a03b3871ecb52f28697dbaeab33b41f12c1df16361a68bf8fc90f50df`. Exact-source CI is pending. Audit freshness is bounded to its
collection time and cannot clear historical candidate bytes. No conformance
baseline, retry, deadline, security exception or release-age policy is changed.
Existing framework and publication admission remain authoritative.

The first focused invocation and full-gate invocation through Corepack stopped
before tests because child commands selected the older globally installed pnpm.
Using the repository's direct pinned pnpm launcher resolved that environment
mismatch without policy changes. The focused security controls then passed all
eight cases. The first integrated run passed 1,065 tests and failed six framework
mapping controls because the two new evidence documents were unclassified.
The new review/audit records were explicitly classified alongside existing security
bookkeeping; the dependency map itself remains a semantic input, and package/lock
changes still invalidate framework review. No expired review was renewed.
The affected controls and full gate were repeated after this mapping correction.

After mapping correction, all 21 focused framework controls pass. The final
integrated command then exits successfully after the correction, preserving every
test assertion. The local artifact has changed development metadata; its successful
run does not approve historical signed/unsigned candidates or renew framework
source observations.
