import type { DocumentationSource } from './catalog.js';
import { matchesDocumentationSource } from './catalog.js';
import { ERROR_CODES, PolicyViolationError } from '../errors.js';
import { searchParams } from './search.js';

/**
 * Decides whether a documentation request may leave the machine.
 *
 * A documentation lookup is the only thing this server sends anywhere, and the
 * request itself is the leak worth worrying about: a search term assembled from
 * a file, or a path naming an unreleased game, ends up in someone else's logs.
 * So the query is checked where the request is built rather than trusted to the
 * caller, and it must look like something a developer typed.
 *
 * Pure functions, no I/O.
 */

export type RequestContentViolation =
  'empty' | 'too-long' | 'control-characters' | 'project-path' | 'source-code';

/** Long enough for a real question, short enough that a paste does not fit. */
export const MAX_QUERY_LENGTH = 200;

// Lexical exclusions also protect Studio values. They do not establish origin.
const SOURCE_MARKERS = ['<?php', '?>', '$this->', '=>', '){', '/*', '*/', '//'] as const;

function containsProjectPath(query: string, projectRoots: readonly string[]): boolean {
  const lowered = query.toLowerCase();
  for (const root of projectRoots) {
    const normalized = root.replaceAll('\\', '/').toLowerCase();
    if (normalized.length > 0 && lowered.includes(normalized)) {
      return true;
    }
  }
  // An absolute path names a machine even when it is not a configured root.
  return /(?:^|\s)(?:\/[^\s/]+\/|[a-z]:[\\/])/iu.test(query);
}

/** Returns why a query may not be sent, or `null` when it may. */
export function requestContentViolation(
  query: string,
  projectRoots: readonly string[] = [],
): RequestContentViolation | null {
  if (query.trim().length === 0) {
    return 'empty';
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return 'too-long';
  }
  // eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
  if (/[\u0000-\u001F\u007F]/u.test(query)) {
    return 'control-characters';
  }
  if (containsProjectPath(query, projectRoots)) {
    return 'project-path';
  }
  return SOURCE_MARKERS.some((marker) => query.includes(marker)) ? 'source-code' : null;
}

/** Explains a refusal in the terms the developer can act on. */
export function describeRequestContentViolation(violation: RequestContentViolation): string {
  switch (violation) {
    case 'empty': {
      return 'the query is empty';
    }
    case 'too-long': {
      return `the query is longer than ${String(MAX_QUERY_LENGTH)} characters`;
    }
    case 'control-characters': {
      return 'the query contains control characters';
    }
    case 'project-path': {
      return 'the query contains a filesystem path, which would send the location of local work to a third party';
    }
    case 'source-code': {
      return 'the query contains source syntax; its origin is unknown';
    }
  }
}

/** @internal Shared lexical/source confinement for live and cached page reads. */
export function documentationRequestUrl(
  source: DocumentationSource,
  request: { readonly path: string; readonly params?: Readonly<Record<string, string>> },
): URL {
  if (/[^A-Za-z0-9._~:@!$'()*+,;=/%-]/u.test(request.path) || request.path.includes('..')) {
    throw new PolicyViolationError(
      ERROR_CODES.policyDocSourceNotAllowed,
      'The documentation page path contains characters that are not allowed.',
      { details: { sourceId: source.id, path: request.path } },
    );
  }
  // A protocol-relative or absolute path would re-point the request, so the
  // path must be relative to the source and stay inside it.
  if (request.path.startsWith('/') || request.path.includes('//')) {
    throw new PolicyViolationError(
      ERROR_CODES.policyDocSourceNotAllowed,
      'The documentation page path must be relative to its source.',
      { details: { sourceId: source.id, path: request.path } },
    );
  }
  const base = new URL(source.canonicalUrl);
  const url = new URL(request.path, base);
  for (const [name, value] of Object.entries(request.params ?? {})) {
    url.searchParams.set(name, value);
  }
  if (!matchesDocumentationSource(source, url)) {
    throw new PolicyViolationError(
      ERROR_CODES.policyDocSourceNotAllowed,
      'The documentation request did not stay within its source.',
      { details: { sourceId: source.id, url: url.href } },
    );
  }
  return url;
}

/** @internal The same refusal applies before a cached search can return. */
export function assertDocumentationRequestContent(
  value: string,
  roots: readonly string[],
  sourceId?: string,
): void {
  const violation = requestContentViolation(value, roots);
  if (violation !== null) {
    throw new PolicyViolationError(
      ERROR_CODES.policyDocRequestContent,
      `The documentation request was refused because ${describeRequestContentViolation(violation)}.`,
      { details: { sourceId, violation } },
    );
  }
  // A lexical check does not establish provenance. Documentation lookups additionally
  // select only a finite public vocabulary, with fixed outbound terms.
  searchParams(value, 1);
}
