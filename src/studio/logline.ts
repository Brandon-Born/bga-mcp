/**
 * Reads a BGA Studio log line.
 *
 * The documented shape carries the actor in every line, which is what makes a
 * privacy rule enforceable here rather than aspirational:
 *
 *   20/06 21:50:56 [info] [T403] [4/mytest0] /cinco/cinco/exchange4Cards.html?...
 *   20/06 21:50:56 [notice] [T403] [4/mytest0] OK-0 169 d141 c8 e0 I9 A158 V0 T0
 *   20/06 21:50:56 [info] [T403] [4/mytest0] 0.26 SELECT player_tokenColor FROM player WHERE player_id ='4'
 *
 * `[T403]` is the table and `[4/mytest0]` is the player id and name the line is
 * about. A line whose actor cannot be read is `unknown`, and unknown is treated
 * as not-yours everywhere downstream.
 *
 * Only text that begins like a log line is one. The page carrying the log is a
 * signed-in management interface three megabytes wide, and treating each of its
 * lines as an unreadable log entry is how a live run on 2026-08-10 reported
 * "53 unattributable" for a project whose log was empty — a count that reads as
 * "53 things were hidden from you" and meant "53 lines of page furniture".
 *
 * Pure functions, no I/O.
 */

export interface StudioLogLine {
  readonly raw: string;
  readonly timestamp: string | null;
  readonly level: string | null;
  readonly tableId: string | null;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly message: string;
}

const LINE =
  /^(?<timestamp>\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(?<level>[a-z]+)\]\s+\[T(?<table>[0-9]+)\]\s+\[(?<actorId>[0-9]+)\/(?<actorName>[^\]]*)\]\s*(?<message>.*)$/u;

/** Parses one line, keeping the original text whatever happens. */
export function parseStudioLogLine(raw: string): StudioLogLine {
  const match = LINE.exec(raw.trim());
  if (match?.groups === undefined) {
    return {
      raw,
      timestamp: null,
      level: null,
      tableId: null,
      actorId: null,
      actorName: null,
      message: raw.trim(),
    };
  }
  const { timestamp, level, table, actorId, actorName, message } = match.groups;
  return {
    raw,
    timestamp: timestamp ?? null,
    level: level ?? null,
    tableId: table ?? null,
    actorId: actorId ?? null,
    actorName: actorName ?? null,
    message: message ?? '',
  };
}

/**
 * Whether Studio answered "this project is not one you can read".
 *
 * Matched without apostrophes on purpose. Studio answers a missing or
 * inaccessible project with a 200 and a sentence, and the sentence contains two
 * of them — a live run on 2026-08-10 sailed past a straight-quote pattern and
 * reported a successful empty log for a project name that does not exist, which
 * is the very confusion this check exists to prevent.
 */
export function saysProjectMissing(pageText: string): boolean {
  const flattened = pageText.replace(/['\u2018\u2019\u02bc`\u00b4]/gu, '');
  return /the project doesnt exist or you dont have access to it/iu.test(flattened);
}

/** The timestamp every documented log line opens with, and page text does not. */
const LOG_LINE_START = /^\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s/u;

/** True when a line is a log line at all, whether or not its actor can be read. */
export function isStudioLogLine(line: string): boolean {
  return LOG_LINE_START.test(line.trim());
}

export function parseStudioLog(text: string): readonly StudioLogLine[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => isStudioLogLine(line))
    .map((line) => parseStudioLogLine(line));
}
