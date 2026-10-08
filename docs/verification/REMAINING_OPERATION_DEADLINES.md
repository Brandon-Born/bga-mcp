# Remaining operation deadlines and file-provider witnesses

```verification-record
{"kind":"review","scope":"BGA-326 remaining operation inventory and BGA-328 local file-provider acceptance; real distinct-owner POSIX witness requires hosted CI, and live Studio payload support remains separate"}
```

This change closes the previously omitted implementation paths rather than
calling the earlier project-filesystem slice complete. A private operation
context supplies each call's own signal to packaged-configuration reads without
changing exported method signatures or generated declarations. A cancelled lazy
catalog read cannot populate the cache. Concurrent and nested calls retain
separate signals. Synchronous callback failures receive the same timer cleanup. Caller-defined nested library timeout controllers remain independent; an outer abort does not implicitly abort an inner controller. No production MCP nested timeout path is claimed or exercised by these witnesses.

Configured-root resolution and initial session registration share a bounded
startup operation. Standalone package-configuration reads also have a bounded
startup budget. These startup stages use the existing default ten-second budget;
`--operation-timeout-ms` retains its request budget, including very small values.
This bounds individual startup stages, not the sum of all initialization stages.
No configuration flag, schema, transport, resource, public tool or effect
boundary is added. All filesystem and context effects remain in `src/policy.ts`.

## Operation inventory and installed controls

The existing project-filesystem, network-response/DNS and JSONC-parser witnesses
remain required. `operation-deadline-matrix.test.ts` adds the excluded positions:

- Client-root `realpath` in both protocol eras, including the modern retry round.
- Lazy packaged catalog `readFile`, aborted-cache refusal and explicit native
  `readFile` signal observation.
- Configured-root and packaged-configuration startup reads.
- POSIX session-file `open`, descriptor `stat`, `read` and `close`, at startup
  and during a request. Windows explicitly refuses this provider.

Each issued-promise case holds observed completion for 150 or 600 milliseconds,
queues expiry only after actual I/O has been issued, and observes the same client
and server before shutdown. The transcript requires no new application work
following expiry, balanced operations, terminal resource release and a quiet
observation window. A primitive that exceeds the existing 250-millisecond cleanup
ceiling must retain the actual ceiling event before timeout publication and
subsequently release its resource. Native operating-system requests are not
claimed interruptible. Setup is separate from measured issued work; request
probes deliberately exceed their nominal budget during controlled setup. Startup
probes expire their actual ten-second timer through the same controlled callback.

Installed cleanup-await, native-read signal/checkpoint and descriptor-close
removal controls must reverse their corresponding oracle. Mutations replace and
restore owned directory entries atomically, preserving hardlinked peers.
`studio-parser-deadline.test.ts` advances the monotonic clock only at installed
Studio parsing checkpoints and observes synchronous expiry with the client still
alive. Removing those installed checkpoints produces a useful synthetic result
and fails the original expiry expectation. Its source is scripted; it supplies
no evidence that the live rendered log panel is readable.

`UNIT-POLICY-OPERATION-CONTEXT` observes overlapping/nested signal isolation,
refusal of reads after expiry and bounded standalone reads. It is unit support
for context propagation, not a replacement for the installed matrix.

The original harness assumed the first deadline belonged to a request. New
startup budgets exposed that assumption; source-mapped static methods can also
appear as `Function.create`. The probe now explicitly distinguishes startup and
request registration, and can follow the modern interaction's retry instead of
expiring its already-settled first round. An initial run failed 41 cases under
that stale setup assumption; the observation is not an underlying cancellation
failure or an OS-cancellation claim. The original CLI-failure injection site also
needed its signal-aware session-registration marker updated. No failure was
suppressed. Network fixture modes are selected independently of query text so
BGA-324's reviewed query grammar cannot disable cancellation cases.

Integrated normalization made the post-expiry full `inspect_project` recovery
request perform additional source parsing under the unchanged 100 ms budget.
A concurrent diagnostic run observed its actual `policy.timeout.exceeded`
response; isolated root cases passed. Recovery now uses the same client's
`check_setup` to require the exact available-root finding and a second issued
native root `realpath`, while retaining the original inspection expiry, quiet
window and resource-cleanup assertions. The 2025 provider asks over the wire
again; the 2026 provider can retry the existing MRTR answer. Removing the installed
expired-root cache reset must fail this adoption witness. No request budget is
raised and no recovery retry hides a failure.

