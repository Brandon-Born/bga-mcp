# Security Policy

`bga-mcp` inspects authorized local source without writing to it. Network access is off by default. The public command excludes network and Studio surfaces; the development profile has explicitly permitted documentation and experimental Studio reads. See the packaged [inventory](README.md) and [version policy](docs/VERSIONING.md).

## Reporting a vulnerability privately

Do not open a public issue for a security vulnerability. Use [GitHub private vulnerability reporting](https://github.com/Brandon-Born/bga-mcp/security/advisories/new), or open this repository's Security and quality tab and choose **Report a vulnerability**. The channel is enabled for this public repository. A GitHub account is required; repository membership is not. Reports stay in the private advisory workflow until an authorized disclosure decision.

Provide the affected package version or commit, MCP client and configuration, a minimal original reproduction, expected and observed behavior, likely impact, and any suggested mitigation. Use a minimal synthetic project. Do not include real credentials, session cookies, private game code, player data or publisher artwork. State if an exact reproduction requires sensitive material so the maintainer can agree on safe handling privately.

If the reporting page is temporarily unavailable, retain the report locally and retry the private channel; do not post its contents publicly. Routine non-security bugs can use public issues with sanitized examples.

## Ownership and triage

Repository maintainer **Brandon-Born** owns incoming reports and the disclosure decision. The maintainer aims to:

- Acknowledge a report within **3 business days**.
- Give an initial triage decision within **7 business days**, covering reproducibility, affected versions, severity and the next step.
- Update an open, accepted report at least every **7 calendar days**, even if the fix is still pending.

These are response targets for a community project, not guaranteed service levels. If a target is missed, follow up in the same private report. GitHub notification delivery depends on the maintainer's notification settings; an automated receipt is not a maintainer acknowledgement.

Confirm the report with a synthetic reproduction. Keep discussion and any patch work private until disclosure is coordinated. Accept a confirmed vulnerability as a draft advisory; record the affected inventory, remediation owner, planned fix and targeted regression/security checks. Explain duplicate, unsupported-version or non-security triage privately before closing. A harmless channel test is closed as **benign channel test; no vulnerability**, without publication, a CVE request or a private fork.

## Supported versions

Before a stable release, this is evaluation software, not a production security-support commitment. Reports are welcome for all versions; remediation focuses on the latest designated evaluation candidate (**1.0.0-rc.3**) and current source. Earlier candidates remain immutable and may be superseded; signing proves identity and integrity, not a completed security review or permanent dependency clearance.

After stable publication, the **current stable major** receives fixes. The **previous major** receives feasible critical security fixes for **180 days** after its successor is published. Older majors remain installable but unsupported. This follows the packaged version policy; an unsupported-version report is still assessed for impact on a supported version. Use the latest reviewed release rather than relying on an old advisory assessment.

## Coordinated disclosure

For a confirmed issue, aim for remediation within **30 calendar days** of acceptance and discuss a feasible date with the reporter. Review disclosure timing by **90 calendar days** if remediation is still incomplete. These are coordination targets, not automatic publication timers. Earlier coordinated disclosure may be needed for active exploitation; delays and their rationale are discussed privately.

Before publication, verify the fix through the affected installed-package scenarios, reassess dependencies and residual risks, and identify immutable fixed and affected versions. Publish the reviewed advisory and sanitized remediation guidance with the fixed release when feasible. Request a CVE only for a confirmed issue where appropriate. Agree on attribution with the reporter; do not disclose confidential reproductions, private project source or credentials. Never publish a harmless channel-test report.

## Boundaries and residual risks

Local inspection is confined to authorized roots, with budgets, refusal paths and redaction. No profile provides uploads, synchronization, remote mutations or telemetry. TB-STUDIO for mutation remains unreviewed; the separate reviewed TB-STUDIO-READ surface remains experimental and cannot retrieve browser-rendered logs. Documentation network permission is reviewed and guarded, not unrestricted access.

Default server execution sends no telemetry and stores no analytics identifiers.
The installed public command is tested across its complete local inventory with
network and Node filesystem mutation observation, an isolated user profile,
unchanged project/profile snapshots, and independent injected request and
identifier-write controls. This observes the Node primitives used by the server;
it is not an operating-system sandbox or a claim about package-manager traffic.

Any future telemetry requires a separate backlog item, maintainer agreement,
privacy and threat-model review, explicit opt-in, and installed-artifact tests
proving absence before consent and after refusal. Documentation network opt-in
cannot grant telemetry consent. A future review must name what is collected,
its destination, retention and deletion, and how consent can be withdrawn.

The repository [threat model](https://github.com/Brandon-Born/bga-mcp/blob/0c3c34d19434106a53d7b3210598e95db1094b74/docs/THREAT_MODEL.md) records controls, operator responsibilities and remaining risks at that reviewed revision. Current source work uses the checkout's threat model and executable backlog. This policy does not substitute for the exact-candidate release security review.

## Process sources

GitHub documents [private reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately), [maintainer triage and closure](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/fix-reported-vulnerabilities/manage-vulnerability-reports), and the [configuration API](https://docs.github.com/en/rest/repos/repos#enable-private-vulnerability-reporting-for-a-repository). Its reporting documentation says “anyone can submit a private vulnerability report”; administrator-created drafts are a different path and do not prove non-maintainer access.
