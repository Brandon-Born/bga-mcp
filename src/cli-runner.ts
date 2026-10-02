import { StdioServerTransport, serveStdio } from '@modelcontextprotocol/server/stdio';

import { CliUsageError, helpTextForProfile, parseCliArguments } from './config.js';
import { BgaMcpError, ERROR_CODES } from './errors.js';
import { formatErrorLog } from './logging.js';
import { SERVER_VERSION } from './metadata.js';
import { STUDIO_SESSION_ENV, studioSessionRedactionValues, type PolicyBoundary } from './policy.js';
import { boundOutgoingPayloads } from './publish.js';
import { redactText, type RedactionOptions } from './redaction.js';
import type { ServerProfile } from './release.js';
import { createServerWithPolicy } from './server.js';
import { checkStudioSetup, formatStudioCheck } from './studio/check.js';

/** Runs one executable profile. The release entry point fixes this to its frozen inventory. */
export async function runCli(
  arguments_: readonly string[],
  profile: ServerProfile = 'development',
): Promise<number> {
  let policy: PolicyBoundary | undefined;
  // No file access here. Policy registers every file/environment session before
  // returning it, and this getter retains rotations for the process lifetime.
  const redaction = (): RedactionOptions => {
    const registered = policy?.redactionOptions;
    return {
      ...registered,
      // Terminal errors disclose no root-relative filenames either.
      projectRoots: [],
      secretValues: [
        ...(registered?.secretValues ?? []),
        ...studioSessionRedactionValues(process.env[STUDIO_SESSION_ENV]),
      ],
    };
  };
  const report = (scope: string, error: unknown): boolean => {
    let diagnostic: string;
    let safe = true;
    try {
      diagnostic = formatErrorLog(scope, error, redaction());
    } catch {
      safe = false;
      // A malformed diagnostic/details getter must not defeat the error boundary.
      diagnostic =
        'bga-mcp failure [internal.unexpected]: The server failed unexpectedly. No further detail is safe to report.\n';
    }
    process.stderr.write(diagnostic);
    return safe;
  };
  let close: (() => Promise<void>) | undefined;
  let closeTransport: (() => Promise<void>) | undefined;
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
      try {
        await close?.();
      } catch (error) {
        report('shutdown error', error);
        process.exitCode = 1;
      } finally {
        // A failed server close must not leave stdin keeping the process alive.
        try {
          await closeTransport?.();
        } catch (error) {
          report('shutdown error', error);
          process.exitCode = 1;
        }
        process.stdin.pause();
      }
    })();
    return stopping;
  };
  const shutdown = (): void => {
    void stop();
  };
  let configuring = true;
  let scope = 'configuration error';
  try {
    const action = parseCliArguments(arguments_, process.cwd(), profile);
    if (action.kind === 'help') {
      process.stdout.write(helpTextForProfile(profile));
      return 0;
    }
    if (action.kind === 'version') {
      process.stdout.write(`${SERVER_VERSION}\n`);
      return 0;
    }
    const prepared = await createServerWithPolicy(action.config, profile, (ready) => {
      policy = ready;
    });
    configuring = false;
    if (action.kind === 'studio-check') {
      scope = 'Studio check error';
      const checked = await prepared.policy.runWithTimeout(
        'studio-check',
        async (signal) => await checkStudioSetup(prepared.policy, action.gameId, undefined, signal),
      );
      process.stdout.write(`${redactText(formatStudioCheck(checked), redaction())}\n`);
      return checked.ok ? 0 : 1;
    }
    scope = 'startup error';
    const transport = boundOutgoingPayloads(new StdioServerTransport(), prepared.policy);
    closeTransport = async () => await transport.close();
    // serveStdio starts asynchronously and reports (rather than rethrows) some
    // failures. Await its real start operation so a rejected start is terminal.
    const start = transport.start.bind(transport);
    let started: Promise<void> | undefined;
    transport.start = () => (started = start());
    const reportProtocolError = (error: Error): void => {
      report('protocol error', error);
      process.exitCode = 1;
    };
    if (profile === 'development') {
      const handle = serveStdio(prepared.create, { transport, onerror: reportProtocolError });
      close = async () => await handle.close();
      await started;
    } else {
      // The frozen release connects only its conformance-proven legacy revision.
      const server = prepared.create({ era: 'legacy' });
      server.server.onerror = reportProtocolError;
      close = async () => await server.close();
      await server.connect(transport);
    }
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return process.exitCode === 1 ? 1 : 0;
  } catch (error) {
    const usage = error instanceof CliUsageError;
    const safeDiagnostic = report(
      scope,
      usage ? new BgaMcpError(ERROR_CODES.configInvalid, error.message) : error,
    );
    if (usage) process.stderr.write('Run bga-mcp --help for usage.\n');
    const exitCode =
      safeDiagnostic && (usage || (configuring && error instanceof BgaMcpError)) ? 2 : 1;
    process.exitCode = exitCode;
    await stop();
    return exitCode;
  }
}
