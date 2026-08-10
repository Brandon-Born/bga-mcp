# Installing, configuring, and removing bga-mcp

Written for a developer who has a BGA project and an MCP client, and would like the second to know something about the first.

Nothing here asks you to paste a secret into a chat, and nothing here is irreversible: the server only reads, and removing it is deleting a directory and a few lines of configuration.

## Before you start

- **Node.js 22.13 or newer** on the Node 22 line, or **Node.js 24 LTS or newer**. Check with `node --version`.
- **An MCP client.** The supported contract is protocol `2025-11-25` over stdio. A `2026-07-28` handshake/discovery smoke works, but that era remains unverified and is not a supported capability contract until BGA-017 and BGA-318 pass.
- **A BGA project on disk**, in any layout. Detection can identify the legacy flat form, the modern `modules/php` form, and projects part-way between. Only the legacy-flat capability contract is currently supported; state-machine reading for the other two was corrected under BGA-124, and the rest of modern and hybrid validation remains unverified under BGA-125 through BGA-128.

There is no published package yet, so installation means building the repository. That changes when BGA-403 lands.

```sh
git clone https://github.com/Brandon-Born/bga-mcp.git
cd bga-mcp
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js --version
```

If the last command prints a version, the server works.

## Point your client at it

Add the server to your client's MCP configuration. The exact file differs by client; the contents do not.

```json
{
  "command": "node",
  "args": ["/absolute/path/to/bga-mcp/dist/cli.js"]
}
```

**If your client tells the server which folders you have open, that is the whole configuration.** The server asks for those folders and uses them as project roots. Clients that advertise roots on the `2025-11-25` protocol do this automatically.

If yours does not, name the project yourself:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/bga-mcp/dist/cli.js", "--project-root", "/absolute/path/to/your/game"]
}
```

## Check it worked

Ask your assistant to run the `check_setup` tool. It reports what is available, what is missing, and what to do about each thing — and it never refuses, so it works even when everything else would.

A healthy first run says the server is ready and lists your project roots. Anything it flags comes with the fix attached.

## What you get, and what it costs

Everything below is off unless you turn it on. The defaults are local, read-only, and network-free.

| Option                       | What it enables                                   | What it costs                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(none)_                     | Project inspection and all five validators        | Nothing. The server reads your project and never writes to it.                                                                                                                                                                                                |
| `--allow-network`            | `search_bga_docs` and the documentation resources | Outbound HTTPS to the BGA documentation wiki, one page per request you make. Your exact query leaves the machine. Obvious paths and recognized source markers are refused, but arbitrary text provenance cannot be inferred; never send project-derived text. |
| `--experimental-studio-logs` | `read_studio_logs`                                | Reads a Studio page BGA does not document or version, so it can break without warning. See [reading your own Studio logs](#reading-your-own-studio-logs-experimental).                                                                                        |
| `--allow-mutations`          | Nothing yet                                       | Reserved for Studio synchronization, which is not built.                                                                                                                                                                                                      |

Two more shape the results rather than enabling anything: `--operation-timeout-ms` and `--max-output-bytes`. The output budget bounds one result payload, successful or not; its minimum is the smallest failure the server can send, and the server refuses to start below it rather than accept a setting under which nothing could be answered.

## Reading your own Studio logs (experimental)

This one reads an authenticated page that BGA has never documented. The MCP result filter keeps parsed lines attributed to accounts you declare and withholds other parsed lines; production error logs and Sentry are not requested. A line carrying a credential is withheld whole and a line that is kept is passed through the same value redaction as every other successful result (BGA-327), but the capability is not ready for general live use: BGA-320, BGA-322, and BGA-326 remain open against it.

You need your own Studio session cookie. Sign in to `studio.boardgamearena.com`, open developer tools, find any request to that host, and copy its entire `Cookie` request header.

> [!WARNING]
> The session is registered for redaction by whichever provider resolved it (BGA-321), and `--studio-session-file` must now be a small regular file that only its owner can read, with no diagnostic naming its path (BGA-328). On Windows the file provider is refused as unsupported; use `BGA_STUDIO_SESSION` there. Never paste a cookie into a prompt, launcher configuration, shell command, or repository. The environment provider has existing exact-value error-redaction evidence, but no supported general live recipe is published while BGA-312's blockers remain open.

The CLI preflight already accepts a project name, but do not use its page-fetching mode until BGA-319 removes foreign actor names and BGA-328 removes credential-file paths from diagnostics. The MCP tool itself still rejects the real alphabetic project identifier (BGA-320).

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
