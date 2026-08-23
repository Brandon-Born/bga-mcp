# Modern action and transition source decision

Reviewed 2026-08-23 for BGA-419.

```verification-record
{
  "kind": "review",
  "scope": "BGA-419 official modern action-name and transition-form conflict"
}
```

## Decision

The [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) and [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) are the current authority for validator rules. They agree that an autowired player action starts with `act`; the state page says methods “must be prefixed by `act`” and describes a returned transition name. [Tutorial Reversi](https://en.doc.boardgamearena.com/Tutorial_reversi) follows that model with `actPlayDisc`.

The [Complete Walkthrough](https://en.doc.boardgamearena.com/Create_a_game_in_BGA_Studio:_Complete_Walkthrough) conflicts with those pages. Its state-class examples declare `#[PossibleAction] action_resolve()` and `action_pass()`, invoke those names with `bga.actions.performAction`, and imperatively call `nextState('pass')` instead of returning the transition.

The walkthrough is official material, so its differing form cannot safely justify either a supported-form claim or a defect rule. Upstream clarification is required. Until BGA documents whether that form is supported or erroneous, `bga-mcp` reports the located `action_*` method and imperative transition call as unsupported syntax. It suppresses action-name, missing-entry-point, reachability, and dead-end conclusions that depend on silently rejecting those constructs. Independently readable names and state fields remain available.

## Regression boundary

`E2E-VALIDATE-MODERN-DOCUMENTATION-CONFLICT` installs the packed artifact, launches the package-manager-created `bga-mcp` command, and sends the captured minimal form through a real MCP client. The state validator, action validator, aggregate, and pre-release audit all remain inconclusive; none converts the unresolved source conflict into a clean pass or dependent project defect.

If BGA confirms the walkthrough form is supported, the parser must normalize its action name, parameters, scope, and transition edge before any rule consumes it. If BGA confirms the example is erroneous, a future rule may reject it only after recording that clarification and adding packaged positive and negative scenarios.
