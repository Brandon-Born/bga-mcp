#!/usr/bin/env node

import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { CliUsageError, HELP_TEXT, parseCliArguments } from './config.js';
import { SERVER_VERSION } from './metadata.js';
import { createServer } from './server.js';

export function runCli(arguments_: readonly string[]): number {
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

  const handle = serveStdio(() => createServer(action.config), {
    onerror(error) {
      process.stderr.write(`bga-mcp protocol error: ${error.message}\n`);
    },
  });

  const shutdown = (): void => {
    void handle.close().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`bga-mcp shutdown error: ${message}\n`);
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return 0;
}

process.exitCode = runCli(process.argv.slice(2));
