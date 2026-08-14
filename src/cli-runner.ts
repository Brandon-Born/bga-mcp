import { StdioServerTransport, serveStdio } from '@modelcontextprotocol/server/stdio';

import { CliUsageError, helpTextForProfile, parseCliArguments } from './config.js';
import { BgaMcpError } from './errors.js';
import { formatErrorLog, formatMessageLog } from './logging.js';
import { SERVER_VERSION } from './metadata.js';
import { boundOutgoingPayloads } from './publish.js';
import type { ServerProfile } from './release.js';
import { createServerWithPolicy } from './server.js';
import { checkStudioSetup, formatStudioCheck } from './studio/check.js';

/** Runs one executable profile. The release entry point fixes this to its frozen inventory. */
export async function runCli(
  arguments_: readonly string[],
  profile: ServerProfile = 'development',
): Promise<number> {
  let action;
  try {
    action = parseCliArguments(arguments_, process.cwd(), profile);
  } catch (error) {
    if (error instanceof CliUsageError) {
      process.stderr.write(`${error.message}\nRun bga-mcp --help for usage.\n`);
      return 2;
    }
    throw error;
  }

  if (action.kind === 'help') {
    process.stdout.write(helpTextForProfile(profile));
    return 0;
  }

  if (action.kind === 'version') {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return 0;
  }

  if (action.kind === 'studio-check') {
    // Runs and exits rather than serving: this is a setup question, and the
    // answer belongs in the operator's terminal, not in an agent's context.
    const checked = await createServerWithPolicy(action.config, profile);
    const report = await checked.policy.runWithTimeout(
      'studio-check',
      async (signal) => await checkStudioSetup(checked.policy, action.gameId, undefined, signal),
    );
    process.stdout.write(`${formatStudioCheck(report)}\n`);
    return report.ok ? 0 : 1;
  }

  let prepared;
  try {
    prepared = await createServerWithPolicy(action.config, profile);
  } catch (error) {
    if (error instanceof BgaMcpError) {
      process.stderr.write(formatErrorLog('configuration error', error));
      return 2;
    }
    throw error;
  }

  const redaction = prepared.policy.redactionOptions;
  // The server's own transport, so the output budget can be applied once
  // more on the way out — including to payloads the protocol library
  // produced before any handler of ours ran.
  const transport = boundOutgoingPayloads(new StdioServerTransport(), prepared.policy);
  const reportProtocolError = (error: Error): void => {
    process.stderr.write(formatMessageLog('protocol error', error.message, redaction));
  };
  let close: () => Promise<void>;
  if (profile === 'development') {
    const handle = serveStdio(prepared.create, {
      transport,
      onerror: reportProtocolError,
    });
    close = async () => await handle.close();
  } else {
    // `serveStdio` is deliberately a dual-era router and advertises the SDK's
    // modern revision before it asks the factory for an instance. The first
    // release claims only its conformance-proven 2025 revision, so it connects
    // one inventory-bound legacy instance directly and lets that instance's
    // supportedProtocolVersions reject every other opening on the wire.
    const server = prepared.create({ era: 'legacy' });
    server.server.onerror = reportProtocolError;
    await server.connect(transport);
    close = async () => await server.close();
  }

  const shutdown = (): void => {
    void close().catch((error: unknown) => {
      process.stderr.write(formatErrorLog('shutdown error', error, redaction));
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return 0;
}
