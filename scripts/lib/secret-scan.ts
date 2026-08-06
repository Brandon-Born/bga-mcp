import { readFile, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { listFiles } from './scenarios.js';

export interface SecretRule {
  readonly id: string;
  readonly pattern: RegExp;
}

/**
 * Known credential formats. A rule must match the credential itself, not the
 * word that introduces it, so a finding is actionable without quoting a secret.
 */
export const SECRET_RULES: readonly SecretRule[] = [
  { id: 'private-key', pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u },
  { id: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { id: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/u },
  { id: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/u },
  { id: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/u },
  { id: 'url-credential', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/u },
  {
    id: 'assigned-secret',
    pattern:
      /\b(?:api[_-]?key|access[_-]?key|secret[_-]?key|client[_-]?secret|password|passwd|auth[_-]?token)\s*[:=]\s*(?:"[^"\s]{8,}"|'[^'\s]{8,}'|[^\s"',;]{8,})/iu,
  },
  { id: 'private-key-body', pattern: /\bMIIE[A-Za-z0-9+/]{40,}={0,2}/u },
];

/** A file may opt out only with an explicit, self-describing marker and a reason. */
export const ALLOW_MARKER = 'secret-scan:allow-file';

export interface SecretFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  /** A masked excerpt. Never the matched value. */
  readonly preview: string;
}

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  '.pnpm-store',
  'quality-gate-seeds',
]);
const MAX_SCANNED_BYTES = 4_194_304;

function mask(match: string): string {
  const visible = match.slice(0, 4);
  return `${visible}${'*'.repeat(Math.min(8, Math.max(1, match.length - visible.length)))} (masked)`;
}

export function scanText(text: string, file: string): SecretFinding[] {
  if (text.includes(ALLOW_MARKER)) {
    return [];
  }
  const findings: SecretFinding[] = [];
  const lines = text.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const rule of SECRET_RULES) {
      const match = rule.pattern.exec(line);
      if (match !== null) {
        findings.push({
          file,
          line: index + 1,
          rule: rule.id,
          preview: mask(match[0]),
        });
      }
    }
  }
  return findings;
}

async function isBinary(path: string): Promise<boolean> {
  const handle = await readFile(path);
  return handle.subarray(0, 4096).includes(0);
}

/**
 * Scans a directory tree. Returns findings whose previews are safe to print in
 * CI output, so a gate failure never publishes the value it just blocked.
 */
export async function scanDirectory(
  root: string,
  options: { readonly repositoryRoot?: string } = {},
): Promise<SecretFinding[]> {
  const base = options.repositoryRoot ?? root;
  const findings: SecretFinding[] = [];
  for (const file of await listFiles(root, '')) {
    const portable = relative(base, file).split(sep).join('/');
    if (portable.split('/').some((segment) => SKIPPED_DIRECTORIES.has(segment))) {
      continue;
    }
    const info = await stat(file);
    if (info.size > MAX_SCANNED_BYTES || (await isBinary(file))) {
      continue;
    }
    findings.push(...scanText(await readFile(file, 'utf8'), portable));
  }
  return findings;
}

export function formatFindings(findings: readonly SecretFinding[]): string {
  return findings
    .map((finding) => `${finding.file}:${String(finding.line)} ${finding.rule} ${finding.preview}`)
    .join('\n');
}

export function repositoryPath(...segments: string[]): string {
  return resolve(import.meta.dirname, '../..', ...segments);
}
