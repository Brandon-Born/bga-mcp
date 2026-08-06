# CI failure proof

- **Backlog item:** BGA-005
- **Verified:** 2026-08-06 (America/Chicago)
- **Clean commit:** [`f2a90a729875de49e0d946fe53aae8695570b09e`](https://github.com/Brandon-Born/bga-mcp/commit/f2a90a729875de49e0d946fe53aae8695570b09e)
- **Proof branch:** [`verification/bga-005-failing-gates`](https://github.com/Brandon-Born/bga-mcp/tree/verification/bga-005-failing-gates)

## Clean matrix

[`CI` run 31098519365](https://github.com/Brandon-Born/bga-mcp/actions/runs/31098519365) completed successfully from a clean checkout at the clean commit. All six Ubuntu, macOS, and Windows jobs on Node 22 and 24 passed the frozen-lockfile install and complete `pnpm check` chain.

## Controlled failures

The proof branch is deliberately unmerged. Each successive commit removes the preceding fault, introduces exactly one new fault, and runs the same ordered `pnpm check` command used by normal CI in the isolated, least-privilege [`CI failure proof`](../../.github/workflows/ci-failure-proof.yml) workflow. Local execution established that every earlier command passed before the named command failed; the linked hosted run then completed with `failure` at that commit.

| Required command       | Isolated rejection                                                                  | Proof commit                                                                                                                          | Hosted run                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `format:check`         | Prettier rejected an intentionally unformatted TypeScript fixture.                  | [`afc898fb2d02a061e7269b8c33bef0ee029b7a64`](https://github.com/Brandon-Born/bga-mcp/commit/afc898fb2d02a061e7269b8c33bef0ee029b7a64) | [`31098715271`](https://github.com/Brandon-Born/bga-mcp/actions/runs/31098715271) |
| `lint`                 | ESLint rejected an intentionally unused variable after formatting passed.           | [`ecf0f064c03c0405c029942ee9039f3a5340f0f7`](https://github.com/Brandon-Born/bga-mcp/commit/ecf0f064c03c0405c029942ee9039f3a5340f0f7) | [`31098804798`](https://github.com/Brandon-Born/bga-mcp/actions/runs/31098804798) |
| `typecheck`            | TypeScript rejected an intentional `string`-to-`number` assignment.                 | [`cdc877b27b80774601f1d9a0c8df30fb67553f6b`](https://github.com/Brandon-Born/bga-mcp/commit/cdc877b27b80774601f1d9a0c8df30fb67553f6b) | [`31098894819`](https://github.com/Brandon-Born/bga-mcp/actions/runs/31098894819) |
| `verify:quality-gates` | The self-test rejected a formatting seed altered so Prettier would accept it.       | [`753d071bc980e8e814bd4a1e4cf397915abd7650`](https://github.com/Brandon-Born/bga-mcp/commit/753d071bc980e8e814bd4a1e4cf397915abd7650) | [`31098994561`](https://github.com/Brandon-Born/bga-mcp/actions/runs/31098994561) |
| `test:coverage`        | Vitest rejected one intentional failing assertion after all preceding gates passed. | [`55dd2e67dd385052e68bd51c72ac070fa5bb22e0`](https://github.com/Brandon-Born/bga-mcp/commit/55dd2e67dd385052e68bd51c72ac070fa5bb22e0) | [`31099094458`](https://github.com/Brandon-Born/bga-mcp/actions/runs/31099094458) |
| `check:package`        | `publint` rejected an export whose declared type file did not exist.                | [`8af9c15f874b06bdd255e3916647c566ed945576`](https://github.com/Brandon-Born/bga-mcp/commit/8af9c15f874b06bdd255e3916647c566ed945576) | [`31099299418`](https://github.com/Brandon-Born/bga-mcp/actions/runs/31099299418) |
| `test:conformance`     | The official MCP conformance runner rejected a candidate URL with no MCP endpoint.  | [`da10a3855d1ab7471d3dbe05e87de3a96306b825`](https://github.com/Brandon-Born/bga-mcp/commit/da10a3855d1ab7471d3dbe05e87de3a96306b825) | [`31099415730`](https://github.com/Brandon-Born/bga-mcp/actions/runs/31099415730) |

These seven commands are the complete chain enforced by `pnpm check`. Together with the successful clean matrix, they prove that every required gate can block completion and that the valid repository passes on every supported CI environment.
