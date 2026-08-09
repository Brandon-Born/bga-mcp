# Installed-package adversarial review — 2026-08-08

## Verdict

The package installs, negotiates both advertised MCP versions, exposes its runtime inventory, enforces important refusal paths, and shuts down cleanly. It is **not ready to describe any public capability as verified**.

The review found three classes of release blocker:

1. Documented, common BGA constructs produce confident false findings through the installed public MCP boundary.
2. The evidence system permits a capability to remain `verified` when its protocol conformance, literal acceptance cases, fixtures, or retained records are incomplete or stale.
3. Policy and Studio controls have exploitable or resource-bounding gaps on failure, credential, network-address, successful-output, and filesystem paths that their existing tests do not exercise.

The affected manifest entries were downgraded to `implemented`, existing backlog items were reopened, and every finding below has a permanent owner.

## Artifact and method

- Source commit: `a178783c1a858c00dfafe3acd010b98c48d633fe`
- Source state: clean `git archive`, not the working directory
- Package: `bga-mcp-0.0.0-development.tgz`
- Package SHA-256: `f8ab96cea1380395dde6cd01eb0b7358b3f305d10fe71074e6fd7c71bdada93e`
- Consumer: isolated pnpm project with `@modelcontextprotocol/client@2.0.0`
- Transport: real `Client` plus `StdioClientTransport`, spawning the installed bin
- Protocols: negotiated `2025-11-25` and `2026-07-28` separately
- Network: repeated with outbound documentation access unavailable and with deliberate live access to the official allowlisted wiki
- Cleanup: package uninstall removed the dependency and bin; every child exited; all isolated package/probe temporary trees were removed
- Continuation probes: after documentation and tracking-config edits, the unchanged implementation was freshly packed/installed again for BGA-325/BGA-326. A real SDK client reproduced the oversized failure and post-timeout filesystem work; the second isolated install and all instrumentation were deleted and their absence verified.
- Live Studio: the owner completed enrollment and authorized one private BGG-ID-0 tutorial project in the existing browser session. No browser credential was inspected or copied by the reviewer.

The primary behavior claims above came from the installed public package. Findings below distinguish installed-client reproductions from in-process probes and static source/control review; source inspection was used to locate causes and to identify explicitly labeled, not-yet-runtime-reproduced risks.

## What passed

- Pack, isolated install, public import, executable bin, start, initialize, shutdown, uninstall, and cleanup.
- Discovery of 10 tools, 11 concrete listed resources, and no prompts.
- Invocation of every tool through the installed stdio server.
- Schema rejection for every tool, null arguments, unknown tools/resources, unsupported protocol, invalid CLI options, and help/version paths.
- Studio-disabled and missing-session refusals.
- Clean stderr and clean child-process exit.
- Legacy-era client roots, including `notifications/roots/list_changed` refresh.
- Documentation-resource host/provenance selection for all seven fixed topics.
- A live `search_bga_docs` query for state-machine transitions returned two useful official results.
- Real Studio developer enrollment and owner-authorized creation of a private, BGG-ID-0 tutorial project containing only BGA's generated starter skeleton.

These passing observations remain evidence for the implementation. They do not override a failed correctness or completion prerequisite.

After all review/tracking corrections, `corepack pnpm check` passed on 2026-08-08 America/Chicago (the conformance output timestamps are UTC on 2026-08-09): 56 test files and 383 tests passed; statement coverage was 91.38%; package build and publint passed; the threat-model, compatibility, scenario, safety, and evidence gates passed; and official `2025-11-25` conformance passed against its reviewed baseline. The generated evidence records 16 capabilities and 113/113 required scenarios. The separately maintained live documentation evaluation still fails as recorded in AR-07 and is not run by this offline CI-shaped gate.

## Critical findings

### AR-01 — Verification is not compositional

Every formerly verified capability claimed both advertised protocol versions. The official conformance record passes `2025-11-25` but records `2026-07-28` as not applicable/not run for the shipped stdio semantics; `verify-evidence` explicitly accepts overall partial conformance. That contradicts [TESTING.md](../TESTING.md), which says a capability cannot be released on a transport that has not passed conformance.

The manifest also has no field for its policy-required most recent passing CI evidence. Scenario discovery regex-scans string literals, so fixture data can satisfy the existence gate without being a runnable assertion. Several “current” verification records have old capability, scenario, claim, or test counts.

