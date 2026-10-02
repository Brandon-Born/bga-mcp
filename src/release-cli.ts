#!/usr/bin/env node

// Load the implementation inside the final executable boundary: dependency
// initialization can reject before runCli has installed its lifecycle handlers.
try {
  const { runCli } = await import('./cli-runner.js');
  const exitCode = await runCli(process.argv.slice(2), 'first-local-only');
  // A protocol callback can fail while startup is awaiting the transport.
  if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = exitCode;
} catch {
  process.stderr.write(
    'bga-mcp startup error [internal.unexpected]: The server failed unexpectedly. No further detail is safe to report.\n',
  );
  process.exitCode = 1;
  process.stdin.pause();
}
