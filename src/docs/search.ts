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

/**
 * Parses the API response, keeping only hits that are complete.
 *
 * A hit missing its title cannot be cited or fetched, so it is dropped rather
 * than shown with a gap where the source should be.
 */
export function parseSearchResponse(body: string, limit: number): readonly SearchHit[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const search = (parsed as { query?: { search?: unknown } }).query?.search;
  if (!Array.isArray(search)) {
    return [];
  }

  const hits: SearchHit[] = [];
  for (const raw of search as readonly RawHit[]) {
    if (typeof raw.title !== 'string' || raw.title.length === 0) {
      continue;
    }
    hits.push({
      title: raw.title,
      path: pathForTitle(raw.title),
      // The snippet is wiki-authored HTML, so it is stripped like any other
      // retrieved content before it goes anywhere near a result.
      snippet: typeof raw.snippet === 'string' ? htmlToText(raw.snippet) : '',
      lastEdited: typeof raw.timestamp === 'string' ? raw.timestamp : null,
    });
    if (hits.length >= limit) {
      break;
    }
  }
  return hits;
}

/** The API parameters for one search, all values fixed except the query. */
export function searchParams(query: string, limit: number): Readonly<Record<string, string>> {
  return {
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(limit),
    format: 'json',
    formatversion: '1',
  };
}
