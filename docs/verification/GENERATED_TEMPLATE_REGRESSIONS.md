# Real generated-template MCP regressions

Reviewed 2026-10-01 for BGA-426 through BGA-428. The purpose of the real game
project is to expose and fix MCP defects; developing that game is secondary.

```verification-record
{
  "kind": "review",
  "scope": "BGA-426 through BGA-428 generated-template findings and bounded regression fixes"
}
```

## Baseline and rerun criteria

The preserved signed `v1.0.0-rc.1` candidate, source
`a2031afe9da6acbdcf1712007da8394bc0fdeef2`, SHA-256
`a3472a97916bbd793fe32ffb847ced3d9638fe2c45cc112867b0af0a15f3acfa`,
was installed offline and called through its public executable by the real
`@modelcontextprotocol/client` 2.0.0 stdio client. The owner-created generated
project exposed three false missing-component warnings, declaration/helper
pollution in actions and notifications, and a documented delegated state return
reported unsupported. The template separately started in authorized Studio;
its disposable training table was stopped. Private project source and raw
results remain outside this repository.

Freeze the regression criteria before the changed-artifact rerun:

- The same unchanged generated project has all three JSONC components present.
- No game contracts or unsupported calls originate in the two editor helpers.
- The documented direct same-state action return resolves, with complete state
  edges and no dependent reachability/dead-end finding.
- Actual unmatched runtime notifications and unreadable computed SQL remain
  visible. Their disappearance would not count as a successful fix.
- Every public call succeeds without changing the recorded project files; the
  server exits cleanly, with networking disabled and no credential access.

The changed package is a separately identified development build. It does not
replace, alter, or inherit verification from the original signed candidate.
This targeted regression rerun does not complete BGA-424's feature, diagnosis,
and review task set or demonstrate general productivity gains.

## Source decisions and implementation

BGA-426 recognizes JSONC independently for options, preferences, and statistics,
while retaining JSON and legacy PHP forms. Empty present configuration files do
not become missing components.

BGA-427 excludes the documented root `_ide_helper.php` and `.d.ts` declarations
from contract sources before consuming their source budgets. The inventory still
lists them; a `.d.ts` file cannot satisfy runtime client layout detection. Arbitrary
nested PHP helpers, backups, and Git ignore rules do not establish runtime scope.
The official IDE documentation resolves the PHP-helper open question from setup.
Documentation examples inside excluded helpers cannot create runtime contracts;
this is not a general JavaScript/PHP parser completeness claim.

BGA-428 follows direct `$this->act…(...)` returns to a unique method in the same
state class, whose return targets are read with the existing literal/constant
resolver. No parameters or game code are evaluated. Missing/duplicate delegates,
cycles, computed target returns, compound expressions, arbitrary helper calls,
chains over eight steps, and graphs exceeding 256 expansion steps remain unsupported. Methods in another class in the
same file cannot satisfy the delegation.

## Original regression evidence

`modern-generated-regression` extends the repository's original modern fixture,
without copying the private game's source or BGA-generated helper implementations.
Its helper declarations and examples are synthetic. Fixture safety checks verify
its exact declared findings, source inventory, no binary art/secrets, and immutability.

- `E2E-INSPECT-JSONC-COMPONENTS`: JSONC, JSON, PHP, independent mixed migrations,
  empty present configuration, and genuinely absent statistics through the public
  installed command and summary resource.
- `E2E-CONTRACT-EDITOR-HELPERS`: individual action/notification/database tools,
  aggregate, diagnostics and pre-release consumers; declaration-only client
  absence, real computed action uncertainty, and a real missing game method that
  an IDE declaration cannot satisfy.
- `E2E-STATE-DELEGATED-RETURNS`: state and project inspection, states resource,
  aggregate and pre-release consumers; direct delegation succeeds while missing
  and computed delegates remain inconclusive.

Unit cases cover entering-state delegation, computed targets, compound calls,
cycles, ambiguous declarations, absent bodies, depth limits and class isolation.
The real-project rerun and full-gate outcome are recorded below. Exact-source CI
completed for the implementation commit before these owners became verified.

## Sources

Fetched 2026-10-01, starting at the [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference).

- [Options/preferences](https://en.doc.boardgamearena.com/Options_and_preferences:_gameoptions.json,_gamepreferences.json) and [statistics](https://en.doc.boardgamearena.com/Game_statistics:_stats.json): “you can use jsonc instead of json, to allow comments in the Json.” Legacy forms are deprecated, not removed.
- [BGA migration guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide#IDE_Support): `_ide_helper.php` is IDE support, “allowing IDE to provide syntax error highlighting for the framework functions”; the next sentence also identifies `bga-framework.d.ts`.
- [BGA VSCode setup](https://en.doc.boardgamearena.com/Setting_up_BGA_Development_environment_using_VSCode): the helper supplies IDE framework knowledge and appears in the documented upload ignore list alongside `bga-framework.d.ts`.
- [TypeScript declarations](https://www.typescriptlang.org/docs/handbook/2/type-declarations.html): “`.d.ts` files are declaration files that contain only type information.”
- [State classes](https://en.doc.boardgamearena.com/State_classes:_State_directory): entering-state and zombie examples delegate their returns to an action; “The return value works the same way as onEnteringState.”

## Executed rerun, 2026-10-01

The changed development artifact is
`9cf4835978bf903ffacab2d750f37cba3a4b937fe0eb59c8e4893c0654d48b8d`.
It was reconstructed byte-for-byte against the package digest from the complete
local gate, installed offline, and invoked through its public command using the
same real stdio client. It remains distinct from the original signed candidate.

The canonical real-game source set is an explicit export of all 42 tracked files
at game revision `12ff03affa31545c1e115530c97027a3c5a37f09`. The generated file
bytes were unchanged; no rules or framework source was edited to make validation
pass. On that source set, all seven tools were called and every recorded before/
after file digest matched; the client/server session exited without stderr.

| Consumer           | Observed result                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Project inspection | Modern layout; all expected components present; zero findings.                                    |
| State machine      | Complete declarations and edges; zero findings.                                                   |
| Action contracts   | Two actual calls and two state-scoped entry points; zero findings.                                |
| Notifications      | One unmatched `pass` heuristic; zero helper findings/unsupported calls.                           |
| Database           | One unreadable computed setup query and unavailable-audit information; no clean database verdict. |
| Aggregate          | Zero errors, one warning, one information, one unsupported.                                       |
| Pre-release        | 25 passed, 2 failed, 6 unsupported, 8 manual-required; not release-ready.                         |

The mixed working folder was also inspected separately. Its ignored source backup
still supplies duplicate notifications/SQL and nested helper uncertainty. BGA-429
owns that source-scope decision. This distinction was observed, not inferred from
a clean fixture; the exported snapshot is explicitly a narrower source set.

The local `pnpm check` passed: 613 tests, 185 required retained scenarios,
17 capabilities, 99 claims, package/contract checks, safety gates, and applicable
2025-11-25 conformance. Exact-source [CI 36929053758](https://github.com/Brandon-Born/bga-mcp/actions/runs/36929053758)
passed all six Ubuntu/macOS/Windows jobs on Node 22/24 at implementation commit
`d5112626b77415d6f5feb7b851c8c3a8adf5903b`. Its retained clean-source evidence
records 613 passing tests and 185 passing required scenarios per environment.
Raw real-game results remain private. The tests prove the three bounded fixes,
not arbitrary source-scope correctness, the complete game, or BGA-424 usefulness.
