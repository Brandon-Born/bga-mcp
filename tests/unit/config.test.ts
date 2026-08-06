import { resolve } from 'node:path';

import { CliUsageError, parseCliArguments } from '../../src/config.js';

describe('parseCliArguments', () => {
  it('defaults to a local, network-free server with no allowed roots', () => {
    expect(parseCliArguments([])).toEqual({
      kind: 'serve',
      config: { projectRoots: [] },
    });
  });

  it('returns help and version actions', () => {
    expect(parseCliArguments(['--help'])).toEqual({ kind: 'help' });
    expect(parseCliArguments(['--version'])).toEqual({ kind: 'version' });
  });

  it('resolves and deduplicates explicit project roots', () => {
    expect(
      parseCliArguments(['--project-root', 'game', '--project-root', './game'], '/workspace'),
    ).toEqual({
      kind: 'serve',
      config: { projectRoots: [resolve('/workspace', 'game')] },
    });
  });

  it.each([
    [['--project-root'], '--project-root requires a path'],
    [['--project-root', '--help'], '--project-root requires a path'],
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
