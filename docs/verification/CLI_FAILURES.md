# Executable failure boundary

```verification-record
{ "kind": "review", "scope": "BGA-421 direct executable diagnostics and lifecycle" }
```

BGA-421 closes the advertised development preflight's uncaught missing-root exception and the shared executable startup/shutdown paths. Both installed profiles receive the same terminal contract. The public release remains local only; the Studio preflight exists only in development.

Known setup/configuration failures keep their stable error code and redacted message and exit 2. Invalid arguments use `config.invalid`. Unexpected setup, import and startup failures collapse to `internal.unexpected` and exit 1. Operational Studio refusal returns a safe terminal report on stdout and exits 1. Exceptions use stderr; serving stdout remains reserved for JSON-RPC. Diagnostics never include the thrown stack, cause or details object. Terminal errors also remove private filenames within configured project roots.

The policy announces its live registry before resolving the session-file provider. Existing cookie fragment registration is shared with the early environment context; it introduces no new accepted credential syntax. Later provider resolutions remain visible to terminal formatting. The executable observer and early-fragment helper are explicitly internal; declaration stripping preserves the original public overloads, and the installed public-contract scenario proves the complete declaration digest remains unchanged. File refusal never falls back to environment credentials. Unsupported Windows file permissions remain an explicit refusal.

The development SDK router starts its transport asynchronously and reports some close failures through `onerror`. The runner awaits the actual start operation, collapses callback errors and preserves a nonzero exit even if startup returns successfully. Signal cleanup runs once, removes signal listeners, attempts server close and transport close independently and pauses stdin even when both throw. Recoverable protocol callbacks retain the SDK's connection behavior while marking the process unsuccessful. Dependency imports sit inside the final executable fallback; no global uncaught-exception handler resumes an undefined process.

| Scenario                      | Installed-process observation                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| E2E-CLI-FAILURE-CONFIGURATION | Unknown arguments and missing roots exit 2; help/version remain successful in both profiles. |
| E2E-CLI-FAILURE-STUDIO        | Network refusal and missing session file produce safe development preflight reports.         |
| E2E-CLI-FAILURE-SETUP         | Unexpected setup collapses; known errors redact environment and POSIX file sessions.         |
| E2E-CLI-FAILURE-IMPORT        | A dependency throws before runner initialization; both entrypoints collapse and exit 1.      |
| E2E-CLI-FAILURE-STARTUP       | Actual SDK transport startup throws; both profiles exit 1 with stdin still open.             |
| E2E-CLI-FAILURE-SHUTDOWN      | Actual transport cleanup throws after initialization; both profiles preserve exit 1.         |
| GATE-LOG-REDACTION            | Outside-boundary mutation is rejected; entry fallback still redacts a runner-level escape.   |
| GATE-THREAT-MODEL-AGREEMENT   | Direct CLI surfaces are modeled and the structural outside-boundary mutation is rejected.    |

The suite mutates installed dependency bytes atomically in an isolated installation, restores every original file, and leaves the production catch/formatter under test intact. Atomic replacement avoids changing pnpm store hardlinks. There is no production test environment switch or hook. The external preload is passed as a file URL on every OS; a Windows drive-letter path is not an ESM URL. Shutdown uses the registered Node signal event after a real initialize response; Windows OS kill semantics would otherwise bypass the handler. The missing-file provider is tested on every OS; file-session registration is proved on POSIX, where that provider is supported.

Original non-secret path/session/cause canaries are compared only in memory. Failed assertions report booleans, never the captured private transcript. CI retains ordinary sanitized test/evidence records; the source and artifact scanners remain required. A seeded operation outside the runner boundary fails both logger and threat-model structural gates, even though the executable fallback also prevents a raw escape.

The structural gate is conservative about runner-level executable statements and complements real process tests. It is not a proof of arbitrary dependency code or malicious code execution, and does not cover Node failures before the executable loads, OS termination, native crashes or a deliberately configured external diagnostic preload. No live Studio compatibility or publisher approval is established by these probes.

All 741 tests, 215 required scenarios and applicable 2025 conformance passed in the integrated attempt; its final evidence gate refused six stale current-run headers, which were then updated precisely from emitted results. The final integrated recheck passed, including all 741 tests, 215 required scenarios, applicable conformance, package, evidence and acceptance gates. Exact-source CI remains pending. The backlog remains implemented until the required gates have passed. The bounded [source-CI receipt](bga421-source-ci.json) retains actual failed attempts, the read-only Dino Racer rerun and pending steps.

The Node ESM reference recommends “use `url.pathToFileURL` when importing a path.” The first source CI passed Ubuntu/macOS and refused both Windows jobs at the external shutdown preload. The file-URL correction is test-only; a new six-platform run is required and the failed source remains in the bounded receipt.

The corrected preload passed all six executable scenarios on every OS/Node job in run `37031021535`. That run still failed an existing cancellation-matrix timing assumption on macOS/Node 24, so it is not retained as a globally passing gate. The [filesystem matrix](FILESYSTEM_OPERATION_MATRIX.md) now observes the real cleanup ceiling rather than assuming nominal 150 ms completion guarantees immediate quiescence; the integrated full gate now passes again at 741 tests / 215 required scenarios, with exact-source CI still required.

Sources: [Node 22 ESM URL resolution](https://github.com/nodejs/node/blob/v22.x/doc/api/esm.md#urls), [TypeScript internal declaration stripping](https://www.typescriptlang.org/tsconfig/stripInternal.html), [Node 22 process lifecycle](https://nodejs.org/docs/latest-v22.x/api/process.html#event-uncaughtexception), the installed pinned `@modelcontextprotocol/server` 2.0.0 stdio implementation, and [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference). No BGA framework interpretation changed.
