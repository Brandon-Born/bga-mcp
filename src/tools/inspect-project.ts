import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { DiagnosticResultSchema } from '../diagnostics.js';
import type { PolicyBoundary } from '../policy.js';
import type { ProjectModel } from '../project/model.js';
import { loadProjectContext, publishFailure, resolveProjectRoot } from './project-context.js';

export const INSPECT_PROJECT_TOOL = 'inspect_project';

const StateDefinitionSchema = z.strictObject({
  id: z.number().int(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  action: z.string().nullable(),
  args: z.string().nullable(),
  possibleActions: z.array(z.string()),
  transitions: z.record(z.string(), z.number().int()),
  origin: z.enum(['array', 'class', 'framework']),
  description: z.string().nullable(),
  descriptionMyTurn: z.string().nullable(),
  zombie: z.string().nullable(),
  redirects: z.array(z.number().int()),
  edgesResolved: z.boolean(),
});

export const InspectProjectInputSchema = z.strictObject({
  projectRoot: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Absolute path of a project root the server was started with. Optional when exactly one root is configured; with none or several, the call is refused rather than guessed.',
    ),
});

export const InspectProjectOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
  gameKey: z.string().nullable(),
  detection: z.strictObject({
    layout: z.enum(['modern', 'legacy', 'hybrid', 'unrecognized']),
    gameKey: z.string().nullable(),
    certainty: z.enum(['certain', 'likely', 'possible']),
    reason: z.string(),
    components: z.array(
      z.strictObject({
        id: z.enum(['metadata', 'game-logic', 'states', 'client-logic']),
        description: z.string(),
        generation: z.enum(['modern', 'legacy', 'both', 'absent']),
        legacyFiles: z.array(z.string()),
        modernFiles: z.array(z.string()),
      }),
    ),
    signals: z.array(
      z.strictObject({
        id: z.string(),
        description: z.string(),
        matched: z.boolean(),
        files: z.array(z.string()),
      }),
    ),
  }),
  metadata: z.strictObject({
    gameName: z.string().nullable(),
    playerCounts: z.array(z.number().int()),
    source: z.string().nullable(),
  }),
  components: z.array(
    z.strictObject({
      id: z.string(),
      present: z.boolean(),
      files: z.array(z.string()),
      expected: z.boolean(),
    }),
  ),
  states: z.strictObject({
    parsed: z.boolean(),
    definitions: z.array(StateDefinitionSchema),
    unsupported: z.array(z.string()),
    source: z.string().nullable(),
    sources: z.array(z.string()),
    complete: z.strictObject({ declarations: z.boolean(), edges: z.boolean() }),
    duplicateIds: z.array(z.number().int()),
    initial: z.strictObject({
      ids: z.array(z.number().int()),
      origin: z.enum(['setup-new-game', 'state-1', 'default', 'unresolved']),
      evidence: z.string(),
    }),
  }),
  fileCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  skippedLinks: z.array(z.string()),
  diagnostics: DiagnosticResultSchema,
});

export type InspectProjectResult = z.infer<typeof InspectProjectOutputSchema>;

const DESCRIPTION = `Inspect a configured BGA project root and explain its structure.

Reports the detected layout and why it was chosen, the game metadata, which
components are present or missing, the state machine where it can be read, and
explicit findings for anything unsupported or uncertain.

Reads the legacy, modern, and part-migrated layouts: each of metadata, game
logic, states, and client logic is read in whichever form the project has it in.
Read-only: it never writes to the project and never uses the network.`;

/** Renders the model as the short text an agent or a human reads first. */
export function summarize(model: ProjectModel): string {
  const lines: string[] = [];
  const name = model.metadata.gameName ?? model.gameKey ?? 'unnamed project';
  lines.push(
    `${name}: ${model.layout} layout (${model.detection.certainty}). ${model.detection.reason}`,
  );

  const present = model.components.filter((component) => component.present).map((c) => c.id);
  const missing = model.components
    .filter((component) => component.expected && !component.present)
    .map((component) => component.id);
  lines.push(`Components present: ${present.length === 0 ? 'none' : present.join(', ')}.`);
  if (missing.length > 0) {
    lines.push(`Expected but missing: ${missing.join(', ')}.`);
  }

  if (model.states.parsed) {
    const transitions = model.states.definitions.reduce(
      (total, state) => total + Object.keys(state.transitions).length,
      0,
    );
    lines.push(
      `States: ${String(model.states.definitions.length)} definitions with ${String(transitions)} transitions.`,
    );
  } else {
    lines.push('States: not readable from this project. See the diagnostics for the reason.');
  }

  const { summary } = model.diagnostics;
  lines.push(
    `Findings: ${String(summary.errors)} errors, ${String(summary.warnings)} warnings, ${String(summary.information)} information, ${String(summary.unsupported)} unsupported.`,
  );
  return lines.join('\n');
}

/**
 * Registers the read-only project inspection tool.
 *
 * Every filesystem access goes through the policy boundary, the work runs
 * under the configured deadline, the result is checked against the output
 * budget, and any failure is published through the public error contract.
 */
export function registerInspectProject(server: McpServer, policy: PolicyBoundary): void {
  server.registerTool(
    INSPECT_PROJECT_TOOL,
    {
      title: 'Inspect a BGA project',
      description: DESCRIPTION,
      inputSchema: InspectProjectInputSchema,
      outputSchema: InspectProjectOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectRoot }) => {
      try {
        const root = await resolveProjectRoot(policy, projectRoot);
        const model = await policy.runWithTimeout(INSPECT_PROJECT_TOOL, async () => {
          return (await loadProjectContext(policy, root)).model;
        });

        const structuredContent = InspectProjectOutputSchema.parse(model);
        const text = summarize(model);
        policy.assertOutputWithinLimit(
          INSPECT_PROJECT_TOOL,
          `${JSON.stringify(structuredContent)}${text}`,
        );
        return { content: [{ type: 'text', text }], structuredContent };
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
