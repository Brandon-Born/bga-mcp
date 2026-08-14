import { constants as oConstants } from 'node:fs';
import { lstat, open, opendir, readFile, realpath } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { Resolver, lookup as dnsLookup } from 'node:dns';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { cancellationCheckpoint, registerDeadline } from './deadline.js';
import {
  createGuardedLookup,
  type AddressResolver,
  type ResolvedAddress,
} from './docs/addresses.js';
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

/** Maximum time an aborted operation may delay the public timeout response. */
export const CLEANUP_WINDOW_MS = 250;

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

/**
 * How many skipped links or unreadable directories a listing will name.
 *
 * The counts are bounded work; the names are bounded output. A project with a
 * link for every file would otherwise turn a listing into a megabyte of
 * diagnostics — which is how a link storm came back as `policy.output.too-large`
 * instead of as a truncated listing.
 */
export const MAX_REPORTED_SKIPS = 100;

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
export const PACKAGED_CONFIG_NAMES = [
  'rule-catalog.json',
  'doc-sources.json',
  'release.json',
] as const;

export type PackagedConfigName = (typeof PACKAGED_CONFIG_NAMES)[number];

/** Hops allowed before a redirect chain is treated as a loop. */
export const MAX_DOCUMENTATION_REDIRECTS = 3;

/** Ceiling on a retrieved page, independent of the output budget. */
export const MAX_DOCUMENTATION_BYTES = 524_288;

/**
 * Ceiling on a Studio page, which is a different kind of document.
 *
 * A wiki article is prose. A Studio game page is a signed-in application page
 * carrying the whole management interface around the log, and it is far larger
 * than a documentation ceiling allows. This number is measured rather than
 * guessed, twice over: a live run on 2026-08-10 refused the page at 524,288
 * bytes, refused it again at 2,097,152, and then measured it at 3,113,458 —
 * for a project with no gameplay and therefore no log lines at all.
 *
 * So the headroom is deliberate: a project that has actually been played
 * carries its log on the same page, and the part that grows is the part this
 * capability is for. It is still a bound, and a project busy enough to exceed
 * it is refused rather than half-read, because a truncated HTML prefix cannot
 * be parsed into log lines anyone should trust.
 */
export const MAX_STUDIO_PAGE_BYTES = 8_388_608;

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

/** A wait that bounds cleanup without keeping the process alive by itself. */
async function delay(ms: number): Promise<void> {
  await new Promise<void>((settle) => {
    const timer = setTimeout(settle, ms);
    timer.unref();
  });
}

/** The error shape Node uses when an operation is stopped by an AbortSignal. */
function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  return Object.assign(new Error('The operation was aborted.'), {
    name: 'AbortError',
    code: 'ABORT_ERR',
  });
}

interface CancellableAddressResolver {
  resolve4: (
    hostname: string,
    callback: (error: Error | null, addresses: string[]) => void,
  ) => void;
  resolve6: (
    hostname: string,
    callback: (error: Error | null, addresses: string[]) => void,
  ) => void;
  cancel: () => void;
}

interface AddressResolverDependencies {
  readonly lookupAll: (
    hostname: string,
    callback: (error: Error | null, addresses: readonly ResolvedAddress[]) => void,
  ) => void;
  readonly createResolver: () => CancellableAddressResolver;
}

/**
 * Resolves every A and AAAA answer with cancellation scoped to this request.
 *
 * `dns.lookup` has no cancellation API. A dedicated `Resolver` does: calling
 * `cancel()` stops only the queries issued through that instance, so one timed
 * out MCP call cannot disturb another call resolving the same host.
 */
