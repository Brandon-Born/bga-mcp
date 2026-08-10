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
  readonly homeDirectory?: string | undefined;
  /**
   * Exact secret values to remove wherever they appear.
   *
   * A pattern cannot recognise an opaque session cookie, so the one value that
   * must never be echoed is passed in and matched literally.
   */
  readonly secretValues?: readonly string[];
  /**
   * How text that looks like a filesystem location is treated.
   *
   * `shape` — the default — replaces anything shaped like an absolute path,
   * which is what a failure needs: a thrown error can carry any location on the
   * machine, and there is no list of them to compare against.
   *
   * `known-locations` replaces only the configured roots and the home
   * directory, by value. It is for content that is known not to be filesystem
   * text: a Studio request log is full of `/game/game/action.html`, and calling
   * those paths is the difference between a usable log and a column of
   * `[redacted-path]`.
   */
  readonly paths?: 'shape' | 'known-locations' | undefined;
}

/**
 * What a rule protects.
 *
 * `credential` is the set that makes a whole line unpublishable rather than
 * merely in need of editing, so it is named rather than inferred from the
 * replacement text.
 */
type RuleKind = 'credential' | 'personal';

interface Rule {
  readonly kind: RuleKind;
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
    kind: 'credential',
    pattern:
      /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/gu,
    replace: () => REDACTED_PRIVATE_KEY,
  },
  {
    kind: 'credential',
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*/gu,
    replace: () => REDACTED_PRIVATE_KEY,
  },
  {
    kind: 'credential',
    pattern: /\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]*@([^\s/:]+)/giu,
    replace: (scheme, host) => `${scheme ?? ''}://${REDACTED_CONNECTION}@${host ?? ''}`,
  },
  {
    kind: 'credential',
    pattern: /\bAKIA[0-9A-Z]{16}\b/gu,
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    kind: 'credential',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/gu,
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    // A whole header value: `Authorization: Bearer …` is the documented shape,
    // but the scheme is the caller's choice and an unquoted assignment rule
    // would stop at the first space and publish the token after it.
    kind: 'credential',
    pattern: /\b(?:proxy-)?(?:authorization|cookie|set-cookie)\s*[:=][^\r\n]{8,}/giu,
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    kind: 'credential',
    pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9\-._~+/=]{8,}/giu,
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    // A JSON Web Token carries its own shape, so it is recognizable even when
    // nothing around it says what it is.
    kind: 'credential',
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/gu,
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    kind: 'credential',
    pattern: new RegExp(
      `\\b(?:PHPSESSID|TournoiEnLigne(?:id|idt)?|session(?:[_-]?id)?)\\s*[:=]\\s*${ASSIGNED_VALUE}`,
      'giu',
    ),
    replace: () => REDACTED_SESSION,
  },
  {
    kind: 'credential',
    pattern: new RegExp(
      `\\b(?:api[_-]?key|access[_-]?key|secret[_-]?key|secret|password|passwd|token|credential)\\s*[:=]\\s*${ASSIGNED_VALUE}`,
      'giu',
    ),
    replace: () => REDACTED_CREDENTIAL,
  },
  {
    kind: 'personal',
    pattern: new RegExp(`\\bplayer[_-]?(?:id|name|email)\\s*[:=]\\s*${ASSIGNED_VALUE}`, 'giu'),
    replace: () => REDACTED_PLAYER,
  },
  {
    kind: 'personal',
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

/** Replaces the locations this process actually knows about, by value. */
function redactKnownLocations(value: string, options: RedactionOptions): string {
  let result = value;
  // Roots before the home directory: a root usually lives under it, and
  // replacing the home directory first would leave a root-relative remainder
  // that no longer says which project it belongs to.
  for (const root of options.projectRoots ?? []) {
    const normalizedRoot = normalizeRoot(root);
    for (const spelling of new Set([normalizedRoot, toPortable(normalizedRoot)])) {
      result = result.split(spelling).join('<project-root>');
    }
  }
  const home = options.homeDirectory;
  if (home !== undefined && home.length > 0) {
    for (const spelling of new Set([normalizeRoot(home), toPortable(normalizeRoot(home))])) {
      result = result.split(spelling).join(REDACTED_PATH);
    }
  }
  return result;
}

/**
 * Removes credentials, sessions, connection strings, and player data from free
 * text, leaving anything that merely looks like a filesystem location alone.
 *
 * This is the part of redaction that is true wherever the text came from. Path
 * handling is not: see {@link RedactionOptions.paths}.
 */
export function redactSecrets(value: string, options: RedactionOptions = {}): string {
  return applyRules(value, options, () => true);
}

/**
 * True when the text carries something that must never be published at all,
 * rather than something that can be published with a value removed.
 *
 * Personal data is deliberately not part of this: a query naming a player
 * column is a diagnostic, and losing it would cost a developer the finding.
 * A credential is different — there is no reading of a leaked token that
 * remains useful.
 */
export function containsCredential(value: string, options: RedactionOptions = {}): boolean {
  return applyRules(value, options, (kind) => kind === 'credential') !== value;
}

function applyRules(
  value: string,
  options: RedactionOptions,
  wanted: (kind: RuleKind) => boolean,
): string {
  let result = value;
  // Literal secrets go first: an opaque value has no shape to match later.
  for (const secret of options.secretValues ?? []) {
    if (secret.length >= 8) {
      result = result.split(secret).join('[redacted-secret]');
    }
  }
  for (const rule of RULES) {
    if (!wanted(rule.kind)) {
      continue;
    }
    result = result.replace(rule.pattern, (...arguments_: unknown[]) => {
      const groups = arguments_.slice(1, -2) as (string | undefined)[];
      return rule.replace(...groups);
    });
  }
  return result;
}

/**
 * Removes credentials, sessions, connection strings, player data, and
 * filesystem locations from free text before it leaves the process.
 */
export function redactText(value: string, options: RedactionOptions = {}): string {
  const result = redactSecrets(value, options);
  return options.paths === 'known-locations'
    ? redactKnownLocations(result, options)
    : redactPathsIn(result, options);
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
