import { constants as oConstants } from 'node:fs';
import { lstat, open, readFile, readdir, realpath } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { lookup as dnsLookup } from 'node:dns';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { createGuardedLookup } from './docs/addresses.js';
import { readBoundedUtf8 } from './docs/read.js';
import { describeRequestContentViolation, requestContentViolation } from './docs/request.js';
import {
  parseDocumentationCatalog,
  sourceById,
  sourceForUrl,
  type DocumentationCatalog,
  type DocumentationSource,
} from './docs/catalog.js';
import { ERROR_CODES, PolicyViolationError } from './errors.js';
import { MINIMUM_OUTPUT_BYTES } from './publish.js';
import { MIN_REDACTED_SECRET_LENGTH, redactPath } from './redaction.js';

export const DEFAULT_OPERATION_TIMEOUT_MS = 10_000;
export const MAX_OPERATION_TIMEOUT_MS = 600_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
export const MAX_OUTPUT_BYTES_LIMIT = 33_554_432;

export interface PolicyConfig {
  /** Local roots the server may read. Empty means every project operation is denied. */
  readonly projectRoots: readonly string[];
  /** Studio project identifiers that a mutation may target. */
  readonly remoteProjects: readonly string[];
  readonly operationTimeoutMs: number;
  readonly maxOutputBytes: number;
  readonly networkEnabled: boolean;
  readonly mutationsEnabled: boolean;
  /** Experimental Studio log reading. Off unless asked for. */
  readonly experimentalStudioLogs: boolean;
  /** File holding the Studio session, for setups that would rather not use an environment variable. */
  readonly studioSessionFile?: string;
  /**
   * Studio dev accounts the developer owns.
   *
   * The log reader returns lines about these accounts and nothing else, so an
   * empty list means it returns nothing at all.
   */
  readonly studioDevAccounts: readonly string[];
}

/** Local, read-only, and network-off. Every relaxation must be configured explicitly. */
export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  projectRoots: [],
  remoteProjects: [],
  operationTimeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
  maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  networkEnabled: false,
  mutationsEnabled: false,
  experimentalStudioLogs: false,
  studioDevAccounts: [],
};

export const DEFAULT_MAX_LISTED_FILES = 5_000;
export const DEFAULT_MAX_LIST_DEPTH = 12;

export interface ProjectFile {
  /** Root-relative path with forward slashes on every platform. */
  readonly path: string;
  readonly bytes: number;
}

export interface ProjectListing {
  readonly root: string;
  readonly files: readonly ProjectFile[];
  /** Links found inside the root. They are reported, never followed. */
  readonly skippedLinks: readonly string[];
  /** Directories the process may not read. Reported, so nothing is silently absent. */
  readonly unreadablePaths: readonly string[];
  readonly truncated: boolean;
}

/** Whether a filesystem error is the operating system refusing access. */
function isPermissionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'EACCES' || code === 'EPERM';
}

/** Configuration files the package ships and may read for itself. */
export const PACKAGED_CONFIG_NAMES = ['rule-catalog.json', 'doc-sources.json'] as const;

export type PackagedConfigName = (typeof PACKAGED_CONFIG_NAMES)[number];

/** Hops allowed before a redirect chain is treated as a loop. */
export const MAX_DOCUMENTATION_REDIRECTS = 3;

/** Ceiling on a retrieved page, independent of the output budget. */
export const MAX_DOCUMENTATION_BYTES = 524_288;

export interface DocumentationRequest {
  /** A source identifier from the reviewed catalog. */
  readonly sourceId: string;
  /** A page path within that source. Never a full URL, so the host cannot move. */
  readonly path: string;
  /** The client's explicit query, when the lookup is a search. */
  readonly query?: string;
  /** Query-string parameters. Every value is checked like the query itself. */
  readonly params?: Readonly<Record<string, string>>;
}

export interface DocumentationResponse {
  readonly sourceId: string;
  readonly authority: string;
  /** The URL finally retrieved, after any allowed redirects. */
  readonly url: string;
  readonly status: number;
  readonly body: string;
  readonly bytes: number;
  readonly retrievedAt: string;
  /** The source's own last-modified signal, when it publishes one. */
  readonly lastModified: string | null;
  readonly redirects: readonly string[];
}

/** The documented Studio host. Not configurable: it is the only one allowed. */
export const STUDIO_HOST = 'studio.boardgamearena.com';

/**
 * The most a Studio session file may hold.
 *
 * A `Cookie` request header for one host is a few hundred bytes. Anything much
 * larger is a different file, and reading it into memory to find that out is
 * how a credential provider becomes a way to read arbitrary files.
 */
export const MAX_SESSION_FILE_BYTES = 4_096;

/** Environment variable carrying the developer's own Studio session cookie. */
export const STUDIO_SESSION_ENV = 'BGA_STUDIO_SESSION';

/**
 * Says how to obtain a session, rather than only that one is missing.
 *
 * A refusal that names an environment variable and stops assumes the reader
 * already knows what to put in it. This one does not.
 */
export function missingSessionMessage(): string {
  return [
    'No Studio session.',
    `Set ${STUDIO_SESSION_ENV}, or point --studio-session-file at a file containing it.`,
    'To get the value: sign in to https://studio.boardgamearena.com in a browser, open developer tools,',
    'find any request to that host, and copy its entire Cookie request header.',
    'Run `bga-mcp --studio-check <gameId>` to confirm it works before wiring it into a client.',
    'It is never accepted as a tool argument, so it stays out of the client transcript.',
  ].join(' ');
}

