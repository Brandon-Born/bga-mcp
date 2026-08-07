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

/**
 * Constructs that do not appear in a question and do appear in a BGA project.
 *
 * Deliberately short: a query mentioning `states.inc.php` or `bga->notify` is a
 * perfectly good question, so file names and API names are not markers. What is
 * marked is syntax, which means the text was copied out of a file.
 */
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
      return `the query is longer than ${String(MAX_QUERY_LENGTH)} characters, which is a paste rather than a question`;
    }
    case 'control-characters': {
      return 'the query contains control characters, so it was not typed';
    }
    case 'project-path': {
      return 'the query contains a filesystem path, which would send the location of local work to a third party';
    }
    case 'source-code': {
      return 'the query contains source syntax, so it was copied out of a file';
    }
  }
}
