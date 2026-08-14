/**
 * Reads the software versions BGA Studio publishes.
 *
 * The Studio page carries a "Software Versions" section listing what the
 * platform actually runs. Nothing here guesses: if the section cannot be found
 * or cannot be read, that is reported as unknown, because a wrong version is
 * worse than no version to a developer choosing what syntax to write.
 *
 * This reads the page's markup rather than its flattened text, because the
 * words "Software Versions" appear on the page more than once. The first
 * occurrence is the table-of-contents link, and anchoring on it read the
 * navigation that follows: the live resource once reported a forum
 * announcement URL as the platform's only software version. A rendered heading
 * is an `<h1>`–`<h6>` element, a table-of-contents entry is a list item, and
 * only the first of those is an anchor.
 *
 * Pure functions, no I/O.
 *
 * Source: <https://en.doc.boardgamearena.com/Studio#Software_Versions>,
 * retrieved 2026-08-09, which says "Versions currently used by BGA framework:"
 * and then lists "Dojo Toolkit 1.15 - deprecated, avoid at all cost",
 * "PHP: 8.4", "SQL: MySQL 5.7 (prod) - on studio 8.0", a JS/CSS/HTML entry
 * that states no version, and two "Font Awesome" entries.
 */

import { htmlToText } from './excerpt.js';
import { cancellationCheckpoint } from '../deadline.js';

export interface FrameworkVersion {
  /** The software the line names: `PHP`, `SQL`, `Dojo Toolkit`, `Font Awesome`. */
  readonly software: string;
  readonly version: string;
  /**
   * What the line said around the number, when it said anything.
   *
   * The maintained list qualifies several values — `MySQL 5.7 (prod)` and
   * `on studio 8.0` are one line about two environments — and dropping the
   * qualifier would turn two readings into a contradiction.
   */
  readonly detail: string | null;
  /** The line it was read from, so a developer can check the reading. */
  readonly statedAs: string;
}

export interface FrameworkVersionConflict {
  readonly software: string;
  readonly versions: readonly string[];
}

export interface FrameworkVersionReading {
  readonly status: 'read' | 'unknown';
  /** Why nothing was read, when nothing was. Null on success. */
  readonly reason: string | null;
  /** The heading text this reading is anchored to, so the anchor is checkable. */
  readonly heading: string | null;
  readonly versions: readonly FrameworkVersion[];
  /**
   * Software the page states more than one version for.
   *
   * Reported rather than resolved. The page currently lists two Font Awesome
   * versions and two SQL environments, and choosing one of them would be this
   * server inventing a fact the source does not state.
   */
  readonly conflicts: readonly FrameworkVersionConflict[];
}

const SECTION_HEADING = /software\s+versions/iu;
const HEADING_ELEMENT = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu;
const LIST_ITEM = /<li\b([^>]*)>([\s\S]*?)<\/li>/giu;

/** Elements inside a list item whose text is a sample, not a statement. */
const SAMPLE_ELEMENT = /<(code|pre|kbd|samp)\b[^>]*>[\s\S]*?<\/\1>/giu;

/**
 * An aside written around a sample, such as `(available as <code>…</code>)`.
 *
 * Dropped whole. Removing only the sample leaves "(available as )", which is
 * not something the page says.
 */
const SAMPLE_ASIDE = /\([^()]*<(code|pre|kbd|samp)\b[\s\S]*?<\/\1>[^()]*\)/giu;

/** A bare URL. Never a version, however many numbers it contains. */
const URL_TEXT = /\bhttps?:\/\/\S+/giu;

/**
 * A dotted release number.
 *
 * The dot is required. A bare integer would make "as of Apr 1, 2026" a version
 * and dates are exactly what this must never report. A page that states a
 * single-number version is read as unknown rather than guessed at.
 */
const VERSION_TOKEN = /(?<![\w.])(\d+(?:\.\d+)+)(?![\w.])/u;

/** Separates the values and notes on one line: `MySQL 5.7 (prod) - on studio 8.0`. */
const SEGMENT_SEPARATOR = /\s+[-–—]\s+/u;

/** Words that introduce a value rather than naming anything. */
const LEADING_FILLER = /^(?:and|on|or|in|is|are|as|at|to|the|a|an|of|for)\b\s*/iu;

const MAX_SOFTWARE_CHARS = 40;
const MAX_SOFTWARE_WORDS = 4;
const MAX_VERSIONS = 12;

/** Collapses one element's markup into the single line a reader sees. */
function lineOf(html: string, signal?: AbortSignal): string {
  return htmlToText(html, signal).split('\n').join(' ').replace(/\s+/gu, ' ').trim();
}

/**
 * The same line with everything that is not a statement taken out.
 *
 * A URL and a markup sample both carry numbers — `fontawesome.com/v4.7` and
 * `<i class="fa6 fa6-clock" />` — and neither states a version. They are
 * removed before reading and kept in the evidence line, so the reading is
 * narrow and what the page said is still checkable.
 */
