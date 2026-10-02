/**
 * A bounded record of what a developer's own lookups returned.
 *
 * This is not an index of the wiki. No approved source permits building one
 * (see docs/DOCUMENTATION_SOURCES.md), so the cache only ever holds pages the
 * developer explicitly asked for, and only the excerpt that was shown to them
 * rather than the page.
 *
 * It lives in memory for the life of the process. That is a deliberate choice
 * and not an oversight: writing a cache to disk would give a server whose only
 * filesystem behaviour is reading a reason to write, which is a change to the
 * local-filesystem boundary rather than a convenience. A developer restarting
 * their editor loses nothing but a repeated fetch.
 *
 * Every entry carries its date. Nothing here can be served without one.
 */

export type SourceAuthority =
  'official-maintained' | 'official-host-community-edited' | 'community';

export interface DocumentationEntry {
  readonly url: string;
  readonly sourceId: string;
  readonly authority: SourceAuthority;
  /** When this server retrieved it. */
  readonly retrievedAt: string;
  /** The source's own last-modified signal, when it publishes one. */
  readonly lastModified: string | null;
  readonly title: string;
  /** The excerpt shown to the developer. Never the whole page. */
  readonly excerpt: string;
}

export interface CachedDocumentation extends DocumentationEntry {
  /** Age in whole days at the moment it was read. */
  readonly ageDays: number;
  readonly stale: boolean;
}

export interface CacheLimits {
  readonly maxEntries: number;
  readonly maxExcerptChars: number;
}

export const DEFAULT_CACHE_LIMITS: CacheLimits = { maxEntries: 200, maxExcerptChars: 2_000 };

const MILLISECONDS_PER_DAY = 86_400_000;

/** Whole days between two instants, floored, never negative. */
export function ageInDays(retrievedAt: string, now: Date): number {
  const retrieved = Date.parse(retrievedAt);
  if (Number.isNaN(retrieved)) {
    // An entry whose date cannot be read is treated as maximally old rather
    // than as fresh, because the date is the only thing making it usable.
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor((now.getTime() - retrieved) / MILLISECONDS_PER_DAY));
}

export class DocumentationCache {
  readonly #entries = new Map<string, DocumentationEntry>();
  readonly #limits: CacheLimits;

  constructor(limits: CacheLimits = DEFAULT_CACHE_LIMITS) {
    this.#limits = limits;
  }

  get size(): number {
    return this.#entries.size;
  }

  /**
   * Reads an entry and says how old it is.
   *
   * A stale entry is returned rather than hidden, marked stale, so a caller can
   * decide between refetching and telling the developer what it has. What it
   * cannot do is present it as current: `ageDays` and `retrievedAt` come with
   * it either way.
   */
  read(url: string, maxCacheDays: number, now: Date = new Date()): CachedDocumentation | null {
    return this.#read(url, maxCacheDays, now);
  }

  /** @internal Query, budget and source identity bind a cached selection. */
  readSelected(
    url: string,
    selection: string,
    maxCacheDays: number,
    now: Date,
  ): CachedDocumentation | null {
    return this.#read(JSON.stringify([url, selection]), maxCacheDays, now);
  }

  #read(key: string, maxCacheDays: number, now: Date): CachedDocumentation | null {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return null;
    }
    const ageDays = ageInDays(entry.retrievedAt, now);
    // Refresh recency on use, so the bound evicts what nobody reads.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return { ...entry, ageDays, stale: ageDays > maxCacheDays };
  }

  /** Stores an excerpt, truncating to the limit and evicting the oldest use. */
  write(entry: DocumentationEntry): DocumentationEntry {
    return this.#write(entry.url, entry);
  }

  /** @internal Shares the same global LRU and size bounds as unselected entries. */
  writeSelected(entry: DocumentationEntry, selection: string): DocumentationEntry {
    return this.#write(JSON.stringify([entry.url, selection]), entry);
  }

  #write(key: string, entry: DocumentationEntry): DocumentationEntry {
    const stored: DocumentationEntry = {
      ...entry,
      excerpt: entry.excerpt.slice(0, this.#limits.maxExcerptChars),
    };
    this.#entries.delete(key);
    this.#entries.set(key, stored);
    while (this.#entries.size > this.#limits.maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.#entries.delete(oldest.value);
    }
    return stored;
  }

  /** Drops an entry, used when a refetch supersedes it or a source is removed. */
  forget(url: string): void {
    for (const [key, entry] of this.#entries) {
      if (entry.url === url) this.#entries.delete(key);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}
