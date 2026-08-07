import type { DiagnosticFinding, DiagnosticResult } from '../diagnostics.js';
import type { ProjectListing } from '../policy.js';
import {
  detectLayout,
  generationFor,
  type ComponentGeneration,
  type LayoutDetection,
  type ProjectLayout,
} from './layout.js';
import { parseModernStates } from './modern.js';
import {
  parseLegacyMetadata,
  parseLegacyStates,
  parseModernMetadata,
  type GameMetadata,
  type StateDefinition,
} from './parse.js';

/** Reads project files. Backed by the policy boundary; never by direct filesystem access. */
export interface ProjectReader {
  read(relativePath: string): Promise<string>;
}

export type ComponentId =
  | 'metadata'
  | 'options'
  | 'preferences'
  | 'states'
  | 'statistics'
  | 'database'
  | 'game-logic'
  | 'client-logic'
  | 'player-actions'
  | 'view'
  | 'template'
  | 'styles';

export interface ProjectComponent {
  readonly id: ComponentId;
  readonly present: boolean;
  readonly files: readonly string[];
  /** Set when the component is expected for the detected layout but absent. */
  readonly expected: boolean;
}

export interface ProjectStates {
  /** False when the layout's state definitions could not be read at all. */
  readonly parsed: boolean;
  readonly definitions: readonly StateDefinition[];
  readonly unsupported: readonly string[];
  /** The first source read, kept for callers that expect a single origin. */
  readonly source: string | null;
  /** Every source read. A partially migrated project has more than one. */
  readonly sources: readonly string[];
}

export interface ProjectModel {
  readonly schemaVersion: 1;
  readonly layout: ProjectLayout;
  readonly gameKey: string | null;
  readonly detection: LayoutDetection;
  readonly metadata: GameMetadata & { readonly source: string | null };
  readonly components: readonly ProjectComponent[];
  readonly states: ProjectStates;
  readonly fileCount: number;
  readonly truncated: boolean;
  readonly skippedLinks: readonly string[];
  readonly diagnostics: DiagnosticResult;
}

const MODEL_SCHEMA_VERSION = 1 as const;
const MAX_COMPONENT_FILES = 20;

interface ComponentRule {
  readonly id: ComponentId;
  readonly match: (path: string, gameKey: string | null) => boolean;
  /**
   * Whether a project in this shape ought to define the component.
   *
   * Expectation is keyed to the generation of the component that governs it,
   * not to a whole-project label: a project that has moved its game logic to
   * `modules/php` no longer needs `<game>.action.php` or `<game>.view.php`,
   * whatever form the rest of its files are still in.
   */
  readonly expected: (detection: LayoutDetection) => boolean;
}

const always = (): boolean => true;
const isLegacy = (generation: ComponentGeneration): boolean =>
  generation === 'legacy' || generation === 'both';
const isModern = (generation: ComponentGeneration): boolean =>
  generation === 'modern' || generation === 'both';

