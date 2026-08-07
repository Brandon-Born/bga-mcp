// The conformance CLI calls process.exit() while its HTTP handles are closing,
// which made Windows Node 24 abort inside libuv after the verifier had already
// produced its result. Replacing exit lets those handles drain naturally.
//
// Draining cannot be waited on forever, though: the 0.2.0 line leaves handles
// open after a full requirements run, so an exit that only sets `exitCode` never
// arrives and the runner blocks. The unref'd timer below is the deadline. It
// keeps nothing alive on its own — if the loop has already drained, the process
// exits normally and this never fires — but if something is still holding the
// loop open a second later, the recorded code is used to leave anyway.
const FLUSH_GRACE_MS = 1_000;

process.exit = ((code) => {
  const resolved = code ?? process.exitCode ?? 0;
  process.exitCode = resolved;
  setTimeout(() => {
    // `reallyExit` is the un-patched primitive underneath `process.exit`, so
    // the deadline cannot be swallowed by the very replacement above.
    (process as unknown as { reallyExit: (code: number) => void }).reallyExit(
      typeof resolved === 'number' ? resolved : 0,
    );
  }, FLUSH_GRACE_MS).unref();
}) as typeof process.exit;
