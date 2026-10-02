# BGA-326 installed project-filesystem operation matrix

```verification-record
{"kind":"review","scope":"BGA-326 installed project-filesystem operation positions, bounded cleanup and residual completion; client-root adoption, package-config reads, Studio file-provider paths and complete native-matrix verification remain separate"}
```

The test-only `fs-matrix-stub.ts` observes the real installed policy's promise
APIs. It issues native work before controlled expiry, attaches fulfillment and
rejection handlers immediately, and delays observation of its completion.
Setup takes 200 ms before the nominal 100 ms deadline is released. As with the
[earlier probes](FILESYSTEM_DEADLINE_PROBES.md), this models an issued promise
completing slowly; it does not claim the operating system stays busy for the
injected delay or can cancel an already-issued syscall.

The unchanged `inspect_project` schema drives the original legacy fixture. The
matrix covers these 17 positions through an installed real MCP client:

| Policy stage                  | Operation                            | Selected occurrences                     |
| ----------------------------- | ------------------------------------ | ---------------------------------------- |
| Root resolution               | `realpath`                           | First                                    |
| In-root file resolution       | `realpath`                           | First                                    |
| Directory traversal           | `lstat`                              | Before open, after open, first entry     |
| Directory traversal           | `opendir`, post-open `realpath`      | First each                               |
| Directory traversal           | Native async iterator `next` promise | First                                    |
| Descriptor-bound project read | `lstat`                              | Before open and post-open identity check |
| Descriptor-bound project read | `open`, post-open `realpath`         | First each                               |
| Descriptor-bound project read | Descriptor `stat`                    | Before read and after read               |
| Descriptor-bound project read | Descriptor `read`                    | First read and EOF probe                 |
| Descriptor-bound project read | Descriptor `close`                   | First                                    |

Each position runs with nominal 150 ms and 600 ms completion holds. A nominal
hold does not bound native or instrumentation latency on a loaded runner.
When the operation and required cleanup finish before timeout publication,
the transcript must remain unchanged afterward. Otherwise the actual existing
250 ms cleanup timer must be observed firing before publication; no synthetic
timer schedule replaces it. The 600 ms case also requires publication before
the selected completion. Only completion of already-issued work and
close/iterator-return cleanup may follow expiry; another application-level
filesystem start fails.
Two additional cases hold file/directory cleanup for 400 ms after a 150 ms
opening promise, proving that the ceiling also bounds delayed cleanup. Removing
the observed ceiling event from an otherwise sequence-consistent transcript
must make the residual-completion oracle fail. Removing the production cleanup
wait still fails because timeout publication precedes the real timer.

The child records publication before transport delivery. This protects order
assertions from IPC scheduling. Acquisition/release counters must return to
zero; post-cleanup observations must stay unchanged while the same client
successfully calls `check_setup`. The helper also compares project digests,
checks stderr and awaits process exit. This does not prove the responsiveness
or shutdown of a syscall that never returns.

Three installed-module mutation controls remove the cleanup wait, cooperative
policy checkpoints, or descriptor close. The same ordering, no-new-work and
resource-release oracles reject their respective faults. Each installed module
is restored and checked byte for byte; original tarballs and project files are
unchanged. An installed production-file scan refuses the probe's environment
markers or module name, so the instrumentation supplies no production switch.

The new 38 cases pass against both the current shared package and the original
digest-pinned rc.5 tarball. The original run is preparation evidence from an
uncommitted harness, without fresh cryptographic signature verification or full
security approval. The separately retained receipt binds its actual harness,
source base, result and tarball identity in the [preparation receipt](bga326-matrix-rc5-preparation.json). Earlier assessments retain their
original harness and scope; they do not establish this expanded matrix.

This is project-filesystem evidence. Client-root adoption, lazy package-config
reads and Studio session-file preflight still need their own operation-position
and cleanup probes. Windows explicitly refuses the Studio file provider; that
refusal cannot stand in for a POSIX file-provider cancellation test. BGA-326
remains implemented, with its full-matrix scenarios reserved. BGA-433 is the
next priority under the updated execution policy; no broad framework guard is
bypassed or claimed current by this test-only change. The concurrently approved
workflow policy changes packed `AGENTS.md` bytes; this integrated tree therefore
does not claim byte-identical current guides or a byte-identical new checkout
package to rc.5. The original tarball remains unchanged. Collect the guide
change into the next substantive candidate preparation before publication,
without transferring old candidate-documentation approval to this tree.

The integrated run passes all 712 tests and 209 required scenarios, packaging,
applicable conformance and safety checks. Its final evidence check initially
refused six active summary headers still counting 674 tests. Those current-run
headers are updated to the observed 712 total; dated observations, source CI
records and original candidate evidence are not rewritten. The integrated full
gate must pass before the handoff is called done.

## Bounded completion observation, 2026-10-02 UTC

BGA-423 CI on `e20e866` passed five jobs; Windows Node 22 failed the
600 ms `walk:opendir` case because a directory remained acquired at the fixed
700 ms observation. The log proves that failed observation, not an eventual
leak or eventual release. The new parent-side observer polls for selected
completion, balanced work/cleanup events and zero resources for at most five
seconds, then retains the same quiet transcript and same-client checks. Reaching
that observation limit cannot pass the ordering/resource oracle. The production
250 ms cleanup ceiling is unchanged, and late completion still requires its
actual event before timeout publication.

Two additional installed cases hold cleanup for 1,100 ms on the file and directory
paths, deliberately outlasting the old fixed observation. The earlier 400 ms
cases and removed-wait/checkpoint/close controls remain. Historical rc.5 and CI
receipts above retain their original harness and counts; this changed observer
passes all 59 focused cancellation/authority tests and the fresh integrated
`pnpm check` at 751 tests / 223 required scenarios; exact-source CI remains
required before its handoff is verified. The [BGA-423 receipt](bga423-source-ci.json) records the
failed attempt and subsequent proof separately.

## Sources

[Node.js FileHandle.close](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandleclose)
says it closes the handle “after waiting for any pending operation”.
[Directory iteration](https://nodejs.org/docs/latest-v24.x/api/fs.html#class-fsdir)
documents that the directory is “automatically closed” after iterator exit.
The native iterator promise is observed as such, rather than mislabelled a
direct `Dir.read` syscall. Both pages were fetched and their relevant wording
read on 2026-10-02 UTC. No BGA reader, syntax rule or public schema changes.
