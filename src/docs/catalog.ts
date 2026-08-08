/**
 * The allowlist a documentation fetch is checked against.
 *
 * The catalog is reviewed material (BGA-200): it records which hosts may be
 * reached at all, and what each source's operator said a machine may do with
 * its content. Nothing here decides policy; it only reads the decision that was
 * already made and refuses to guess when the file says something unexpected.
 */

export type SourceAuthority =
  'official-maintained' | 'official-host-community-edited' | 'community';

export interface DocumentationSource {
  readonly id: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly host: string;
  readonly authority: SourceAuthority;
  readonly allowedUse: {
    readonly link: boolean;
    readonly shortExcerpt: boolean;
    readonly fullTextRedistribution: boolean;
    readonly localIndexing: boolean;
    readonly bulkCrawl: boolean;
    readonly aiTraining: boolean;
  };
  readonly retrieval: {
    readonly mode: string;
    readonly respectRobots: boolean;
    readonly userAgent: string;
  };
  readonly retention: {
    readonly storesFullText: boolean;
    readonly storesProvenance: boolean;
    readonly maxCacheDays: number;
  };
}

export interface DocumentationCatalog {
  readonly reviewedAt: string;
  readonly sources: readonly DocumentationSource[];
}

/** Parses the catalog, failing loudly rather than allowing an unreadable entry. */
export function parseDocumentationCatalog(text: string): DocumentationCatalog {
  const parsed: unknown = JSON.parse(text);
  const sources = (parsed as { sources?: unknown }).sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('The documentation source catalog lists no sources.');
  }
  for (const entry of sources as readonly Partial<DocumentationSource>[]) {
    if (
      typeof entry.id !== 'string' ||
      typeof entry.host !== 'string' ||
      typeof entry.canonicalUrl !== 'string' ||
      typeof entry.retrieval?.userAgent !== 'string'
    ) {
      throw new Error('The documentation source catalog contains an incomplete source.');
    }
  }
  return parsed as DocumentationCatalog;
}

/**
 * Finds the source that permits a URL, or `null` when none does.
 *
 * The most specific match wins. Authority is a property of a page, not of a
 * host: the BGA Studio Cookbook sits on the official wiki and anyone may edit
 * it, so a catalog entry scoped to that page must outrank the entry covering
 * the whole site, or a community page would be reported as official.
 */
export function sourceForUrl(catalog: DocumentationCatalog, url: URL): DocumentationSource | null {
  const matches = catalog.sources.filter(
    (source) =>
      url.protocol === 'https:' &&
      url.hostname === source.host &&
      url.href.startsWith(source.canonicalUrl),
  );
  return (
    [...matches].sort((left, right) => right.canonicalUrl.length - left.canonicalUrl.length)[0] ??
    null
  );
}

/** Finds a source by identifier. */
export function sourceById(catalog: DocumentationCatalog, id: string): DocumentationSource | null {
  return catalog.sources.find((source) => source.id === id) ?? null;
}
