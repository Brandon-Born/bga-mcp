# BGA-408 framework change process verification

```verification-record
{"kind":"review","scope":"BGA-408 conservative impact mapping, repository publication holds and simulated fixture/retest lifecycle; no live baseline or upstream change claim"}
```

The [process](../FRAMEWORK_CHANGES.md) names an owner, weekly explicit single-page monitoring, compatibility/deprecation decisions, original fixtures and 24-hour emergency triage. `framework:status` derives impact from the rule catalog and compatibility matrix. Missing observation, changed text, unavailable sources, expired observation and implementation drift block `framework:release`; candidate creation and new inventory guidance generation call that guard. Current supported claims remain intact while the separate review state is stale.

`GATE-FRAMEWORK-CHANGE`, `INT-FRAMEWORK-CHANGE` and `INT-FRAMEWORK-RETEST` test ownership, conservative mapping, failure/recovery, reversion, age, implementation drift and clean post-observation evidence with all targeted scenarios. `E2E-FRAMEWORK-CHANGE-LIFECYCLE` simulates a page digest change, observes a stale hold, proves an old PHP-statistics fixture assertion fails, updates an original JSON/JSONC fixture, and exercises both documented forms through the installed public MCP. Passing that fixture alone leaves the hold intact; missing targeted evidence fails admission; explicit reviewed retest restores the synthetic control.

The simulation's page/evidence metadata are clearly synthetic. They never enter the live ledger or certify that BGA changed. The initial ledger has no reviewed live baseline, so new candidates/guidance remain held until explicit per-page observation, official review and fresh exact-source retest are retained. This is process verification, not fresh framework compatibility certification, a background monitoring service, or publication approval. No signed candidate was rebuilt or registry package published.

The complete local `corepack pnpm check` passes: 661 tests and 202 required scenarios, package, applicable official conformance, safety and acceptance checks. The acceptance map proves 188 of 191 cases across 57 items; three prior external/later-scope gaps remain explicit. Exact-source CI is pending. BGA-408 remains implemented until that CI gate passes.
