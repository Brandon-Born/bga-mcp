import { resolve } from 'node:path';

export interface ServerConfig {
  readonly projectRoots: readonly string[];
}

export type CliAction =
  | { readonly kind: 'serve'; readonly config: ServerConfig }
  | { readonly kind: 'help' }
  | { readonly kind: 'version' };

export class CliUsageError extends Error {
  override readonly name = 'CliUsageError';
}

export const HELP_TEXT = `Usage: bga-mcp [options]

Run the bga-mcp server over stdio.

Options:
  --project-root <path>  Allow a local BGA project root (repeatable)
  --help                 Show this help text
  --version              Show the package version
`;

export function parseCliArguments(
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
): CliAction {
  const projectRoots: string[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--help') {
      return { kind: 'help' };
    }

    if (argument === '--version') {
      return { kind: 'version' };
    }

    if (argument === '--project-root') {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new CliUsageError('--project-root requires a path');
      }

      projectRoots.push(resolve(workingDirectory, value));
      index += 1;
      continue;
    }

    throw new CliUsageError(`Unknown option: ${argument ?? ''}`);
  }

  return {
    kind: 'serve',
    config: { projectRoots: [...new Set(projectRoots)] },
  };
}
