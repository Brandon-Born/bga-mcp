import type { PolicyBoundary } from '../policy.js';
import type { ProjectContext } from '../tools/project-context.js';
import { normalizedProject } from '../tools/project-context.js';
import { cancellationCheckpoint } from '../deadline.js';
import { validateActionContracts } from './action-contracts.js';
import type { GroupRunner } from './aggregate.js';
import { auditDatabaseUsage } from './database.js';
import { validateNotifications } from './notifications.js';
import { validateStateMachine } from './state-machine.js';
import { summarizeFindings } from './uncertainty.js';

/**
 * A deliberately narrow absence proof, not the schema reader's completeness.
 * BGA: "all CREATE/ALTER tables and views should be in dbmodel.sql".
 * https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql
 * MySQL -- comments require following whitespace and run to the line end.
 * https://dev.mysql.com/doc/refman/8.0/en/comments.html
 * Reject every other spelling, including MySQL executable block comments.
 */
function inertSchema(text: string, signal?: AbortSignal): boolean {
  return text.split(/\r\n?|\n/u).every((line) => {
    cancellationCheckpoint(signal);
    return /^[ \t]*(?:--[ \t][^\r\n]*)?$/u.test(line);
  });
}

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
        (
          normalizedProject(context)?.actions ??
          validateActionContracts(context.model, context.clientSources, context.phpSources, signal)
        ).diagnostics,
    },
    {
      id: 'notifications',
      run: () =>
        summarizeFindings(
          [
            ...(
              normalizedProject(context)?.notifications ??
              validateNotifications(context.phpSources, context.clientSources, signal)
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
        const normalized = normalizedProject(context);
        if (normalized?.database.error !== null && normalized?.database.error !== undefined)
          throw normalized.database.error;
        const schemaSource =
          normalized?.database.source ??
          (schemaPath === undefined
            ? null
            : {
                path: schemaPath,
                text: await policy.readProjectFile(
                  projectRoot,
                  schemaPath,
                  signal === undefined ? {} : { signal },
                ),
              });
        const audit =
          normalized?.database.audit ??
          auditDatabaseUsage(schemaSource, context.phpSources, signal);
        const result = summarizeFindings(
          [
            ...audit.diagnostics.findings.filter(
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
        const completedChecks: { id: string; reason: string }[] = [];
        if (schemaSource !== null) {
          if (audit.queries.length > 0) {
            completedChecks.push({
              id: 'database.audit.unavailable',
              reason:
                'The validator read dbmodel.sql and at least one query reference. This proves audit availability only; unknown query text remains unsupported.',
            });
          }
          if (inertSchema(schemaSource.text, signal)) {
            for (const id of ['database.table.duplicate', 'database.column.duplicate']) {
              completedChecks.push({
                id,
                reason:
                  'The fully read dbmodel.sql contains only blank lines and ordinary -- line comments, so it declares no game tables or columns to duplicate. This does not validate runtime SQL.',
              });
            }
          }
        }
        // Retain only completed checks with no finding in the full owning
        // result. Aggregate truncation must never hide a defect into a pass.
        Object.defineProperty(result, 'completedChecks', {
          value: completedChecks.filter(
            (check) => !audit.diagnostics.findings.some((finding) => finding.code === check.id),
          ),
        });
        return result;
      },
    },
  ];
}