Later exact-source CI observed another legitimate independent-operation timeout:
after selected request-provider `close` expiry and cleanup passed, `check_setup`
re-read the configured session file and exceeded its real 100 ms deadline on a
loaded macOS/Node 22 runner. Transport responsiveness now requires successful
`tools/list` on the same live client, including the expected discovered tools
and an unchanged filesystem transcript. It does not assume every fresh native
filesystem read fits that deliberately small wall-clock budget. Only root cases
also perform the state-specific `check_setup` adoption witness described above.

A new POSIX control issues a subsequent native provider read, delays that
observed promise for 150 ms and requires its exact `check_setup`/100 ms timeout,
eventual balanced release and successful discovery before and after it. It
demonstrates the distinction deterministically without changing the production
budget, selected-expiry callback or 250 ms cleanup ceiling. Windows retains its
unsupported file-provider limit and exercises discovery through the package-read
probe. These witnesses establish transport availability and measured resource
release; they do not claim a universal 100 ms filesystem-service guarantee.

Exact-source Windows/Node 24 CI exposed an omitted Studio response mode in the
query-fixture migration: that case received a finite HTML body and relied on it
outlasting the deadline. The runner instead completed it and correctly reported
the unsupported rendered-log shell. The case now explicitly selects the
never-ending response and asserts that the far end entered that mode and sent
body bytes, in addition to the original deadline, socket-abort, quiet-window and
same-client responsiveness checks. The request budget remains 300 milliseconds.
Removing only that fixture mode fails the new observed-mode assertion, even when
the finite body happens to produce a timeout; restoring it passes the witness.

## Actual file ownership and provider acceptance

`E2E-STUDIO-SESSION-FILE-OWNER` first verifies a real owner-only file through the
installed development command and real MCP client, observing actual descriptor
UID, process UID, mode, reads and closes. Ordinary local runs establish only this
same-owner positive. Windows establishes the documented unsupported refusal.

Hosted POSIX CI additionally launches that installed command as its existing root
account, using `sudo -n env -i` to clear inherited credentials. The original
synthetic 0600 fixture remains owned by the ordinary runner account: no account
is created, no file is chowned and no Studio or user-machine access changes.
Root can open the file, making the different actual UID observable. The provider
must refuse before reading, close every opened descriptor, redact its path and
publish no fixture content. Removing the installed UID check must allow an actual
read and the session-present result, detecting the missing control. A root-owned
0600 file opened by the ordinary runner would only prove EACCES; it would not
exercise this owner-comparison branch. No UID or stat ownership is mocked.

Other installed cases retain environment precedence, Windows refusal, unsafe
permissions, link/FIFO/directory/empty/oversized/missing files and CLI disclosure
controls. New cases cover a real Unix socket/device, a file growing after its
measured descriptor stat, relative-path resolution and deletion after startup.
Growth must leave the actual read bounded by the earlier measured size; the
subsequent provider read refuses its now-oversized content. Deletion must not
reuse a previously resolved session. Owned fixtures are restored and removed;
original game projects are unchanged.

The new hosted ownership branch has not run on the local workstation and cannot
be called verified from its local positive route. Whole BGA-326/328 acceptance
still requires the integrated full gate, clean exact-source six-job CI, actual
hosted POSIX ownership assertion/control and current framework admission. These
are local safety/credential-provider witnesses. They do not establish successful
live Studio log payloads, SFTP credentials, game correctness or publication.

## Sources

- [Node readFile](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesreadfilepath-options)
  documents that `signal` “allows aborting an in-progress readFile”, while abort
  “does not abort individual operating system requests”.
- [Official Node asynchronous-context source](https://github.com/nodejs/node/blob/v22.17.1/doc/api/async_context.md)
  describes “stores that stay coherent through asynchronous operations”. Its
  `run` context is available to asynchronous work created inside the callback,
  and `getStore` outside that context returns undefined.
- [Node FileHandle.close](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandleclose)
  supplies the existing bounded resource-cleanup interpretation.
- [Official Node process source](https://github.com/nodejs/node/blob/v22.17.1/doc/api/process.md)
  defines process UID observation. File ownership is observed on actual opened
  descriptors; neither observation is replaced by a synthetic numeric UID.

These sources were fetched and read on 2026-10-07. No BGA construct is newly read,
parsed or inferred; its existing project and Studio reader semantics are retained.