const COMPONENT_RULES: readonly ComponentRule[] = [
  {
    id: 'metadata',
    match: (path) => /^gameinfos\.(?:json|jsonc|inc\.php)$/u.test(path),
    expected: always,
  },
  {
    id: 'options',
    match: (path) => path === 'gameoptions.json' || path === 'gameoptions.inc.php',
    expected: always,
  },
  {
    id: 'preferences',
    match: (path) => path === 'gamepreferences.json' || path === 'gamepreferences.inc.php',
    // Preferences become their own file only when gameoptions.inc.php is split.
    expected: (detection) => isModern(generationFor(detection, 'metadata')),
  },
  {
    id: 'states',
    match: (path) =>
      path === 'states.inc.php' ||
      (path.startsWith('modules/php/States/') && path.endsWith('.php')),
    expected: always,
  },
  {
    id: 'statistics',
    match: (path) => path === 'stats.json' || path === 'stats.inc.php',
    expected: always,
  },
  { id: 'database', match: (path) => path === 'dbmodel.sql', expected: always },
  {
    id: 'game-logic',
    match: (path, gameKey) =>
      (path.startsWith('modules/php/') &&
        path.endsWith('.php') &&
        !path.startsWith('modules/php/States/')) ||
      (gameKey !== null && path === `${gameKey}.game.php`),
    expected: always,
  },
  {
    id: 'client-logic',
    match: (path, gameKey) =>
      (path.startsWith('modules/js/') && /\.(?:js|ts)$/u.test(path)) ||
      (gameKey !== null && path === `${gameKey}.js`),
    expected: always,
  },
  {
    id: 'player-actions',
    match: (path, gameKey) => gameKey !== null && path === `${gameKey}.action.php`,
    // Autowired actions on the game class replace this file, so it is expected
    // only while the game logic is still in its flat form.
    expected: (detection) => isLegacy(generationFor(detection, 'game-logic')),
  },
  {
    id: 'view',
    match: (path, gameKey) => gameKey !== null && path === `${gameKey}.view.php`,
    expected: (detection) => isLegacy(generationFor(detection, 'game-logic')),
  },
  {
    id: 'template',
    match: (path) => path.endsWith('.tpl'),
    expected: (detection) => isLegacy(generationFor(detection, 'client-logic')),
  },
  {
    id: 'styles',
    match: (path) => path.endsWith('.css'),
    expected: (detection) => isLegacy(generationFor(detection, 'client-logic')),
  },
];

function issue(
  code: string,
  severity: 'error' | 'warning' | 'information',
  message: string,
  evidence: string,
  uri?: string,
  suggestion?: string,
): DiagnosticFinding {
  return {
    kind: 'issue',
    code,
    severity,
    certainty: 'certain',
    message,
    locations: uri === undefined ? [] : [{ uri }],
    evidence: [{ kind: 'relationship', message: evidence }],
    suggestions: suggestion === undefined ? [] : [{ message: suggestion }],
  };
}

function unsupportedSyntax(
  code: string,
  message: string,
  construct: string,
  language: string,
  uri?: string,
): DiagnosticFinding {
  return {
    kind: 'unsupported-syntax',
    code,
    certainty: 'certain',
    message,
    locations: uri === undefined ? [] : [{ uri }],
    evidence: [{ kind: 'source', message: `Unsupported construct: ${construct}` }],
    suggestions: [
      { message: 'Report the construct so a future release can read it, or simplify it.' },
    ],
    syntax: { language, construct },
  };
}

function summarize(findings: readonly DiagnosticFinding[]): DiagnosticResult {
  const summary = { errors: 0, warnings: 0, information: 0, unsupported: 0 };
  for (const finding of findings) {
    if (finding.kind === 'unsupported-syntax') {
      summary.unsupported += 1;
    } else if (finding.severity === 'error') {
      summary.errors += 1;
    } else if (finding.severity === 'warning') {
      summary.warnings += 1;
    } else {
      summary.information += 1;
    }
  }
  const status =
    findings.length === 0
      ? 'passed'
      : summary.unsupported === findings.length
        ? 'unsupported'
        : 'findings';
  return { schemaVersion: 1, status, summary, findings: [...findings] };
}

async function readMetadata(
  reader: ProjectReader,
  detection: LayoutDetection,
  paths: readonly string[],
  findings: DiagnosticFinding[],
): Promise<GameMetadata & { source: string | null }> {
  // The metadata file is chosen by its own generation, not by the shape of the
  // rest of the project: a project can move to modules/php while keeping
  // gameinfos.inc.php, and can move its metadata while keeping everything else.
  const generation = generationFor(detection, 'metadata');
  const legacySource = paths.find((path) => path === 'gameinfos.inc.php');
  const modernSource = paths.find(
    (path) => path === 'gameinfos.json' || path === 'gameinfos.jsonc',
  );

  if (generation === 'both') {
    findings.push(
      issue(
        'project.metadata.both-generations',
        'information',
        'The project declares its metadata twice, in the JSON form and the PHP form.',
        `Both ${String(modernSource)} and ${String(legacySource)} are present, and the JSON form was read as the current one.`,
        modernSource,
        'Remove the form the project no longer maintains so the two cannot drift apart.',
      ),
    );
  }

  const source = generation === 'legacy' ? legacySource : (modernSource ?? legacySource);
  if (source === undefined) {
    return { gameName: null, playerCounts: [], source: null };
  }

  const layout = source === legacySource ? 'legacy' : 'modern';
  const text = await reader.read(source);
  const outcome = layout === 'legacy' ? parseLegacyMetadata(text) : parseModernMetadata(text);
  for (const construct of outcome.unsupported) {
    findings.push(
      unsupportedSyntax(
        'project.metadata.unsupported',
        `Game metadata could not be read completely: ${construct}.`,
        construct,
        layout === 'legacy' ? 'php' : 'json',
        source,
      ),
    );
  }
  return { ...outcome.value, source };
}

