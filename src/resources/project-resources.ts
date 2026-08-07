import type { McpServer } from '@modelcontextprotocol/server';

import { toPublicError } from '../errors.js';
import type { PolicyBoundary } from '../policy.js';
import { aggregateStatus, aggregateValidations } from '../rules/aggregate.js';
import { validateStateMachine } from '../rules/state-machine.js';
import { createValidatorRunners } from '../rules/validators.js';
import { loadProjectContext, resolveProjectRoot } from '../tools/project-context.js';

export const PROJECT_SUMMARY_URI = 'bga://project/summary';
export const PROJECT_STATES_URI = 'bga://project/states';
export const PROJECT_DIAGNOSTICS_URI = 'bga://project/diagnostics';

/**
 * A resource has no arguments, so it can only describe one project.
 *
 * The single configured root is that project. Zero roots, or more than one,
 * is ambiguous: the resource refuses rather than picking for the developer,
 * and the tools remain available for a project named explicitly. The rule is
 * the tools' own omitted-argument rule, so the two cannot drift apart.
 */
function soleProjectRoot(policy: PolicyBoundary): string {
  return resolveProjectRoot(
    policy,
    undefined,
    (roots) =>
      `This resource describes one project, but ${String(roots)} roots are configured. Use the tools with an explicit projectRoot instead.`,
  );
}

/**
 * Resources cannot return a structured error the way a tool can, so a failure
 * is raised as a protocol error carrying the same stable code and redacted
 * message a tool would have published.
 */
function fail(policy: PolicyBoundary, error: unknown): never {
  const published = toPublicError(error, policy.redactionOptions);
  const details = published.details === undefined ? '' : ` ${JSON.stringify(published.details)}`;
  throw new Error(`${published.code}: ${published.message}${details}`);
}

async function readJson(
  policy: PolicyBoundary,
  uri: URL,
  label: string,
  build: () => Promise<unknown>,
): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  try {
    const value = await policy.runWithTimeout(label, async () => await build());
    const text = `${JSON.stringify(value, null, 2)}\n`;
    policy.assertOutputWithinLimit(label, text);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
  } catch (error) {
    return fail(policy, error);
  }
}

/**
 * Registers the read-only project resources.
 *
 * Each one exposes what a tool already computes, so an agent can read project
 * context without spending a tool call. They route through the same policy
 * boundary, never write, and never use the network.
 */
export function registerProjectResources(server: McpServer, policy: PolicyBoundary): void {
  server.registerResource(
    'project-summary',
    PROJECT_SUMMARY_URI,
    {
      title: 'BGA project summary',
      description:
        'The normalized model of the configured project: layout, metadata, components, and state definitions.',
      mimeType: 'application/json',
    },
    async (uri) =>
      await readJson(policy, uri, 'project-summary', async () => {
        const root = soleProjectRoot(policy);
        const context = await loadProjectContext(policy, root);
        return context.model;
      }),
  );

  server.registerResource(
    'project-states',
    PROJECT_STATES_URI,
    {
      title: 'BGA project state machine',
      description:
        'State definitions, transitions, handlers, and the uncertainty around them, with their source locations.',
      mimeType: 'application/json',
    },
    async (uri) =>
      await readJson(policy, uri, 'project-states', async () => {
        const root = soleProjectRoot(policy);
        const context = await loadProjectContext(policy, root, { withPhpSources: true });
        return {
          schemaVersion: 1,
          layout: context.model.layout,
          source: context.model.states.source,
          sources: context.model.states.sources,
          parsed: context.model.states.parsed,
          definitions: context.model.states.definitions,
          unsupported: context.model.states.unsupported,
          validation: validateStateMachine(context.model, context.phpSources),
        };
      }),
  );

  server.registerResource(
    'project-diagnostics',
    PROJECT_DIAGNOSTICS_URI,
    {
      title: 'BGA project diagnostics',
      description:
        'Current findings from every validator, with the per-group breakdown and any group that could not run.',
      mimeType: 'application/json',
    },
    async (uri) =>
      await readJson(policy, uri, 'project-diagnostics', async () => {
        const root = soleProjectRoot(policy);
        const context = await loadProjectContext(policy, root, {
          withPhpSources: true,
          withClientSources: true,
        });

        const runners = createValidatorRunners(policy, root, context);

        const aggregate = await aggregateValidations(runners);
        return {
          schemaVersion: 1,
          layout: context.model.layout,
          status: aggregateStatus(aggregate.groups, aggregate.diagnostics),
          groups: aggregate.groups,
          truncation: aggregate.truncation,
          diagnostics: aggregate.diagnostics,
        };
      }),
  );
}
