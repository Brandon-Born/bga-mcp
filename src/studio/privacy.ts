import {
  containsCredential,
  MIN_REDACTED_SECRET_LENGTH,
  redactSecrets,
  type RedactionOptions,
} from '../redaction.js';

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
  /**
   * The exact strings that were withheld, kept only so publication can prove
   * none of them survived. Never returned, formatted, or counted as content.
   */
  readonly withheldValues: readonly string[];
}

/**
 * Values that are never returned, whoever they belong to.
 *
 * A session or lock token is a credential, and an email address is personal
 * data even when it is the developer's own — neither belongs in a tool result
 * that an agent will carry into its context.
 *
 * These are the shapes this page carries that the shared credential rules do
 * not name; everything a credential can look like anywhere else is recognized
 * by {@link containsCredential} rather than listed again here. The 2026-08-08
 * review found the cost of a private list: an own-account line carrying
 * `Authorization: Bearer …` came back with the token on it, because four
 * patterns were all this file knew about.
 */
const NEVER_RETURNED: readonly RegExp[] = [
  /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/iu,
  /\block=[0-9a-f-]{8,}/iu,
  /\bsession[_-]?id\s*[=:]\s*\S+/iu,
  /\bPHPSESSID\b/iu,
];

function isSensitive(line: StudioLogLine, options: RedactionOptions): boolean {
  return (
    NEVER_RETURNED.some((pattern) => pattern.test(line.raw)) ||
    containsCredential(line.raw, options)
  );
}

/** Decides one line against the developer's own accounts. */
export function screenLine(
  line: StudioLogLine,
  ownAccounts: readonly string[],
  options: RedactionOptions = {},
): LineDisposition {
  if (isSensitive(line, options)) {
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
  options: RedactionOptions = {},
): ScreeningResult {
  const kept: StudioLogLine[] = [];
  const withheld = { foreign: 0, unattributable: 0, sensitive: 0 };
  const withheldValues = new Set<string>();

  for (const line of lines) {
    const disposition = screenLine(line, ownAccounts, options);
    if (disposition === 'own') {
      kept.push(line);
      continue;
    }
    withheld[disposition] += 1;
    // Long enough to be worth removing by value. A live run on 2026-08-10
    // returned "[withheld] log line(s) ... limited to meatmugdev[withheld]",
    // because a withheld line's message was a single digit and every digit in
    // the report went with it. A fragment that short identifies nobody.
    for (const value of [line.raw, line.actorName ?? '', line.message]) {
      if (value.length >= MIN_REDACTED_SECRET_LENGTH) {
        withheldValues.add(value);
      }
    }
  }

  return { kept, withheld, withheldValues: [...withheldValues] };
}

/** True when anything was withheld, so a caller can say so plainly. */
export function withheldAny(result: ScreeningResult): boolean {
  return Object.values(result.withheld).some((count) => count > 0);
}

/** Stands in for anything withheld, so a removal is visible rather than silent. */
export const WITHHELD_MARK = '[withheld]';

/**
 * The last thing that happens to any Studio text before it is published.
 *
 * The screening rule above decides what may be returned; this decides that the
 * decision survived. Every surface goes through it — the MCP result, the setup
 * report, the terminal check, a thrown error, and anything a launcher or CI job
 * captures from those — because the 2026-08-08 review found the leak in the one
 * surface nobody had routed through the screen: a preflight hint that named the
 * other developers whose lines the same screen had just withheld.
 *
 * It replaces rather than throws. A diagnostic that crashes tells the developer
 * nothing, and a visible `[withheld]` is a better failure than a name.
 *
 * Withheld values go first, then the shared secret rules. The screen above
 * decides whole lines; these rules decide values inside a line that was kept,
 * which is what an own-account message needs — the line is the developer's, and
 * the player identifier or token on it still is not something to hand an agent.
 */
export function publishStudioText(
  text: string,
  withheldValues: readonly string[],
  options: RedactionOptions = {},
): string {
  let published = text;
  // Longest first: a raw line contains its own actor name, and replacing the
  // name first would leave the rest of the line behind.
  for (const value of [...withheldValues].sort((left, right) => right.length - left.length)) {
    if (value.length === 0) {
      continue;
    }
    published = published.split(value).join(WITHHELD_MARK);
  }
  return redactSecrets(published, options);
}
