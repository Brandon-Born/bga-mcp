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
clock. The primitive is delayed by 150 ms, inside the unchanged 250 ms cleanup
ceiling. No production timer, callback, option or package file changes.

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
records both passing cases and their cleanup-removal controls against the
digest-matched original signed tarball. Its harness tree is explicitly dirty;
clean committed repeat and six-platform CI remain required. This targeted run
does not repeat cryptographic verification or the complete security assessment.

These probes establish issued-operation cleanup behavior, not real wall-clock
latency or cancellation of every native primitive. The separate uninstrumented
deadline and responsiveness case still uses real time. BGA-326 remains
implemented pending its complete matrix and residual-platform evidence.

## Sources

[Node.js filesystem documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesreadfilepath-options)
states: “Aborting an ongoing request does not abort individual operating system
requests”. That wording concerns `readFile` buffering; it is not a promise that
`FileHandle.read` or `lstat` accepts cancellation. These probes therefore observe
and await issued promises within the existing cleanup ceiling rather than
claiming operating-system cancellation.
