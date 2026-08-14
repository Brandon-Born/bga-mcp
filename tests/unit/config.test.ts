import { resolve } from 'node:path';

import {
  CliUsageError,
  DEFAULT_SERVER_CONFIG,
  helpTextForProfile,
  parseCliArguments,
} from '../../src/config.js';

describe('parseCliArguments', () => {
  it('defaults to a local, network-free, read-only server with no allowed roots', () => {
    expect(parseCliArguments([])).toEqual({
      kind: 'serve',
      config: {
        projectRoots: [],
        remoteProjects: [],
        operationTimeoutMs: DEFAULT_SERVER_CONFIG.operationTimeoutMs,
        maxOutputBytes: DEFAULT_SERVER_CONFIG.maxOutputBytes,
        networkEnabled: false,
        mutationsEnabled: false,
        experimentalStudioLogs: false,
        studioDevAccounts: [],
      },
    });
  });

  it('returns help and version actions', () => {
    expect(parseCliArguments(['--help'])).toEqual({ kind: 'help' });
    expect(parseCliArguments(['--version'])).toEqual({ kind: 'version' });
  });

  it('keeps the release profile local-only and refuses every excluded relaxation', () => {
    expect(helpTextForProfile('first-local-only')).toContain('local-only bga-mcp release');
    expect(helpTextForProfile('first-local-only')).not.toContain('--allow-network');
    expect(parseCliArguments([], process.cwd(), 'first-local-only')).toEqual(parseCliArguments([]));

    for (const option of [
      '--allow-network',
      '--allow-mutations',
      '--allow-remote-project',
      '--experimental-studio-logs',
      '--studio-check',
      '--studio-dev-account',
      '--studio-session-file',
    ]) {
      expect(() => parseCliArguments([option], process.cwd(), 'first-local-only')).toThrow(
        new CliUsageError(`${option} is unavailable in the local-only release`),
      );
    }
  });

  it('resolves and deduplicates explicit project roots', () => {
    expect(
      parseCliArguments(['--project-root', 'game', '--project-root', './game'], '/workspace'),
    ).toEqual({
      kind: 'serve',
      config: {
        projectRoots: [resolve('/workspace', 'game')],
        remoteProjects: [],
        operationTimeoutMs: DEFAULT_SERVER_CONFIG.operationTimeoutMs,
        maxOutputBytes: DEFAULT_SERVER_CONFIG.maxOutputBytes,
        networkEnabled: false,
        mutationsEnabled: false,
        experimentalStudioLogs: false,
        studioDevAccounts: [],
      },
    });
  });

  it('collects every explicit policy relaxation', () => {
    expect(
      parseCliArguments([
        '--allow-remote-project',
        'bgamcptest',
        '--allow-remote-project',
        'bgamcptest',
        '--operation-timeout-ms',
        '2500',
        '--max-output-bytes',
        '4096',
        '--allow-network',
        '--allow-mutations',
        '--experimental-studio-logs',
        '--studio-dev-account',
        'mytest0',
        '--studio-dev-account',
        'mytest0',
      ]),
    ).toEqual({
      kind: 'serve',
      config: {
        projectRoots: [],
        remoteProjects: ['bgamcptest'],
        operationTimeoutMs: 2500,
        maxOutputBytes: 4096,
        networkEnabled: true,
        mutationsEnabled: true,
        experimentalStudioLogs: true,
        studioDevAccounts: ['mytest0'],
      },
    });
  });

  it('parses Studio preflight forms and resolves the session file', () => {
    expect(
      parseCliArguments(
        ['--studio-session-file', 'session.txt', '--studio-check', 'mcpverification'],
        '/workspace',
      ),
    ).toEqual({
      kind: 'studio-check',
      gameId: 'mcpverification',
      config: {
        projectRoots: [],
        remoteProjects: [],
        operationTimeoutMs: DEFAULT_SERVER_CONFIG.operationTimeoutMs,
        maxOutputBytes: DEFAULT_SERVER_CONFIG.maxOutputBytes,
        networkEnabled: false,
        mutationsEnabled: false,
        experimentalStudioLogs: false,
        studioDevAccounts: [],
        studioSessionFile: resolve('/workspace', 'session.txt'),
      },
    });

    expect(parseCliArguments(['--studio-check'])).toMatchObject({
      kind: 'studio-check',
      gameId: null,
    });
  });

  it.each([
    [['--project-root'], '--project-root requires a value'],
    [['--project-root', '--help'], '--project-root requires a value'],
    [['--allow-remote-project'], '--allow-remote-project requires a value'],
    [['--operation-timeout-ms'], '--operation-timeout-ms requires a value'],
    [['--operation-timeout-ms', 'soon'], '--operation-timeout-ms requires a positive integer'],
    [['--operation-timeout-ms', '0'], '--operation-timeout-ms requires a positive integer'],
    [['--max-output-bytes', '1e6'], '--max-output-bytes requires a positive integer'],
    [['--unknown'], 'Unknown option: --unknown'],
  ])('rejects invalid arguments', (arguments_, message) => {
    expect(() => parseCliArguments(arguments_)).toThrow(new CliUsageError(message));
  });

  it('rejects a sparse argument instead of treating it as configuration', () => {
    expect(() => parseCliArguments(new Array<string>(1))).toThrow(
      new CliUsageError('Unknown option: '),
    );
  });
});
