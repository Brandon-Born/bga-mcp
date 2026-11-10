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

## Optional schema follow-up — BGA-464

A separate November 10 reproduction used the built public stdio command and
original `modern-state-classes` copies with the custom SQL call removed. Before
correction, omitting `dbmodel.sql` produced `project.component.missing`. After
correction, both variants report the optional component without that warning;
the present file is inventoried. Directory digests before and after both
inspection calls match. No game runtime or live database was tested.

`E2E-INSPECT-OPTIONAL-DBMODEL` independently fails all three old expectations
and passes modern, legacy and hybrid packaged cases after correction. Absent
schema remains unavailable to the SQL audit. The full local gate passes 1,074
checks at dirty base `dd9c0c6`; the detailed local archive identity is in BGA-464.

[CI 42909612076](https://github.com/Brandon-Born/bga-mcp/actions/runs/42909612076),
attempt 1, passes every Linux/macOS/Windows Node 22/24 job. Every downloaded
verification record validates against the trusted schema and seal, clean
`7ca8dbecb6dab429e18e51f77570be0a03461aab`, current lockfile, passing applicable
conformance, 1,074 tests, 281 scenarios and 108 claims. Both the inspection tool
and summary resource contain all three passing assertions for the new scenario.
The table retains SHA-256 identities for the tested archive and the downloaded
verification JSON. This evidence-only follow-up does not claim a run on its own
commit. The eight framework holds remain active.

| Job                    | Node     | Test archive SHA-256                                               | Verification JSON SHA-256                                          |
| ---------------------- | -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| macos-latest-node-22   | v22.23.4 | `87d3ad50b9247049b9e6b756c46b6773eb449b74244e567345a29c0f4dcbc851` | `57d234bdb5a4abc7d8ec17e8a335b67ea4d27ae10364fa75d60fb5f75560f377` |
| macos-latest-node-24   | v24.22.2 | `87d3ad50b9247049b9e6b756c46b6773eb449b74244e567345a29c0f4dcbc851` | `5139db4bf8638cec30aa9f294ea9e3e42f25fe52c03e98f4bd0f7648af42766c` |
| ubuntu-latest-node-22  | v22.23.4 | `c83b484eaaef9156a3b54489fcaddf6ccd0521eb0b25bf0f10b0a83442523282` | `e4eca569973632355286c361a595cc070637b0b219e6755a461894d580d96f13` |
| ubuntu-latest-node-24  | v24.22.2 | `c83b484eaaef9156a3b54489fcaddf6ccd0521eb0b25bf0f10b0a83442523282` | `49c78dc9a5b55326af87b7cf97968a3756a7c43f98575b3746189ec046970bdb` |
| windows-latest-node-22 | v22.23.4 | `f31a9fe491448e3973648b622579bad906fba8c24cb08c790c6b464db9ba4c09` | `2fe3ad5b4877a1e57f44b6190ad95174a8c4214de7f5ea6dcdd5b4dec60ea8e7` |
| windows-latest-node-24 | v24.22.2 | `f31a9fe491448e3973648b622579bad906fba8c24cb08c790c6b464db9ba4c09` | `8690d238aacc5246d776cbe11d025038534763b81daa4e0e79056f0deda993f4` |
