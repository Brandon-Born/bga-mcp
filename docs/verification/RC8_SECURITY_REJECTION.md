# rc.8 rejected after independent security review

```verification-record
{"kind":"review","scope":"Independent Daybreak Blue findings against exact signed rc.8, local reproduction, explicit rejection and bounded remediation; not a new candidate security approval"}
```

Signed `v1.0.0-rc.8`, source `f7cdc3d785ae173cde54ffd6ba65d073fac87b47`,
original tarball `sha256:fce2a4491d7aa41be0b6d0cb8adcd74bfe998805442d0ec1058d031038e9c91d`,
is blocked for publication. Signing authenticates those bytes; it does not
establish that the runtime is safe.

Independent Daybreak Blue review on 2026-10-19 identified SEC-RC8-01 (high:
client roots become filesystem authority without startup roots) and SEC-RC8-02
(medium: project metadata reaches agent-facing prose without a trust label).
The supplied isolated probe was independently repeated against that exact
signed package: client-only root accepted = true, synthetic private file read =
true, hostile metadata at summary start = true. The exploit requires a client
controlling its roots response and OS read permission, or project-controlled
text plus a consuming agent that acts on it. No OS privilege escalation or
server-side instruction execution is claimed.

The findings contradict existing trusted-developer / semi-trusted-client /
untrusted-project boundaries. They are accepted as genuine release blockers.
BGA-449 repairs runtime behavior and adds packaged adversarial tests. Project
content labels reduce confusion; the consuming agent must still enforce its
own permissions and instruction/data isolation.

Earlier initial/clean assessments, client checks and CI remain immutable
historical observations. In particular, `security-review-v1.0.0-rc.8-clean.json`
is not current publication approval. `config/security-review.json` carries an
explicit publication hold that refuses that approval even at its original valid
time. Both live writers and evidence preparation refuse the hold; no fabricated
replacement receipt is used. Historical packet verification remains possible.

PR39 now contains the remediation and historical disposition together. It is
a draft. Development selects rc.9 locally, without creating a tag or claiming
a hosted candidate. The exact rc.8 tag, tarball, signature and records must
never move or be overwritten. A new candidate, signature and candidate-specific
security/client/usefulness evidence are needed after owner-approved integration.
Merging and publication remain unauthorized. Dino Racer is untouched.
