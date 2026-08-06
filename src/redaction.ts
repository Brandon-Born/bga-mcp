import { isAbsolute, relative, resolve, sep } from 'node:path';

export const REDACTED_CREDENTIAL = '[redacted-credential]';
export const REDACTED_PRIVATE_KEY = '[redacted-private-key]';
export const REDACTED_SESSION = '[redacted-session]';
export const REDACTED_CONNECTION = '[redacted-connection]';
export const REDACTED_EMAIL = '[redacted-email]';
export const REDACTED_PLAYER = '[redacted-player]';
export const REDACTED_PATH = '[redacted-path]';

export interface RedactionOptions {
  /** Absolute roots whose contents may be reported as root-relative paths. */
  readonly projectRoots?: readonly string[];
  /** Home directory used to detect paths outside the configured roots. */
  readonly homeDirectory?: string;
}

interface Rule {
  readonly pattern: RegExp;
  readonly replace: (...groups: (string | undefined)[]) => string;
}

/** A quoted or unquoted right-hand side, so a quoted secret cannot leak past its first space. */
const ASSIGNED_VALUE = `(?:"[^"]*"|'[^']*'|[^\\s,;"']+)`;

/**
 * Ordered redaction rules. Earlier rules win, so structured secrets such as
 * private key blocks and connection strings are removed before the generic
 * assignment rule can leak a fragment of the same value.
 */
const RULES: readonly Rule[] = [
  {
    pattern:
      /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/gu,
    replace: () => REDACTED_PRIVATE_KEY,
  },
  {
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*/gu,
    replace: () => REDACTED_PRIVATE_KEY,
  },
  {
    pattern: /\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]*@([^\s/:]+)/giu,
    replace: (scheme, host) => `${scheme ?? ''}://${REDACTED_CONNECTION}@${host ?? ''}`,
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/gu,
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/gu,
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9\-._~+/=]{8,}/giu,
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    pattern: new RegExp(
      `\\b(?:PHPSESSID|TournoiEnLigne(?:id|idt)?|session(?:[_-]?id)?)\\s*[:=]\\s*${ASSIGNED_VALUE}`,
      'giu',
    ),
    replace: () => REDACTED_SESSION,
  },
  {
    pattern: new RegExp(
      `\\b(?:api[_-]?key|access[_-]?key|secret[_-]?key|secret|password|passwd|token|credential)\\s*[:=]\\s*${ASSIGNED_VALUE}`,
      'giu',
    ),
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    pattern: new RegExp(`\\bplayer[_-]?(?:id|name|email)\\s*[:=]\\s*${ASSIGNED_VALUE}`, 'giu'),
    replace: () => REDACTED_PLAYER,
  },
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu,
    replace: () => REDACTED_EMAIL,
  },
];

/** Excludes a leading `:` or `/` so URL authorities are not mistaken for paths. */
const POSIX_PATH = /(?<![\w.:/])\/(?:[^\s"'<>|:*?]+\/)*[^\s"'<>|:*?]*/gu;
const WINDOWS_PATH = /\b[A-Za-z]:[\\/](?:[^\s"'<>|:*?]+[\\/])*[^\s"'<>|:*?]*/gu;

function normalizeRoot(root: string): string {
  const resolved = resolve(root);
  return resolved.endsWith(sep) ? resolved.slice(0, -sep.length) : resolved;
}

function withinRoot(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  if (difference === '') {
    return true;
  }
  return !difference.startsWith('..') && !isAbsolute(difference);
}

function toPortable(value: string): string {
  return value.split(sep).join('/').split('\\').join('/');
}

/**
 * Replaces a filesystem path with a form that is safe to return to a client.
 * Paths inside a configured project root keep their root-relative location so
 * findings stay actionable; everything else becomes an opaque placeholder.
 */
export function redactPath(path: string, options: RedactionOptions = {}): string {
  const candidate = resolve(path);
  for (const root of options.projectRoots ?? []) {
    const normalizedRoot = normalizeRoot(root);
    if (withinRoot(normalizedRoot, candidate)) {
      const difference = relative(normalizedRoot, candidate);
      return difference === '' ? '<project-root>' : `<project-root>/${toPortable(difference)}`;
    }
  }
  return REDACTED_PATH;
}

function redactPathsIn(value: string, options: RedactionOptions): string {
  let result = value;
  for (const pattern of [POSIX_PATH, WINDOWS_PATH]) {
    result = result.replace(pattern, (match) => {
      const trimmed = match.replace(/[).,;:]+$/u, '');
      const suffix = match.slice(trimmed.length);
      if (!trimmed.includes('/') && !trimmed.includes('\\')) {
        return match;
      }
      return `${redactPath(trimmed, options)}${suffix}`;
    });
  }
  return result;
}

/**
 * Removes credentials, sessions, connection strings, player data, and
 * filesystem locations from free text before it leaves the process.
 */
export function redactText(value: string, options: RedactionOptions = {}): string {
  let result = value;
  for (const rule of RULES) {
    result = result.replace(rule.pattern, (...arguments_: unknown[]) => {
      const groups = arguments_.slice(1, -2) as (string | undefined)[];
      return rule.replace(...groups);
    });
  }
  return redactPathsIn(result, options);
}

/**
 * Applies {@link redactText} to every string reachable from a JSON-like value.
 * Object keys are preserved so structured results stay machine-readable.
 */
export function redactValue(value: unknown, options: RedactionOptions = {}): unknown {
  if (typeof value === 'string') {
    return redactText(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, options));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        redactValue(entry, options),
      ]),
    );
  }
  return value;
}