export function abortableAddressResolver(
  signal: AbortSignal | undefined,
  dependencies: Partial<AddressResolverDependencies> = {},
): AddressResolver {
  const lookupAll =
    dependencies.lookupAll ??
    ((hostname, callback) => {
      dnsLookup(hostname, { all: true }, (error, addresses) => {
        callback(error, error === null ? addresses : []);
      });
    });
  if (signal === undefined) {
    // Callers without an operation deadline retain the platform resolver,
    // including its hosts-file and system name-service behavior.
    return (hostname, callback) => {
      lookupAll(hostname, callback);
    };
  }

  return (hostname, callback) => {
    if (signal.aborted) {
      callback(abortError(signal), []);
      return;
    }

    const resolver = dependencies.createResolver?.() ?? new Resolver();
    let ipv4: readonly ResolvedAddress[] = [];
    let ipv6: readonly ResolvedAddress[] = [];
    let firstError: Error | null = null;
    let remaining = 2;
    let settled = false;

    const finish = (): void => {
      if (settled || remaining > 0) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      const addresses = [...ipv4, ...ipv6];
      callback(
        addresses.length === 0 ? (firstError ?? new Error('DNS returned no address')) : null,
        addresses,
      );
    };
    const resolved = (family: 4 | 6, error: Error | null, addresses: readonly string[]): void => {
      if (settled) {
        return;
      }
      if (error !== null) {
        firstError ??= error;
      } else {
        const answer = addresses.map((address) => ({ address, family }));
        if (family === 4) {
          ipv4 = answer;
        } else {
          ipv6 = answer;
        }
      }
      remaining -= 1;
      finish();
    };
    const onAbort = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      // This Resolver belongs to this one guarded request. Its cancellation
      // cannot affect concurrent requests, even for the same hostname.
      resolver.cancel();
      callback(abortError(signal), []);
    };

    signal.addEventListener('abort', onAbort, { once: true });
    try {
      resolver.resolve4(hostname, (error, addresses) => {
        resolved(4, error, addresses);
      });
    } catch (error) {
      resolved(4, error instanceof Error ? error : new Error(String(error)), []);
    }
    try {
      resolver.resolve6(hostname, (error, addresses) => {
        resolved(6, error, addresses);
      });
    } catch (error) {
      resolved(6, error instanceof Error ? error : new Error(String(error)), []);
    }
  };
}

function normalize(path: string): string {
  const resolved = resolve(path);
  return resolved.length > 1 && resolved.endsWith(sep) ? resolved.slice(0, -sep.length) : resolved;
}

function contains(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return difference === '' || (!difference.startsWith('..') && !isAbsolute(difference));
}

interface FilesystemIdentity {
  readonly dev: number;
  readonly ino: number;
}

