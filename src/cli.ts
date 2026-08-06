#!/usr/bin/env node

import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { CliUsageError, HELP_TEXT, parseCliArguments } from './config.js';
import { BgaMcpError } from './errors.js';
import { formatErrorLog, formatMessageLog } from './logging.js';
import { SERVER_VERSION } from './metadata.js';
import { createServerWithPolicy } from './server.js';

export async function runCli(arguments_: readonly string[]): Promise<number> {
  let action;
  try {
    action = parseCliArguments(arguments_);
  } catch (error) {
    if (error instanceof CliUsageError) {
      process.stderr.write(`${error.message}\nRun bga-mcp --help for usage.\n`);
      return 2;
    }
    throw error;
  }

  if (action.kind === 'help') {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (action.kind === 'version') {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return 0;
  }

  let prepared;
  try {
    prepared = await createServerWithPolicy(action.config);
  } catch (error) {
    if (error instanceof BgaMcpError) {
      process.stderr.write(formatErrorLog('configuration error', error));
      return 2;
    }
    throw error;
  }

  const redaction = prepared.policy.redactionOptions;
  const handle = serveStdio(prepared.create, {
    onerror(error) {
      process.stderr.write(formatMessageLog('protocol error', error.message, redaction));
    },
  });

  const shutdown = (): void => {
    void handle.close().catch((error: unknown) => {
      process.stderr.write(formatErrorLog('shutdown error', error, redaction));
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return 0;
}

process.exitCode = await runCli(process.argv.slice(2));
