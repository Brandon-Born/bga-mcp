import type { ProjectListing } from '../policy.js';

export type ProjectLayout = 'modern' | 'legacy' | 'unrecognized';

export type LayoutCertainty = 'certain' | 'likely' | 'possible';

export interface LayoutSignal {
  readonly id: string;
  readonly description: string;
  readonly matched: boolean;
  /** Root-relative files that produced the signal, capped for readability. */
  readonly files: readonly string[];
}

export interface LayoutDetection {
  readonly layout: ProjectLayout;
  /** The project's short name, derived from its files or directory. */
  readonly gameKey: string | null;
  readonly certainty: LayoutCertainty;
  /** Why the layout was chosen, in language a developer can check. */
  readonly reason: string;
  readonly signals: readonly LayoutSignal[];
}

interface SignalDefinition {
  readonly id: string;
  readonly description: string;
  readonly match: (path: string) => boolean;
}

const MAX_SIGNAL_FILES = 10;

const LEGACY_GAME_CLASS = /^([a-z][a-z0-9]*)\.game\.php$/u;
const LEGACY_ACTION = /^([a-z][a-z0-9]*)\.action\.php$/u;

const SIGNALS: readonly SignalDefinition[] = [
  {
    id: 'modern.metadata',
    description: 'JSON or JSONC game metadata',
    match: (path) => path === 'gameinfos.json' || path === 'gameinfos.jsonc',
  },
  {
    id: 'modern.php-modules',
    description: 'PHP sources under modules/php',
    match: (path) => path.startsWith('modules/php/') && path.endsWith('.php'),
  },
  {
    id: 'modern.js-modules',
    description: 'JavaScript or TypeScript sources under modules/js',
    match: (path) => path.startsWith('modules/js/') && /\.(?:js|ts)$/u.test(path),
  },
  {
    id: 'legacy.metadata',
    description: 'PHP game metadata',
    match: (path) => path === 'gameinfos.inc.php',
  },
  {
    id: 'legacy.game-class',
    description: 'Flat <game>.game.php table class',
    match: (path) => LEGACY_GAME_CLASS.test(path),
  },
  {
    id: 'legacy.action-class',
    description: 'Flat <game>.action.php entry point',
    match: (path) => LEGACY_ACTION.test(path),
  },
  {
    id: 'legacy.client',
    description: 'Flat <game>.js client logic',
    match: (path) => /^[a-z][a-z0-9]*\.js$/u.test(path),
  },
  {
    id: 'shared.states',
    description: 'states.inc.php state machine',
    match: (path) => path === 'states.inc.php',
  },
  {
    id: 'shared.database',
    description: 'dbmodel.sql schema',
    match: (path) => path === 'dbmodel.sql',
  },
];

function signalMap(listing: ProjectListing): Map<string, LayoutSignal> {
  const signals = new Map<string, LayoutSignal>();
  for (const definition of SIGNALS) {
    const files = listing.files
      .map((file) => file.path)
      .filter((path) => definition.match(path))
      .slice(0, MAX_SIGNAL_FILES);
    signals.set(definition.id, {
      id: definition.id,
      description: definition.description,
      matched: files.length > 0,
      files,
    });
  }
  return signals;
}

function matched(signals: Map<string, LayoutSignal>, id: string): boolean {
  return signals.get(id)?.matched ?? false;
}

function legacyGameKey(listing: ProjectListing): string | null {
  for (const file of listing.files) {
    const match = LEGACY_GAME_CLASS.exec(file.path);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return null;
}

function modernGameKey(listing: ProjectListing): string | null {
  // A modern project has no file that carries its key, so the directory name
  // is the only available source. It is reported as-is, never normalized.
  const directory = listing.root
    .split(/[\\/]/u)
    .filter((segment) => segment.length > 0)
    .at(-1);
  return directory ?? null;
}

/**
 * Detects a supported BGA project layout from the files that are present.
 *
 * Detection is capability-based: it scores independent signals rather than
 * assuming one template, and a project matching neither template stays
 * `unrecognized` instead of being forced into the closest match.
 */
export function detectLayout(listing: ProjectListing): LayoutDetection {
  const signals = signalMap(listing);
  const ordered = [...signals.values()];

  const modernCore = matched(signals, 'modern.metadata') && matched(signals, 'modern.php-modules');
  const legacyCore = matched(signals, 'legacy.metadata') && matched(signals, 'legacy.game-class');
  const modernPartial =
    matched(signals, 'modern.metadata') || matched(signals, 'modern.php-modules');
  const legacyPartial =
    matched(signals, 'legacy.metadata') || matched(signals, 'legacy.game-class');

  if (modernCore && legacyCore) {
    return {
      layout: 'unrecognized',
      gameKey: legacyGameKey(listing) ?? modernGameKey(listing),
      certainty: 'certain',
      reason:
        'The project matches both the modern and the legacy layout. A mixed project is not a supported combination.',
      signals: ordered,
    };
  }

  if (modernCore) {
    return {
      layout: 'modern',
      gameKey: modernGameKey(listing),
      certainty: 'certain',
      reason: 'JSON metadata and modules/php sources are both present.',
      signals: ordered,
    };
  }

  if (legacyCore) {
    return {
      layout: 'legacy',
      gameKey: legacyGameKey(listing),
      certainty: 'certain',
      reason: 'PHP metadata and a flat <game>.game.php table class are both present.',
      signals: ordered,
    };
  }

  if (modernPartial !== legacyPartial && (modernPartial || legacyPartial)) {
    const layout: ProjectLayout = modernPartial ? 'modern' : 'legacy';
    return {
      layout,
      gameKey: layout === 'legacy' ? legacyGameKey(listing) : modernGameKey(listing),
      certainty: 'likely',
      reason:
        layout === 'modern'
          ? 'Some modern markers are present, but JSON metadata and modules/php were not both found.'
          : 'Some legacy markers are present, but PHP metadata and a flat table class were not both found.',
      signals: ordered,
    };
  }

  return {
    layout: 'unrecognized',
    gameKey: null,
    certainty: 'certain',
    reason:
      listing.files.length === 0
        ? 'The project root contains no readable files.'
        : 'No supported modern or legacy layout marker was found.',
    signals: ordered,
  };
}