/** Device and inode identify the object a pathname named at one instant. */
function sameFilesystemObject(left: FilesystemIdentity, right: FilesystemIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/** A stable refusal for a pathname whose security decision went stale mid-operation. */
function changedProjectPath(
  requestedPath: string,
  message: string,
  cause?: unknown,
): PolicyViolationError {
  return new PolicyViolationError(ERROR_CODES.policyPathSymlinkEscape, message, {
    details: { requestedPath },
    ...(cause === undefined ? {} : { cause }),
  });
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
  #requestClientRoots: ((signal?: AbortSignal) => Promise<readonly string[]>) | undefined;
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
  setClientRootsProvider(provider: (signal?: AbortSignal) => Promise<readonly string[]>): void {
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
  async ensureClientRoots(options: { readonly signal?: AbortSignal } = {}): Promise<void> {
    cancellationCheckpoint(options.signal);
    if (this.#requestClientRoots === undefined || this.#clientRootsFetched) {
      return;
    }
    this.#clientRootsFetched = true;
    try {
      let offered: readonly string[];
      try {
        offered = await this.#requestClientRoots(options.signal);
      } catch {
        cancellationCheckpoint(options.signal);
        // A client that cannot answer is a client without roots, not an error.
        return;
      }
      cancellationCheckpoint(options.signal);

      const adopted: string[] = [];
      for (const candidate of offered) {
        cancellationCheckpoint(options.signal);
        try {
          const resolved = await realpath(normalize(candidate));
          cancellationCheckpoint(options.signal);
          if (!adopted.includes(resolved)) {
            adopted.push(resolved);
          }
        } catch {
          cancellationCheckpoint(options.signal);
          // A root that does not exist is skipped, exactly as a configured one
          // would be refused at startup.
        }
      }
      this.#clientRoots = adopted;
    } catch (error) {
      if (options.signal?.aborted === true) {
        // A timed-out roots request did not produce a reusable answer. Let the
        // next call on the same connection ask again instead of poisoning the
        // session until a roots-changed notification happens to arrive.
        this.#clientRootsFetched = false;
      }
      throw error;
    }
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
  async resolveProjectRoot(
    candidate: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<string> {
    cancellationCheckpoint(options.signal);
    // A client that advertises roots is asked before anything is refused for
    // want of one.
    await this.ensureClientRoots(options);
    cancellationCheckpoint(options.signal);
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
      cancellationCheckpoint(options.signal);
    } catch (cause) {
      cancellationCheckpoint(options.signal);
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
  async resolveWithinProject(
    root: string,
    relativePath: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<string> {
    cancellationCheckpoint(options.signal);
    const allowedRoot = await this.resolveProjectRoot(root, options);

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
      cancellationCheckpoint(options.signal);
    } catch (cause) {
      cancellationCheckpoint(options.signal);
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
   * An entry observed as a link is skipped and reported. Directory identity
   * and containment are checked on both sides of `opendir` before an entry is
   * consumed, so a single swap cannot widen the content a capability sees.
   * Listing stops at the entry and depth budget rather than walking forever.
   */
  async listProjectFiles(
    root: string,
    options: {
      readonly maxEntries?: number;
      readonly maxDepth?: number;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<ProjectListing> {
    cancellationCheckpoint(options.signal);
    const allowedRoot = await this.resolveProjectRoot(root, options);
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_LISTED_FILES;
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_LIST_DEPTH;
    assertPositiveInteger('maxEntries', maxEntries, DEFAULT_MAX_LISTED_FILES);
    assertPositiveInteger('maxDepth', maxDepth, DEFAULT_MAX_LIST_DEPTH);

    const files: ProjectFile[] = [];
    const skippedLinks: string[] = [];
    const unreadablePaths: string[] = [];
    // Held on an object: the flag is set inside the walk below, and a plain
    // local reads to the compiler as one that never changes.
    const state = { truncated: false };

    // One budget for everything encountered, not one for the files that
    // survive. A directory of a million links, a million empty directories, or
    // a million sockets costs the same work as a million files and used to
    // cost nothing against the limit — with `maxEntries: 1` an ordinary
    // directory returned zero files, four skipped links, and `truncated:
    // false`, which is the wrong answer twice over.
    let encountered = 0;
    // Read through a call: a flag the compiler cannot see being set stays
    // narrowed to its last assignment, and the loops below would be told they
    // are checking something that is always false.
    const stopped = (): boolean => state.truncated;
    const spend = (): boolean => {
      encountered += 1;
      if (encountered > maxEntries) {
        state.truncated = true;
        return false;
      }
      return true;
    };

    const reportUnreadable = (directory: string): void => {
      if (unreadablePaths.length < MAX_REPORTED_SKIPS) {
        unreadablePaths.push(relative(allowedRoot, directory).split(sep).join('/') || '.');
      } else {
        state.truncated = true;
      }
    };
    const reportLink = (path: string): void => {
      if (skippedLinks.length < MAX_REPORTED_SKIPS) {
        skippedLinks.push(path);
      } else {
        state.truncated = true;
      }
    };

    const walk = async (
      directory: string,
      depth: number,
      expectedIdentity?: FilesystemIdentity,
    ): Promise<void> => {
      cancellationCheckpoint(options.signal);
      if (stopped()) {
        return;
      }
      if (depth > maxDepth) {
        state.truncated = true;
        return;
      }
      const requestedDirectory = relative(allowedRoot, directory).split(sep).join('/') || '.';
      let beforeOpen;
      try {
        beforeOpen = await lstat(directory);
        cancellationCheckpoint(options.signal);
      } catch (error) {
        cancellationCheckpoint(options.signal);
        // A directory the process may not read is a fact about the project,
        // not a failure of the server. It is recorded by its project-relative
        // path so the caller knows what was left out, and the rest is read.
        if (!isPermissionError(error)) {
          throw error;
        }
        reportUnreadable(directory);
        return;
      }

      // A child was classified before it was queued. Refuse if the name became
      // another object before traversal reached it, and never let opendir
      // follow a final-component link.
      if (
        !beforeOpen.isDirectory() ||
        (expectedIdentity !== undefined && !sameFilesystemObject(expectedIdentity, beforeOpen))
      ) {
        throw changedProjectPath(
          requestedDirectory,
          'A project directory changed while it was being opened, so it was not read.',
        );
      }

      let entries;
      try {
        // Read lazily rather than materializing and sorting the whole
        // directory: the budget has to be able to stop a huge one before its
        // names are all in memory, which a `readdir` that returns an array
        // cannot do.
        entries = await opendir(directory);
      } catch (error) {
        cancellationCheckpoint(options.signal);
        if (!isPermissionError(error)) {
          throw error;
        }
        reportUnreadable(directory);
        return;
      }
      // Keep the checkpoint under the close-finally below: expiry immediately
      // after a successful opendir must not leak the newly opened handle.

      const directories: { readonly path: string; readonly identity: FilesystemIdentity }[] = [];
      const found: ProjectFile[] = [];
      try {
        cancellationCheckpoint(options.signal);
        // `opendir` has no public descriptor-stat operation. Re-resolve and
        // re-stat before consuming its first entry, so a single swap around the
        // open is caught rather than allowing an outside directory to be read.
        let afterOpenResolved: string;
        let afterOpen;
        try {
          afterOpenResolved = normalize(await realpath(directory));
          cancellationCheckpoint(options.signal);
          afterOpen = await lstat(directory);
          cancellationCheckpoint(options.signal);
        } catch (cause) {
          throw changedProjectPath(
            requestedDirectory,
            'A project directory changed while it was being opened, so it was not read.',
            cause,
          );
        }
        if (
          !contains(allowedRoot, afterOpenResolved) ||
          !afterOpen.isDirectory() ||
          !sameFilesystemObject(beforeOpen, afterOpen)
        ) {
          throw changedProjectPath(
            requestedDirectory,
            'A project directory changed or left its project root while it was being opened, so it was not read.',
          );
        }

        for await (const entry of entries) {
          // Checked per entry, so an aborted walk stops within one entry
          // rather than at the end of a directory that may hold a million.
          cancellationCheckpoint(options.signal);
          if (!spend()) {
            return;
          }
          const absolute = join(directory, entry.name);
          const portable = relative(allowedRoot, absolute).split(sep).join('/');
          let observed;
          try {
            // Dirent is only a snapshot. Judge the object that the name denotes
            // now, without following its final component, before queuing or
            // publishing metadata about it.
            observed = await lstat(absolute);
            cancellationCheckpoint(options.signal);
          } catch (error) {
            cancellationCheckpoint(options.signal);
            if (isPermissionError(error)) {
              reportUnreadable(absolute);
              continue;
            }
            // A disappearing entry makes this a partial listing. No content was
            // read, and claiming completeness would be the wrong answer.
            state.truncated = true;
            continue;
          }
          if (observed.isSymbolicLink()) {
            // Counted always, named up to the reporting cap: the developer
            // needs to know links were skipped, not to read ten thousand of
            // their names.
            reportLink(portable);
            continue;
          }
          if (observed.isDirectory()) {
            directories.push({ path: absolute, identity: observed });
            continue;
          }
          if (!observed.isFile()) {
            // A socket, a FIFO, a device. Counted, because encountering it was
            // work, and skipped, because it is not project content.
            continue;
          }
          found.push({ path: portable, bytes: observed.size });
        }
      } finally {
        // An iteration left early keeps the directory handle open otherwise.
        await entries.close().catch(() => undefined);
        // What was read before the budget ran out is still a true answer about
        // this directory, and truncation is reported beside it. Sorted here,
        // per directory, because the order is part of the contract and the
        // budget decides how much there is to order.
        found.sort((left, right) => left.path.localeCompare(right.path));
        files.push(...found);
      }
      for (const child of directories.sort((left, right) => left.path.localeCompare(right.path))) {
        cancellationCheckpoint(options.signal);
        await walk(child.path, depth + 1, child.identity);
        if (stopped()) {
          return;
        }
      }
    };

    await walk(allowedRoot, 1);
    return { root: allowedRoot, files, skippedLinks, unreadablePaths, truncated: state.truncated };
  }

  /**
   * Reads one file inside an allowed root, bound to the object it opened.
   *
   * The 2026-08-08 review found the decisions here attached to a pathname
   * rather than to a file: the path was resolved and checked for containment,
   * and then — separately, later — `lstat` and `readFile` were pointed at that
   * same name again. Between those steps a name can come to mean a different
   * file, so the checks described a file that no longer had to be the one read.
   *
   * Now the file is opened once, with `O_NOFOLLOW` so the last component
   * cannot be a link, and every decision is made about that descriptor: its
   * type, its size, and its bytes. Containment is bound to it by identity —
   * the resolved path is checked to be inside the root, and the object at that
   * resolved path is required to be the same device and inode as the one
   * opened. A swap in between changes one of those two things, and a file that
   * is not the file whose containment was checked is refused rather than read.
   *
   * The residual is stated rather than papered over: the before/after checks
   * detect one swap of an intermediate directory, but an attacker able to
   * perform repeated precisely timed swaps can still race pathname APIs.
   * Binding containment at the point of opening needs `openat`, which Node does
   * not expose. See RR-POLICY-TRAVERSAL-OPENAT.
   */
  async readProjectFile(
    root: string,
    relativePath: string,
    options: { readonly maxBytes?: number; readonly signal?: AbortSignal } = {},
  ): Promise<string> {
    cancellationCheckpoint(options.signal);
    const allowedRoot = await this.resolveProjectRoot(root, options);
    const resolved = await this.resolveWithinProject(allowedRoot, relativePath, options);
    const maxBytes = options.maxBytes ?? this.#config.maxOutputBytes;
    assertPositiveInteger('maxBytes', maxBytes, MAX_OUTPUT_BYTES_LIMIT);

    let beforeOpen;
    try {
      beforeOpen = await lstat(resolved);
      cancellationCheckpoint(options.signal);
    } catch (cause) {
      cancellationCheckpoint(options.signal);
      throw changedProjectPath(
        relativePath,
        'The requested project file changed before it could be opened, so it was not read.',
        cause,
      );
    }
    if (!beforeOpen.isFile()) {
      throw new PolicyViolationError(
        ERROR_CODES.policyPathNotFound,
        'The requested project path is not a regular file.',
        { details: { requestedPath: relativePath } },
      );
    }

    let handle;
    try {
      handle = await open(resolved, oConstants.O_RDONLY | oConstants.O_NOFOLLOW);
    } catch (cause) {
      cancellationCheckpoint(options.signal);
      throw new PolicyViolationError(
        ERROR_CODES.policyPathNotFound,
        'The requested project file could not be opened.',
        { details: { requestedPath: relativePath }, cause },
      );
    }

    try {
      // Inside the close-finally: expiry immediately after open cannot leak
      // the descriptor whose work was abandoned.
      cancellationCheckpoint(options.signal);
      const info = await handle.stat();
      cancellationCheckpoint(options.signal);
      if (!info.isFile()) {
        throw new PolicyViolationError(
          ERROR_CODES.policyPathNotFound,
          'The requested project path is not a regular file.',
          { details: { requestedPath: relativePath } },
        );
      }

      // The object opened must be the one checked immediately before the open.
      // A replacement in that window changes its device/inode even when the
      // replacement is another ordinary file with the same size.
      if (!sameFilesystemObject(beforeOpen, info)) {
        throw changedProjectPath(
          relativePath,
          'The requested project file changed while it was being opened, so it was not read.',
        );
      }

      // Re-resolve after opening. This catches an intermediate directory that
      // was replaced by a link after the first containment check. Compare the
      // current pathname to the descriptor too, so the final name cannot have
      // been replaced after open without invalidating the read.
      let afterOpenResolved: string;
      let atPath;
      try {
        afterOpenResolved = normalize(await realpath(resolved));
        cancellationCheckpoint(options.signal);
        atPath = await lstat(resolved);
        cancellationCheckpoint(options.signal);
      } catch (cause) {
        throw changedProjectPath(
          relativePath,
          'The requested project file changed while it was being opened, so it was not read.',
          cause,
        );
      }
      if (
        !contains(allowedRoot, afterOpenResolved) ||
        !atPath.isFile() ||
        !sameFilesystemObject(atPath, info)
      ) {
        throw changedProjectPath(
          relativePath,
          'The requested project file changed or left its project root while it was being opened, so it was not read.',
        );
      }

      if (info.size > maxBytes) {
        throw new PolicyViolationError(
          ERROR_CODES.policyOutputTooLarge,
          `The file is ${String(info.size)} bytes, above the ${String(maxBytes)} byte read limit.`,
          { details: { requestedPath: relativePath, bytes: info.size, maxBytes } },
        );
      }

      // Read exactly the descriptor size plus one EOF probe. Regular-file reads
      // may complete short, so loop until EOF or the probe byte instead of
      // treating one short syscall as the whole file. Any count other than the
      // statted size means the object shrank or grew while it was being read.
      const buffer = Buffer.alloc(info.size + 1);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        cancellationCheckpoint(options.signal);
        const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
        cancellationCheckpoint(options.signal);
        if (chunk.bytesRead === 0) {
          break;
        }
        bytesRead += chunk.bytesRead;
      }
      if (bytesRead !== info.size) {
        throw changedProjectPath(
          relativePath,
          'The requested project file changed size while it was being read, so its partial content was not returned.',
        );
      }

      const afterRead = await handle.stat();
      cancellationCheckpoint(options.signal);
      if (!sameFilesystemObject(info, afterRead) || afterRead.size !== info.size) {
        throw changedProjectPath(
          relativePath,
          'The requested project file changed while it was being read, so its content was not returned.',
        );
      }
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
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
      options.signal?.throwIfAborted();
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
    /** What to call the page in a refusal, so a Studio failure does not read as a documentation one. */
    what = 'documentation page',
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
      abortableAddressResolver(signal),
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
            // Destroyed rather than drained: a body nobody will read is bytes
            // and time this server would spend on someone else's decision, and
            // `resume()` spends both until the far end is finished talking.
            response.destroy();
            resolveRequest({ status, body: '', location, lastModified: null });
            return;
          }
          if (status < 200 || status >= 300) {
            response.destroy();
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
                `The ${what} is larger than the ${String(limit)} byte limit.`,
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
    const session = await this.assertStudioAvailable(
      options.signal === undefined ? {} : { signal: options.signal },
    );

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

    const maxBytes = Math.min(options.maxBytes ?? MAX_STUDIO_PAGE_BYTES, MAX_STUDIO_PAGE_BYTES);
    const result = await this.#sendGuardedRequest(
      url,
      maxBytes,
      options.signal,
      {
        'user-agent': 'bga-mcp (+https://github.com/Brandon-Born/bga-mcp)',
        accept: 'text/html',
        'accept-encoding': 'identity',
        cookie: session,
      },
      'Studio page',
    );
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
  async assertStudioAvailable(options: { readonly signal?: AbortSignal } = {}): Promise<string> {
    options.signal?.throwIfAborted();
    this.assertNetworkAllowed('studio');
    if (!this.#config.experimentalStudioLogs) {
      throw new PolicyViolationError(
        ERROR_CODES.policyStudioDisabled,
        'Studio access is experimental and disabled. Start the server with --experimental-studio-logs to enable it.',
      );
    }
    const session = await this.studioSession(options);
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
    options.signal?.throwIfAborted();
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
      cancellationCheckpoint(signal);
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
      cancellationCheckpoint(signal);
      const stats = await handle.stat();
      cancellationCheckpoint(signal);
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
      cancellationCheckpoint(signal);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      cancellationCheckpoint(signal);
      return { session: buffer.subarray(0, bytesRead).toString('utf8'), refusedBecause: null };
    } catch {
      cancellationCheckpoint(signal);
      return {
        session: null,
        refusedBecause: 'The configured Studio session file could not be read.',
      };
    } finally {
      await handle.close();
      cancellationCheckpoint(signal);
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
    const timeoutError = new PolicyViolationError(
      ERROR_CODES.policyTimeoutExceeded,
      `The operation exceeded its ${String(timeoutMs)} ms deadline.`,
      { details: { operation: label, timeoutMs } },
    );
    const expire = (): void => {
      if (!controller.signal.aborted) {
        controller.abort(timeoutError);
      }
    };
    const unregisterDeadline = registerDeadline(controller.signal, timeoutMs, expire);
    let timer: NodeJS.Timeout | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expire();
        reject(timeoutError);
      }, timeoutMs);
    });

    const running = operation(controller.signal);
    // Observed either way: when the deadline wins the race, an unobserved
    // rejection from the abandoned work would become an unhandled rejection.
    const settled = running.then(
      () => undefined,
      () => undefined,
    );

    try {
      return await Promise.race([running, expiry]);
    } catch (error) {
      if (controller.signal.aborted) {
        // A deadline that only wins a race leaves the work running: the
        // 2026-08-08 review measured twenty-eight filesystem operations
        // completing after the timeout had been reported, and a five hundred
        // file scan that shutdown rather than cancellation eventually stopped.
        // Cooperative work normally stops first. The cleanup ceiling preserves
        // the public deadline if a missed signal or an uninterruptible native
        // syscall does not; that residual is recorded rather than hidden by an
        // unbounded second wait.
        await Promise.race([settled, delay(CLEANUP_WINDOW_MS)]);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      unregisterDeadline();
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
