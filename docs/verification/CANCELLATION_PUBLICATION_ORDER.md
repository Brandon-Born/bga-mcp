# Filesystem-deadline oracle causal order — BGA-461

```verification-record
{ "kind": "run", "capabilities": 17, "scenarios": 280, "claims": 108, "tests": 1071 }
```

This current correction record is checked against its actual full-gate evidence. The complete local gate passed 1,071/1,071 tests, 280/280 required scenarios and 108 claims, plus package/safety checks and applicable conformance. Independent source review and exact-head CI remain pending at this checkpoint; the failed main run and earlier source proofs remain separate.

[Final merged-main CI41113878027](https://github.com/Brandon-Born/bga-mcp/actions/runs/41113878027) failed Windows/Node24: 1,060/1,061 tests passed, with one cancellation-oracle failure in `readProjectFile:close`, occurrence1, injected completion600. Five other matrix jobs passed. The exact main source is `b6744b21eb387e2a9fdb69d59f4faa5d127d961f`. The completed-job log records publication index91 and selected completion92; the equal-snapshot branch demanded the reverse order. The full child transcript was not retained, and the failed job uploaded no sealed verification artifact. Those missing facts remain missing. The run is not retried unchanged.

The parent reads its first transcript after receiving the MCP result. Native cleanup can complete between publication and that file read, so equality of the first and final parent snapshots cannot establish completion-before-publication. The test-only correction uses the existing synchronous child event sequence to choose the early/late branch. An early branch requires complete balanced cleanup at publication. A late branch retains the actual ceiling-before-publication requirement, existing minimum interval, 600ms ordering guarantee, no-new-work, final resource balance, quiescence and same-client recovery assertions. The original installed mutations must still fail when awaiting, checkpoints or close operations are removed.

The assertion helper is extracted only to test code so deterministic synthetic transcripts can exercise both parent-read timings and refusal cases. These unit controls are not live filesystem or packaged-boundary evidence. The unchanged installed matrix and mutation suite remain that evidence. No production file, observer, native operation, clock, timer, deadline, retry, public declaration/schema, dependency or release selector changes.

Both approved normal merges are preserved: PR50 `5e459d726dd790014eb8c58fbb13d5e008bec7ef`, then PR51 `b6744b21eb387e2a9fdb69d59f4faa5d127d961f`. Their premerge checks passed; this final-main failure remains a separate genuine result. Any correction PR needs its own passing checks and explicit merge approval. This task signs, prepares or publishes no release and changes no game code.

The retained local source is actual dirty `b6744b21eb387e2a9fdb69d59f4faa5d127d961f`, with test tarball `sha256:d45405e1823becfb57c073591fd68262e1c7e0933843f114ef6e25f972e9dce8`, identical to the unchanged production package. The first selected-operation-only repair correctly failed four existing late-handle-cleanup controls. The final oracle uses complete causal quiescence at publication, allowing outstanding handle cleanup only after the actual ceiling; all 53 installed cancellation tests and ten synthetic controls pass. No failing run has been relabeled or retried unchanged.
