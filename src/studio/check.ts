import { STUDIO_HOST, STUDIO_SESSION_ENV, type PolicyBoundary } from '../policy.js';
import { htmlToText } from '../docs/excerpt.js';
import { cancellationCheckpoint } from '../deadline.js';
import { parseStudioLog, saysProjectMissing } from './logline.js';
import { publishStudioText, screenStudioLog } from './privacy.js';

/**
 * Checks a Studio setup and says what to do about whatever is wrong.
 *
 * This exists because the first version of this capability failed in the worst
 * possible way: a mistyped account name returned an empty result, which is
 * indistinguishable from a quiet game. Every check below turns a silent nothing
 * into a sentence.
 */

export interface CheckLine {
  readonly ok: boolean;
  readonly text: string;
  /** What to do about it, when it is not ok. */
  readonly fix?: string;
}

export interface StudioCheckReport {
  readonly lines: readonly CheckLine[];
  readonly ok: boolean;
}

function line(ok: boolean, text: string, fix?: string): CheckLine {
  return fix === undefined ? { ok, text } : { ok, text, fix };
}

/**
 * Runs the checks in the order they block each other, stopping at the first
 * failure so the report names one problem rather than a cascade.
 */
export async function checkStudioSetup(
  policy: PolicyBoundary,
  gameId: string | null,
  // Injectable so the interesting half — what the page turned out to contain —
  // can be exercised without a live account.
  fetchPage: (id: string, signal?: AbortSignal) => Promise<{ url: string; body: string }> = async (
    id,
    signal,
  ) =>
    await policy.fetchStudioPage(
      { path: 'studiogame', params: { game: id } },
      signal === undefined ? {} : { signal },
    ),
  signal?: AbortSignal,
): Promise<StudioCheckReport> {
  cancellationCheckpoint(signal);
  const lines: CheckLine[] = [];
  const { config } = policy;

  if (!config.networkEnabled) {
    lines.push(
      line(false, 'Network access is disabled.', 'Start the server with --allow-network.'),
    );
    return { lines, ok: false };
  }
  lines.push(line(true, 'Network access is enabled.'));

  if (!config.experimentalStudioLogs) {
    lines.push(
      line(
        false,
        'The experimental Studio log reader is disabled.',
        'Add --experimental-studio-logs. It is off by default because it reads a page BGA does not version.',
      ),
    );
    return { lines, ok: false };
  }
  lines.push(line(true, 'The experimental Studio log reader is enabled.'));

  const session = await policy.studioSession(signal === undefined ? {} : { signal });
  cancellationCheckpoint(signal);
  if (session === null) {
    lines.push(
      line(
        false,
        // Why, when there is a why: a developer whose file has the wrong mode
        // cannot act on "no session was found".
        policy.studioSessionRefusal ?? 'No Studio session was found.',
        `Set ${STUDIO_SESSION_ENV}, or use --studio-session-file. Sign in to https://${STUDIO_HOST}, open developer tools, and copy the entire Cookie header from any request to that host.`,
      ),
    );
    return { lines, ok: false };
  }
  lines.push(
    line(
      true,
      // Which provider, never which file. The operator knows where they put
      // it; an agent reading this terminal does not need to learn where a
      // credential lives on their machine.
      config.studioSessionFile === undefined
        ? `A session was found in ${STUDIO_SESSION_ENV}.`
        : 'A session was found in the configured file.',
    ),
  );

  if (config.studioDevAccounts.length === 0) {
    lines.push(
      line(
        false,
        'No Studio dev accounts were declared, so no log line could ever be returned.',
        'Add --studio-dev-account <name> for each account you own, exactly as it appears in Studio, for example mytest0.',
      ),
    );
    return { lines, ok: false };
  }
  lines.push(line(true, `Declared accounts: ${config.studioDevAccounts.join(', ')}.`));

  if (gameId === null) {
    lines.push(
      line(
        true,
        'Configuration looks complete. Pass a game id to check a real page: bga-mcp --studio-check <gameId>.',
      ),
    );
    return { lines, ok: true };
  }

  let body: string;
  try {
    const page = await fetchPage(gameId, signal);
    cancellationCheckpoint(signal);
    body = page.body;
    lines.push(line(true, `Retrieved ${page.url}.`));
  } catch (error) {
    // A deadline is the outcome of the enclosing operation, not a failed
    // Studio setup check that may continue formatting after expiry.
    cancellationCheckpoint(signal);
    const message = error instanceof Error ? error.message : String(error);
    lines.push(
      line(
        false,
        `Could not retrieve the Studio page: ${message}`,
        // Named by what actually failed: telling somebody their session expired
        // when the page was simply too large sends them to refresh a cookie
        // that was working.
        /redirect/iu.test(message)
          ? 'A redirect usually means the session has expired; sign in again and copy a fresh Cookie header.'
          : 'Check that the project name matches the one in Manage Games, and that the session in your configured file is current.',
      ),
    );
    return { lines, ok: false };
  }

  const pageText = htmlToText(body, signal);
  if (saysProjectMissing(pageText, signal)) {
    // What Studio answers, with a 200, for a project that is not there or not
    // this account's — including for a numeric Play ID, which is a different
    // identifier rather than this one.
    lines.push(
      line(
        false,
        'Studio says that project does not exist, or is not one this account may read.',
        'Use the project name from Manage Games — the `game` parameter of the studiogame URL, for example mcpverification — rather than the numeric Play ID from the game page.',
      ),
    );
    return { lines, ok: false };
  }

  const parsed = parseStudioLog(pageText, signal);
  // Screened before anything is said about the page, so every sentence below is
  // built from the screened view. `publish` is the same guarantee applied a
  // second time at the boundary, because this report reaches a terminal, a
  // launcher log, and whatever CI keeps of them — surfaces the MCP result's own
  // screening never covered.
  const screened = screenStudioLog(
    parsed,
    config.studioDevAccounts,
    policy.redactionOptions,
    signal,
  );
  const publish = (text: string): string =>
    publishStudioText(text, screened.withheldValues, policy.redactionOptions, signal);
  const withActors = [];
  for (const entry of parsed) {
    cancellationCheckpoint(signal);
    if (entry.actorName !== null) {
      withActors.push(entry);
    }
  }
  if (withActors.length === 0) {
    lines.push(
      line(
        false,
        'The page was retrieved, and it carries no log lines at all.',
        // What a project with no gameplay looks like, which a live run on
        // 2026-08-10 confirmed: the page came back whole, three megabytes of
        // it, with nothing matching the documented log shape. The
        // documentation says the log appears on this page, so the likely
        // answer is that nothing has been played yet rather than that the tool
        // is looking in the wrong place.
        'Observed live on 2026-08-10: this page is a JavaScript application, 99% script by weight, and identical in shape for a project that exists and one that does not. The log you see in a browser is rendered there rather than served in the HTML. Reading it would need something this tool is not — see the experimental status of read_studio_logs.',
      ),
    );
    return { lines, ok: false };
  }
  lines.push(line(true, publish(`Found ${String(withActors.length)} log line(s) in the page.`)));

  if (screened.kept.length === 0) {
    lines.push(
      line(
        false,
        publish('Log lines were found, but none belong to a declared account.'),
        // This used to name the accounts the page showed, which is the fastest
        // way to fix a typo and also a way to publish another developer's — or
        // a real player's — name to a terminal and everything that records it.
        // The count is enough to tell a typo from an empty page; the name has
        // to come from the developer's own Studio page.
        publish(
          `${String(withActors.length)} attributed line(s) were found and none matched, so no name from the page is shown here. ` +
            'Open the game in Studio, read your own dev account name there, and pass it exactly with --studio-dev-account.',
        ),
      ),
    );
    return { lines, ok: false };
  }

  lines.push(
    line(
      true,
      publish(
        `${String(screened.kept.length)} line(s) are yours and would be returned; ` +
          `${String(screened.withheld.foreign)} belong to others and ${String(screened.withheld.sensitive)} carry credentials, and are withheld.`,
      ),
    ),
  );
  return { lines, ok: true };
}

/** Renders the report for a terminal. */
export function formatStudioCheck(report: StudioCheckReport): string {
  const lines = report.lines.map((entry) => {
    const mark = entry.ok ? 'ok  ' : 'FAIL';
    return entry.fix === undefined
      ? `${mark} ${entry.text}`
      : `${mark} ${entry.text}\n     ${entry.fix}`;
  });
  lines.push(
    report.ok
      ? 'Studio setup looks usable. Nothing here has been verified against a live account before, so treat the first real result as the test.'
      : 'Studio setup is not usable yet. Fix the item above and run this again.',
  );
  return lines.join('\n');
}
