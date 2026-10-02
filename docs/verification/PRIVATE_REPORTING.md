# BGA-406 private vulnerability reporting

```verification-record
{"kind":"review","scope":"BGA-406 live channel enablement, policy checks and explicitly pending non-maintainer report lifecycle"}
```

GitHub private vulnerability reporting was disabled and is now enabled for `Brandon-Born/bga-mcp`. The owner API returned `enabled: true` after the documented enable endpoint. An anonymous browser reached GitHub's sign-in page with the private report URL as its return target. This proves the public entry reaches authentication; it does not prove a signed-in non-maintainer can submit, receive acknowledgement, complete triage and close a report. The [channel observation](private-reporting-channel.json) deliberately retains a null lifecycle.

`SECURITY.md` now states the private channel, owner, acknowledgement/triage/update targets, version-policy-aligned security support, and coordinated disclosure. It distinguishes a confirmed vulnerability from a harmless test. No stable package, security approval, published advisory, CVE or private fork is claimed or created. The [policy](../../config/security-reporting.json) is repository process configuration, not an MCP capability or runtime network permission.

`GATE-PRIVATE-REPORTING` checks channel/policy/support alignment and refuses a verified status without a real lifecycle. `INT-PRIVATE-REPORTING-LIFECYCLE` uses explicitly synthetic controls to reject a maintainer draft, unverified reporter access, missing or unordered acknowledgement/triage/closure and publication/CVE claims. Those controls never constitute external channel verification. `pnpm verify:security-reporting` checks retained observations offline; a fresh GitHub read and the actual private lifecycle remain the live gate.

## Exact benign test, ready for an independent reporter

Use a GitHub account without admin/security privileges on this repository. Open [Report a vulnerability](https://github.com/Brandon-Born/bga-mcp/security/advisories/new). Submit only:

Title: `BGA-406 harmless private reporting channel test`

Description:

> This is a prearranged benign test of bga-mcp's private vulnerability reporting workflow, not a vulnerability report. It contains no credentials, project code, personal data, logs, copyrighted assets or exploit. Please acknowledge receipt, triage it as a benign channel test, and close it without publication, a CVE request or a private fork.

Leave optional severity, affected versions, CWE and CVE fields empty. Have the reporter provide the specific test advisory identity. Inspect that advisory directly; do not enumerate an inbox containing unrelated private reports. Record only the test identity and lifecycle timestamps in sanitized verification evidence; never publish real report contents. A maintainer account must not be substituted for this reporter role.

The proposed acknowledgement is: “Received. This is the prearranged BGA-406 benign channel test, with no vulnerability or sensitive data. I am checking the private reporting workflow.”

The proposed triage/closure explanation is: “Triaged: benign channel test; no vulnerability. The report was received through the private reporting channel and acknowledged. Closing this test without publication, a CVE request or a private fork.”

No report or message has been submitted by this implementation. External submission and permission to send the prepared acknowledgement/closure explanation remain required. Afterward, inspect the report's actual private state and non-maintainer role, retain sanitized observations and rerun the full gate before setting BGA-406 verified.

## Sources

Official [reporting documentation](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately) explains non-maintainer reporting and directs administrators to drafts. [Triage documentation](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/fix-reported-vulnerabilities/manage-vulnerability-reports) says a report starts in `Triage` and can be closed with an explanation when it is not a security risk. [Repository API](https://docs.github.com/en/rest/repos/repos#enable-private-vulnerability-reporting-for-a-repository) documents enablement and its status read. Sources were fetched 2026-10-02 UTC before implementation.

## Validation

The complete local `corepack pnpm check` passes: 656 tests, 198 required scenarios, package, applicable official conformance and safety checks. The acceptance map proves 185 of 188 scoped cases across 56 items and retains this external lifecycle plus two prior gaps as missing. [Exact-source CI](bga406-source-ci.json) passed all six Node 22/24 Ubuntu/macOS/Windows jobs. The external benign-report lifecycle is not run. BGA-406 remains implemented, not verified; later release work does not inherit completion from a configured channel.

The [2026-10-02 channel recheck](private-reporting-recheck-2026-10-02.json)
confirms reporting remains enabled and the available `Brandon-Born` account
has repository administrator permission. No independent test identity has
been supplied, and no private report was enumerated or submitted. This account
cannot substitute for the required non-maintainer reporter. The original
channel/lifecycle observation stays unchanged; the new read does not supply
receipt, acknowledgement, triage or closure evidence.