/**
 * Merges state definitions read from both sources.
 *
 * A project migrates its states one class at a time and removes
 * `states.inc.php` only once every class exists, so in the interim both files
 * describe parts of one machine. A state declared in both is taken from the
 * class, because that is the form the framework runs.
 */
function mergeStates(
  legacy: readonly StateDefinition[],
  modern: readonly StateDefinition[],
): readonly StateDefinition[] {
  const merged = new Map<number, StateDefinition>();
  for (const definition of legacy) {
    merged.set(definition.id, definition);
  }
  for (const definition of modern) {
    merged.set(definition.id, definition);
  }
  return [...merged.values()].sort((left, right) => left.id - right.id);
}

async function readStates(
  reader: ProjectReader,
  layout: ProjectLayout,
  paths: readonly string[],
  findings: DiagnosticFinding[],
): Promise<ProjectStates> {
  const legacySource = paths.find((path) => path === 'states.inc.php');
  const modernStateFiles = paths.filter(
    (path) => path.startsWith('modules/php/States/') && path.endsWith('.php'),
  );

  const sources: string[] = [];
  let legacyDefinitions: readonly StateDefinition[] = [];
  let modernDefinitions: readonly StateDefinition[] = [];
  const unsupported: string[] = [];

  if (legacySource !== undefined) {
    sources.push(legacySource);
    const outcome = parseLegacyStates(await reader.read(legacySource));
    legacyDefinitions = outcome.value;
    unsupported.push(...outcome.unsupported);
    for (const construct of outcome.unsupported) {
      findings.push(
        unsupportedSyntax(
          'project.states.unsupported',
          `Part of the state machine could not be read: ${construct}.`,
          construct,
          'php',
          legacySource,
        ),
      );
    }
  }

  if (modernStateFiles.length > 0) {
    sources.push(...modernStateFiles);
    const classSources = await Promise.all(
      modernStateFiles.map(async (path) => ({ path, text: await reader.read(path) })),
    );
    const outcome = parseModernStates(classSources);
    modernDefinitions = outcome.value;
    unsupported.push(...outcome.unsupported);
    for (const construct of outcome.unsupported) {
      findings.push(
        unsupportedSyntax(
          'project.states.unsupported',
          `Part of the state machine could not be read: ${construct}.`,
          construct,
          'php',
          modernStateFiles[0],
        ),
      );
    }
    if (outcome.value.length === 0 && outcome.unsupported.length === 0) {
      findings.push(
        unsupportedSyntax(
          'project.states.modern-classes',
          'State classes were found but none declared a readable state.',
          'class-based state definitions under modules/php/States',
          'php',
          modernStateFiles[0],
        ),
      );
    }
  }

  if (sources.length > 0) {
    const definitions = mergeStates(legacyDefinitions, modernDefinitions);
    if (legacyDefinitions.length > 0 && modernDefinitions.length > 0) {
      const migrated = modernDefinitions.filter((state) =>
        legacyDefinitions.some((other) => other.id === state.id),
      );
      findings.push(
        issue(
          'project.states.partially-migrated',
          'information',
          `The state machine is split across both forms: ${String(legacyDefinitions.length)} in states.inc.php and ${String(modernDefinitions.length)} in modules/php/States. Both were read as one machine.`,
          migrated.length === 0
            ? 'No state is declared in both forms.'
            : `${String(migrated.length)} state(s) declared in both forms were read from the class, which is the form the framework runs.`,
          legacySource,
          'Remove a state from states.inc.php once its class exists, and remove the file once every class does.',
        ),
      );
    }
    return {
      parsed: definitions.length > 0,
      definitions,
      unsupported,
      source: sources[0] ?? null,
      sources,
    };
  }

  if (layout !== 'unrecognized') {
    findings.push(
      issue(
        'project.states.missing',
        'warning',
        'No state machine definition was found.',
        'Neither states.inc.php nor modules/php/States was present.',
        undefined,
        'Add the state definitions for the project layout in use.',
      ),
    );
  }
  return { parsed: false, definitions: [], unsupported: [], source: null, sources: [] };
}