export interface StudioPageRequest {
  /** Path on the Studio host. Built by the caller from fixed strings. */
  readonly path: string;
  readonly params?: Readonly<Record<string, string>>;
}

export interface StudioPageResponse {
  readonly url: string;
  readonly status: number;
  readonly body: string;
  readonly retrievedAt: string;
}

export type MutationMode = 'preview' | 'execute';

export interface MutationRequest {
  readonly mode: MutationMode;
  /** The client must repeat the exact target it intends to change. */
  readonly confirmedTarget?: string;
}

function assertPositiveInteger(name: string, value: number, maximum: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new PolicyViolationError(
      ERROR_CODES.configInvalid,
      `${name} must be an integer between 1 and ${String(maximum)}.`,
      { details: { setting: name } },
    );
  }
}

/**
 * The parts of one `name=value` cookie pair that could be published alone.
 *
 * A pair, its name, and its value are three different strings that all reveal
 * the same credential, so all three are registered.
 */
function sessionFragments(pair: string): string[] {
  const trimmed = pair.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const separator = trimmed.indexOf('=');
  if (separator < 0) {
    return [trimmed];
  }
  return [trimmed, trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()];
}

function normalize(path: string): string {
  const resolved = resolve(path);
  return resolved.length > 1 && resolved.endsWith(sep) ? resolved.slice(0, -sep.length) : resolved;
}

function contains(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return difference === '' || (!difference.startsWith('..') && !isAbsolute(difference));
}

/**
 * The single gate between client input and any privileged effect.
 *
 * Every capability must obtain filesystem paths, remote targets, network
 * permission, mutation permission, timeouts, and output budget from this class.
 * Nothing here is best-effort: an unconfigured or ambiguous request fails.
 */
export class PolicyBoundary {
  readonly #config: PolicyConfig;
  readonly #resolvedRoots: readonly string[];
  /** Roots the client offered, resolved and checked exactly like configured ones. */
  #clientRoots: readonly string[] = [];
  /** Dev accounts supplied during the session, alongside configured ones. */
  #askedStudioAccounts: readonly string[] = [];
  #requestClientRoots: (() => Promise<readonly string[]>) | undefined;
  #clientRootsFetched = false;
  /** The reviewed documentation catalog, read once and kept for the process. */
  #catalog: DocumentationCatalog | undefined;
  /**
   * Every session value this process has resolved, in every spelling it could
   * be published in. Added to, never removed from: a credential that was once
   * sent stays worth removing from output for the life of the process.
   */
  readonly #sessionSecrets = new Set<string>();
  /** Why a configured session file was refused, so a diagnostic can say so without its path. */
  #sessionRefusal: string | null = null;

  private constructor(config: PolicyConfig, resolvedRoots: readonly string[]) {
    this.#config = config;
    this.#resolvedRoots = resolvedRoots;
  }

