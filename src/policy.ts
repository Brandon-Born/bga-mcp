import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { ERROR_CODES, PolicyViolationError } from './errors.js';
import { redactPath } from './redaction.js';

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
}

/** Local, read-only, and network-off. Every relaxation must be configured explicitly. */
export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  projectRoots: [],
  remoteProjects: [],
  operationTimeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
  maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  networkEnabled: false,
  mutationsEnabled: false,
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
  readonly truncated: boolean;
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

    return new PolicyBoundary(config, resolvedRoots);
  }

  get config(): PolicyConfig {
    return this.#config;
  }

  /** Real, existing project roots in configuration order. */
  get projectRoots(): readonly string[] {
    return this.#resolvedRoots;
  }

  /** Redaction options that keep in-root paths readable and hide everything else. */
  get redactionOptions(): { readonly projectRoots: readonly string[] } {
    return { projectRoots: this.#resolvedRoots };
  }

  /** Accepts a client-supplied project root only when it is explicitly allowed. */
  async resolveProjectRoot(candidate: string): Promise<string> {
    if (this.#resolvedRoots.length === 0) {
      throw new PolicyViolationError(
        ERROR_CODES.policyRootUnconfigured,
        'No project root is configured. Start the server with --project-root.',
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

    const match = this.#resolvedRoots.find((root) => root === resolved);
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
    let truncated = false;

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (truncated) {
        return;
      }
      if (depth > maxDepth) {
        truncated = true;
        return;
      }
      const entries = await readdir(directory, { withFileTypes: true });
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
    return { root: allowedRoot, files, skippedLinks, truncated };
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
