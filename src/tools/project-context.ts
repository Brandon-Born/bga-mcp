import { toPublicError } from '../errors.js';
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
  options: { readonly withPhpSources?: boolean } = {},
): Promise<ProjectContext> {
  const listing = await policy.listProjectFiles(projectRoot);
  const model = await buildProjectModel(listing, {
    read: async (relativePath) => await policy.readProjectFile(projectRoot, relativePath),
  });

  if (options.withPhpSources !== true) {
    return { model, phpSources: [] };
  }

  const phpSources: PhpSource[] = [];
  let budget = MAX_SOURCE_BYTES;
  for (const file of listing.files) {
    if (!file.path.endsWith('.php') || phpSources.length >= MAX_SOURCE_FILES) {
      continue;
    }
    if (file.bytes > budget) {
      break;
    }
    budget -= file.bytes;
    phpSources.push({
      path: file.path,
      text: await policy.readProjectFile(projectRoot, file.path),
    });
  }

  return { model, phpSources };
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
