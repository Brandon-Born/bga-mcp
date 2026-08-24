# Installing, configuring, and removing bga-mcp

Written for a developer who has a BGA project and an MCP client, and would like the second to know something about the first.

Nothing here asks you to paste a secret into a chat, and nothing here is irreversible: the server only reads, and removing it is deleting a directory and a few lines of configuration.

## Before you start

- **Node.js 22.13 or newer** on the Node 22 line, or **Node.js 24 LTS or newer**. Check with `node --version`.
- **An MCP client.** The supported contract is protocol `2025-11-25` over stdio. A `2026-07-28` handshake/discovery smoke works, but that era remains unverified and is not a supported capability contract until BGA-017 and BGA-318 pass.
- **A BGA project on disk**, in a legacy flat, modern `modules/php`, or part-migrated layout. The frozen local release includes inspection and all five validators for those layouts.

There is no published package yet. A release consumer will launch the package-manager-created `bga-mcp` command; the internal `dist/*.js` files are not public package commands. To evaluate a source checkout before publication, build and run the separate development profile:

```sh
git clone https://github.com/Brandon-Born/bga-mcp.git
cd bga-mcp
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js --version
```

If the last command prints a version, the development checkout works. It is not evidence for the installed release profile.

## Point your client at it

After installing a release package, add its public command to your client's MCP configuration. The exact file differs by client; the command does not.

```json
{
  "command": "bga-mcp",
  "args": []
}
```

**If your client tells the server which folders you have open, that is the whole configuration.** The server asks for those folders and uses them as project roots. Clients that advertise roots on the `2025-11-25` protocol do this automatically.

If yours does not, name the project yourself:

```json
{
  "command": "bga-mcp",
  "args": ["--project-root", "/absolute/path/to/your/game"]
}
```

## Check it worked

Ask your assistant to run `inspect_project`. A healthy first run identifies the layout and components without a policy error. `check_setup` belongs to the source-only development profile and is deliberately absent from the frozen release.

If `inspect_project` reports `policy.root.unconfigured`, add an explicit `--project-root` as shown above.

## What the public release includes

The public command is local, read-only, and network-free. It accepts only `--project-root`, `--operation-timeout-ms`, `--max-output-bytes`, `--help`, and `--version`. Network, Studio, mutation, setup, and documentation-search options are rejected because those surfaces are outside the frozen release inventory.

With no feature flag, the command exposes project inspection, all five validators, the aggregate and pre-release tools, and the three project resources. `--operation-timeout-ms` bounds one operation. `--max-output-bytes` bounds one result payload, successful or not; its minimum is the smallest failure the server can send.

The source-only development profile also contains documentation and experimental Studio options. They are not installed-release capabilities and are documented for contributors below.

## Reading your own Studio logs (experimental)

**This one does not currently work, and the reason is now measured rather than suspected.** A live run on 2026-08-10 found that the Studio page serves a JavaScript application and none of the log text: the panel you see in a browser is rendered there. The tool retrieves the page, finds no log lines, and says so. Nothing below will produce a log until the capability gets a different mechanism (BGA-312). It reads an authenticated page that BGA has never documented. The MCP result filter keeps parsed lines attributed to accounts you declare and withholds other parsed lines; production error logs and Sentry are not requested. A line carrying a credential is withheld whole and a line that is kept is passed through the same value redaction as every other successful result (BGA-327), but the capability is not ready for general live use: BGA-322 and BGA-326 remain open against it.

You need your own Studio session cookie. Sign in to `studio.boardgamearena.com`, open developer tools, find any request to that host, and copy its entire `Cookie` request header.

> [!WARNING]
> The session is registered for redaction by whichever provider resolved it (BGA-321), and `--studio-session-file` must now be a small regular file that only its owner can read, with no diagnostic naming its path (BGA-328). On Windows the file provider is refused as unsupported; use `BGA_STUDIO_SESSION` there. Never paste a cookie into a prompt, launcher configuration, shell command, or repository. The environment provider has existing exact-value error-redaction evidence, but no supported general live recipe is published while BGA-312's blockers remain open.

The CLI preflight already accepts a project name, but do not use its page-fetching mode until BGA-319 removes foreign actor names and BGA-328 removes credential-file paths from diagnostics. The MCP tool takes the project name from Manage Games — the `game` parameter of your studiogame URL — rather than the numeric Play ID (BGA-320).

You do not have to name your dev accounts up front: if your client supports it, the server asks the first time it needs them, and remembers your answer for the session. Declining is fine and it will not ask again.

The session is never accepted as a tool argument, so it does not enter your client's transcript.

## Updating

```sh
cd bga-mcp
git pull
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

Restart your client afterwards; it launches the server per session and will keep using the old build until it does.

## Removing it

1. Delete the server entry from your client's MCP configuration.
2. `rm -rf /path/to/bga-mcp`
3. `rm -f ~/.bga-mcp-session` if you created one.

That is everything. The server writes nothing outside its own directory — no configuration file, no cache on disk, no state in your project. Your BGA project is byte-for-byte as it was, which is checked on every release by a test that snapshots the project before and after running every capability.

## When something does not work

**Everything refuses with `policy.root.unconfigured`.** No project root. Either your client does not advertise roots, or it advertises none. Pass `--project-root`.

**A tool refuses with `resource.project.ambiguous`.** More than one root is configured, so the server will not guess. Pass `projectRoot` explicitly.

**Documentation search refuses with `policy.network.disabled`.** Add `--allow-network`.

**Documentation search returns nothing useful.** Known and measured: retrieval currently answers 4 of the 9 questions in the maintained evaluation set. Topic lookups through `bga://docs/{topic}` are more reliable than search. Tracked in BGA-313.

**Studio logs return nothing.** The capability remains experimental and unverified; see BGA-312 for the complete current blocker set rather than treating an empty result as a setup-only problem. The likely eventual causes include an expired session, wrong project/account identifier, or upstream page drift.

**Anything else.** Run `check_setup` first and read what it says; it is more current than this document.