Disposition: reopened BGA-005, BGA-006, BGA-007, BGA-009, and BGA-012; BGA-017 owns the cross-cutting correction.

### AR-02 — The clean modern fixture encodes the wrong initial/end-state model

A documented state-class project whose `setupNewGame` returns `PlayerTurn::class` and has no class state 1 produced:

- certain error `state.initial.missing`
- certain warning `state.unreachable` for two valid states

The current modern fixture defines state-class IDs 1 and 99, masking the bug. The official [state-class documentation](https://en.doc.boardgamearena.com/State_classes:_State_directory) says to return the initial class from `setupNewGame`, says class IDs cannot use 1 or 99, and documents `StateConstants`, `StateType::PRIVATE`, handler returns, and `GameStateBuilder`.

Additional installed reproductions:

- `id: StateConstants::STATE_PLAYER_TURN` became `project.states.unsupported`, then generated false certain target/reachability findings.
- `StateType::PRIVATE` generated certain `state.type.unknown`.
- Pre-release converted a parser-unsupported case into two failed checks and reported `unsupported: 0`.

Disposition: reopened BGA-008, BGA-101's dependent verification, BGA-104, BGA-106, BGA-111, BGA-112, BGA-113, BGA-117, BGA-118, BGA-122, and BGA-123; BGA-124 owns the correctness fix and fixture replacement.

### AR-03 — Modern action wiring produces false defects

This documented state-class action:

```php
#[PossibleAction]
public function actPlay(int $cardId, int $active_player_id, int $currentPlayerId): string
```

was visible to state parsing but not treated as an action entry point. The installed action validator reported `action.entry-point.missing`. It also reported `action.call.not-declared` for a Game.php `actPass`, although the official state-class page says the framework checks Game.php for actions available in any state. Both player identifiers are framework-injected aliases, not client arguments.

Disposition: reopened BGA-107 and BGA-119; BGA-125 owns the fix.

### AR-04 — Notification and database readers mistake syntax for behavior

- The documented state shortcut `$this->notif->all(...)` was ignored, producing `notification.handled.not-sent` and a pre-release failure.
- Client `notif_*` methods are treated as bound even when `setupPromiseNotifications()` never registers them.
- An unrelated assignment `$example = 'SELECT imaginary_id FROM ghost';` was treated as an executed third query and generated certain `database.table.undeclared`.

Disposition: reopened BGA-108, BGA-109, BGA-120, and BGA-121; BGA-126 and BGA-127 own the fixes.

## High findings

### AR-05 — Live framework-version output is wrong

`bga://framework/version` returned `status: read` with one pair:

```json
{
  "software": "Original announcement on BGA forum",
  "version": "https://forum.boardgamearena.com/viewtopic.php?f=10&t=1973"
}
```

The current official [Studio Software Versions](https://en.doc.boardgamearena.com/Studio#Software_Versions) section instead lists Dojo 1.15, PHP 8.4, MySQL 5.7/8.0, and Font Awesome 4.7/6.4.0. The parser anchors on the table-of-contents occurrence and scans unrelated prose.

Disposition: BGA-204 remains not verified; BGA-210 owns the correctness bug.

### AR-06 — Total documentation outage is reported as a successful no-match

With DNS unavailable, `search_bga_docs` returned `isError: false`, no results, both sources under `sourcesSearched`, and “No documentation matched.” Resource reads in the same process correctly returned `policy.doc-fetch.failed ... ENOTFOUND`.

Disposition: BGA-202 remains not verified; BGA-209 owns truthful degradation and source accounting.

### AR-07 — Maintained retrieval quality still fails

The maintained real-SDK live evaluation against the repository build (`pnpm test:docs-eval`) exited 1:

- answered: 4/9; threshold 0.8
- attributed: 6/9; threshold 1
- passed: `states-where`, `game-class-location`, `software-versions`, `no-answer`
- failed: `client-entry-point`, `migration-states`, `file-reference`, `community-recipes`, `adversarial-instruction`

All seven fixed topic resources had the correct canonical URL and authority, but `game-logic`, `file-reference`, and `studio` selected materially weak passages.

Disposition: BGA-313 remains an open failing live record; BGA-211 owns captured-page relevance evaluation for search and topic resources.

### AR-08 — The 2026 roots/setup path blames a client the server never asked

On `2025-11-25`, the server requested roots, adopted them, and refreshed after `roots/list_changed`. On `2026-07-28`, the same real client advertised roots and installed a handler, but the server made zero root requests. `check_setup` told it to use a client that advertises roots, and `inspect_project` said the client offered none.

BGA-314 and BGA-315 describe the newer input-required mechanism as outstanding while both items are marked implemented; no item owned the remaining work.

Disposition: BGA-318 owns the modern input-required roots/non-secret setup flow and truthful era-aware diagnostics.

### AR-09 — Studio preflight leaks foreign actor names

The MCP log-result filter withholds foreign lines, but `checkStudioSetup` builds a diagnostic from every parsed actor and prints up to five foreign account names. The integration test intentionally expects the foreign fixture name. CLI preflight stdout can enter terminal, launcher, or CI logs, contradicting BGA-312 and `TM-STUDIO-OWN-DATA-ONLY`.

Disposition: reopened BGA-013 and BGA-016; BGA-312 remains not verified; BGA-319 owns the output-boundary fix.

## Continued live Studio and security findings

### AR-10 — The public Studio identifier rejects the real project name

The owner-authorized private project appears in Manage Games at `/studiogame?game=mcpverification`, matching the official [First steps with BGA Studio](https://en.doc.boardgamearena.com/First_steps_with_BGA_Studio) form `/studiogame?game=<your_game>`. The page's numeric Play link uses `15414`, but `/studiogame?game=15414` says the project does not exist. A real MCP client call with `gameId: "mcpverification"` failed public Zod validation because the tool requires digits, before it could touch Studio.

Disposition: BGA-312 remains implemented/not verified; BGA-320 owns project-name semantics, query confinement, guidance, and the successful live call.

### AR-11 — File-backed Studio credentials bypass value redaction

`studioSession()` can read and trim `--studio-session-file`, but `redactionOptions.secretValues` registers only `process.env.BGA_STUDIO_SESSION`. A synthetic file session was resolved while the redaction list stayed empty; the existing redaction test covers only the environment provider.

Disposition: BGA-321 owns exact resolved-value redaction. BGA-328 separately owns safe file loading. The source guide and README now warn not to use the file provider with a real credential until both pass.

### AR-12 — A new Private Studio project is readonly-shared by default

The dedicated project was created as Private with BGG ID 0 and contains only BGA's generated skeleton. Its project page nevertheless had “Allow other studio developers to get readonly access to this project source code” checked. No private publisher/source data was seeded, but selecting Private alone does not satisfy BGA-300's least-privilege acceptance.

After the initial review, the owner separately approved changing that permission. The reviewer turned it off, selected the page's `Update` action, reloaded the exact project page, and confirmed the checked class remained absent. BGA-322 remains open because a distinct-account denial and reusable live-harness precondition are still required.

Disposition: BGA-300 remains blocked; BGA-322 owns explicit ACL disablement, preflight, and a distinct-account negative access test before any live data is introduced.

### AR-13 — Hexadecimal IPv4-mapped IPv6 bypasses the SSRF guard

`blockedAddressReason` returned no violation for `::ffff:7f00:1`, `::ffff:a00:1`, and `::ffff:c0a8:101`. Node recognizes each as IPv6; standards parsing maps them to loopback/private IPv4. The classifier recognizes only dotted mapped syntax, so an address can reach the resolver-to-socket callback without the required post-resolution refusal. HTTPS certificate validation remains a second barrier, not a substitute for the policy.

Disposition: BGA-207 stays unverified and BGA-323 owns semantic address normalization across documentation and Studio HTTPS reads.

### AR-14 — Free-text request heuristics cannot prove data provenance

`requestContentViolation('SELECT unreleased_secret FROM internal_table')` returned no violation. The current policy detects paths, controls, length, and eight PHP-centric markers; it cannot determine whether arbitrary text came from a project. Accepted text is placed in the remote MediaWiki query, contradicting the absolute claim that project file content is never sent.

Disposition: BGA-324 owns an enforceable explicit-input/consent or narrow-query contract plus an honest residual-risk statement; merely adding SQL keywords to the regex is insufficient.

### AR-15 — Error responses bypass the configured output budget

With `--max-output-bytes 64`, a real client call containing an oversized unknown documentation source returned a 12,162-byte failure with the complete 12,000-character marker. A second freshly packed/installed reproduction measured `Buffer.byteLength(JSON.stringify(CallToolResult)) === 16574` and proved that its unique marker survived. That measurement is the server-owned tool-result object, not the JSON-RPC wire envelope, and it did not assert survival of every repeated tail character. Successful paths enforce the budget; shared failure publication does not.

Disposition: BGA-015 remains incomplete; BGA-325 owns one final serialized-response budget for success and failure.

### AR-16 — Timeout responses do not cancel the timed-out operation

A 5 ms in-process probe returned `policy.timeout.exceeded`, then the ignored operation completed at 50 ms. A freshly installed-client `inspect_project` probe returned its timeout before any delayed `lstat` completed, followed by 28 filesystem completions in the next 350 ms. The driver took 4.41 seconds overall; after client close/process exit, instrumentation recorded 358 starts and 357 completions for the 500-file scan, showing shutdown—not operation cancellation—eventually interrupted the work. Source inspection separately found that redirect/non-2xx bodies are resumed and settled without bounded drain/destruction after the operation timer clears; that network lifecycle case was not installed-runtime reproduced.

Disposition: BGA-326 owns cooperative cancellation and bounded response lifecycle across filesystem, parser, documentation, and Studio paths.

### AR-17 — Successful structured results bypass shared redaction

`audit_database_usage` can return complete SQL text, including a synthetic password literal. The Studio allowlist withheld foreign actors but kept an own-account line containing `Authorization: Bearer` plus a seeded marker because its sensitive regex covers only four shapes. Shared `redactValue` protects failures, not these successful results.

Disposition: BGA-014 was reopened from verified; BGA-016 and BGA-312 remain incomplete; BGA-327 owns successful-output minimization/redaction across every tool and resource.

### AR-18 — Studio session-file loading is unbounded and publishes its path

The provider uses unbounded `readFile` on an arbitrary configured path with no regular-file, symlink, FIFO, device, ownership, mode, or size checks. CLI preflight runs outside `runWithTimeout`, so a FIFO can hang it, and diagnostics intentionally print the absolute credential-file path.

Disposition: BGA-328 owns bounded protected-file semantics and generic setup output; BGA-316 remains unverified.

### AR-19 — The privileged-effect gate is easy to bypass

ESLint blocks eight exact `node:` imports outside `policy.ts`; the repository gate mirrors that list with a single-quote `from` regex. Read-only lint probes reported no violation for `fs/promises`, `node:dns`, `node:http2`, or global `fetch`. No current production bypass was found, so this is a regression-control defect rather than evidence of active exfiltration.

Disposition: BGA-329 owns a fail-closed allowlist/AST gate covering alternate specifiers, dynamic imports, re-exports, and privileged globals.

### AR-20 — Filesystem work is not entry-bounded or race-bound to the checked object

`listProjectFiles` materializes/sorts an entire directory, retains every symlink, recurses every directory, and counts only regular files. With `maxEntries: 1`, an existing directory returned zero files, four skipped links, and `truncated: false`. Reads separately realpath/contain-check a pathname, then later `lstat` and `readFile` it; concurrent replacement can invalidate the object and size that were checked.

Disposition: BGA-330 owns cumulative entry/data bounds plus descriptor/no-follow/post-open validation. The resource-exhaustion case is reproduced; the TOCTOU escape is a static race finding requiring concurrent write access to the configured root.

## Verification-completeness findings

The audit reopened BGA-100, BGA-102 through BGA-114, and BGA-116 through BGA-123 where their literal acceptance cases do not cross the installed public boundary. BGA-115 remains permanently superseded. The missing set includes:

- empty, partial, ambiguous, nested, and permission-denied layout/project cases
- resource generation, malformed, unsupported, size-limit, and in-session refresh cases
- positive and negative public coverage for every rule
- dynamic/malformed action, notification, and SQL cases
- modern rule-catalog fixture enforcement
- unsupported propagation in pre-release
- malicious/root/redaction coverage for every applicable tool
- default-root coverage beyond `inspect_project`
- every capability against hybrid/split-source layouts and duplicate precedence

BGA-128 owns the generated acceptance-to-installed-test map. BGA-017 separately ensures a scenario cannot be “covered” merely by source text.

## Packaging finding

The tarball includes README.md but excludes `docs/`. Installed README links to the installation guide, backlog, testing policy, compatibility matrix, threat model, and verification records therefore do not resolve locally. CLI help also points to absent docs. README says seven tools and three resources while discovery returns ten tools and eleven concrete resources. The canonical `AGENTS.md` description also retained the obsolete absolute statement that the server never opens a network connection after opt-in documentation and Studio readers existed.

Disposition: BGA-400 remains not verified; BGA-411 owns self-contained installed documentation and inventory-derived counts.

## Browser/live Studio boundary

The account owner completed BGA Studio developer enrollment in Chrome and explicitly confirmed creation of `McpVerification` as a Private project with BGG ID 0. BGA created the project as `mcpverification`, generated/committed its starter files, and exposed no publisher assets or user test data. No browser cookie, password, reset token, or personal registration value was copied into the repository, tool output, or conversation.

The environment now has readonly source sharing disabled: after a separate permission-change confirmation, the control was turned off, saved with `Update`, and confirmed off after a reload. That is current manual evidence, not the distinct-account denial or repeatable preflight BGA-322 requires. The owner populated the out-of-repository handoff file; metadata-only inspection confirmed a regular file owned by the account, mode 0600, size 1,435 bytes. Its value was never printed or included in a tool argument. Because the documented file provider does not register its resolved value for redaction, the live probe instead loaded the value into the installed server's `BGA_STUDIO_SESSION` environment and removed the isolated process/install afterward. The protected handoff file intentionally remains for the owner.

The live probe freshly packed and installed the current package (tarball SHA-256 `f62af72c17800b7dffa8bbce932a3ba18099669fa88adc4609e365f158ec211c`) beside `@modelcontextprotocol/client@2.0.0`. A call with the real project name, `gameId: "mcpverification"`, failed the public digits-only schema before any Studio request. A second call with the numeric Play identifier, `gameId: "15414"`, made the bounded authenticated read but returned public error `policy.output.too-large` instead of a usable result. Neither the MCP result nor captured stderr contained the session value, and stderr was empty. The isolated package tree was deleted and its absence verified. This is a real authenticated failure-path exercise, not a successful Studio-log read. BGA-300 remains blocked on BGA-320 through BGA-322 plus identity/target/cleanup preflight, and BGA-312 cannot become verified before its full blocker set passes.

## Backlog disposition summary

- Added: BGA-017, BGA-018, BGA-124 through BGA-128, BGA-209 through BGA-211, BGA-318 through BGA-330, BGA-411.
- Reopened to `implemented`: BGA-005 through BGA-009 except BGA-010; BGA-012 through BGA-016; BGA-100; BGA-102 through BGA-114; BGA-116 through BGA-123. BGA-015, BGA-207, BGA-312, and BGA-316 remain implemented/not verified with newly disproved acceptance assumptions and permanent bug owners.
- Blocked with the external condition recorded: BGA-300.
- Downgraded in the capability manifest: all formerly `verified` tool/resource entries; project-dependent capabilities now claim only the verified legacy-flat layout, and public capability protocol claims are limited to `2025-11-25` while modern, hybrid, and `2026-07-28` remain unknown/unverified.

The passing artifact lifecycle and protocol smoke evidence should be retained. They are necessary evidence, but they are not sufficient evidence of BGA semantic correctness or release verification.

## Sanitized continuation-probe recipes

- Output budget: start the freshly installed CLI with `--allow-network --max-output-bytes 64`; call `search_bga_docs` with query `state classes` and an unknown `sourceId` consisting of a unique marker plus 16,384 repeated characters; measure `Buffer.byteLength(JSON.stringify(result))` and test only whether the unique marker survives. The catalog refusal occurs before network access.
- Cancellation: start the freshly installed CLI with a 1 ms operation timeout and a temporary preload that delays `node:fs/promises.lstat` by 10 ms while recording only start/completion counters; call `inspect_project` against a synthetic 500-file root; record whether completions occur after the public timeout result and again after client close. The preload, project, install, and logs were removed after the probe.
