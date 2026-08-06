import { detectLayout } from '../../src/project/layout.js';
import type { ProjectListing } from '../../src/policy.js';

function listing(paths: readonly string[], root = '/workspace/bgamcptest'): ProjectListing {
  return {
    root,
    files: paths.map((path) => ({ path, bytes: 10 })),
    skippedLinks: [],
    truncated: false,
  };
}

const MODERN = [
  'dbmodel.sql',
  'gameinfos.jsonc',
  'gameoptions.json',
  'modules/js/Game.js',
  'modules/php/Game.php',
  'modules/php/States/PlayerTurn.php',
  'stats.json',
];

const LEGACY = [
  'bgamcplegacy.action.php',
  'bgamcplegacy.game.php',
  'bgamcplegacy.js',
  'dbmodel.sql',
  'gameinfos.inc.php',
  'states.inc.php',
];

describe('layout detection', () => {
  it('recognizes a modern project and derives its key from the directory', () => {
    const detection = detectLayout(listing(MODERN));
    expect(detection.layout).toBe('modern');
    expect(detection.certainty).toBe('certain');
    expect(detection.gameKey).toBe('bgamcptest');
    expect(detection.signals.filter((signal) => signal.matched).map((signal) => signal.id)).toEqual(
      ['modern.metadata', 'modern.php-modules', 'modern.js-modules', 'shared.database'],
    );
    expect(detection.signals.find((signal) => signal.id === 'modern.php-modules')?.files).toEqual([
      'modules/php/Game.php',
      'modules/php/States/PlayerTurn.php',
    ]);
  });

  it('recognizes a legacy project and derives its key from the table class', () => {
    const detection = detectLayout(listing(LEGACY));
    expect(detection.layout).toBe('legacy');
    expect(detection.certainty).toBe('certain');
    expect(detection.gameKey).toBe('bgamcplegacy');
  });

  it('refuses to guess when both layouts match', () => {
    const detection = detectLayout(listing([...MODERN, ...LEGACY]));
    expect(detection.layout).toBe('unrecognized');
    expect(detection.reason).toContain('both');
  });

  it('reports a partial match as likely rather than certain', () => {
    const partialModern = detectLayout(listing(['gameinfos.jsonc', 'dbmodel.sql']));
    expect(partialModern).toMatchObject({ layout: 'modern', certainty: 'likely' });
    expect(partialModern.reason).toContain('not both');

    const partialLegacy = detectLayout(listing(['bgamcplegacy.game.php']));
    expect(partialLegacy).toMatchObject({ layout: 'legacy', certainty: 'likely' });
  });

  it('reports an unrecognized project instead of forcing a layout', () => {
    expect(detectLayout(listing([]))).toMatchObject({
      layout: 'unrecognized',
      gameKey: null,
      reason: 'The project root contains no readable files.',
    });
    expect(detectLayout(listing(['README.md', 'src/main.rs']))).toMatchObject({
      layout: 'unrecognized',
      gameKey: null,
    });
  });

  it('handles a root path with a trailing separator or drive letter', () => {
    expect(detectLayout(listing(MODERN, 'C:\\games\\bgamcpwin')).gameKey).toBe('bgamcpwin');
    expect(detectLayout(listing(MODERN, '/workspace/bgamcptest/')).gameKey).toBe('bgamcptest');
  });
});
