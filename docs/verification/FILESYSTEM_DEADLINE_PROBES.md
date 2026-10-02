# BGA-326 controlled filesystem deadline probes

```verification-record
{"kind":"review","scope":"BGA-326 controlled installed lstat/FileHandle.read expiry and cleanup-await mutation controls; complete filesystem matrix, real-time latency and final release approval are not established"}
```

The Windows/Node 24 failure in [publication baseline CI](rc5-publication-baseline-ci.json)
had an empty descriptor-read transcript when its 100 ms deadline expired.
The test required a pending read but did not ensure setup reached it before the
real deadline. Its unchanged replay passed; the original failure is retained.
The precise cause of that CI delay is unconfirmed.

The pre-imported test shim now holds the first operation's monotonic deadline
and captures its actual timer callback. Setup deliberately takes 200 ms, longer
than the nominal 100 ms deadline. Only after the selected primitive returns a
pending promise does a microtask invoke the captured callback and advance the
clock. The shim issues native I/O before that expiry microtask and holds its
observed completion by 150 ms, inside the unchanged 250 ms cleanup ceiling.
Both completion handlers attach immediately, including native rejection.
This models an issued filesystem promise completing slowly; it does not claim
the operating system remains busy throughout the injected delay. No production
timer, callback, option or package file changes.

The transcript must show registration, setup, primitive start, expiry,
primitive completion and timeout publication in that order. The timeout frame
is observed in the child before it writes to stdout, so IPC scheduling cannot
hide a native completion occurring after publication. The parent also snapshots
the transcript at settlement, requires no further work after 350 ms, and calls
`check_setup` successfully through the same still-running installed development
entry point. This does not add `check_setup` to public release discovery.

Each primitive also runs against a temporary installed module with only the
cleanup `await` removed. The child then publishes its timeout before primitive
completion, and the same oracle detects that reversed order. The original
installed module is restored in `finally` and checked byte for byte. No project
source or retained package is mutated.

[The original rc.5 preparation receipt](bga326-filesystem-probes-rc5-preparation.json)
records the earlier wrapper-model preparation against the digest-matched original
signed tarball. Its harness tree is explicitly dirty and its identity remains
unchanged. [The clean final-harness repeat](bga326-filesystem-probes-rc5-clean.json)
at `cc6413c07ec8c1474c49397791b25521021522f2` records `sourceClean: true`, both
primitive cases and both cleanup-removal controls with native I/O issued before
expiry. Neither targeted run repeats cryptographic verification or the complete
security assessment.

These probes establish issued-operation cleanup behavior, not real wall-clock
latency or cancellation of every native primitive. The separate uninstrumented
deadline, responsiveness and shutdown cases still use real time against a
stub response that never completes. They do not assume that a chosen number
of files must take longer than 30 or 40 ms: the shutdown assumption also failed
locally when its scan completed successfully. No live documentation request
is made by these cases. BGA-326 remains
implemented pending its complete matrix and residual-platform evidence.

## Sources

[Node.js filesystem documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesreadfilepath-options)
states: “Aborting an ongoing request does not abort individual operating system
requests”. That wording concerns `readFile` buffering; it is not a promise that
`FileHandle.read` or `lstat` accepts cancellation. These probes therefore observe
and await issued promises within the existing cleanup ceiling rather than
claiming operating-system cancellation.

[Exact-source CI 37012838535](bga326-filesystem-probes-ci.json) passes all six
Ubuntu/macOS/Windows Node 22/24 jobs at `cc6413c`, each with 674 tests and 209
required scenarios. Every downloaded sealed record validates trusted schema,
integrity, exact clean source, CI environment and applicable conformance. Each
platform's package digest matches its prior baseline; the Linux digest still
matches original rc.5. The eight unchanged, still-fresh, previously read official
framework decisions are explicitly re-admitted against that evidence and the
actual framework release guard passes. BGA reader semantics and compatibility
fixtures are unchanged. This does not approve the candidate or fill BGA-326's
remaining complete native matrix.
