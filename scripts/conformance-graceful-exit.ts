// The pinned conformance CLI calls process.exit() while its HTTP handles are
// closing. Let Node drain those handles naturally so Windows Node 24 does not
// abort inside libuv after the verifier has produced its result.
process.exit = ((code) => {
  process.exitCode = code ?? 0;
}) as typeof process.exit;
