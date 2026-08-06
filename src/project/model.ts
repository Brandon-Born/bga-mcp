import type { DiagnosticFinding, DiagnosticResult } from '../diagnostics.js';
import type { ProjectListing } from '../policy.js';
import { detectLayout, type LayoutDetection, type ProjectLayout } from './layout.js';
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
  readonly source: string | null;
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
  readonly expectedIn: readonly ProjectLayout[];
}

const COMPONENT_RULES: readonly ComponentRule[] = [
  {
    id: 'metadata',
    match: (path) => /^gameinfos\.(?:json|jsonc|inc\.php)$/u.test(path),
    expectedIn: ['modern', 'legacy'],
  },
  {
    id: 'options',
    match: (path) => path === 'gameoptions.json' || path === 'gameoptions.inc.php',
    expectedIn: ['modern', 'legacy'],
  },
  {
    id: 'preferences',
    match: (path) => path === 'gamepreferences.json' || path === 'gamepreferences.inc.php',
    expectedIn: ['modern'],
  },
  { id: 'states', match: (path) => path === 'states.inc.php', expectedIn: ['legacy'] },
  {
    id: 'statistics',
    match: (path) => path === 'stats.json' || path === 'stats.inc.php',
    expectedIn: ['modern', 'legacy'],
  },
  { id: 'database', match: (path) => path === 'dbmodel.sql', expectedIn: ['modern', 'legacy'] },
  {
    id: 'game-logic',
    match: (path, gameKey) =>
      (path.startsWith('modules/php/') && path.endsWith('.php')) ||
      (gameKey !== null && path === `${gameKey}.game.php`),
    expectedIn: ['modern', 'legacy'],
  },
  {
    id: 'client-logic',
    match: (path, gameKey) =>
      (path.startsWith('modules/js/') && /\.(?:js|ts)$/u.test(path)) ||
      (gameKey !== null && path === `${gameKey}.js`),
    expectedIn: ['modern', 'legacy'],
  },
  {
    id: 'player-actions',
    match: (path, gameKey) => gameKey !== null && path === `${gameKey}.action.php`,
    expectedIn: ['legacy'],
  },
  {
    id: 'view',
    match: (path, gameKey) => gameKey !== null && path === `${gameKey}.view.php`,
    expectedIn: ['legacy'],
  },
  {
    id: 'template',
    match: (path) => path.endsWith('.tpl'),
    expectedIn: ['legacy'],
  },
  { id: 'styles', match: (path) => path.endsWith('.css'), expectedIn: ['legacy'] },
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
  layout: ProjectLayout,
  paths: readonly string[],
  findings: DiagnosticFinding[],
): Promise<GameMetadata & { source: string | null }> {
  const source =
    layout === 'legacy'
      ? paths.find((path) => path === 'gameinfos.inc.php')
      : paths.find((path) => path === 'gameinfos.json' || path === 'gameinfos.jsonc');

  if (source === undefined) {
    return { gameName: null, playerCounts: [], source: null };
  }

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

async function readStates(
  reader: ProjectReader,
  layout: ProjectLayout,
  paths: readonly string[],
  findings: DiagnosticFinding[],
): Promise<ProjectStates> {
  const legacySource = paths.find((path) => path === 'states.inc.php');
  if (legacySource !== undefined) {
    const outcome = parseLegacyStates(await reader.read(legacySource));
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
    return {
      parsed: outcome.value.length > 0,
      definitions: outcome.value,
      unsupported: outcome.unsupported,
      source: legacySource,
    };
  }

  const modernStateFiles = paths.filter(
    (path) => path.startsWith('modules/php/States/') && path.endsWith('.php'),
  );
  if (modernStateFiles.length > 0) {
    findings.push(
      unsupportedSyntax(
        'project.states.modern-classes',
        'Modern state classes are recognized but not yet interpreted, so no transitions are reported.',
        'class-based state definitions under modules/php/States',
        'php',
        modernStateFiles[0],
      ),
    );
    return {
      parsed: false,
      definitions: [],
      unsupported: [`${String(modernStateFiles.length)} class-based state definitions`],
      source: modernStateFiles[0] ?? null,
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
  return { parsed: false, definitions: [], unsupported: [], source: null };
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
      expected: rule.expectedIn.includes(detection.layout),
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
        `The project looks like a ${detection.layout} project, but not every marker was found. ${detection.reason}`,
        'Only part of the layout signature matched.',
        undefined,
        'Add the missing layout files, or confirm the project is intentionally incomplete.',
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

  const metadata = await readMetadata(reader, detection.layout, paths, findings);
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
