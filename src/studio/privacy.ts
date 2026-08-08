import type { StudioLogLine } from './logline.js';

/**
 * Keeps other people's data out of a log result.
 *
 * The condition this capability exists under is that it returns no personal
 * data belonging to anyone but the developer running it. That is enforceable
 * because every documented log line names its actor: a line about `mytest0` is
 * about a dev account the developer was issued, and a line about anyone else is
 * about a real player.
 *
 * The rule is an allowlist and it fails closed. A line is returned only when
 * its actor is a declared dev account of the developer. A line whose actor
 * cannot be read is withheld, because "I could not tell whose this is" is not a
 * reason to hand it over. Nothing is redacted and returned anyway: a partially
 * scrubbed line about a stranger is still a line about a stranger.
 *
 * Pure functions, no I/O.
 */

export type LineDisposition = 'own' | 'foreign' | 'unattributable' | 'sensitive';

export interface ScreenedLine {
  readonly line: StudioLogLine;
  readonly disposition: LineDisposition;
}

export interface ScreeningResult {
  readonly kept: readonly StudioLogLine[];
  /** Counts by reason, so a caller can say what it withheld without showing it. */
  readonly withheld: Readonly<Record<Exclude<LineDisposition, 'own'>, number>>;
}

/**
 * Values that are never returned, whoever they belong to.
 *
 * A session or lock token is a credential, and an email address is personal
 * data even when it is the developer's own — neither belongs in a tool result
 * that an agent will carry into its context.
 */
const NEVER_RETURNED: readonly RegExp[] = [
  /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/iu,
  /\block=[0-9a-f-]{8,}/iu,
  /\bsession[_-]?id\s*[=:]\s*\S+/iu,
  /\bPHPSESSID\b/iu,
];

function isSensitive(line: StudioLogLine): boolean {
  return NEVER_RETURNED.some((pattern) => pattern.test(line.raw));
}

/** Decides one line against the developer's own accounts. */
export function screenLine(line: StudioLogLine, ownAccounts: readonly string[]): LineDisposition {
  if (isSensitive(line)) {
    return 'sensitive';
  }
  if (line.actorName === null) {
    return 'unattributable';
  }
  const owned = ownAccounts.some(
    (account) => account.toLowerCase() === line.actorName?.toLowerCase(),
  );
  return owned ? 'own' : 'foreign';
}

/**
 * Screens a log, keeping only what belongs to the developer.
 *
 * With no declared accounts nothing is kept. That is deliberate: the guarantee
 * is "only your own data", and with no way to tell what is yours the honest
 * answer is nothing rather than everything.
 */
export function screenStudioLog(
  lines: readonly StudioLogLine[],
  ownAccounts: readonly string[],
): ScreeningResult {
  const kept: StudioLogLine[] = [];
  const withheld = { foreign: 0, unattributable: 0, sensitive: 0 };

  for (const line of lines) {
    const disposition = screenLine(line, ownAccounts);
    if (disposition === 'own') {
      kept.push(line);
      continue;
    }
    withheld[disposition] += 1;
  }

  return { kept, withheld };
}

/** True when anything was withheld, so a caller can say so plainly. */
export function withheldAny(result: ScreeningResult): boolean {
  return Object.values(result.withheld).some((count) => count > 0);
}
