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
`sha256:4c41c48a03b3871ecb52f28697dbaeab33b41f12c1df16361a68bf8fc90f50df`. The completed CI result is retained below. Audit freshness is bounded to its
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

## Completed implementation evidence

[CI run 42900818441](https://github.com/Brandon-Born/bga-mcp/actions/runs/42900818441),
attempt 1, passes all six Linux/macOS/Windows Node 22/24 jobs. Its implementation
head is `eb5b2992727e0c19ff17d3669a22182462b8302c`; the actual clean PR merge
commit recorded in every downloaded sealed artifact is
`6f104948dda9f075013706b82f541f776da1e959`. Both have Git tree
`aa708c4c265dd0818a35a2cc8e5073cd470033ff`, verified from the fetched merge ref.
Each artifact passes trusted-schema and integrity checks, matches the selected
lockfile, and records 1,071 passing tests / 280 passing required scenarios /
108 claims and passing applicable conformance. Platform artifact identities are
retained individually; this is not a replacement candidate or signature.

The complete production lock graph is unchanged: all four runtime package
snapshots and package integrities match the original source. The clean-source
canonical audit below also reports zero findings, with its actual collection time
and source/material identity. It does not renew an old candidate assessment.

This later evidence-only note records those implementation results, not an
exact-HEAD CI run for its own commit. The ordinary policy, tests and assertions
are unchanged. All eight existing framework observations remain held by their
actual expiry/dependency state; no re-admission, merge or release approval is
inferred. BGA-462 remains implemented pending the separate admission/review work.

### Downloaded artifact bindings

```json
[
  {
    "job": "verification-macos-latest-node-22",
    "source": {
      "commit": "6f104948dda9f075013706b82f541f776da1e959",
      "clean": true
    },
    "environment": {
      "node": "v22.23.4",
      "platform": "darwin",
      "arch": "arm64",
      "packageManager": "pnpm@11.28.5",
      "ci": true
    },
    "artifactDigest": "sha256:4c41c48a03b3871ecb52f28697dbaeab33b41f12c1df16361a68bf8fc90f50df",
    "evidenceSeal": "bc4192077c80e561b4713c8e1f8a11063d128b45c8e5c2a77a50aa75fab800e3",
    "evidenceFileDigest": "sha256:6927fafc717a90846c7463e78eaccde45edf516f85992893bfbea0e2786f2853"
  },
  {
    "job": "verification-macos-latest-node-24",
    "source": {
      "commit": "6f104948dda9f075013706b82f541f776da1e959",
      "clean": true
    },
    "environment": {
      "node": "v24.22.2",
      "platform": "darwin",
      "arch": "arm64",
      "packageManager": "pnpm@11.28.5",
      "ci": true
    },
    "artifactDigest": "sha256:4c41c48a03b3871ecb52f28697dbaeab33b41f12c1df16361a68bf8fc90f50df",
    "evidenceSeal": "e6dc62964b3557c4f61dd05c83636798cfb00b545c5abd541b8629a4c998388f",
    "evidenceFileDigest": "sha256:e6488624d5cedbfa12e9385a2d183200846333841b6cff24a012a2daa47fc283"
  },
  {
    "job": "verification-ubuntu-latest-node-22",
    "source": {
      "commit": "6f104948dda9f075013706b82f541f776da1e959",
      "clean": true
    },
    "environment": {
      "node": "v22.23.4",
      "platform": "linux",
      "arch": "x64",
      "packageManager": "pnpm@11.28.5",
      "ci": true
    },
    "artifactDigest": "sha256:5372fd35c17e60d96bf71ee7af1a246f8a17e7104f6253f5c4e1b944dd59b919",
    "evidenceSeal": "7a03ccd5d14480787821a9965037b51ca5a78a72edfd10b569afabdcec9814c6",
    "evidenceFileDigest": "sha256:6e24886b26f4c305cf8466ae4db5b8fb37555b08e60aa23c6e371f5d029fc692"
  },
  {
    "job": "verification-ubuntu-latest-node-24",
    "source": {
      "commit": "6f104948dda9f075013706b82f541f776da1e959",
      "clean": true
    },
    "environment": {
      "node": "v24.22.2",
      "platform": "linux",
      "arch": "x64",
      "packageManager": "pnpm@11.28.5",
      "ci": true
    },
    "artifactDigest": "sha256:5372fd35c17e60d96bf71ee7af1a246f8a17e7104f6253f5c4e1b944dd59b919",
    "evidenceSeal": "069149fd7fd5b8ba63cff46228df01ecb71efeaa23aadacc52394907f3acdfea",
    "evidenceFileDigest": "sha256:e594cddf63b94a6fdf53d8184ff1f338df3b12f2ff71e6b3a28a2f1f4e89541f"
  },
  {
    "job": "verification-windows-latest-node-22",
    "source": {
      "commit": "6f104948dda9f075013706b82f541f776da1e959",
      "clean": true
    },
    "environment": {
      "node": "v22.23.4",
      "platform": "win32",
      "arch": "x64",
      "packageManager": "pnpm@11.28.5",
      "ci": true
    },
    "artifactDigest": "sha256:d6adfea59404e72f0c62f611a5476e90ddc732e3e0b279e601dd1c4026cbbc75",
    "evidenceSeal": "993da95ddb30ee0116d0a29ce0a62cd73db66aabdf0bbfdcab5cb79fcf07f6cd",
    "evidenceFileDigest": "sha256:f9a26bf9542257f5a568cf00cc234790dfa73e3c66a42dbb507fda6b1995725a"
  },
  {
    "job": "verification-windows-latest-node-24",
    "source": {
      "commit": "6f104948dda9f075013706b82f541f776da1e959",
      "clean": true
    },
    "environment": {
      "node": "v24.22.2",
      "platform": "win32",
      "arch": "x64",
      "packageManager": "pnpm@11.28.5",
      "ci": true
    },
    "artifactDigest": "sha256:d6adfea59404e72f0c62f611a5476e90ddc732e3e0b279e601dd1c4026cbbc75",
    "evidenceSeal": "b11c923c382eecb8aa8c91b2fd332418c90dc001e30a39965056ba05be8319e1",
    "evidenceFileDigest": "sha256:355d71537a2683b671c82ba568b1e972105bfcafd5254cdee09bfdc554a38654"
  }
]
```

### Clean implementation-source audit

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-10T21:00:29.983Z",
  "registry": "https://registry.npmjs.org",
  "source": {
    "commit": "eb5b2992727e0c19ff17d3669a22182462b8302c",
    "lockDigest": "sha256:2298e9f9ec04efff2c1576c272a2efffa831d6ab4f0e94b484a4c400ff5ce015",
    "packageDigest": "sha256:b086a93e24dce3b930e4eb459b1aae1ca4df972663b8159d7ba97fd7e3a58610",
    "workspaceDigest": "sha256:cb702802db6f85597c6a359206f79efc19f7a1c58b85c4a94825001c915daad8",
    "policyDigest": "sha256:be837bd11c489f74024db6e99c7817db38b9fad9d2ae2b69f3ee56553f972bab"
  },
  "production": {
    "counts": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 0,
      "critical": 0
    },
    "findings": []
  },
  "all": {
    "counts": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 0,
      "critical": 0
    },
    "findings": []
  }
}
```
