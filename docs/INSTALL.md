# Installing, configuring, and removing bga-mcp

This versioned walkthrough uses signed `v1.0.0-rc.3` as a verified evaluation example; it does not identify the latest candidate or authorize a release. There is no registry package yet. The rc.3 packet is retained in GitHub Actions with finite retention. Public evidence pages distribute metadata separately from the original candidate packet. Package publication belongs to BGA-415.

All acquisition identities below belong to the rc.3 example. For another candidate, use its independently verified receipt, matching trusted verifier, exact signer/source and original tarball path; do not substitute a tag into these commands. Rebuilding any checkout creates a new artifact and does not reproduce or inherit an existing signature. CI executes the marked installation recipes against the newly packed checkout, separately from authenticating the original example.

## Before you start

Use Node 22.13 or later on the Node 22 line, or Node 24 or later, with Corepack and pnpm 11.15.1 available. The walkthrough uses a dedicated installation directory outside your game project. Create that empty directory and save this `package.json` there:

<!-- guide:manifest -->

```json
{
  "name": "bga-mcp-consumer",
  "private": true,
  "packageManager": "pnpm@11.15.1"
}
```

Use a local BGA project that you own or have permission to inspect. The frozen candidate supports legacy flat, modern `modules/php`, and partially migrated layouts through its verified local inspection and validator scenarios. Unsupported syntax is reported as uncertainty; this is not a guarantee that every game is valid. Protocol `2025-11-25` over stdio is the supported contract. Named editor/agent clients require the separate BGA-401 smoke matrix.

## Obtain and verify the candidate

Follow the [signing verification instructions](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/verification/RELEASE_SIGNING.md) from an independently trusted verifier checkout. They identify the exact original candidate, signing identity, trusted-root acquisition, and provenance checks. Maintainers with GitHub Actions artifact access can retrieve the retained signed packet:

Use the [rc.3 signing receipt](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/verification/release-signing-v1.0.0-rc.3.json), not the historical rc.1 example at the top of those instructions. The trusted verifier checkout must select rc.3 (the reviewed `35f90c924f29951a3f137af0edd82e38e25b2e09` handoff does). Its expected signing commit is `e092d1d9cccccae2f38e4eff7129ad8f690fb3bf`, distinct from candidate source `c7ad5c2962e608a82b532dd0d1882040d1ba31ea`. Acquire trust roots independently, then verify with:

```sh
gh attestation trusted-root > /absolute/path/to/independent-trusted-root.jsonl
node --experimental-strip-types scripts/release-signing.ts verify /absolute/path/to/signed-packet e092d1d9cccccae2f38e4eff7129ad8f690fb3bf /absolute/path/to/independent-trusted-root.jsonl
```

Run verification after downloading the packet. These are trusted-checkout maintainer commands, not files shipped inside the npm package. Use Node 24 for the verifier; the installed MCP runtime also supports Node 22. The verifier requires the exact issuer, repository, workflow, main ref, signer commit, provenance and original subjects described in the instructions.

```sh
gh run download 36954957803 --repo Brandon-Born/bga-mcp --name signed-candidate-36954957803 --dir /absolute/path/to/signed-packet
```

That artifact expires on 2026-12-31T02:17:44Z. If it is unavailable, stop and ask the maintainer for the same authenticated original bytes; do not replace it with a source build or an arbitrary registry package. Checksum comparison alone is not signature verification. The expected original tarball digest is `sha256:598cad2186c60e8110d8906ffb91739893c357ebed69cad0529c8a5a367907a3`.

Verification requires independent GitHub trust roots and may contact GitHub. Artifact download requires GitHub access; installation may download dependencies from the package registry and uses the package manager's cache. These setup operations are separate from the installed MCP server, which reads only authorized local roots, makes no network requests, and stores no persistent project state. No Studio session or other BGA credential is needed.

## Install and check the command

Replace `/absolute/path/to/bga-mcp-install` with your dedicated installation directory and `/absolute/path/to/verified/bga-mcp-1.0.0-rc.3.tgz` with the verified original tarball. Keep the quotes when a path contains spaces. These commands work in a POSIX shell or Windows PowerShell with Corepack on PATH.

<!-- guide:install -->