/**
 * Builds the normalized project model.
 *
 * The model covers layout, metadata, components, and state definitions. Action
 * contracts, notifications, and database usage are owned by BGA-107 through
 * BGA-109 and are deliberately absent rather than reported as empty.
 */
export async function buildProjectModel(
  listing: ProjectListing,
  reader: ProjectReader,
): Promise<ProjectModel> {
  const detection = detectLayout(listing);
  const paths = listing.files.map((file) => file.path);
  const findings: DiagnosticFinding[] = [];

  const components = COMPONENT_RULES.map((rule) => {
    const files = paths.filter((path) => rule.match(path, detection.gameKey));
    return {
      id: rule.id,
      present: files.length > 0,
      files: files.slice(0, MAX_COMPONENT_FILES),
      expected: detection.layout !== 'unrecognized' && rule.expected(detection),
    } satisfies ProjectComponent;
  });

  if (detection.layout === 'unrecognized') {
    findings.push(
      issue(
        'project.layout.unrecognized',
        'error',
        `The project layout could not be recognized. ${detection.reason}`,
        'No supported layout matched the files that are present.',
        undefined,
        'Compare the project with the supported layouts in docs/COMPATIBILITY.md.',
      ),
    );
  } else if (detection.certainty !== 'certain') {
    findings.push(
      issue(
        'project.layout.partial',
        'warning',
        `The project looks like a ${detection.layout} project, but only one component identified its form. ${detection.reason}`,
        'Only one of metadata, game logic, states, and client logic was identifiable.',
        undefined,
        'Add the missing project files, or confirm the project is intentionally incomplete.',
      ),
    );
  }

  for (const component of components) {
    if (component.expected && !component.present) {
      findings.push(
        issue(
          'project.component.missing',
          'warning',
          `A ${detection.layout} project usually defines its ${component.id}, and none was found.`,
          `No file matched the ${component.id} component.`,
          undefined,
          `Add the ${component.id} file for this layout, or confirm it is intentionally absent.`,
        ),
      );
    }
  }

  if (listing.truncated) {
    findings.push(
      issue(
        'project.listing.truncated',
        'information',
        'The project contains more files than the configured listing budget, so the result is partial.',
        'File listing stopped at the configured entry or depth limit.',
        undefined,
        'Raise the limit or inspect a narrower project root.',
      ),
    );
  }

  for (const link of listing.skippedLinks) {
    findings.push(
      issue(
        'project.listing.link-skipped',
        'information',
        `A link inside the project root was not followed: ${link}.`,
        'Links are never followed, so their targets are not inspected.',
        link,
        'Inspect the link target directly if it is part of the project.',
      ),
    );
  }

  const metadata = await readMetadata(reader, detection, paths, findings);
  const states = await readStates(reader, detection.layout, paths, findings);

  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    layout: detection.layout,
    gameKey: detection.gameKey,
    detection,
    metadata,
    components,
    states,
    fileCount: listing.files.length,
    truncated: listing.truncated,
    skippedLinks: listing.skippedLinks,
    diagnostics: summarize(findings),
  };
}
