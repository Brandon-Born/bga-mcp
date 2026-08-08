import { BgaMcpError, ERROR_CODES, toPublicError } from '../errors.js';
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
): Promise<string> {
  if (projectRoot !== undefined) {
    return projectRoot;
  }

  // Ask the client for its roots before concluding there are none: for most
  // clients this is what makes --project-root unnecessary.
  await policy.ensureClientRoots();
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
 * Loads a project through the policy boundary.
 *
 * Every capability that needs project content goes through here, so root
 * checks, traversal checks, link handling, and read budgets stay in one place.
 */
export async function loadProjectContext(
  policy: PolicyBoundary,
  projectRoot: string,
  options: { readonly withPhpSources?: boolean; readonly withClientSources?: boolean } = {},
): Promise<ProjectContext> {
  const listing = await policy.listProjectFiles(projectRoot);
  const model = await buildProjectModel(listing, {
    read: async (relativePath) => await policy.readProjectFile(projectRoot, relativePath),
  });

  const phpSources: PhpSource[] = [];
  const clientSources: PhpSource[] = [];
  let budget = MAX_SOURCE_BYTES;

  for (const file of listing.files) {
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
    const source = { path: file.path, text: await policy.readProjectFile(projectRoot, file.path) };
    if (file.path.endsWith('.php')) {
      phpSources.push(source);
    } else {
      clientSources.push(source);
    }
  }

  return { model, phpSources, clientSources };
}

/** Renders any failure as the stable public error text a client receives. */
export function publishFailure(
  policy: PolicyBoundary,
  error: unknown,
): { isError: true; content: { type: 'text'; text: string }[] } {
  const published = toPublicError(error, policy.redactionOptions);
  const details = published.details === undefined ? '' : ` ${JSON.stringify(published.details)}`;
  return {
    isError: true,
    content: [{ type: 'text', text: `${published.code}: ${published.message}${details}` }],
  };
}
