import { resolve } from 'node:path';

import { DEFAULT_POLICY_CONFIG, type PolicyConfig } from './policy.js';

/** Server configuration is exactly the policy configuration: nothing bypasses it. */
export type ServerConfig = PolicyConfig;

export const DEFAULT_SERVER_CONFIG: ServerConfig = DEFAULT_POLICY_CONFIG;

export type CliAction =
  | { readonly kind: 'serve'; readonly config: ServerConfig }
  | { readonly kind: 'studio-check'; readonly config: ServerConfig; readonly gameId: string | null }
  | { readonly kind: 'help' }
  | { readonly kind: 'version' };

export class CliUsageError extends Error {
  override readonly name = 'CliUsageError';
}

export const HELP_TEXT = `Usage: bga-mcp [options]

Run the bga-mcp server over stdio. Defaults are local, read-only, and network-off.

Options:
  --project-root <path>          Allow a local BGA project root (repeatable)
  --allow-remote-project <id>    Allowlist a BGA Studio project for mutations (repeatable)
  --operation-timeout-ms <n>     Deadline for a single operation (default ${String(DEFAULT_POLICY_CONFIG.operationTimeoutMs)})
  --max-output-bytes <n>         Maximum bytes returned by one result (default ${String(DEFAULT_POLICY_CONFIG.maxOutputBytes)})
  --allow-network                Permit network access for capabilities that need it
  --experimental-studio-logs     Enable the experimental Studio log reader (see docs)
  --studio-dev-account <name>    A Studio dev account you own (repeatable). Only log
                                 lines about these accounts are ever returned
  --studio-session-file <path>   Read the Studio session from a file instead of the
                                 BGA_STUDIO_SESSION environment variable
  --studio-check [gameId]        Check the Studio setup and exit, reporting exactly
                                 what is missing and what to do about it
  --allow-mutations              Permit explicitly confirmed mutating operations
  --help                         Show this help text
  --version                      Show the package version
`;

function requireValue(option: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('-')) {
    throw new CliUsageError(`${option} requires a value`);
  }
  return value;
}

function requirePositiveInteger(option: string, value: string): number {
  if (!/^[0-9]+$/u.test(value)) {
    throw new CliUsageError(`${option} requires a positive integer`);
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed <= 0) {
    throw new CliUsageError(`${option} requires a positive integer`);
  }
  return parsed;
}

export function parseCliArguments(
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
): CliAction {
  const projectRoots: string[] = [];
  const remoteProjects: string[] = [];
  let operationTimeoutMs = DEFAULT_POLICY_CONFIG.operationTimeoutMs;
  let maxOutputBytes = DEFAULT_POLICY_CONFIG.maxOutputBytes;
  let networkEnabled = false;
  let mutationsEnabled = false;
  let experimentalStudioLogs = false;
  let studioSessionFile: string | undefined;
  let studioCheck = false;
  let studioCheckGameId: string | null = null;
  const studioDevAccounts: string[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--help') {
      return { kind: 'help' };
    }

    if (argument === '--version') {
      return { kind: 'version' };
    }

    if (argument === '--allow-network') {
      networkEnabled = true;
      continue;
    }

    if (argument === '--allow-mutations') {
      mutationsEnabled = true;
      continue;
    }

    if (argument === '--experimental-studio-logs') {
      experimentalStudioLogs = true;
      continue;
    }

    if (argument === '--studio-session-file') {
      studioSessionFile = resolve(
        workingDirectory,
        requireValue('--studio-session-file', arguments_[index + 1]),
      );
      index += 1;
      continue;
    }

    if (argument === '--studio-check') {
      studioCheck = true;
      // The game id is optional: without one the check still reports on
      // configuration, which is where most setups go wrong.
      const next = arguments_[index + 1];
      if (next !== undefined && !next.startsWith('-')) {
        studioCheckGameId = next;
        index += 1;
      }
      continue;
    }

    if (argument === '--studio-dev-account') {
      studioDevAccounts.push(requireValue('--studio-dev-account', arguments_[index + 1]));
      index += 1;
      continue;
    }

    if (argument === '--project-root') {
      projectRoots.push(
        resolve(workingDirectory, requireValue('--project-root', arguments_[index + 1])),
      );
      index += 1;
      continue;
    }

    if (argument === '--allow-remote-project') {
      remoteProjects.push(requireValue('--allow-remote-project', arguments_[index + 1]));
      index += 1;
      continue;
    }

    if (argument === '--operation-timeout-ms') {
      operationTimeoutMs = requirePositiveInteger(
        '--operation-timeout-ms',
        requireValue('--operation-timeout-ms', arguments_[index + 1]),
      );
      index += 1;
      continue;
    }

    if (argument === '--max-output-bytes') {
      maxOutputBytes = requirePositiveInteger(
        '--max-output-bytes',
        requireValue('--max-output-bytes', arguments_[index + 1]),
      );
      index += 1;
      continue;
    }

    throw new CliUsageError(`Unknown option: ${argument ?? ''}`);
  }

  const config = {
    projectRoots: [...new Set(projectRoots)],
    remoteProjects: [...new Set(remoteProjects)],
    operationTimeoutMs,
    maxOutputBytes,
    networkEnabled,
    mutationsEnabled,
    experimentalStudioLogs,
    studioDevAccounts: [...new Set(studioDevAccounts)],
    ...(studioSessionFile === undefined ? {} : { studioSessionFile }),
  };

  return studioCheck
    ? { kind: 'studio-check', config, gameId: studioCheckGameId }
    : { kind: 'serve', config };
}
