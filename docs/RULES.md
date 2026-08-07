# Pre-release rule catalog

Catalog version 1.0.0. Updated 2026-08-06. Backlog item: BGA-110.

[`config/rule-catalog.json`](../config/rule-catalog.json) is the machine-readable source of truth; this file is its human-readable view. `pnpm verify:rule-catalog` fails when a rule is implemented but not catalogued, catalogued but not implemented, catalogued with a severity or certainty its implementation does not use, missing a fixture or a source, or missing from this file.

## What a check records

Every automated check names the rule that implements it, the tool that runs it, its severity and certainty, the fixtures that prove both outcomes, and where the requirement comes from. Source kinds are deliberate:

- **framework-behavior** — the BGA framework will not work otherwise. These are the strongest claims.
- **community-convention** — a widely followed practice rather than a hard requirement, reported at a lower severity.
- **project-inference** — inferred by comparing two parts of a project. Useful, but not a documented rule, and never reported as certain.
- **official-documentation** — cited BGA Studio documentation. No check claims this kind yet; the framework-behavior entries below are derived from observed framework behavior and fixtures, and citing a page would be a stronger claim than the evidence supports.

A check with a `failing` fixture is proven in both directions: the valid fixture must not produce it, and the failing fixture must. The gate cross-checks that against the fixture's own declared findings.

## State machine

Run by `validate_state_machine`. Implemented in [`src/rules/state-machine.ts`](../src/rules/state-machine.ts).

| Check                                   | Severity | Certainty | Source kind        | Failing fixture |
| --------------------------------------- | -------- | --------- | ------------------ | --------------- |
| `state.action.handler-missing`          | warning  | likely    | framework-behavior | yes             |
| `state.args.handler-missing`            | warning  | likely    | framework-behavior | yes             |
| `state.dead-end`                        | warning  | certain   | framework-behavior | yes             |
| `state.id.duplicate`                    | error    | certain   | framework-behavior | no              |
| `state.initial.missing`                 | error    | certain   | framework-behavior | no              |
| `state.name.duplicate`                  | warning  | certain   | framework-behavior | yes             |
| `state.name.missing`                    | warning  | certain   | framework-behavior | no              |
| `state.possible-action.handler-missing` | warning  | likely    | framework-behavior | no              |
| `state.transition.target-exists`        | error    | certain   | framework-behavior | yes             |
| `state.type.unknown`                    | warning  | certain   | framework-behavior | yes             |
| `state.unreachable`                     | warning  | certain   | framework-behavior | yes             |

## Action contracts

Run by `validate_action_contracts`. Implemented in [`src/rules/action-contracts.ts`](../src/rules/action-contracts.ts).

| Check                          | Severity    | Certainty | Source kind          | Failing fixture |
| ------------------------------ | ----------- | --------- | -------------------- | --------------- |
| `action.argument.mismatch`     | warning     | likely    | framework-behavior   | yes             |
| `action.call.not-declared`     | warning     | likely    | framework-behavior   | yes             |
| `action.declared.not-called`   | information | possible  | project-inference    | no              |
| `action.entry-point.duplicate` | error       | certain   | framework-behavior   | no              |
| `action.entry-point.missing`   | warning     | likely    | framework-behavior   | yes             |
| `action.game-method.missing`   | warning     | likely    | framework-behavior   | yes             |
| `action.name.convention`       | information | certain   | community-convention | yes             |
| `action.trace.unavailable`     | information | certain   | framework-behavior   | no              |

## Notifications

Run by `validate_notifications`. Implemented in [`src/rules/notifications.ts`](../src/rules/notifications.ts).

| Check                                 | Severity    | Certainty | Source kind        | Failing fixture |
| ------------------------------------- | ----------- | --------- | ------------------ | --------------- |
| `notification.handled.not-sent`       | information | possible  | project-inference  | yes             |
| `notification.payload.mismatch`       | warning     | likely    | framework-behavior | yes             |
| `notification.sent.not-handled`       | warning     | likely    | framework-behavior | yes             |
| `notification.subscription.duplicate` | warning     | certain   | framework-behavior | yes             |
| `notification.trace.unavailable`      | information | certain   | framework-behavior | no              |

## Database usage

Run by `audit_database_usage`. Implemented in [`src/rules/database.ts`](../src/rules/database.ts).

| Check                         | Severity    | Certainty | Source kind          | Failing fixture |
| ----------------------------- | ----------- | --------- | -------------------- | --------------- |
| `database.audit.unavailable`  | information | certain   | framework-behavior   | no              |
| `database.column.duplicate`   | error       | certain   | framework-behavior   | no              |
| `database.column.undeclared`  | warning     | likely    | framework-behavior   | yes             |
| `database.column.unused`      | information | possible  | project-inference    | yes             |
| `database.query.interpolated` | warning     | likely    | community-convention | yes             |
| `database.table.duplicate`    | error       | certain   | framework-behavior   | no              |
| `database.table.undeclared`   | error       | certain   | framework-behavior   | yes             |

## Manual-only checks

These are part of a BGA pre-release review and cannot be automated. `run_pre_release_audit` reports them as manual-required; it never counts them as passed.

| Check                         | Why it cannot be automated                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| `manual.artwork.rights`       | A tool cannot judge provenance or licensing of a binary asset.     |
| `manual.rules.fidelity`       | Requires reading the physical rulebook against the implementation. |
| `manual.translation.strings`  | Judging whether a string reads naturally is a human decision.      |
| `manual.tutorial.quality`     | Quality of explanation cannot be measured statically.              |
| `manual.accessibility.colour` | Requires visual inspection of the rendered interface.              |
| `manual.multiplayer.testing`  | Requires running real tables with real players.                    |
| `manual.spectator.replay`     | Requires observing a live table and its replay.                    |
| `manual.performance.table`    | Requires measuring a live table.                                   |

## Changing the catalog

1. Implement or change the rule, with its severity and certainty.
2. Update the catalog entry and, where the outcome changes, the fixture that declares it.
3. Update this file.
4. Run `pnpm check`. A rule and its catalogue entry cannot drift apart without failing the build.
