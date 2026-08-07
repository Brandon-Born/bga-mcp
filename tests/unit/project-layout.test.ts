import { detectLayout, generationFor } from '../../src/project/layout.js';
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

/** Replaces one legacy file with its modern counterpart, leaving the rest alone. */
function migrated(...replacements: readonly (readonly [string, readonly string[]])[]): string[] {
  const paths = [...LEGACY];
  for (const [from, to] of replacements) {
    paths.splice(paths.indexOf(from), 1, ...to);
  }
  return paths;
}

describe('layout detection', () => {
  it('recognizes a fully modern project and derives its key from the directory', () => {
    const detection = detectLayout(listing(MODERN));
    expect(detection.layout).toBe('modern');
    expect(detection.certainty).toBe('certain');
    expect(detection.gameKey).toBe('bgamcptest');
    expect(detection.signals.filter((signal) => signal.matched).map((signal) => signal.id)).toEqual(
      [
        'modern.metadata',
        'modern.php-modules',
        'modern.state-classes',
        'modern.js-modules',
        'shared.database',
      ],
    );
    expect(detection.components.map((component) => component.generation)).toEqual([
      'modern',
      'modern',
      'modern',
      'modern',
    ]);
  });

  it('recognizes a fully legacy project and derives its key from the table class', () => {
    const detection = detectLayout(listing(LEGACY));
    expect(detection.layout).toBe('legacy');
    expect(detection.certainty).toBe('certain');
    expect(detection.gameKey).toBe('bgamcplegacy');
    expect(detection.components.map((component) => component.generation)).toEqual([
      'legacy',
      'legacy',
      'legacy',
      'legacy',
    ]);
  });

  // The framework migrates each of these files on its own schedule, so each of
  // them alone is a real project shape rather than a broken one.
  it.each([
    ['game logic', migrated(['bgamcplegacy.game.php', ['modules/php/Game.php']]), 'game-logic'],
    ['states', migrated(['states.inc.php', ['modules/php/States/PlayerTurn.php']]), 'states'],
    ['client logic', migrated(['bgamcplegacy.js', ['modules/js/Game.js']]), 'client-logic'],
    ['metadata', migrated(['gameinfos.inc.php', ['gameinfos.jsonc']]), 'metadata'],
  ] as const)('reads a project that has migrated only its %s', (_name, paths, component) => {
    const detection = detectLayout(listing(paths));

    expect(detection.layout).toBe('hybrid');
    expect(detection.certainty).toBe('certain');
    expect(generationFor(detection, component)).toBe('modern');
    for (const other of detection.components) {
      if (other.id !== component) {
        expect(other.generation).toBe('legacy');
      }
    }
  });

  it('reads the common shape: modules/php with PHP metadata and states.inc.php', () => {
    const detection = detectLayout(
      listing([
        'bgamcplegacy.js',
        'dbmodel.sql',
        'gameinfos.inc.php',
        'modules/php/Game.php',
        'states.inc.php',
      ]),
    );

    expect(detection.layout).toBe('hybrid');
    expect(detection.gameKey).toBe('bgamcplegacy');
    expect(generationFor(detection, 'game-logic')).toBe('modern');
    expect(generationFor(detection, 'metadata')).toBe('legacy');
    expect(generationFor(detection, 'states')).toBe('legacy');
    expect(detection.reason).toContain('part-way through the BGA migration');
  });

  it('reports a component held in both forms as both rather than choosing', () => {
    const detection = detectLayout(
      listing([...LEGACY, 'gameinfos.jsonc', 'modules/php/States/PlayerTurn.php']),
    );

    expect(detection.layout).toBe('hybrid');
    expect(generationFor(detection, 'metadata')).toBe('both');
    expect(generationFor(detection, 'states')).toBe('both');
    expect(detection.components.find((component) => component.id === 'states')).toMatchObject({
      legacyFiles: ['states.inc.php'],
      modernFiles: ['modules/php/States/PlayerTurn.php'],
    });
  });

  it('derives the game key from a surviving legacy file when the table class is gone', () => {
    expect(detectLayout(listing(migrated(['bgamcplegacy.game.php', []]))).gameKey).toBe(
      'bgamcplegacy',
    );
    expect(
      detectLayout(
        listing(['gameinfos.inc.php', 'modules/php/Game.php', 'bgamcplegacy_bgamcplegacy.tpl']),
      ).gameKey,
    ).toBe('bgamcplegacy');
  });

  it('reports a single identifiable component as likely rather than certain', () => {
    const partialModern = detectLayout(listing(['gameinfos.jsonc', 'dbmodel.sql']));
    expect(partialModern).toMatchObject({ layout: 'modern', certainty: 'likely' });
    expect(partialModern.reason).toContain('Only one component');

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
    // dbmodel.sql is shared by both generations, so it identifies neither.
    expect(detectLayout(listing(['dbmodel.sql', 'README.md'])).layout).toBe('unrecognized');
  });

  it('handles a root path with a trailing separator or drive letter', () => {
    expect(detectLayout(listing(MODERN, 'C:\\games\\bgamcpwin')).gameKey).toBe('bgamcpwin');
    expect(detectLayout(listing(MODERN, '/workspace/bgamcptest/')).gameKey).toBe('bgamcptest');
  });
});
