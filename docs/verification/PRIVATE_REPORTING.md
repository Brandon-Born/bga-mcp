# BGA-406 private vulnerability reporting

```verification-record
{"kind":"review","scope":"BGA-406 completed real non-maintainer private reporting lifecycle; original channel-only observations retained as history"}
```

The genuine non-maintainer test `GHSA-vf87-6crf-jfvg` was received through private reporting on 2026-10-03 at 03:39:20Z. Reporter `bborn-ghtest` has only repository read access. After the user's explicit approval, the maintainer posted the exact prepared acknowledgement at 03:51:28Z, the triage explanation at 03:51:43Z and closed the harmless test at 03:51:53Z. The [sanitized actual receipt](private-reporting-channel.json) preserves comment/timeline identities, observed timestamps, role and channel checks and an independent final REST read. It is closed with no publication, CVE or private fork. Regular comments were visible to advisory collaborators; no reporter-session read receipt is claimed.

The original channel enablement and anonymous authentication-entry observation remain historical inside the receipt. They were insufficient alone; the actual independent lifecycle now supplies the external evidence. No unrelated reports were enumerated.

`SECURITY.md` now states the private channel, owner, acknowledgement/triage/update targets, version-policy-aligned security support, and coordinated disclosure. It distinguishes a confirmed vulnerability from a harmless test. No stable package, security approval, published advisory, CVE or private fork is claimed or created. The [policy](../../config/security-reporting.json) is repository process configuration, not an MCP capability or runtime network permission.

`GATE-PRIVATE-REPORTING` checks channel/policy/support alignment and refuses a verified status without a real lifecycle. `INT-PRIVATE-REPORTING-LIFECYCLE` uses explicitly synthetic controls to reject a maintainer draft, unverified reporter access, missing or unordered acknowledgement/triage/closure and publication/CVE claims. Those controls never constitute external channel verification. `pnpm verify:security-reporting` checks retained observations offline; the completed real lifecycle is checked through the retained receipt, with final state independently read from GitHub.

## Exact benign test used

Use a GitHub account without admin/security privileges on this repository. Open [Report a vulnerability](https://github.com/Brandon-Born/bga-mcp/security/advisories/new). Submit only:

Title: `BGA-406 harmless private reporting channel test`

Description:

> This is a prearranged benign test of bga-mcp's private vulnerability reporting workflow, not a vulnerability report. It contains no credentials, project code, personal data, logs, copyrighted assets or exploit. Please acknowledge receipt, triage it as a benign channel test, and close it without publication, a CVE request or a private fork.

Leave optional severity, affected versions, CWE and CVE fields empty. Have the reporter provide the specific test advisory identity. Inspect that advisory directly; do not enumerate an inbox containing unrelated private reports. Record only the test identity and lifecycle timestamps in sanitized verification evidence; never publish real report contents. A maintainer account must not be substituted for this reporter role.

The proposed acknowledgement is: “Received. This is the prearranged BGA-406 benign channel test, with no vulnerability or sensitive data. I am checking the private reporting workflow.”

The proposed triage/closure explanation is: “Triaged: benign channel test; no vulnerability. The report was received through the private reporting channel and acknowledged. Closing this test without publication, a CVE request or a private fork.”

The independent reporter submitted this test. The two exact prepared comments and private closure were completed after explicit approval. Role, timeline and final state observations are retained; this repository handoff validates the receipt through the complete gate.

## Sources

Official [reporting documentation](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately) explains non-maintainer reporting and directs administrators to drafts. [Triage documentation](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/fix-reported-vulnerabilities/manage-vulnerability-reports) says a report starts in `Triage` and can be closed with an explanation when it is not a security risk. [Repository API](https://docs.github.com/en/rest/repos/repos#enable-private-vulnerability-reporting-for-a-repository) documents enablement and its status read. Sources were fetched 2026-10-02 UTC before implementation.

## Historical validation

The complete local `corepack pnpm check` passes: 656 tests, 198 required scenarios, package, applicable official conformance and safety checks. The acceptance map proves 185 of 188 scoped cases across 56 items and retains this external lifecycle plus two prior gaps as missing. [Exact-source CI](bga406-source-ci.json) passed all six Node 22/24 Ubuntu/macOS/Windows jobs. The external benign-report lifecycle is not run. BGA-406 remains implemented, not verified; later release work does not inherit completion from a configured channel.

The [2026-10-02 channel recheck](private-reporting-recheck-2026-10-02.json)
confirms reporting remains enabled and the available `Brandon-Born` account
has repository administrator permission. No independent test identity has
been supplied, and no private report was enumerated or submitted. This account
cannot substitute for the required non-maintainer reporter. The original
channel/lifecycle observation stays unchanged; the new read does not supply
receipt, acknowledgement, triage or closure evidence.

## Current lifecycle validation

`GATE-PRIVATE-REPORTING` reads the actual verified policy and retained receipt, so it validates the real lifecycle as well as policy alignment. `INT-PRIVATE-REPORTING-LIFECYCLE` remains explicitly synthetic negative coverage. The integrated handoff uses the complete current gate and exact-source CI. Security approval and public package publication are separate gates; no runtime, capability or compatibility claim changes here.

The current complete local `pnpm check` passed 775 tests, 234 required scenarios, 103 claims, package checks, official applicable conformance and safety checks. Acceptance coverage advances to 218 of 223 cases across 64 items, with five remaining cases explicitly missing. The receipt retains actual local source/artifact identity and log/evidence digests; exact committed-source CI is recorded separately.

[Exact-source CI 37095198043](https://github.com/Brandon-Born/bga-mcp/actions/runs/37095198043) passed all six Node 22/24 Ubuntu/macOS/Windows jobs at clean `64e01a7`. Each downloaded record validates trusted schema, integrity, exact clean source, matching environment, 775 tests / 234 scenarios and applicable conformance. Eight freshly read unchanged official decisions were explicitly re-admitted against this source; the actual framework guard passed. These observations do not claim that later metadata commits were that CI source.
