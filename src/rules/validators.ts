import type { PolicyBoundary } from '../policy.js';
import type { ProjectContext } from '../tools/project-context.js';
import { validateActionContracts } from './action-contracts.js';
import type { GroupRunner } from './aggregate.js';
import { auditDatabaseUsage } from './database.js';
import { validateNotifications } from './notifications.js';
import { validateStateMachine } from './state-machine.js';
import { summarizeFindings } from './uncertainty.js';

/**
 * Builds the validator set every aggregating capability runs.
 *
 * `validate_project`, `run_pre_release_audit`, and the diagnostics resource all
 * need the same four validators wired to the same project. Keeping that wiring
 * in one place means a change to how a validator is invoked cannot reach two of
 * the three and quietly miss the last.
 */
export function createValidatorRunners(
  policy: PolicyBoundary,
  projectRoot: string,
  context: ProjectContext,
  signal?: AbortSignal,
): GroupRunner[] {
  return [
    {
      id: 'state-machine',
      run: () => validateStateMachine(context.model, context.phpSources, signal),
    },
    {
      id: 'action-contracts',
      run: () =>
        validateActionContracts(context.model, context.clientSources, context.phpSources, signal)
          .diagnostics,
    },
    {
      id: 'notifications',
      run: () =>
        summarizeFindings(
          [
            ...validateNotifications(
              context.phpSources,
              context.clientSources,
              signal,
            ).diagnostics.findings.filter(
              (finding) =>
                finding.kind !== 'heuristic' ||
                !context.model.diagnostics.findings.some(
                  (entry) => entry.code === 'project.source.read-limit',
                ),
            ),
            ...context.model.diagnostics.findings.filter((finding) =>
              finding.code.startsWith('project.source.'),
            ),
          ],
          signal,
        ),
    },
    {
      id: 'database',
      run: async () => {
        // Reading the schema can fail on its own; that failure belongs to this
        // group and must not abort the whole run.
        const schemaPath = context.model.components
          .find((component) => component.id === 'database')
          ?.files.find((file) => file.endsWith('.sql'));
        const schemaSource =
          schemaPath === undefined
            ? null
            : {
                path: schemaPath,
                text: await policy.readProjectFile(
                  projectRoot,
                  schemaPath,
                  signal === undefined ? {} : { signal },
                ),
              };
        return summarizeFindings(
          [
            ...auditDatabaseUsage(
              schemaSource,
              context.phpSources,
              signal,
            ).diagnostics.findings.filter(
              (finding) =>
                finding.code !== 'database.column.unused' ||
                !context.model.diagnostics.findings.some(
                  (entry) =>
                    entry.code === 'project.source.read-limit' &&
                    entry.kind === 'unsupported-syntax' &&
                    entry.syntax.language === 'php',
                ),
            ),
            ...context.model.diagnostics.findings.filter((finding) =>
              finding.code.startsWith('project.source.'),
            ),
          ],
          signal,
        );
      },
    },
  ];
}