  /**
   * Validates configuration and resolves every root through the filesystem so
   * later containment checks compare real locations rather than symlinks.
   */
  static async create(config: PolicyConfig): Promise<PolicyBoundary> {
    assertPositiveInteger(
      'operationTimeoutMs',
      config.operationTimeoutMs,
      MAX_OPERATION_TIMEOUT_MS,
    );
    assertPositiveInteger('maxOutputBytes', config.maxOutputBytes, MAX_OUTPUT_BYTES_LIMIT);
    if (config.maxOutputBytes < MINIMUM_OUTPUT_BYTES) {
      // A budget under this cannot hold the shortest failure this server can
      // produce, so every call would be refused and every refusal refused in
      // turn. Failing at startup says that once, instead of at every call.
      throw new PolicyViolationError(
        ERROR_CODES.configInvalid,
        `maxOutputBytes must be at least ${String(MINIMUM_OUTPUT_BYTES)}, which is the smallest failure this server can publish.`,
        { details: { setting: 'maxOutputBytes', minimum: MINIMUM_OUTPUT_BYTES } },
      );
    }

    for (const remote of config.remoteProjects) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(remote)) {
        throw new PolicyViolationError(
          ERROR_CODES.configInvalid,
          'A remote project identifier must be alphanumeric with underscores or hyphens.',
          { details: { setting: 'remoteProjects' } },
        );
      }
    }

    const resolvedRoots: string[] = [];
    for (const root of config.projectRoots) {
      if (!isAbsolute(root)) {
        throw new PolicyViolationError(
          ERROR_CODES.configInvalid,
          'A project root must be an absolute path.',
          { details: { setting: 'projectRoots' } },
        );
      }
      try {
        resolvedRoots.push(normalize(await realpath(root)));
      } catch (cause) {
        throw new PolicyViolationError(
          ERROR_CODES.policyRootUnavailable,
          'A configured project root does not exist or is not readable.',
          { details: { root: redactPath(root) }, cause },
        );
      }
    }

    const boundary = new PolicyBoundary(config, resolvedRoots);
    // Resolved once here so the credential is registered for redaction before
    // this server can publish anything at all, rather than at whichever call
    // happens to need it first. A file that appears later is still read then;
    // this is registration, not a cache.
    await boundary.studioSession();
    return boundary;
  }

  get config(): PolicyConfig {
    return this.#config;
  }

  /**
   * Lets the transport supply roots the client advertises.
   *
   * The provider is set by the server factory rather than by configuration,
   * because whether a client can offer roots is a property of the connection.
   */
  setClientRootsProvider(provider: () => Promise<readonly string[]>): void {
    this.#requestClientRoots = provider;
    this.#clientRootsFetched = false;
  }

  /**
   * Records dev accounts the developer supplied when asked.
   *
   * They are session state, not configuration: nothing is written anywhere,
   * and a restart asks again. The privacy rule reads this list exactly as it
   * reads the configured one, so an account supplied here is not trusted more
   * than one passed on the command line.
   */
  rememberStudioAccounts(accounts: readonly string[]): void {
    this.#askedStudioAccounts = [
      ...this.#askedStudioAccounts,
      ...accounts.filter((account) => !this.#askedStudioAccounts.includes(account)),
    ];
  }

  /** Configured accounts plus any supplied during this session. */
  get studioDevAccounts(): readonly string[] {
    return [
      ...this.#config.studioDevAccounts,
      ...this.#askedStudioAccounts.filter(
        (account) => !this.#config.studioDevAccounts.includes(account),
      ),
    ];
  }

  /** Forgets adopted roots, so the next use asks the client again. */
  invalidateClientRoots(): void {
    this.#clientRoots = [];
    this.#clientRootsFetched = false;
  }

  /**
   * Adopts the client's roots, once per connection unless invalidated.
   *
   * A client-offered root is not trusted more than a configured one: each is
   * resolved through the filesystem and checked the same way, and one that
   * cannot be resolved is dropped rather than failing the others. A client
   * that offers nothing, or a provider that fails, leaves the configured roots
   * exactly as they were.
   */
  async ensureClientRoots(): Promise<void> {
    if (this.#requestClientRoots === undefined || this.#clientRootsFetched) {
      return;
    }
    this.#clientRootsFetched = true;
    let offered: readonly string[];
    try {
      offered = await this.#requestClientRoots();
    } catch {
      // A client that cannot answer is a client without roots, not an error.
      return;
    }

    const adopted: string[] = [];
    for (const candidate of offered) {
      try {
        const resolved = await realpath(normalize(candidate));
        if (!adopted.includes(resolved)) {
          adopted.push(resolved);
        }
      } catch {
        // A root that does not exist is skipped, exactly as a configured one
        // would be refused at startup.
      }
    }
    this.#clientRoots = adopted;
  }

  /** Real, existing project roots in configuration order. */
  get projectRoots(): readonly string[] {
    // Configured roots first: an explicit argument outranks what a client
    // happened to have open.
    return [
      ...this.#resolvedRoots,
      ...this.#clientRoots.filter((root) => !this.#resolvedRoots.includes(root)),
    ];
  }

  /** Redaction options that keep in-root paths readable and hide everything else. */
  get redactionOptions(): {
    readonly projectRoots: readonly string[];
    readonly homeDirectory: string | undefined;
    readonly secretValues: readonly string[];
  } {
    // The Studio session is the one credential this process holds, so it is
    // removed from every published error, result, and log line by value rather
    // than by shape. Every provider registers here — reading the environment
    // alone is exactly the defect the 2026-08-08 review found, and it left a
    // file-sourced session unprotected while it was being sent.
    this.#normalizeSession(process.env[STUDIO_SESSION_ENV]);
    const home = process.env.HOME ?? process.env.USERPROFILE;
    return {
      projectRoots: this.projectRoots,
      // Whose machine this is, for the publication paths that replace known
      // locations by value rather than anything shaped like a path.
      homeDirectory: home === undefined || home.length === 0 ? undefined : home,
      secretValues: [...this.#sessionSecrets],
    };
  }

  /** Accepts a client-supplied project root only when it is explicitly allowed. */
  async resolveProjectRoot(candidate: string): Promise<string> {
    // A client that advertises roots is asked before anything is refused for
    // want of one.
    await this.ensureClientRoots();
    const allowed = this.projectRoots;
    if (allowed.length === 0) {
      throw new PolicyViolationError(
        ERROR_CODES.policyRootUnconfigured,
        'No project root is configured, and the client offered none. Start the server with --project-root, or use a client that advertises its roots.',
      );
    }

    let resolved: string;
    try {
      resolved = normalize(await realpath(candidate));
    } catch (cause) {
      throw new PolicyViolationError(
        ERROR_CODES.policyPathNotFound,
        'The requested project root does not exist.',
        { details: { path: redactPath(candidate, this.redactionOptions) }, cause },
      );
    }

    const match = allowed.find((root) => root === resolved);
    if (match === undefined) {
      throw new PolicyViolationError(
        ERROR_CODES.policyRootNotAllowed,
        'The requested project root is not one of the configured roots.',
        { details: { path: redactPath(resolved, this.redactionOptions) } },
      );
    }
    return match;
  }

  /**
   * Resolves a path inside an allowed root.
   *
   * Traversal is rejected lexically, and the resolved location is re-checked
   * after the filesystem follows symlinks so a link cannot escape the root.
   */
  async resolveWithinProject(root: string, relativePath: string): Promise<string> {
    const allowedRoot = await this.resolveProjectRoot(root);

    const segments = relativePath.split(/[\\/]/u);
    if (
      relativePath === '' ||
      isAbsolute(relativePath) ||
      /^[A-Za-z]:/u.test(relativePath) ||
      relativePath.includes('\0') ||
      segments.some((segment) => segment === '..')
    ) {
      throw new PolicyViolationError(
        ERROR_CODES.policyPathTraversal,
        'A project path must be relative and must stay inside its project root.',
        { details: { requestedPath: relativePath.replaceAll('\0', '') } },
      );
    }

    const candidate = join(allowedRoot, ...segments.filter((segment) => segment !== '.'));
    let resolved: string;
    try {
      resolved = normalize(await realpath(candidate));
    } catch (cause) {
      throw new PolicyViolationError(
        ERROR_CODES.policyPathNotFound,
        'The requested project file does not exist.',
        { details: { requestedPath: relativePath }, cause },
      );
    }

    if (!contains(allowedRoot, resolved)) {
      throw new PolicyViolationError(
        ERROR_CODES.policyPathSymlinkEscape,
        'The requested project file resolves outside its project root.',
        { details: { requestedPath: relativePath } },
      );
    }
    return resolved;
  }

  /**
   * Lists readable files inside an allowed root.
   *
   * Symlinks are never followed: an entry that is a link is skipped and
   * reported, so a link cannot widen the set of files a capability can see.
   * Listing stops at the entry and depth budget rather than walking forever.
   */
  async listProjectFiles(
    root: string,
    options: { readonly maxEntries?: number; readonly maxDepth?: number } = {},
  ): Promise<ProjectListing> {
    const allowedRoot = await this.resolveProjectRoot(root);
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_LISTED_FILES;
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_LIST_DEPTH;
    assertPositiveInteger('maxEntries', maxEntries, DEFAULT_MAX_LISTED_FILES);
    assertPositiveInteger('maxDepth', maxDepth, DEFAULT_MAX_LIST_DEPTH);

    const files: ProjectFile[] = [];
    const skippedLinks: string[] = [];
    const unreadablePaths: string[] = [];
    let truncated = false;

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (truncated) {
        return;
      }
      if (depth > maxDepth) {
        truncated = true;
        return;
      }
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        // A directory the process may not read is a fact about the project,
        // not a failure of the server. It is recorded by its project-relative
        // path so the caller knows what was left out, and the rest is read.
        if (!isPermissionError(error)) {
          throw error;
        }
        unreadablePaths.push(relative(allowedRoot, directory).split(sep).join('/') || '.');
        return;
      }
      for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
        const absolute = join(directory, entry.name);
        const portable = relative(allowedRoot, absolute).split(sep).join('/');
        if (entry.isSymbolicLink()) {
          skippedLinks.push(portable);
          continue;
        }
        if (entry.isDirectory()) {
          await walk(absolute, depth + 1);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        if (files.length >= maxEntries) {
          truncated = true;
          return;
        }
        files.push({ path: portable, bytes: (await lstat(absolute)).size });
      }
    };

    await walk(allowedRoot, 1);
    return { root: allowedRoot, files, skippedLinks, unreadablePaths, truncated };
  }

  /** Reads one file inside an allowed root, refusing anything above the byte budget. */
  async readProjectFile(
    root: string,
    relativePath: string,
    options: { readonly maxBytes?: number } = {},
  ): Promise<string> {
    const resolved = await this.resolveWithinProject(root, relativePath);
    const maxBytes = options.maxBytes ?? this.#config.maxOutputBytes;
    assertPositiveInteger('maxBytes', maxBytes, MAX_OUTPUT_BYTES_LIMIT);

    const info = await lstat(resolved);
    if (!info.isFile()) {
      throw new PolicyViolationError(
        ERROR_CODES.policyPathNotFound,
        'The requested project path is not a regular file.',
        { details: { requestedPath: relativePath } },
      );
    }
    if (info.size > maxBytes) {
      throw new PolicyViolationError(
        ERROR_CODES.policyOutputTooLarge,
        `The file is ${String(info.size)} bytes, above the ${String(maxBytes)} byte read limit.`,
        { details: { requestedPath: relativePath, bytes: info.size, maxBytes } },
      );
    }
    return await readFile(resolved, 'utf8');
  }

  /**
   * Reads a configuration file the package ships with itself.
   *
   * This is not project content and never comes from client input: the name
   * must be one of a fixed set, and the file is read from the package's own
   * config directory. It lives here so that every filesystem read in the
   * server still passes through this class.
   */
  async readPackagedConfig(name: PackagedConfigName): Promise<string> {
    if (!PACKAGED_CONFIG_NAMES.includes(name)) {
      throw new PolicyViolationError(
        ERROR_CODES.configInvalid,
        'That configuration file is not part of the package.',
        { details: { requested: name } },
      );
    }
    return await readFile(resolve(import.meta.dirname, '../config', name), 'utf8');
  }

  assertRemoteProjectAllowed(identifier: string): void {
    if (!this.#config.remoteProjects.includes(identifier)) {
      throw new PolicyViolationError(
        ERROR_CODES.policyRemoteNotAllowed,
        'The requested Studio project is not allowlisted.',
        { details: { remoteProject: identifier } },
      );
    }
  }

  assertNetworkAllowed(purpose: string): void {
    if (!this.#config.networkEnabled) {
      throw new PolicyViolationError(
        ERROR_CODES.policyNetworkDisabled,
        'Network access is disabled. Start the server with --allow-network to enable it.',
        { details: { purpose } },
      );
    }
  }

  /** Requires both a configured mutation permission and an explicit execution request. */
  assertMutationAllowed(request: MutationRequest, target: string): void {
    if (!this.#config.mutationsEnabled) {
      throw new PolicyViolationError(
        ERROR_CODES.policyMutationDisabled,
        'Mutations are disabled. Start the server with --allow-mutations to enable them.',
        { details: { target } },
      );
    }
    if (request.mode !== 'execute' || request.confirmedTarget !== target) {
      throw new PolicyViolationError(
        ERROR_CODES.policyMutationNotRequested,
        'A mutation requires mode "execute" and a confirmedTarget equal to the target.',
        { details: { target, mode: request.mode } },
      );
    }
  }

  /**
   * Retrieves one documentation page from an allowlisted source.
   *
   * This is the only outbound request the server makes, and every precondition
   * the documentation boundary review recorded is enforced here rather than in
   * a caller:
   *
   * - **Allowlist** — the source must be in the reviewed catalog, the scheme
   *   must be HTTPS, and the URL is built here from a source identifier and a
   *   page path, so a caller cannot name a host at all.
   * - **Address** — every resolved address is checked and the connection is
   *   pinned to the address that was checked, so an allowlisted name that
   *   answers with `127.0.0.1` reaches nothing.
   * - **Request content** — the query must look like something a developer
   *   typed, never a path or a fragment of their source.
   * - **Budget** — the response is bounded in bytes and in time, and a redirect
   *   chain is bounded in hops with every hop re-checked against the allowlist.
   *
   * Network access is off unless configured, so with no `--allow-network` this
   * refuses before it resolves anything.
   */
  async fetchDocumentation(
    request: DocumentationRequest,
    options: { readonly signal?: AbortSignal; readonly maxBytes?: number } = {},
  ): Promise<DocumentationResponse> {
    this.assertNetworkAllowed('documentation');

    const catalog = await this.#documentationCatalog();
    const source = sourceById(catalog, request.sourceId);
    if (source === null) {
      throw new PolicyViolationError(
        ERROR_CODES.policyDocSourceNotAllowed,
        'That documentation source is not in the reviewed catalog.',
        { details: { sourceId: request.sourceId } },
      );
    }

    // Everything that will appear in the URL is checked, not just the query
    // field: a parameter is as good a place to hide a file path as any.
    for (const value of [request.query, ...Object.values(request.params ?? {})]) {
      if (value === undefined) {
        continue;
      }
      const violation = requestContentViolation(value, this.#resolvedRoots);
      if (violation !== null) {
        throw new PolicyViolationError(
          ERROR_CODES.policyDocRequestContent,
          `The documentation request was refused because ${describeRequestContentViolation(violation)}.`,
          { details: { sourceId: source.id, violation } },
        );
      }
    }

    const target = this.#documentationUrl(source, request);
    const maxBytes = Math.min(options.maxBytes ?? MAX_DOCUMENTATION_BYTES, MAX_DOCUMENTATION_BYTES);
    const redirects: string[] = [];
    let current = target;

    for (let hop = 0; hop <= MAX_DOCUMENTATION_REDIRECTS; hop += 1) {
      // Every hop is re-checked: a redirect off the allowlist is refused, not
      // followed, because the first response is attacker-influenced too.
      const hopSource = sourceForUrl(catalog, current);
      if (hopSource === null) {
        throw new PolicyViolationError(
          ERROR_CODES.policyDocSourceNotAllowed,
          'The documentation request left the allowlisted sources.',
          { details: { url: current.href, redirects: redirects.length } },
        );
      }

      const result = await this.#sendGuardedRequest(current, maxBytes, options.signal, {
        // Identifies this project honestly, as the source catalog requires.
        'user-agent': hopSource.retrieval.userAgent,
        accept: 'text/html,text/plain',
        'accept-encoding': 'identity',
      });
      if (result.location === null) {
        return {
          sourceId: source.id,
          authority: source.authority,
          url: current.href,
          status: result.status,
          body: result.body,
          bytes: Buffer.byteLength(result.body, 'utf8'),
          retrievedAt: new Date().toISOString(),
          lastModified: result.lastModified,
          redirects,
        };
      }

      redirects.push(current.href);
      let next: URL;
      try {
        next = new URL(result.location, current);
      } catch {
        throw new PolicyViolationError(
          ERROR_CODES.policyDocFetchFailed,
          'The documentation source returned an unusable redirect.',
          { details: { url: current.href } },
        );
      }
      current = next;
    }

    throw new PolicyViolationError(
      ERROR_CODES.policyDocFetchFailed,
      `The documentation request exceeded ${String(MAX_DOCUMENTATION_REDIRECTS)} redirects.`,
      { details: { url: target.href, redirects: redirects.length } },
    );
  }

  /** Builds the URL from catalog data and a page path, never from a caller's host. */
  #documentationUrl(source: DocumentationSource, request: DocumentationRequest): URL {
    if (/[^A-Za-z0-9._~:@!$'()*+,;=/%-]/u.test(request.path) || request.path.includes('..')) {
      throw new PolicyViolationError(
        ERROR_CODES.policyDocSourceNotAllowed,
        'The documentation page path contains characters that are not allowed.',
        { details: { sourceId: source.id, path: request.path } },
      );
    }
    // A protocol-relative or absolute path would re-point the request, so the
    // path must be relative to the source and stay inside it.
    if (request.path.startsWith('/') || request.path.includes('//')) {
      throw new PolicyViolationError(
        ERROR_CODES.policyDocSourceNotAllowed,
        'The documentation page path must be relative to its source.',
        { details: { sourceId: source.id, path: request.path } },
      );
    }
    const base = new URL(source.canonicalUrl);
    const url = new URL(request.path, base);
    for (const [name, value] of Object.entries(request.params ?? {})) {
      url.searchParams.set(name, value);
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname !== source.host ||
      !url.href.startsWith(source.canonicalUrl)
    ) {
      throw new PolicyViolationError(
        ERROR_CODES.policyDocSourceNotAllowed,
        'The documentation request did not stay within its source.',
        { details: { sourceId: source.id, url: url.href } },
      );
    }
    return url;
  }

  /** One HTTPS request, pinned to a checked address and bounded in size. */
  async #sendGuardedRequest(
    url: URL,
    maxBytes: number,
    signal: AbortSignal | undefined,
    headers: Readonly<Record<string, string>>,
  ): Promise<{
    readonly status: number;
    readonly body: string;
    readonly location: string | null;
    readonly lastModified: string | null;
  }> {
    // The lookup both checks and pins: the address the guard approved is the
    // address the socket connects to, so a second DNS answer cannot be
    // substituted between the check and the connection.
    const guarded = createGuardedLookup(
      (hostname, callback) => {
        dnsLookup(hostname, { all: true }, (error, addresses) => {
          callback(error, error === null ? addresses : []);
        });
      },
      (hostname, reason) =>
        new PolicyViolationError(
          ERROR_CODES.policyDocAddressBlocked,
          `The documentation host resolved to a ${reason} address, which is refused.`,
          { details: { host: hostname, reason } },
        ),
    );
    const guardedLookup: LookupFunction = (hostname, options, callback) => {
      guarded(hostname, (error, address, family) => {
        if (error !== null) {
          (callback as (error: Error) => void)(error);
          return;
        }
        // Node asks for either one address or all of them, and answering in
        // the wrong shape fails the connection with "Invalid IP address".
        // Only a real connection exercises this, which is why it survived
        // every offline test until the first live run.
        if (typeof options === 'object' && options.all === true) {
          (
            callback as unknown as (
              error: null,
              addresses: { address: string; family: number }[],
            ) => void
          )(null, [{ address, family }]);
          return;
        }
        callback(null, address, family);
      });
    };

    return await new Promise((resolveRequest, rejectRequest) => {
      const outgoing = httpsRequest(
        url,
        {
          method: 'GET',
          lookup: guardedLookup,
          headers,
          ...(signal === undefined ? {} : { signal }),
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location ?? null;
          const lastModified = response.headers['last-modified'] ?? null;
          if (status >= 300 && status < 400 && location !== null) {
            response.resume();
            resolveRequest({ status, body: '', location, lastModified: null });
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            rejectRequest(
              new PolicyViolationError(
                ERROR_CODES.policyDocFetchFailed,
                `The documentation source answered ${String(status)}.`,
                { details: { url: url.href, status } },
              ),
            );
            return;
          }

          void readBoundedUtf8(
            response,
            maxBytes,
            (bytes, limit) =>
              new PolicyViolationError(
                ERROR_CODES.policyOutputTooLarge,
                `The documentation page is larger than the ${String(limit)} byte limit.`,
                { details: { url: url.href, bytes, maxBytes: limit } },
              ),
          ).then(
            (body) => {
              resolveRequest({
                status,
                body,
                location: null,
                lastModified: typeof lastModified === 'string' ? lastModified : null,
              });
            },
            (error: unknown) => {
              rejectRequest(
                error instanceof Error
                  ? error
                  : new PolicyViolationError(
                      ERROR_CODES.policyDocFetchFailed,
                      'The documentation response could not be read.',
                      { details: { url: url.href } },
                    ),
              );
            },
          );
        },
      );

      outgoing.once('error', (error: unknown) => {
        if (error instanceof PolicyViolationError) {
          rejectRequest(error);
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        rejectRequest(
          new PolicyViolationError(
            ERROR_CODES.policyDocFetchFailed,
            'The documentation request could not be completed.',
            { details: { url: url.href, reason: message } },
          ),
        );
      });
      outgoing.end();
    });
  }

  /**
   * Retrieves one page from the developer's own Studio session.
   *
   * Experimental, and narrower than the documentation fetch in every way that
   * matters. The host is fixed rather than configurable — there is exactly one
   * Studio and a caller cannot name another. The session comes from the
   * environment, never from a tool argument, so it stays out of the client's
   * transcript. The same address guard and response budget apply, because a
   * hostile DNS answer is a hostile DNS answer whoever asked.
   *
   * This is the capability built on an undocumented page, so it refuses unless
   * it was asked for explicitly with `--experimental-studio-logs`.
   */
  async fetchStudioPage(
    request: StudioPageRequest,
    options: { readonly signal?: AbortSignal; readonly maxBytes?: number } = {},
  ): Promise<StudioPageResponse> {
    const session = await this.assertStudioAvailable();

    if (
      request.path.startsWith('/') ||
      request.path.includes('//') ||
      request.path.includes('..')
    ) {
      throw new PolicyViolationError(
        ERROR_CODES.policyStudioNotAllowed,
        'The Studio page path must be relative and must not traverse.',
        { details: { path: request.path } },
      );
    }

    const url = new URL(request.path, `https://${STUDIO_HOST}/`);
    for (const [name, value] of Object.entries(request.params ?? {})) {
      const violation = requestContentViolation(value, this.#resolvedRoots);
      if (violation !== null) {
        throw new PolicyViolationError(
          ERROR_CODES.policyDocRequestContent,
          `The Studio request was refused because ${describeRequestContentViolation(violation)}.`,
          { details: { violation } },
        );
      }
      url.searchParams.set(name, value);
    }
    if (url.hostname !== STUDIO_HOST || url.protocol !== 'https:') {
      throw new PolicyViolationError(
        ERROR_CODES.policyStudioNotAllowed,
        'The Studio request did not stay on the Studio host.',
        { details: { url: url.href } },
      );
    }

    const maxBytes = Math.min(options.maxBytes ?? MAX_DOCUMENTATION_BYTES, MAX_DOCUMENTATION_BYTES);
    const result = await this.#sendGuardedRequest(url, maxBytes, options.signal, {
      'user-agent': 'bga-mcp (+https://github.com/Brandon-Born/bga-mcp)',
      accept: 'text/html',
      'accept-encoding': 'identity',
      cookie: session,
    });
    if (result.location !== null) {
      // A redirect from Studio usually means the session expired and the page
      // is bouncing to a login. Following it would post a stale cookie around.
      throw new PolicyViolationError(
        ERROR_CODES.policyStudioNoSession,
        'Studio redirected the request, which usually means the session has expired. Refresh it and try again.',
        { details: { url: url.href } },
      );
    }
    return {
      url: url.href,
      status: result.status,
      body: result.body,
      retrievedAt: new Date().toISOString(),
    };
  }

  /**
   * Checks the gates that must hold before Studio is touched at all.
   *
   * Separate from the fetch so a caller can refuse for the right reason before
   * doing anything else — asking a developer for their dev accounts when the
   * capability is switched off would be asking for something useless.
   */
  async assertStudioAvailable(): Promise<string> {
    this.assertNetworkAllowed('studio');
    if (!this.#config.experimentalStudioLogs) {
      throw new PolicyViolationError(
        ERROR_CODES.policyStudioDisabled,
        'Studio access is experimental and disabled. Start the server with --experimental-studio-logs to enable it.',
      );
    }
    const session = await this.studioSession();
    if (session === null) {
      throw new PolicyViolationError(ERROR_CODES.policyStudioNoSession, missingSessionMessage());
    }
    return session;
  }

  /**
   * Reads the Studio session, from a file when one is configured.
   *
   * Either way it comes from the operator's machine and never from a tool
   * argument. The file exists because pasting a cookie into an MCP client's
   * launcher configuration means it lives in that file, in that client's
   * backups, and often in a repository.
   *
   * ## Precedence
   *
   * `--studio-session-file` wins over `BGA_STUDIO_SESSION`, and a configured
   * file that is missing, empty, or unreadable means no session rather than a
   * quiet fall back to the environment. Explicit configuration that fails
   * should say so; silently sending a different credential than the one the
   * operator named is the worse answer.
   *
   * ## Registration
   *
   * The value is normalized in one place and registered for redaction in the
   * same step that returns it, so the value actually sent and the value
   * protected cannot differ. The 2026-08-08 review found them differing: a
   * file-sourced session was resolved and sent while the redaction list, which
   * read only the environment, stayed empty.
   */
  async studioSession(options: { readonly signal?: AbortSignal } = {}): Promise<string | null> {
    const file = this.#config.studioSessionFile;
    if (file !== undefined) {
      const read = await this.#readSessionFile(file, options.signal);
      this.#sessionRefusal = read.refusedBecause;
      return read.session === null ? null : this.#normalizeSession(read.session);
    }
    this.#sessionRefusal = null;
    return this.#normalizeSession(process.env[STUDIO_SESSION_ENV]);
  }

  /**
   * Why a configured session file was refused, when one was.
   *
   * A reason without the path: a developer who set the mode wrong needs to know
   * that, and nobody needs the location of their credential repeated back to
   * them in a terminal an agent may be reading.
   */
  get studioSessionRefusal(): string | null {
    return this.#sessionRefusal;
  }

  /**
   * Reads a session file, refusing anything that is not a small regular file
   * only its owner can read.
   *
   * The 2026-08-08 review found an unbounded `readFile` on whatever path was
   * configured: a directory, a device, a FIFO that never answers, a symlink
   * into somebody else's file, or a file every account on the machine can
   * read were all the same to it. This holds a credential, so the checks are
   * the ones a credential deserves, and every one of them is made against the
   * object actually opened rather than against the name used to open it.
   *
   * The open is `O_NOFOLLOW` so a link is refused by the kernel rather than by
   * a check that a rename could outrun, and `O_NONBLOCK` so a FIFO with no
   * writer returns instead of hanging the server before it can refuse it.
   *
   * Windows has neither flag and no ACL reading this project is willing to
   * shell out for, so the file provider is refused there as unsupported and
   * the environment variable is the supported route. Saying that plainly is
   * better than a check that looks like one and is not.
   */
  async #readSessionFile(
    file: string,
    signal?: AbortSignal,
  ): Promise<{ readonly session: string | null; readonly refusedBecause: string | null }> {
    if (process.platform === 'win32') {
      return {
        session: null,
        refusedBecause:
          'The --studio-session-file provider is not supported on Windows, because this server cannot check who else may read the file. Use the BGA_STUDIO_SESSION environment variable instead.',
      };
    }

    let handle;
    try {
      handle = await open(
        file,
        oConstants.O_RDONLY | oConstants.O_NOFOLLOW | oConstants.O_NONBLOCK,
      );
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      return {
        session: null,
        refusedBecause:
          code === 'ELOOP'
            ? 'The configured Studio session file is a symbolic link, which is not followed.'
            : 'The configured Studio session file could not be opened. Check that it exists and that this account may read it.',
      };
    }

    try {
      const stats = await handle.stat();
      if (!stats.isFile()) {
        return {
          session: null,
          refusedBecause:
            'The configured Studio session path is not a regular file. A directory, socket, device, or FIFO is refused.',
        };
      }
      if ((stats.mode & 0o077) !== 0) {
        return {
          session: null,
          refusedBecause: `The configured Studio session file is readable by other accounts on this machine. Restrict it to its owner with chmod 600.`,
        };
      }
      if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
        return {
          session: null,
          refusedBecause:
            'The configured Studio session file belongs to another account. Use one owned by the account running this server.',
        };
      }
      if (stats.size === 0) {
        return { session: null, refusedBecause: 'The configured Studio session file is empty.' };
      }
      if (stats.size > MAX_SESSION_FILE_BYTES) {
        return {
          session: null,
          refusedBecause: `The configured Studio session file is larger than ${String(MAX_SESSION_FILE_BYTES)} bytes, which is far more than a Cookie header. Check that it holds the header and nothing else.`,
        };
      }

      // Bounded by the size just measured on this descriptor, so a file that
      // grows between the check and the read cannot enlarge it.
      const buffer = Buffer.alloc(Math.min(stats.size, MAX_SESSION_FILE_BYTES));
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return { session: buffer.subarray(0, bytesRead).toString('utf8'), refusedBecause: null };
    } catch {
      return {
        session: null,
        refusedBecause: 'The configured Studio session file could not be read.',
      };
    } finally {
      await handle.close();
    }
  }

  /**
   * Normalizes a session and registers it before any caller can hold it.
   *
   * A session is a whole `Cookie` request header, so it is registered as the
   * header, as each `name=value` pair, and as each name and value on its own.
   * Anything that publishes a fragment of a credential has published a
   * credential, and a diagnostic that names the cookie it used says which
   * credential the operator holds.
   */
  #normalizeSession(raw: string | undefined): string | null {
    const value = raw?.trim() ?? '';
    if (value.length === 0) {
      return null;
    }
    for (const part of [value, ...value.split(';').flatMap((pair) => sessionFragments(pair))]) {
      if (part.length >= MIN_REDACTED_SECRET_LENGTH) {
        this.#sessionSecrets.add(part);
      }
    }
    return value;
  }

  /** The reviewed sources, for callers that need a source's own rules. */
  async documentationSources(): Promise<readonly DocumentationSource[]> {
    return (await this.#documentationCatalog()).sources;
  }

  /** Reads and caches the reviewed catalog for the life of the process. */
  async #documentationCatalog(): Promise<DocumentationCatalog> {
    this.#catalog ??= parseDocumentationCatalog(await this.readPackagedConfig('doc-sources.json'));
    return this.#catalog;
  }

  /** Runs an operation under the configured deadline and aborts it on expiry. */
  async runWithTimeout<T>(
    label: string,
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs = this.#config.operationTimeoutMs,
  ): Promise<T> {
    assertPositiveInteger('operationTimeoutMs', timeoutMs, MAX_OPERATION_TIMEOUT_MS);
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new PolicyViolationError(
            ERROR_CODES.policyTimeoutExceeded,
            `The operation exceeded its ${String(timeoutMs)} ms deadline.`,
            { details: { operation: label, timeoutMs } },
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation(controller.signal), expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Rejects output larger than the configured budget instead of truncating silently. */
  assertOutputWithinLimit(label: string, value: string): string {
    const bytes = Buffer.byteLength(value, 'utf8');
    if (bytes > this.#config.maxOutputBytes) {
      throw new PolicyViolationError(
        ERROR_CODES.policyOutputTooLarge,
        `The result is ${String(bytes)} bytes, above the ${String(this.#config.maxOutputBytes)} byte limit.`,
        { details: { operation: label, bytes, maxOutputBytes: this.#config.maxOutputBytes } },
      );
    }
    return value;
  }
}

export async function createPolicyBoundary(
  config: Partial<PolicyConfig> = {},
): Promise<PolicyBoundary> {
  return await PolicyBoundary.create({ ...DEFAULT_POLICY_CONFIG, ...config });
}
