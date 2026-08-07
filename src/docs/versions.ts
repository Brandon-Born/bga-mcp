/**
 * Reads the software versions BGA Studio publishes.
 *
 * The Studio page carries a "Software Versions" section listing what the
 * platform actually runs. Nothing here guesses: if the section cannot be found
 * or cannot be read, that is reported as unknown, because a wrong version is
 * worse than no version to a developer choosing what syntax to write.
 *
 * Pure functions, no I/O.
 */

export interface FrameworkVersion {
  readonly software: string;
  readonly version: string;
  /** The line it was read from, so a developer can check the reading. */
  readonly statedAs: string;
}

const SECTION_HEADING = /software\s+versions/iu;

/**
 * Extracts the version lines from the page text.
 *
 * The section is found by its heading and read until the next heading-like
 * line. A line is only reported when it names software and a version, so prose
 * inside the section does not become a fact.
 */
export function parseFrameworkVersions(text: string): readonly FrameworkVersion[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => SECTION_HEADING.test(line) && line.length < 60);
  if (start === -1) {
    return [];
  }

  const versions: FrameworkVersion[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    // A short line with no digits after the first few entries is the next
    // heading, and the section has ended.
    if (versions.length > 0 && trimmed.length < 40 && !/\d/u.test(trimmed)) {
      break;
    }
    const match = /^([A-Za-z][A-Za-z0-9 /+.#-]{1,40}?)\s*[:–-]\s*(.+)$/u.exec(trimmed);
    if (match?.[1] === undefined || match[2] === undefined) {
      continue;
    }
    const value = match[2].trim();
    if (!/\d/u.test(value)) {
      continue;
    }
    versions.push({ software: match[1].trim(), version: value, statedAs: trimmed });
    if (versions.length >= 12) {
      break;
    }
  }
  return versions;
}