```sh
corepack pnpm add --prefer-offline --dir "/absolute/path/to/bga-mcp-install" "/absolute/path/to/verified/bga-mcp-1.0.0-rc.3.tgz"
```

<!-- guide:version -->

```sh
corepack pnpm --dir "/absolute/path/to/bga-mcp-install" exec bga-mcp --version
```

Expect `1.0.0-rc.3`. This launches the package-manager-created public command. Do not configure an internal `dist/*.js` file: the contributor development entry point has a different capability set.

## Configure your MCP client

Add the following stdio server entry in your client's configuration, substituting absolute paths. The surrounding configuration format belongs to your client. Use the public executable directly, so starting the server does not invoke a package manager or download anything.

For macOS/Linux:

<!-- guide:posix-client -->

```json
{
  "command": "/absolute/path/to/bga-mcp-install/node_modules/.bin/bga-mcp",
  "args": ["--project-root", "/absolute/path/to/your/game"]
}
```

For Windows, use the package-manager-created `.cmd` shim through the command interpreter:

<!-- guide:windows-client -->

```json
{
  "command": "cmd.exe",
  "args": [
    "/d",
    "/s",
    "/c",
    "C:\\absolute\\path\\to\\bga-mcp-install\\node_modules\\.bin\\bga-mcp.cmd",
    "--project-root",
    "C:\\absolute\\path\\to\\your\\game"
  ]
}
```

If your client advertises authorized project roots on protocol `2025-11-25`, you can omit `--project-root` and its value. Explicit configuration is the reproducible first-run path. Multiple configured roots require the tool's `projectRoot` argument; the server never chooses between them.

Restart the client and ask it to call `inspect_project`. A successful first use identifies your layout and available components. Inspect findings and unsupported-pattern notes before making development decisions. The release exposes the tools and resources in the inventory below and the packed [frozen selection](../config/release.json); discovery must match that selection. `check_setup`, documentation search, Studio reads, mutations, and the newer protocol adapter are excluded.

The release accepts `--project-root`, `--operation-timeout-ms`, `--max-output-bytes`, `--help`, and `--version`. The timeout bounds each operation; the output limit bounds successful and failed payloads. Network and Studio flags are refused. Contributor-only integrations have separate backlog and verification requirements.

## Update

Stop the client/server, obtain and independently verify the replacement candidate, and repeat the install command with that candidate's exact tarball path. Never overwrite the old candidate or treat a rebuilt archive as the same release. Keep its packet if you need to reinstall it. The marked command exercises repeat installation of the same candidate:

<!-- guide:update -->

```sh
corepack pnpm add --prefer-offline --dir "/absolute/path/to/bga-mcp-install" "/absolute/path/to/verified/bga-mcp-1.0.0-rc.3.tgz"
```

Restart the client and repeat `inspect_project`. This walkthrough tests repeat installation, not a cross-version upgrade. New candidate installation may download dependencies; MCP calls remain local.

## Remove

Remove the server entry from the client's configuration and stop/restart that client to end its server process. Then remove the package:

<!-- guide:remove -->

```sh
corepack pnpm remove --dir "/absolute/path/to/bga-mcp-install" bga-mcp
```

The public command is now absent. Delete the dedicated installation directory if you no longer need its package manifest or lockfile, and delete downloaded candidate packets/trust-root files if you no longer want them. The package manager may retain its shared cache; removing that cache is optional and affects other packages. The MCP server creates no config, cache, session file, or project file to remove. Your client's own logs/history follow that client's retention policy.

## Troubleshooting

- **Command not found or unsupported Node:** check Node/Corepack availability and the absolute installed command path. Do not use a package downloader as an automatic fallback.
- **`policy.root.unconfigured`:** configure an explicit `--project-root` or authorize a root in a client that advertises roots.
- **`resource.project.ambiguous`:** supply `projectRoot` to select one authorized root.
- **Root/path refused:** check that the configured directory exists, is readable, and matches the intended authorized project; do not broaden roots to your home directory.
- **Unsupported syntax:** retain the uncertainty in your review. A clean audit does not establish correctness for syntax the reader cannot interpret.
- **Excluded tool or flag:** use the frozen local inventory; source-only `check_setup` or Studio options cannot diagnose this release.
- **Signature/provenance mismatch or expired artifact access:** stop before installation and retain the failure for maintainer investigation.

