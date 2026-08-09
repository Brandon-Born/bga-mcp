# Notification contract verification

> [!CAUTION]
> Historical evidence only. The [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md) reopened the associated backlog and manifest claims. Do not treat this record as current release verification.

Recorded: 2026-08-06. Covers BGA-108.

`validate_notifications` checks the one BGA contract that breaks in silence. When an action is misrouted the framework raises an error; when a notification is misnamed, nothing happens at all — no error, no log, the interface simply never updates and the developer goes looking in the wrong place.

## What it compares

- **What the server sends** — `notifyAllPlayers` and `notifyPlayer` calls, their notification names, and the payload keys they carry. Framework-managed keys (`i18n`, `player_name`, `player_id`) are excluded so they cannot produce noise.
- **What the client handles** — names bound by `dojo.subscribe` or by the `notif_<name>` method convention the modern framework binds automatically, and the `notif.args.<key>` reads inside each handler.

Both sides of the trace are returned in the result, so the tool's reasoning can be checked rather than trusted.

## The rule catalog

### Proven from the source — reported as facts

| Rule                                  | Severity    | Catches                                                                              |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `notification.subscription.duplicate` | warning     | The client subscribing to one name twice, so the handler runs twice per notification |
| `notification.trace.unavailable`      | information | A side that could not be read, or no notification found at all                       |

### Cross-side — reported as heuristics

| Rule                            | Certainty | Catches                                                         |
| ------------------------------- | --------- | --------------------------------------------------------------- |
| `notification.sent.not-handled` | likely    | A notification the server sends that no handler receives        |
| `notification.payload.mismatch` | likely    | A key one side uses and the other does not, in either direction |
| `notification.handled.not-sent` | possible  | A handler no readable server source feeds                       |

`notification.handled.not-sent` is `possible` rather than `likely` because a legitimate send can be invisible to a textual reader — built at runtime, outside the read budget, or coming from a framework module rather than project code.

## Not guessing

- **A send it cannot read becomes unsupported syntax.** `notifyAllPlayers($name, …)` or a payload passed as a variable is reported as unreadable, never resolved.
- **An empty trace is not a pass.** If both sides are readable but neither mentions a notification, the result is `notification.trace.unavailable`, not `passed`. That is either a project with no notifications or a form this reader does not recognize, and the tool cannot tell which — so it says so. The modern fixture hits this today.
- **No project code is executed.**

## Evidence

The complete gate passed on Node 22.17.1 (macOS): 185 tests across 29 files, 94.96% statement, 88.84% branch, 96.15% function, and 94.81% line coverage of `src`, plus official conformance and every verification gate.

### Fixtures

- **`legacy`** — the server sends `playerPassed` with a `comment` key; the client subscribes and reads `comment`. Validation returns `passed`.
- **`legacy-broken`** — seeds four defects: a notification sent with a key the handler ignores (`score`), a handler reading a key the server never sends (`comment`), a notification nobody handles (`ghostEvent`), a handler nothing sends (`phantomEvent`), and a name subscribed twice. Five findings, declared in its `expected.json`.

### Packaged scenarios

| Scenario                                  | Proves                                                                |
| ----------------------------------------- | --------------------------------------------------------------------- |
| E2E-VALIDATE-NOTIFICATIONS-CLEAN          | A healthy contract passes and both sides of the trace are returned    |
| E2E-VALIDATE-NOTIFICATIONS-SEEDED-DEFECTS | Exactly the five declared defects, facts and heuristics distinguished |
| E2E-VALIDATE-NOTIFICATIONS-UNTRACEABLE    | A contract that cannot be traced never returns clean                  |
| E2E-VALIDATE-NOTIFICATIONS-IMMUTABLE      | The project directory hash is unchanged                               |
| E2E-VALIDATE-NOTIFICATIONS-DETERMINISTIC  | Repeated calls return byte-identical results                          |
| E2E-VALIDATE-NOTIFICATIONS-INVALID-INPUT  | Four malformed inputs are rejected by the published schema            |
| E2E-VALIDATE-NOTIFICATIONS-UNLISTED-ROOT  | An unlisted root is refused, with the path redacted                   |

## A flaky-test bug this work exposed

Adding a fifth end-to-end suite made the suite fail intermittently: every capability suite ran `pnpm pack`, whose `prepack` step writes `dist/`, so several suites raced on the same directory. Each suite passed alone and the set failed together — the exact shape of a test that would have passed locally and failed in CI.

The fix is in `tests/global-setup.ts`: the artifact is packed once, before any worker starts, and every suite installs that one tarball. This removed four redundant packs, so the end-to-end run is also faster. `packaged-server.test.ts` still packs independently, because proving that packing works is its scenario.

Per the testing policy, a flaky test is a failure. This one was fixed rather than retried.

## Deliberate limits

- **Legacy client and PHP sources only.** A modern project reports `notification.trace.unavailable`.
- **Payload keys are compared by name, not shape.** A key whose value type changed is invisible to this tool.
- **Handlers are matched by name.** A client that routes several notifications through one generic handler will produce `sent.not-handled` findings; that is why the rule is a heuristic and records the limitation.
