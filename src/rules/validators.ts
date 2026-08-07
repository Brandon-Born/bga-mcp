import type { PolicyBoundary } from '../policy.js';
import type { ProjectContext } from '../tools/project-context.js';
import { validateActionContracts } from './action-contracts.js';
import type { GroupRunner } from './aggregate.js';
import { auditDatabaseUsage } from './database.js';
import { validateNotifications } from './notifications.js';
import { validateStateMachine } from './state-machine.js';

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
): GroupRunner[] {
  return [
    {
      id: 'state-machine',
      run: () => validateStateMachine(context.model, context.phpSources),
    },
    {
      id: 'action-contracts',
      run: () =>
        validateActionContracts(context.model, context.clientSources, context.phpSources)
          .diagnostics,
    },
    {
      id: 'notifications',
      run: () => validateNotifications(context.phpSources, context.clientSources).diagnostics,
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
            : { path: schemaPath, text: await policy.readProjectFile(projectRoot, schemaPath) };
        return auditDatabaseUsage(schemaSource, context.phpSources).diagnostics;
      },
    },
  ];
}