## Exact inventory and boundaries

<!-- inventory:start -->

Generated in a repository checkout by `corepack pnpm docs:inventory` from the capability manifest, release selection, topic table and policy defaults; installed MCP discovery checks both profiles.

Network access is off by default. The public command excludes network surfaces and refuses network/Studio flags. In the development profile, `--allow-network` enables documentation search, topic reads and framework-version reads; Studio reads additionally require `--experimental-studio-logs`, an authorized account and session. The experimental Studio reader cannot read the browser-rendered log panel. No profile provides synchronization, uploads or other mutations.

Resource templates are URI patterns returned by `resources/templates/list`; concrete resources are individually listed URIs returned by `resources/list`. Counts below include each separately, including the fixed documentation-topic expansions.

**Public command (bga-mcp)**

Tools: 7; resource templates: 0; concrete resources: 3; prompts: 0. Discovery entries by manifest stability: verified 10, implemented 0, experimental 0. Network-backed entries: 0 (permission off by default).

| Kind      | Discovery name / URI        | Manifest stability | Trust boundary      | Network permission |
| --------- | --------------------------- | ------------------ | ------------------- | ------------------ |
| resources | `bga://project/diagnostics` | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/states`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/summary`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `audit_database_usage`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `inspect_project`           | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `run_pre_release_audit`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_action_contracts` | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_notifications`    | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_project`          | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_state_machine`    | verified           | TB-LOCAL-FILESYSTEM | local              |

**Development entry point (dist/cli.js)**

Tools: 10; resource templates: 1; concrete resources: 11; prompts: 0. Discovery entries by manifest stability: verified 10, implemented 11, experimental 1. Network-backed entries: 11 (permission off by default).

| Kind      | Discovery name / URI        | Manifest stability | Trust boundary      | Network permission |
| --------- | --------------------------- | ------------------ | ------------------- | ------------------ |
| resources | `bga://docs/client`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/cookbook`       | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/file-reference` | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/game-logic`     | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/migration`      | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/states`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://docs/studio`         | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://framework/version`   | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| resources | `bga://project/diagnostics` | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/states`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| resources | `bga://project/summary`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| templates | `bga://docs/{topic}`        | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| tools     | `audit_database_usage`      | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `check_setup`               | implemented        | TB-LOCAL-FILESYSTEM | local              |
| tools     | `inspect_project`           | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `read_studio_logs`          | experimental       | TB-STUDIO-READ      | explicit opt-in    |
| tools     | `run_pre_release_audit`     | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `search_bga_docs`           | implemented        | TB-DOCS-NETWORK     | explicit opt-in    |
| tools     | `validate_action_contracts` | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_notifications`    | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_project`          | verified           | TB-LOCAL-FILESYSTEM | local              |
| tools     | `validate_state_machine`    | verified           | TB-LOCAL-FILESYSTEM | local              |

Manifest stability describes the recorded scenario coverage, not general game correctness. Implemented and experimental entries are excluded from the public release. The development protocol adapter remains implemented; it is not a verified public transport.
<!-- inventory:end -->

## Verification and sources

`E2E-INSTALL-GUIDE` executes the marked commands and the platform's configuration above against a freshly packed public package, including first use, root refusal, repeat install, project hashing, process shutdown, and package removal. A separate retained run follows the same guide against the signed original candidate. It does not establish named-client compatibility or real-game usefulness; BGA-401 and BGA-424 own those claims. See the [installation verification record](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/verification/INSTALLATION.md).

- [pnpm add](https://pnpm.io/cli/add) documents local tarball installation.
- [pnpm exec](https://pnpm.io/cli/exec) states that `node_modules/.bin` is added to PATH.
- [pnpm remove](https://pnpm.io/cli/remove) states that removal affects `node_modules` and the project's `package.json`.
- [Candidate signing and provenance](https://github.com/Brandon-Born/bga-mcp/blob/35f90c924f29951a3f137af0edd82e38e25b2e09/docs/verification/RELEASE_SIGNING.md) records the independently authenticated artifact and finite retention.
