import { fileURLToPath } from 'node:url';

import {
  inputRequired,
  inputResponse,
  type InputRequiredResult,
  type ServerContext,
} from '@modelcontextprotocol/server';

import { cancellationCheckpoint } from '../deadline.js';
import { BgaMcpError, ERROR_CODES } from '../errors.js';
import type { PolicyBoundary } from '../policy.js';
import { buildProjectModel, type ProjectModel } from '../project/model.js';
import type { PhpSource } from '../rules/state-machine.js';

/** Bytes of PHP source a single validation may read. Keeps a huge project bounded. */
const MAX_SOURCE_BYTES = 262_144;
const MAX_SOURCE_FILES = 200;

export interface ProjectContext {
  readonly model: ProjectModel;
  /** Readable PHP sources, used by cross-file rules. */
  readonly phpSources: readonly PhpSource[];
  /** Readable client sources, used by rules that span client and server. */
  readonly clientSources: readonly PhpSource[];
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
  let budget = MAX_SOURCE_BYTES;

  for (const file of listing.files) {
    // One check per file: a deadline that expires during a large read set
    // stops here rather than at the end of it.
    cancellationCheckpoint(options.signal);
    const wanted =
      (options.withPhpSources === true && file.path.endsWith('.php')) ||
      (options.withClientSources === true && /\.(?:js|ts)$/u.test(file.path));
    if (!wanted || phpSources.length + clientSources.length >= MAX_SOURCE_FILES) {
      continue;
    }
    if (file.bytes > budget) {
      break;
    }
    budget -= file.bytes;
    const source = { path: file.path, text: await readOnce(file.path) };
    if (file.path.endsWith('.php')) {
      phpSources.push(source);
    } else {
      clientSources.push(source);
    }
  }

  return { model, phpSources, clientSources };
}
