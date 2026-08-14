import type { ProjectListing } from '../policy.js';
import { cancellationCheckpoint } from '../deadline.js';

export type ProjectLayout = 'modern' | 'legacy' | 'hybrid' | 'unrecognized';

export type LayoutCertainty = 'certain' | 'likely' | 'possible';

/**
 * Which form of a single migratable component a project uses.
 *
 * `both` is a legitimate mid-migration state, not an error: the framework
 * deprecates the older form of each file rather than removing it, so a project
 * can hold both while it moves across.
 */
export type ComponentGeneration = 'modern' | 'legacy' | 'both' | 'absent';

export type LayoutComponentId = 'metadata' | 'game-logic' | 'states' | 'client-logic';

export interface LayoutComponent {
  readonly id: LayoutComponentId;
  readonly description: string;
  readonly generation: ComponentGeneration;
  /** Root-relative files that produced each verdict, capped for readability. */
  readonly legacyFiles: readonly string[];
  readonly modernFiles: readonly string[];
}

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
  /** One entry per migratable component, whatever the whole-project label says. */
  readonly components: readonly LayoutComponent[];
  readonly signals: readonly LayoutSignal[];
}

interface SignalDefinition {
  readonly id: string;
  readonly description: string;
  readonly match: (path: string) => boolean;
}

interface ComponentDefinition {
  readonly id: LayoutComponentId;
  readonly description: string;
  readonly legacySignal: string;
  readonly modernSignal: string;
}

const MAX_SIGNAL_FILES = 10;

const LEGACY_GAME_CLASS = /^([a-z][a-z0-9]*)\.game\.php$/u;
const LEGACY_ACTION = /^([a-z][a-z0-9]*)\.action\.php$/u;
const LEGACY_VIEW = /^([a-z][a-z0-9]*)\.view\.php$/u;
const LEGACY_CLIENT = /^([a-z][a-z0-9]*)\.js$/u;

const MODERN_STATES_PREFIX = 'modules/php/States/';

const SIGNALS: readonly SignalDefinition[] = [
  {
    id: 'modern.metadata',
    description: 'JSON or JSONC game metadata',
    match: (path) => path === 'gameinfos.json' || path === 'gameinfos.jsonc',
  },
  {
    id: 'modern.php-modules',
    description: 'PHP game logic under modules/php',
    match: (path) =>
      path.startsWith('modules/php/') &&
      path.endsWith('.php') &&
      !path.startsWith(MODERN_STATES_PREFIX),
  },
  {
    id: 'modern.state-classes',
    description: 'State classes under modules/php/States',
    match: (path) => path.startsWith(MODERN_STATES_PREFIX) && path.endsWith('.php'),
  },
  {
    id: 'modern.js-modules',
    description: 'JavaScript or TypeScript client logic under modules/js',
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
    match: (path) => LEGACY_CLIENT.test(path),
  },
  {
    id: 'legacy.states',
    description: 'states.inc.php state machine',
    match: (path) => path === 'states.inc.php',
  },
  {
    id: 'shared.database',
    description: 'dbmodel.sql schema',
    match: (path) => path === 'dbmodel.sql',
  },
];

/**
 * The components the framework migrates independently.
 *
 * The BGA documentation describes migration as a per-file process: the game
 * class moves to `modules/php/Game.php`, states move to classes one at a time,
 * the client moves to `modules/js/Game.js`, and metadata moves to JSONC, each on
 * its own schedule, with the older form of each deprecated but still read.
 * Detection therefore reports a generation per component and derives the
 * whole-project label from them, rather than matching one of two templates.
 *
 * `<game>.action.php` is deliberately not a component here. The documentation
 * says the file may remain in a project that has already moved to autowired
 * actions, so its presence proves nothing about which form is in use; that
 * question is answered by reading the sources, not by listing them.
 */
const COMPONENTS: readonly ComponentDefinition[] = [
  {
    id: 'metadata',
    description: 'game metadata',
    legacySignal: 'legacy.metadata',
    modernSignal: 'modern.metadata',
  },
  {
    id: 'game-logic',
    description: 'main game logic',
    legacySignal: 'legacy.game-class',
    modernSignal: 'modern.php-modules',
  },
  {
    id: 'states',
    description: 'state machine',
    legacySignal: 'legacy.states',
    modernSignal: 'modern.state-classes',
  },
  {
    id: 'client-logic',
    description: 'client interface logic',
    legacySignal: 'legacy.client',
    modernSignal: 'modern.js-modules',
  },
];

function signalMap(listing: ProjectListing, signal?: AbortSignal): Map<string, LayoutSignal> {
  const signals = new Map<string, LayoutSignal>();
  for (const definition of SIGNALS) {
    cancellationCheckpoint(signal);
    const files: string[] = [];
    for (const file of listing.files) {
      cancellationCheckpoint(signal);
      if (definition.match(file.path) && files.length < MAX_SIGNAL_FILES) {
        files.push(file.path);
      }
    }
    signals.set(definition.id, {
      id: definition.id,
      description: definition.description,
      matched: files.length > 0,
      files,
    });
  }
  return signals;
}

