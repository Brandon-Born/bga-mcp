import type { McpServer } from '@modelcontextprotocol/server';

import type { PolicyBoundary } from '../policy.js';
import { publishJson, publishResourceFailure } from '../publish.js';
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
async function soleProjectRoot(policy: PolicyBoundary): Promise<string> {
  return await resolveProjectRoot(
    policy,
    undefined,
    (roots) =>
      `This resource describes one project, but ${String(roots)} roots are configured. Use the tools with an explicit projectRoot instead.`,
  );
}

async function readJson(
  policy: PolicyBoundary,
  uri: URL,
  label: string,
  build: (signal: AbortSignal) => Promise<unknown>,
): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  try {
    const value = await policy.runWithTimeout(label, async (signal) => await build(signal));
    return publishJson(policy, uri, label, value);
  } catch (error) {
    // A resource cannot return a structured error the way a tool can, so the
    // failure leaves as a protocol error carrying the same stable code, the
    // same redaction, and the same budget a tool result would have had.
    return publishResourceFailure(policy, error);
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
      await readJson(policy, uri, 'project-summary', async (signal) => {
        const root = await soleProjectRoot(policy);
        const context = await loadProjectContext(policy, root, { signal });
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
      await readJson(policy, uri, 'project-states', async (signal) => {
        const root = await soleProjectRoot(policy);
        const context = await loadProjectContext(policy, root, { withPhpSources: true, signal });
        return {
          schemaVersion: 1,
          layout: context.model.layout,
          source: context.model.states.source,
          sources: context.model.states.sources,
          parsed: context.model.states.parsed,
          // Where the framework enters the machine, and how completely it was
          // read: both differ by generation, and both decide what the
          // validation below is allowed to claim.
          initial: context.model.states.initial,
          complete: context.model.states.complete,
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
      await readJson(policy, uri, 'project-diagnostics', async (signal) => {
        const root = await soleProjectRoot(policy);
        const context = await loadProjectContext(policy, root, {
          withPhpSources: true,
          withClientSources: true,
          signal,
        });

        const runners = createValidatorRunners(policy, root, context);

        const aggregate = await aggregateValidations(runners, { signal });
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
