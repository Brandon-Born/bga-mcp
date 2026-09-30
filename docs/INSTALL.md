# Installing, configuring, and removing bga-mcp

Use the signed `v1.0.0-rc.1` candidate for evaluation. There is no registry package yet. The [public release page](https://github.com/Brandon-Born/bga-mcp/releases/tag/v1.0.0-rc.1) distributes verification metadata, not an installable tarball. Package publication belongs to BGA-415.

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

Follow the [signing verification instructions](verification/RELEASE_SIGNING.md) from an independently trusted verifier checkout. They identify the exact original candidate, signing identity, trusted-root acquisition, and provenance checks. Maintainers with GitHub Actions artifact access can retrieve the retained signed packet:

```sh
gh run download 36740988457 --repo Brandon-Born/bga-mcp --name signed-candidate-36740988457 --dir /absolute/path/to/signed-packet
```

That artifact expires on 2026-12-29. If it is unavailable, stop and ask the maintainer for the same authenticated original bytes; do not replace it with a source build or an arbitrary registry package. Checksum comparison alone is not signature verification. The expected original tarball digest is `sha256:a3472a97916bbd793fe32ffb847ced3d9638fe2c45cc112867b0af0a15f3acfa`.

Verification requires independent GitHub trust roots and may contact GitHub. Artifact download requires GitHub access; installation may download dependencies from the package registry and uses the package manager's cache. These setup operations are separate from the installed MCP server, which reads only authorized local roots, makes no network requests, and stores no persistent project state. No Studio session or other BGA credential is needed.

## Install and check the command

Replace `/absolute/path/to/bga-mcp-install` with your dedicated installation directory and `/absolute/path/to/verified/bga-mcp-1.0.0-rc.1.tgz` with the verified original tarball. Keep the quotes when a path contains spaces. These commands work in a POSIX shell or Windows PowerShell with Corepack on PATH.

<!-- guide:install -->

```sh
corepack pnpm add --prefer-offline --dir "/absolute/path/to/bga-mcp-install" "/absolute/path/to/verified/bga-mcp-1.0.0-rc.1.tgz"
```

<!-- guide:version -->

```sh
corepack pnpm --dir "/absolute/path/to/bga-mcp-install" exec bga-mcp --version
```

Expect `1.0.0-rc.1`. This launches the package-manager-created public command. Do not configure an internal `dist/*.js` file: the contributor development entry point has a different capability set.

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
    "\"C:\\absolute\\path\\to\\bga-mcp-install\\node_modules\\.bin\\bga-mcp.cmd\"",
    "--project-root",
    "\"C:\\absolute\\path\\to\\your\\game\""
  ]
}
```

If your client advertises authorized project roots on protocol `2025-11-25`, you can omit `--project-root` and its value. Explicit configuration is the reproducible first-run path. Multiple configured roots require the tool's `projectRoot` argument; the server never chooses between them.

Restart the client and ask it to call `inspect_project`. A successful first use identifies your layout and available components. Inspect findings and unsupported-pattern notes before making development decisions. The release exposes seven tools and three project resources from the [frozen inventory](../config/release.json); discovery must match that inventory. `check_setup`, documentation search, Studio reads, mutations, and the newer protocol adapter are excluded.

The release accepts `--project-root`, `--operation-timeout-ms`, `--max-output-bytes`, `--help`, and `--version`. The timeout bounds each operation; the output limit bounds successful and failed payloads. Network and Studio flags are refused. Contributor-only integrations have separate backlog and verification requirements.

## Update

Stop the client/server, obtain and independently verify the replacement candidate, and repeat the install command with that candidate's exact tarball path. Never overwrite the old candidate or treat a rebuilt archive as the same release. Keep its packet if you need to reinstall it. With the current single candidate, this command verifies the repeat-install path:

<!-- guide:update -->

```sh
corepack pnpm add --prefer-offline --dir "/absolute/path/to/bga-mcp-install" "/absolute/path/to/verified/bga-mcp-1.0.0-rc.1.tgz"
```

Restart the client and repeat `inspect_project`. A cross-version upgrade cannot be claimed until a second reviewed candidate exists. New candidate installation may download dependencies; MCP calls remain local.

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

## Verification and sources

`E2E-INSTALL-GUIDE` executes the marked commands and the platform's configuration above against a freshly packed public package, including first use, root refusal, repeat install, project hashing, process shutdown, and package removal. A separate retained run follows the same guide against the signed original candidate. It does not establish named-client compatibility or real-game usefulness; BGA-401 and BGA-424 own those claims. See the [installation verification record](verification/INSTALLATION.md).

- [pnpm add](https://pnpm.io/cli/add) documents local tarball installation.
- [pnpm exec](https://pnpm.io/cli/exec) states that `node_modules/.bin` is added to PATH.
- [pnpm remove](https://pnpm.io/cli/remove) states that removal affects `node_modules` and the project's `package.json`.
- [Candidate signing and provenance](verification/RELEASE_SIGNING.md) records the independently authenticated artifact and finite retention.