function readableLine(html: string, signal?: AbortSignal): string {
  cancellationCheckpoint(signal);
  return lineOf(html.replace(SAMPLE_ASIDE, ' ').replace(SAMPLE_ELEMENT, ' '), signal)
    .replace(URL_TEXT, ' ')
    .replace(/\(\s*\)/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Whether a list item is a table-of-contents entry rather than content. */
function isNavigationItem(attributes: string, html: string): boolean {
  return /toclevel|tocsection/iu.test(attributes) || /class="[^"]*toc(?:number|text)/iu.test(html);
}

/** Trims a fragment down to the name of a piece of software, or nothing. */
function softwareName(candidate: string): string | null {
  const cleaned = candidate
    .replace(/[\s:,;.]+$/u, '')
    .replace(/^[\s:,;.-]+/u, '')
    .trim();
  if (
    cleaned.length === 0 ||
    cleaned.length > MAX_SOFTWARE_CHARS ||
    !/^[A-Za-z]/u.test(cleaned) ||
    cleaned.split(/\s+/u).length > MAX_SOFTWARE_WORDS
  ) {
    return null;
  }
  return cleaned;
}

/** What the segment said apart from the number, when it said anything. */
function detailOf(segment: string, version: string): string | null {
  const remainder = segment
    .replace(version, ' ')
    .replace(/\s+/gu, ' ')
    .replace(LEADING_FILLER, '')
    .replace(/^[\s:,;.-]+|[\s:,;.-]+$/gu, '')
    .trim();
  return remainder.length === 0 ? null : remainder;
}

/**
 * Reads one list item as zero or more software/version readings.
 *
 * Zero is the common case for a line that states no version — the maintained
 * list contains one — and a line that cannot be attributed to software is
 * dropped rather than reported under a name this code made up.
 */
function readItem(itemHtml: string, signal?: AbortSignal): readonly FrameworkVersion[] {
  const statedAs = lineOf(itemHtml, signal);
  const line = readableLine(itemHtml, signal);

  const labelled = /^([^:]{1,40}):\s*(.+)$/u.exec(line);
  const label = labelled?.[1] === undefined ? null : softwareName(labelled[1]);
  const body = label === null ? line : (labelled?.[2] ?? '');

  const readings: FrameworkVersion[] = [];
  let software = label;
  for (const segment of body.split(SEGMENT_SEPARATOR)) {
    cancellationCheckpoint(signal);
    const match = VERSION_TOKEN.exec(segment);
    const version = match?.[1];
    if (version === undefined || match === null) {
      continue;
    }
    // An unlabelled line names its software before the number, as in
    // "Dojo Toolkit 1.15". Later segments of the same line inherit that name:
    // "on studio 8.0" is still about the software the line opened with.
    const named = software ?? softwareName(segment.slice(0, match.index));
    if (named === null) {
      continue;
    }
    // Where the name came out of the segment, only what follows the number is
    // detail; repeating the name back as its own qualifier says nothing.
    const detailSource = software === null ? segment.slice(match.index) : segment;
    software = named;
    readings.push({ software: named, version, detail: detailOf(detailSource, version), statedAs });
  }
  return readings;
}

/** Software the page states more than one version for, in the order first read. */
function conflictsIn(
  versions: readonly FrameworkVersion[],
  signal?: AbortSignal,
): readonly FrameworkVersionConflict[] {
  const bySoftware = new Map<string, string[]>();
  for (const entry of versions) {
    cancellationCheckpoint(signal);
    const seen = bySoftware.get(entry.software) ?? [];
    if (!seen.includes(entry.version)) {
      bySoftware.set(entry.software, [...seen, entry.version]);
    }
  }
  return [...bySoftware]
    .filter(([, found]) => found.length > 1)
    .map(([software, found]) => ({ software, versions: found }));
}

/** Every rendered heading on the page, with the span of text that follows it. */
function sectionsAfterHeadings(
  html: string,
  signal?: AbortSignal,
): readonly { readonly heading: string; readonly body: string }[] {
  cancellationCheckpoint(signal);
  const headings: { text: string; start: number; end: number }[] = [];
  for (const match of html.matchAll(HEADING_ELEMENT)) {
    cancellationCheckpoint(signal);
    headings.push({
      text: lineOf(match[2] ?? '', signal),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  const sections = headings.map((heading, index) => {
    cancellationCheckpoint(signal);
    return {
      heading: heading.text,
      // A section ends at the next heading of any level. The subsection that
      // follows this one on the Studio page lists PHP extensions with a date in
      // its prose, and a date must never become a version.
      body: html.slice(heading.end, headings[index + 1]?.start ?? html.length),
    };
  });
  cancellationCheckpoint(signal);
  return sections;
}

/**
 * Reads the published versions from the page's markup.
 *
 * Every heading that names the section is tried in document order, and the
 * first one whose list yields a reading wins. A heading with nothing readable
 * under it is not evidence that the page has no versions — it may be a
 * duplicate heading in navigation — so the search continues past it.
 */
export function readFrameworkVersions(html: string, signal?: AbortSignal): FrameworkVersionReading {
  const candidates = sectionsAfterHeadings(html, signal).filter((section) => {
    cancellationCheckpoint(signal);
    return SECTION_HEADING.test(section.heading);
  });
  if (candidates.length === 0) {
    return {
      status: 'unknown',
      reason: 'The page has no rendered "Software Versions" heading.',
      heading: null,
      versions: [],
      conflicts: [],
    };
  }

  for (const candidate of candidates) {
    cancellationCheckpoint(signal);
    const versions: FrameworkVersion[] = [];
    for (const item of candidate.body.matchAll(LIST_ITEM)) {
      cancellationCheckpoint(signal);
      if (isNavigationItem(item[1] ?? '', item[2] ?? '')) {
        // A table of contents is a list of numbered links. Read as content,
        // its section numbers look exactly like release numbers.
        continue;
      }
      for (const reading of readItem(item[2] ?? '', signal)) {
        cancellationCheckpoint(signal);
        if (versions.length >= MAX_VERSIONS) {
          break;
        }
        versions.push(reading);
      }
    }
    if (versions.length > 0) {
      return {
        status: 'read',
        reason: null,
        heading: candidate.heading,
        versions,
        conflicts: conflictsIn(versions, signal),
      };
    }
  }

  return {
    status: 'unknown',
    reason: 'The "Software Versions" section contains no list stating a version.',
    heading: candidates[0]?.heading ?? null,
    versions: [],
    conflicts: [],
  };
}
