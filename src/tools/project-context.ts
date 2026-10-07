import { fileURLToPath } from 'node:url';

import {
  inputRequired,
  inputResponse,
  type InputRequiredResult,
  type ServerContext,
} from '@modelcontextprotocol/server';

import { cancellationCheckpoint } from '../deadline.js';
import type { DiagnosticFinding } from '../diagnostics.js';
import { BgaMcpError, ERROR_CODES } from '../errors.js';
import type { PolicyBoundary } from '../policy.js';
import { buildProjectModel, type ProjectModel } from '../project/model.js';
import { parseJsonc } from '../project/parse.js';
import { readPhpMethodNames } from '../project/actions.js';
import { validateActionContracts, type ActionContractTrace } from '../rules/action-contracts.js';
import { auditDatabaseUsage, type DatabaseAudit, type DatabaseSource } from '../rules/database.js';
import { validateNotifications, type NotificationTrace } from '../rules/notifications.js';
import type { PhpSource } from '../rules/state-machine.js';
import { summarizeFindings, unsupportedSyntaxFinding } from '../rules/uncertainty.js';

/** Bytes shared by PHP/client contract sources in a single validation. */
const MAX_SOURCE_BYTES = 262_144;
const MAX_SOURCE_FILES = 200;

export interface ProjectContext {
  readonly model: ProjectModel;
  /** Readable PHP sources, used by cross-file rules. */
  readonly phpSources: readonly PhpSource[];
  /** Readable client sources, used by rules that span client and server. */
  readonly clientSources: readonly PhpSource[];
}

/** @internal A source fact, never a claim that the project executes it. */
export interface NormalizedFact {
  readonly key: string;
  readonly source: string | null;
  readonly sources: readonly string[];
  readonly certainty: 'certain' | 'possible';
  readonly value: unknown;
}

/** @internal Unknowns survive normalization alongside the facts that were read. */
export interface NormalizedSection {
  readonly facts: readonly NormalizedFact[];
  readonly unknowns: readonly { source: string | null; reason: string }[];
}

/** @internal Request-scoped shared model; the retained public version-one schema stays fixed. */
export interface NormalizedProject {
  readonly sections: Readonly<Record<string, NormalizedSection>>;
  readonly actions: ActionContractTrace;
  readonly notifications: NotificationTrace;
  readonly database: {
    readonly audit: DatabaseAudit;
    readonly source: DatabaseSource | null;
    readonly error: Error | null;
  };
}

const normalizedProjects = new WeakMap<ProjectContext, NormalizedProject>();

