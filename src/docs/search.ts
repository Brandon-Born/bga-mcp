/**
 * Reads a MediaWiki search response.
 *
 * The wiki publishes a search API that answers with titles, snippets, and each
 * page's last edit. Using it rather than scraping the rendered search page is
 * both sturdier and narrower: it is the `search=yes` use the source's own
 * content signals permit, and it returns provenance the HTML does not.
 *
 * Pure functions, no I/O.
 */

import { htmlToText } from './excerpt.js';
import { cancellationCheckpoint } from '../deadline.js';

export interface SearchHit {
  readonly title: string;
  /** Page path relative to the wiki root, ready to be requested. */
  readonly path: string;
  /** The snippet the wiki itself produced, stripped of its markup. */
  readonly snippet: string;
  /** The page's last edit, which is the source's own freshness signal. */
  readonly lastEdited: string | null;
}

interface RawHit {
  readonly title?: unknown;
  readonly snippet?: unknown;
  readonly timestamp?: unknown;
}

/** Turns a wiki page title into the path that requests it. */
export function pathForTitle(title: string): string {
  return encodeURIComponent(title.replaceAll(' ', '_'))
    .replaceAll('%3A', ':')
    .replaceAll('%2F', '/');
}

export interface SearchResponse {
  readonly hits: readonly SearchHit[];
  /**
   * Why the response could not be read, when it could not be.
   *
   * Separate from an empty `hits` on purpose. A search that answered "nothing
   * matched" and a search that did not answer at all are different facts, and
   * reporting the second as the first is how an outage came back as "no
   * documentation matched".
   */
  readonly unreadable: string | null;
}

/**
 * Reads the API response, keeping only hits that are complete.
 *
 * A hit missing its title cannot be cited or fetched, so it is dropped rather
 * than shown with a gap where the source should be.
 */
export function readSearchResponse(
  body: string,
  limit: number,
  signal?: AbortSignal,
): SearchResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitizeJson(body, signal));
    cancellationCheckpoint(signal);
  } catch {
    cancellationCheckpoint(signal);
    return { hits: [], unreadable: 'the source did not answer with JSON' };
  }
  const search = (parsed as { query?: { search?: unknown } }).query?.search;
  if (!Array.isArray(search)) {
    // A search that ran carries a result list, even an empty one. Anything
    // else is the API refusing, erroring, or having been replaced.
    return { hits: [], unreadable: 'the answer carried no search results' };
  }

  const hits: SearchHit[] = [];
  for (const raw of search as readonly RawHit[]) {
    cancellationCheckpoint(signal);
    if (typeof raw.title !== 'string' || raw.title.length === 0) {
      continue;
    }
    hits.push({
      title: raw.title,
      path: pathForTitle(raw.title),
      // The snippet is wiki-authored HTML, so it is stripped like any other
      // retrieved content before it goes anywhere near a result.
      snippet: typeof raw.snippet === 'string' ? htmlToText(raw.snippet, signal) : '',
      lastEdited: typeof raw.timestamp === 'string' ? raw.timestamp : null,
    });
    if (hits.length >= limit) {
      break;
    }
  }
  return { hits, unreadable: null };
}

/**
 * Escapes raw control characters inside the response.
 *
 * The wiki returns snippets containing literal newlines, which `JSON.parse`
 * rejects outright. Without this the whole response fails to parse and the
 * search silently returns nothing — a wrong answer that looks like no answer.
 */
function sanitizeJson(body: string, signal?: AbortSignal): string {
  cancellationCheckpoint(signal);
  // eslint-disable-next-line no-control-regex -- control characters are the defect
  return body.replace(/[\u0000-\u001F]/gu, (character) => {
    cancellationCheckpoint(signal);
    const code = character.codePointAt(0) ?? 0;
    return `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

/** The API parameters for one search, all values fixed except the query. */
export function searchParams(query: string, limit: number): Readonly<Record<string, string>> {
  return {
    action: 'query',
    list: 'search',
    srsearch: query,
    // Without this the wiki matches titles only, and a search for
    // "notifyAllPlayers" or "getArgs" returns nothing at all while the pages
    // documenting them sit in the index. Measured 2026-08-08.
    srwhat: 'text',
    srlimit: String(limit),
    format: 'json',
    formatversion: '1',
  };
}
