import type { PolicyBoundary } from '../policy.js';

/**
 * Reports what is set up, what is not, and what to do about it.
 *
 * Addressed to the agent rather than to a terminal. The developer is talking to
 * an assistant, and an assistant cannot read output from a command nobody ran,
 * so every finding here carries a stable code, a sentence, and a next action a
 * caller can act on or repeat verbatim.
 *
 * It never reports a credential. Whether one was found, and where from, is the
 * most it will say.
 */

export type FindingStatus = 'ok' | 'action-needed' | 'unavailable';

export interface SetupFinding {
  /** Stable across releases, so a caller can branch on it. */
  readonly code: string;
  readonly status: FindingStatus;
  readonly summary: string;
  /** What to do next. Absent only when there is nothing to do. */
  readonly nextAction?: string;
}

export interface SetupStatus {
  readonly schemaVersion: 1;
  readonly ready: boolean;
  readonly findings: readonly SetupFinding[];
}

function finding(
  code: string,
  status: FindingStatus,
  summary: string,
  nextAction?: string,
): SetupFinding {
  return nextAction === undefined
    ? { code, status, summary }
    : { code, status, summary, nextAction };
}

/**
 * Builds the report.
 *
 * A capability that is off is reported as off with the way to turn it on,
 * rather than omitted — a reader cannot ask about something they were never
 * told exists.
 */
export async function buildSetupStatus(policy: PolicyBoundary): Promise<SetupStatus> {
  const findings: SetupFinding[] = [];
  const { config } = policy;

  await policy.ensureClientRoots();
  const roots = policy.projectRoots;
  if (roots.length === 0) {
    findings.push(
      finding(
        'project.roots.none',
        'action-needed',
        'No project root is available, so every project capability will refuse.',
        'Start the server with --project-root <absolute path>, or use a client that advertises its open folders as roots.',
      ),
    );
  } else {
    findings.push(
      finding(
        'project.roots.available',
        'ok',
        `${String(roots.length)} project root(s) available. Pass projectRoot explicitly when more than one is.`,
      ),
    );
  }

  if (!config.networkEnabled) {
    findings.push(
      finding(
        'network.disabled',
        'unavailable',
        'Network access is off, so documentation search and Studio logs will refuse. Local project capabilities are unaffected.',
        'Start the server with --allow-network to enable them.',
      ),
    );
  } else {
    findings.push(finding('network.enabled', 'ok', 'Network access is enabled.'));
  }

  if (!config.experimentalStudioLogs) {
    findings.push(
      finding(
        'studio.disabled',
        'unavailable',
        'Studio log reading is off. It is experimental because it reads a page BGA does not document or version.',
        'Start the server with --experimental-studio-logs if you want it.',
      ),
    );
  } else {
    const session = await policy.studioSession();
    if (session === null) {
      findings.push(
        finding(
          'studio.session.missing',
          'action-needed',
          'Studio log reading is enabled but no session was found.',
          'Sign in to https://studio.boardgamearena.com, copy the whole Cookie request header from any request to that host, and put it in BGA_STUDIO_SESSION or a file named by --studio-session-file.',
        ),
      );
    } else {
      // Whether one exists and where it came from; never the value.
      findings.push(
        finding(
          'studio.session.present',
          'ok',
          config.studioSessionFile === undefined
            ? 'A Studio session was found in the environment.'
            : 'A Studio session was found in the configured file.',
        ),
      );
    }

    if (config.studioDevAccounts.length === 0) {
      findings.push(
        finding(
          'studio.accounts.none',
          'action-needed',
          'No Studio dev accounts are declared, so no log line could ever be returned.',
          'Add --studio-dev-account <name> for each account you own, spelled exactly as Studio spells it, for example mytest0.',
        ),
      );
    } else {
      findings.push(
        finding(
          'studio.accounts.declared',
          'ok',
          `Returning log lines for: ${config.studioDevAccounts.join(', ')}. Everything else is withheld.`,
        ),
      );
    }
  }

  return {
    schemaVersion: 1,
    // Ready means the local capabilities work. Optional things being off is
    // not a problem to solve.
    ready: !findings.some((entry) => entry.status === 'action-needed'),
    findings,
  };
}