function files(signals: Map<string, LayoutSignal>, id: string): readonly string[] {
  return signals.get(id)?.files ?? [];
}

function generationOf(legacy: readonly string[], modern: readonly string[]): ComponentGeneration {
  if (legacy.length > 0 && modern.length > 0) {
    return 'both';
  }
  if (modern.length > 0) {
    return 'modern';
  }
  return legacy.length > 0 ? 'legacy' : 'absent';
}

function firstMatch(listing: ProjectListing, pattern: RegExp, signal?: AbortSignal): string | null {
  for (const file of listing.files) {
    cancellationCheckpoint(signal);
    const match = pattern.exec(file.path);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return null;
}

function templateGameKey(listing: ProjectListing, signal?: AbortSignal): string | null {
  for (const file of listing.files) {
    cancellationCheckpoint(signal);
    const match = /^([a-z][a-z0-9]*)_\1\.tpl$/u.exec(file.path);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return null;
}

function directoryGameKey(listing: ProjectListing): string | null {
  // A fully migrated project has no file that carries its key, so the directory
  // name is the only available source. It is reported as-is, never normalized.
  const directory = listing.root
    .split(/[\\/]/u)
    .filter((segment) => segment.length > 0)
    .at(-1);
  return directory ?? null;
}

/**
 * Derives the project's short name from whichever legacy-named file survives.
 *
 * A partially migrated project usually still has one, so the directory name is
 * the last resort rather than the modern default.
 */
function resolveGameKey(listing: ProjectListing, signal?: AbortSignal): string | null {
  return (
    firstMatch(listing, LEGACY_GAME_CLASS, signal) ??
    firstMatch(listing, LEGACY_ACTION, signal) ??
    firstMatch(listing, LEGACY_VIEW, signal) ??
    templateGameKey(listing, signal) ??
    firstMatch(listing, LEGACY_CLIENT, signal) ??
    directoryGameKey(listing)
  );
}

function describe(components: readonly LayoutComponent[]): string {
  const described = components
    .filter((component) => component.generation !== 'absent')
    .map((component) => `${component.description} is ${component.generation}`);
  return described.join(', ');
}

/**
 * Detects how far a BGA project has migrated, component by component.
 *
 * Detection is capability-based: it resolves each independently migratable
 * component from the files that are present and derives the whole-project label
 * from those verdicts. A project part-way through migration is `hybrid` and is
 * read normally; only a project where nothing resolves stays `unrecognized`.
 */
export function detectLayout(listing: ProjectListing, signal?: AbortSignal): LayoutDetection {
  cancellationCheckpoint(signal);
  const signals = signalMap(listing, signal);
  const ordered = [...signals.values()];
  const gameKey = resolveGameKey(listing, signal);

  const components = COMPONENTS.map((definition) => {
    cancellationCheckpoint(signal);
    const legacyFiles = files(signals, definition.legacySignal);
    const modernFiles = files(signals, definition.modernSignal);
    return {
      id: definition.id,
      description: definition.description,
      generation: generationOf(legacyFiles, modernFiles),
      legacyFiles,
      modernFiles,
    } satisfies LayoutComponent;
  });

  const resolved = components.filter((component) => {
    cancellationCheckpoint(signal);
    return component.generation !== 'absent';
  });

  if (resolved.length === 0) {
    return {
      layout: 'unrecognized',
      gameKey: null,
      certainty: 'certain',
      reason:
        listing.files.length === 0
          ? 'The project root contains no readable files.'
          : 'No file identified the metadata, game logic, state machine, or client logic of a BGA project.',
      components,
      signals: ordered,
    };
  }

  const allLegacy = resolved.every((component) => component.generation === 'legacy');
  const allModern = resolved.every((component) => component.generation === 'modern');
  const layout: ProjectLayout = allLegacy ? 'legacy' : allModern ? 'modern' : 'hybrid';
  const certainty: LayoutCertainty = resolved.length > 1 ? 'certain' : 'likely';

  const reason =
    layout === 'hybrid'
      ? `The project is part-way through the BGA migration: ${describe(components)}. Each component is read in the form it is actually in.`
      : `${describe(components)}.`;

  return {
    layout,
    gameKey,
    certainty,
    reason:
      resolved.length > 1
        ? reason
        : `${reason} Only one component identified a generation, so the layout is a best reading of a partial project.`,
    components,
    signals: ordered,
  };
}

/** The generation in use for one component, for readers that must pick a form. */
export function generationFor(
  detection: LayoutDetection,
  id: LayoutComponentId,
): ComponentGeneration {
  return detection.components.find((component) => component.id === id)?.generation ?? 'absent';
}