/** @internal The same trace instance supplies inspection and the public validators. */
export function normalizedProject(context: ProjectContext): NormalizedProject | undefined {
  return normalizedProjects.get(context);
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function normalizeContext(
  context: ProjectContext,
  paths: readonly string[],
  read: (path: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<NormalizedProject> {
  const sections: Record<string, NormalizedSection> = {};
  const facts = (
    values: readonly NormalizedFact[],
    unknowns: NormalizedSection['unknowns'] = [],
  ): NormalizedSection => ({ facts: values, unknowns });
  const fact = (key: string, source: string | null, value: unknown): NormalizedFact => ({
    key,
    source,
    sources: source === null ? [] : [source],
    certainty: 'certain',
    value,
  });
  const unknown = (source: string | null, reason: string) => ({ source, reason });
  sections.metadata = facts(
    [fact('metadata', context.model.metadata.source, context.model.metadata)],
    [
      ...(context.model.metadata.source === null
        ? [unknown(null, 'No metadata source was read.')]
        : []),
      ...context.model.diagnostics.findings
        .filter((entry) => entry.code === 'project.metadata.unsupported')
        .map((entry) => unknown(entry.locations[0]?.uri ?? null, entry.message)),
    ],
  );
  sections.states = facts(
    context.model.states.definitions.map((entry) => ({
      ...fact(String(entry.id), entry.origin === 'array' ? 'states.inc.php' : null, entry),
      sources: context.model.states.sources,
    })),
    [
      ...(context.model.states.parsed ? [] : [unknown(null, 'No state definitions were read.')]),
      ...context.model.states.unsupported.map((reason) =>
        unknown(context.model.states.source, reason),
      ),
    ],
  );
  sections.transitions = facts(
    context.model.states.definitions.flatMap((state) =>
      Object.entries(state.transitions).map(([name, target]) => ({
        ...fact(
          `${String(state.id)}.${name}`,
          state.origin === 'array' ? 'states.inc.php' : null,
          target,
        ),
        sources: context.model.states.sources,
      })),
    ),
    context.model.states.complete.edges
      ? []
      : [unknown(context.model.states.source, 'State edges are incomplete.')],
  );

  // Official pages say "you can use jsonc instead of json". Options and
  // preferences migrate independently; "The PHP format will continue to work".
  // Legacy PHP is retained as unknown here, never executed or called empty.
  // https://en.doc.boardgamearena.com/Options_and_preferences:_gameoptions.json,_gamepreferences.json
  // https://en.doc.boardgamearena.com/Game_statistics:_stats.json
  for (const [id, expression] of [
    ['options', /^gameoptions\.(?:jsonc?|inc\.php)$/u],
    ['preferences', /^gamepreferences\.jsonc?$|^gameoptions\.inc\.php$/u],
    ['statistics', /^stats\.(?:jsonc?|inc\.php)$/u],
  ] as const) {
    const entries: NormalizedFact[] = [];
    const unknowns: { source: string | null; reason: string }[] = [];
    for (const path of paths.filter((path) => expression.test(path))) {
      cancellationCheckpoint(signal);
      if (path.endsWith('.php')) {
        unknowns.push(
          unknown(
            path,
            'Legacy PHP configuration is present; literal definitions are not normalized by this reader.',
          ),
        );
        continue;
      }
      let value: unknown;
      try {
        value = parseJsonc(await read(path), signal);
      } catch {
        cancellationCheckpoint(signal);
        unknowns.push(unknown(path, 'Configuration could not be read as a JSON/JSONC object.'));
        continue;
      }
      if (!objectRecord(value)) {
        unknowns.push(unknown(path, 'Configuration is not an object.'));
        continue;
      }
      for (const [key, definition] of Object.entries(value)) {
        cancellationCheckpoint(signal);
        // Statistics has separate table/player namespaces and optional labels.
        // "A table statistic can have the same ID as a player statistics".
        if (id === 'statistics' && (key === 'table' || key === 'player')) {
          if (!objectRecord(definition))
            unknowns.push(unknown(path, `${key} statistics is not an object.`));
          else
            for (const [name, entry] of Object.entries(definition))
              entries.push(fact(`${key}.${name}`, path, entry));
        } else if (id === 'statistics' && key === 'value_labels') {
          entries.push(fact(key, path, definition));
        } else if (id === 'statistics') {
          unknowns.push(unknown(path, `Unrecognized statistics section ${key}.`));
        } else {
          entries.push(fact(key, path, definition));
        }
      }
    }
    sections[id] = facts(entries, unknowns);
  }

  const actions = validateActionContracts(
    context.model,
    context.clientSources,
    context.phpSources,
    signal,
  );
  const notifications = validateNotifications(context.phpSources, context.clientSources, signal);
  const traceUnknowns = (result: { diagnostics: { findings: readonly DiagnosticFinding[] } }) =>
    result.diagnostics.findings
      .filter((entry) => entry.kind === 'unsupported-syntax' || entry.code.endsWith('.unavailable'))
      .map((entry) => unknown(entry.locations[0]?.uri ?? null, entry.message));
  sections.actions = facts(
    [
      ...actions.clientCalls.map((entry) => fact(`client:${entry.action}`, entry.source, entry)),
      ...actions.entryPoints.map((entry) =>
        fact(`${entry.scope}:${entry.action}`, entry.source, entry),
      ),
    ],
    traceUnknowns(actions),
  );
  const methodFacts: NormalizedFact[] = [];
  const methodUnknowns: { source: string | null; reason: string }[] = [];
  for (const source of context.phpSources) {
    cancellationCheckpoint(signal);
    const outcome = readPhpMethodNames(source.text, signal);
    methodFacts.push(...outcome.value.map((name) => fact(name, source.path, name)));
    methodUnknowns.push(...outcome.unsupported.map((reason) => unknown(source.path, reason)));
  }
  if (context.phpSources.length === 0)
    methodUnknowns.push(
      unknown(null, 'No PHP contract source was read; absence of methods is unknown.'),
    );
  sections.methods = facts(methodFacts, methodUnknowns);
  sections.notifications = facts(
    [
      ...notifications.sent.map((entry) => fact(`sent:${entry.name}`, entry.source, entry)),
      ...notifications.handlers.map((entry) => fact(`handler:${entry.name}`, entry.source, entry)),
    ],
    traceUnknowns(notifications),
  );
  const schemaPath = paths.find((path) => path === 'dbmodel.sql');
  let schema: DatabaseSource | null = null;
  let schemaError: Error | null = null;
  if (schemaPath !== undefined) {
    try {
      schema = { path: schemaPath, text: await read(schemaPath) };
    } catch (error) {
      cancellationCheckpoint(signal);
      schemaError = error instanceof Error ? error : new Error('Schema read failed.');
    }
  }
  const database = auditDatabaseUsage(schema, context.phpSources, signal);
  sections.database = facts(
    [
      ...database.tables.map((entry) => fact(`table:${entry.name}`, schema?.path ?? null, entry)),
      ...database.queries.map((entry, index) =>
        fact(`query:${String(index)}`, entry.source, entry),
      ),
    ],
    [
      ...traceUnknowns(database),
      ...(schemaError === null
        ? []
        : [unknown(schemaPath ?? null, 'Schema file could not be read.')]),
    ],
  );

  // The file reference documents modules as additional code and retained
  // .tpl/.css forms. Inventory is a fact; content interpretation and execution
  // are explicit unknowns. Test names are only a heuristic, owned by BGA-425.
  // https://en.doc.boardgamearena.com/Studio_file_reference
  for (const [id, selected, reason] of [
    [
      'templates',
      paths.filter((path) => path.endsWith('.tpl')),
      'Template contents and dynamic rendering are not normalized.',
    ],
    [
      'styles',
      paths.filter((path) => path.endsWith('.css')),
      'Stylesheet contents and rendered appearance are not normalized.',
    ],
    [
      'modules',
      paths.filter((path) => path.startsWith('modules/')),
      'Module inventory does not establish imports or execution.',
    ],
    [
      'tests',
      paths.filter((path) =>
        /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.[^/]+$/u.test(path),
      ),
      'Heuristic test-file inventory; no tests were executed and runtime coverage is unknown.',
    ],
  ] as const) {
    sections[id] = facts(
      selected.map((path) => ({
        ...fact(path, path, { present: true }),
        certainty: id === 'tests' ? 'possible' : 'certain',
      })),
      [unknown(null, reason)],
    );
  }
  const sourceUnknowns = context.model.diagnostics.findings
    .filter(
      (entry) => entry.code.startsWith('project.source.') && entry.kind === 'unsupported-syntax',
    )
    .flatMap((entry) => entry.locations.map((location) => unknown(location.uri, entry.message)));
  for (const id of ['actions', 'methods', 'notifications', 'database']) {
    const section = sections[id];
    if (section !== undefined)
      sections[id] = facts(section.facts, [...section.unknowns, ...sourceUnknowns]);
  }
  return {
    sections,
    actions,
    notifications,
    database: { audit: database, source: schema, error: schemaError },
  };
}

const MODERN_ROOTS_REQUEST = 'project-roots';

/** A 2026 handler either has a validated root or asks the client for one in-band. */
export type ProjectRootResolution = string | InputRequiredResult;

/** True when a root resolution is the modern multi-round-trip continuation. */
export function isProjectRootInputRequired(resolution: unknown): resolution is InputRequiredResult {
  return (
    typeof resolution === 'object' &&
    resolution !== null &&
    'resultType' in resolution &&
    resolution.resultType === 'input_required'
  );
}

/**
 * Resolves which project a call is about.
 *
 * A developer who configured one root should not have to repeat its absolute
 * path on every call, so an omitted `projectRoot` means that root. With no
 * root, or with several, the server refuses with its existing stable code
 * rather than guessing which project was meant. An explicit root is passed
 * through untouched: the policy boundary, not this function, decides whether
 * it is allowed.
 */
export async function resolveProjectRoot(
  policy: PolicyBoundary,
  projectRoot?: string,
  /** Overrides the ambiguity message for callers that cannot take an argument. */
  ambiguous?: (roots: number) => string,
  signal?: AbortSignal,
): Promise<string> {
  cancellationCheckpoint(signal);
  if (projectRoot !== undefined) {
    return projectRoot;
  }

  // Ask the client for its roots before concluding there are none: for most
  // clients this is what makes --project-root unnecessary.
  await policy.ensureClientRoots(signal === undefined ? {} : { signal });
  cancellationCheckpoint(signal);
  const roots = policy.projectRoots;
  const sole = roots.length === 1 ? roots[0] : undefined;
  if (sole !== undefined) {
    return sole;
  }
  if (roots.length === 0) {
    throw new BgaMcpError(
      ERROR_CODES.policyRootUnconfigured,
      'No project root is configured and the client offered none. Start the server with --project-root <absolute path>, or use a client that advertises its roots.',
    );
  }
  throw new BgaMcpError(
    ERROR_CODES.resourceProjectAmbiguous,
    ambiguous?.(roots.length) ??
      `projectRoot was omitted, but ${String(roots.length)} roots are configured, so the project is ambiguous. Pass the absolute path of the one to inspect.`,
    { details: { configuredRoots: roots.length } },
  );
}

/**
 * Resolves a project root using the protocol-era-appropriate interaction.
 *
 * Legacy connections keep the push-style `roots/list` provider wired by the
 * server. On 2026-07-28 there is no server-to-client request channel: the
 * handler returns `input_required`, the client answers the embedded roots
 * request, and retries this same call with `inputResponses`.
 *
 * A command-line root always wins. Otherwise a modern call asks every time,
 * so a changed set of open folders is observed without hidden session state.
 * The returned file URIs are still resolved and allowlisted by PolicyBoundary;
 * a roots response is input, not authority.
 */
export async function resolveProjectRootForRequest(
  policy: PolicyBoundary,
  projectRoot: string | undefined,
  era: 'legacy' | 'modern',
  context: ServerContext,
  ambiguous?: (roots: number) => string,
  signal?: AbortSignal,
): Promise<ProjectRootResolution> {
  cancellationCheckpoint(signal);
  if (projectRoot !== undefined || era === 'legacy' || policy.config.projectRoots.length > 0) {
    return await resolveProjectRoot(policy, projectRoot, ambiguous, signal);
  }

  const response = inputResponse(context.mcpReq.inputResponses, MODERN_ROOTS_REQUEST);
  if (response.kind === 'missing') {
    const alreadyRetried =
      context.mcpReq.inputResponses !== undefined ||
      context.mcpReq.droppedInputResponseKeys?.includes(MODERN_ROOTS_REQUEST) === true;
    if (alreadyRetried) {
      throw new BgaMcpError(
        ERROR_CODES.policyRootUnconfigured,
        'The client did not supply a usable project-root response. Open a project and retry without projectRoot when the client can complete the roots request, or restart the server with --project-root <absolute path>.',
      );
    }
    return inputRequired({
      inputRequests: {
        [MODERN_ROOTS_REQUEST]: inputRequired.listRoots(),
      },
    });
  }

  if (response.kind !== 'roots') {
    throw new BgaMcpError(
      ERROR_CODES.policyRootUnconfigured,
      'The client answered the project-root request with the wrong response type. Retry without projectRoot in a client that supports the modern roots interaction, or restart the server with --project-root <absolute path>.',
    );
  }

  const offered: string[] = [];
  for (const root of response.roots) {
    cancellationCheckpoint(signal);
    let url: URL;
    try {
      url = new URL(root.uri);
    } catch {
      throw new BgaMcpError(
        ERROR_CODES.policyRootUnconfigured,
        'The client supplied a project root that is not a valid file URI.',
      );
    }
    if (url.protocol !== 'file:') {
      throw new BgaMcpError(
        ERROR_CODES.policyRootUnconfigured,
        'The client supplied a non-file project root. This local server accepts only file roots.',
      );
    }
    offered.push(fileURLToPath(url));
  }

  // Replaces, rather than appends to, the last modern response. This keeps a
  // changed open-folder set from retaining access to a root the client removed.
  policy.setClientRootsProvider(() => Promise.resolve(offered));
  await policy.ensureClientRoots(signal === undefined ? {} : { signal });
  cancellationCheckpoint(signal);
  const roots = policy.projectRoots;
  const sole = roots.length === 1 ? roots[0] : undefined;
  if (sole !== undefined) {
    return sole;
  }
  if (roots.length === 0) {
    throw new BgaMcpError(
      ERROR_CODES.policyRootUnconfigured,
      response.roots.length === 0
        ? 'The client supplied no project roots. Open a project and retry without projectRoot, or restart the server with --project-root <absolute path>.'
        : 'None of the project roots supplied by the client exists and is readable. Fix the open-folder selection and retry, or restart the server with --project-root <absolute path>.',
    );
  }
  throw new BgaMcpError(
    ERROR_CODES.resourceProjectAmbiguous,
    ambiguous?.(roots.length) ??
      `The client supplied ${String(roots.length)} project roots, so the project is ambiguous. Pass projectRoot explicitly.`,
    { details: { configuredRoots: roots.length } },
  );
}

/**
 * Loads a project through the policy boundary.
 *
 * Every capability that needs project content goes through here, so root
 * checks, traversal checks, link handling, and read budgets stay in one place.
 */
export async function loadProjectContext(
  policy: PolicyBoundary,
  projectRoot: string,
  options: {
    readonly withPhpSources?: boolean;
    readonly withClientSources?: boolean;
    /** The deadline's signal, so an expired call stops reading rather than finishing. */
    readonly signal?: AbortSignal;
  } = {},
): Promise<ProjectContext> {
  const listing = await policy.listProjectFiles(projectRoot, {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  // The model reads the game logic to resolve state identifiers and the
  // initial state, and the validators read the same files again. One cache
  // means the second read is free rather than a second trip to disk.
  const read = new Map<string, Promise<string>>();
  const readOnce = async (relativePath: string): Promise<string> => {
    const cached =
      read.get(relativePath) ??
      policy.readProjectFile(projectRoot, relativePath, {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    read.set(relativePath, cached);
    return await cached;
  };

  const model = await buildProjectModel(
    listing,
    { read: readOnce },
    {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );

  const phpSources: PhpSource[] = [];
  const clientSources: PhpSource[] = [];
  const selectedPhp = new Set(
    model.detection.signals.find((entry) => entry.id === 'source.selected.php')?.files ?? [],
  );
  const selectedClient = new Set(
    model.detection.signals.find((entry) => entry.id === 'source.selected.client')?.files ?? [],
  );
  let budget = MAX_SOURCE_BYTES;
  const omitted = new Map<string, { language: string; limit: string; paths: string[] }>();

  for (const file of listing.files) {
    // One check per file: a deadline that expires during a large read set
    // stops here rather than at the end of it.
    cancellationCheckpoint(options.signal);
    // Use the same complete eligibility inventory inspection publishes. Read
    // budgets remain a separate coverage limit, never a hidden source filter.
    const wanted =
      (options.withPhpSources === true && selectedPhp.has(file.path)) ||
      (options.withClientSources === true && selectedClient.has(file.path));
    if (!wanted) continue;
    const limit =
      phpSources.length + clientSources.length >= MAX_SOURCE_FILES
        ? `${String(MAX_SOURCE_FILES)} source-file limit`
        : file.bytes > budget
          ? `${String(MAX_SOURCE_BYTES)}-byte source budget`
          : null;
    if (limit !== null) {
      const language = file.path.endsWith('.php') ? 'php' : 'client';
      const key = `${language}:${limit}`;
      const entry = omitted.get(key) ?? { language, limit, paths: [] };
      entry.paths.push(file.path);
      omitted.set(key, entry);
      // A large source does not prevent later, smaller sources from fitting.
      // The bounded listing still bounds this pass; skipped bodies are not read.
      continue;
    }
    budget -= file.bytes;
    const source = { path: file.path, text: await readOnce(file.path) };
    if (file.path.endsWith('.php')) {
      phpSources.push(source);
    } else {
      clientSources.push(source);
    }
  }

  const limits = [...omitted.values()].map(({ language, limit, paths }) => {
    cancellationCheckpoint(options.signal);
    const construct = `${String(paths.length)} eligible ${language} source file(s) omitted by the ${limit}`;
    return {
      ...unsupportedSyntaxFinding({
        code: 'project.source.read-limit',
        construct,
        language,
        uri: null,
        message: `${construct}. Contract coverage is incomplete; absence in the files read is not evidence of absence in the project.`,
        suggestion:
          'Inspect a separately identified, narrower canonical project root and retain the omitted-source coverage limit; Git ignore rules do not select game code.',
      }),
      locations: paths.map((uri) => {
        cancellationCheckpoint(options.signal);
        return { uri };
      }),
    };
  });
  const context: ProjectContext = {
    model:
      limits.length === 0
        ? model
        : {
            ...model,
            diagnostics: summarizeFindings(
              [...model.diagnostics.findings, ...limits],
              options.signal,
            ),
          },
    phpSources,
    clientSources,
  };
  const normalized = await normalizeContext(
    context,
    listing.files.map((file) => file.path),
    readOnce,
    options.signal,
  );
  const signals = Object.entries(normalized.sections).map(([id, section]) => ({
    id: `normalized.${id}`,
    description: `${String(section.facts.length)} normalized source fact(s); ${String(section.unknowns.length)} unknown(s). Facts reflect bounded listed/read source; absence is not a complete-project verdict. ${[...new Set(section.unknowns.map((entry) => entry.reason))].join(' ')}`,
    matched: section.facts.length > 0,
    files: [
      ...new Set(
        [
          ...section.facts.flatMap((entry) => entry.sources),
          ...section.unknowns.map((entry) => entry.source),
        ].filter((path): path is string => path !== null),
      ),
    ],
  }));
  const result = {
    ...context,
    model: {
      ...context.model,
      detection: {
        ...context.model.detection,
        signals: [...context.model.detection.signals, ...signals],
      },
    },
  };
  normalizedProjects.set(result, normalized);
  return result;
}
