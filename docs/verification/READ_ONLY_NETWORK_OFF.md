# Read-only and network-off verification

Recorded: 2026-08-06. Covers BGA-110, BGA-111, BGA-113, and BGA-114, and completes Phase 1.

Every local capability claims two things a developer has to take on trust unless it is measured: it does not change the project, and it does not talk to the network. This record is the measurement.

## Denying the network

`tests/e2e/network-denied.ts` is loaded before the packaged server starts and replaces every way out of the machine — `net`, `tls`, `http`, `https`, `dns`, `dns/promises`, `dgram`, `fetch`, and `net.Socket.prototype.connect` — with functions that throw and append the attempt to a log file.

Under that denial, `E2E-READ-ONLY-NETWORK-DENIED` runs **every advertised tool and all three resources**. All of them complete successfully, and the attempt log stays empty.

An empty log only means something if the harness can produce a non-empty one. `E2E-READ-ONLY-NETWORK-HARNESS` makes an outbound connection under the same denial and asserts it fails and is logged. Without that second scenario, the first proves nothing.

## Measuring immutability

The project directory is snapshotted before and after, two ways:

- a **content digest** over every file, and
- **per-file size and modification time**, so a rewrite with identical content is still caught.

Both are unchanged after the full sweep of tools and resources.

## The policy holds whatever the client sends

`E2E-READ-ONLY-INPUT-CANNOT-ESCAPE` calls `validate_project` with a root outside the configured one, a traversal out of it, and the filesystem root. All three are refused; a legitimate call in the same connection succeeds. A file planted outside the root is byte-identical afterwards.

## What else Phase 1 finished

- **BGA-110** — a versioned catalog of 31 automated checks and 8 manual-only ones, each automated entry tied to the rule that implements it, its fixtures, and its source kind. The gate fails when a rule and its catalogue entry drift apart in either direction.
- **BGA-111** — `run_pre_release_audit`, which reports passed, failed, unsupported, and manual-required separately and never converts a check it could not run into a pass.
- **BGA-113** — one shared module for the certain / heuristic / unsupported distinction, replacing four copies of the same builders. The refactor left every existing test passing unchanged, which is the evidence that behavior did not move.

## Deliberate limits

- **The denial is in-process.** It replaces Node's network APIs rather than using an OS-level sandbox, so it cannot catch a native addon opening a socket directly. The dependency set is small and pinned, and the ESLint boundary keeps network modules out of `src` entirely, but an OS-level denial would be stronger evidence.
- **Immutability is measured on the project root.** The server writes nothing anywhere else either, but that is asserted only for the directory under test.
