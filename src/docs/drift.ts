/**
 * Compares tracked documentation against the baseline it was reviewed at.
 *
 * The guidance this server gives is only as current as the pages behind it, and
 * those pages change without telling anyone. Detecting that is the whole job
 * here — and only detecting it. A change never updates the baseline by itself,
 * because "the wiki changed" and "the new text is correct" are different
 * claims, and only a person can make the second one.
 *
 * Pure functions, no I/O.
 */

export interface BaselineEntry {
  readonly topic: string;
  readonly url: string;
  /** The page's last edit at the time it was reviewed. */
  readonly lastEdited: string | null;
  /** Digest of the extracted text, so an edit that changes nothing is not drift. */
  readonly digest: string;
  readonly reviewedAt: string;
}

export interface ObservedPage {
  readonly topic: string;
  readonly url: string;
  readonly lastEdited: string | null;
  readonly digest: string;
}

export type DriftKind = 'changed' | 'edited' | 'missing' | 'untracked' | 'unreachable';

export interface DriftFinding {
  readonly topic: string;
  readonly kind: DriftKind;
  readonly detail: string;
}

/**
 * Reports every difference between what was reviewed and what is there now.
 *
 * `changed` is text that differs, which is the one that can invalidate a rule.
 * `edited` is a page whose edit stamp moved while its text did not, which is
 * usually formatting and is still reported so a reviewer decides rather than a
 * heuristic. A tracked page that has vanished is `missing`, and a page nobody
 * reviewed is `untracked`; both mean the baseline no longer describes reality.
 */
export function compareToBaseline(
  baseline: readonly BaselineEntry[],
  observed: readonly ObservedPage[],
  unreachable: readonly { readonly topic: string; readonly reason: string }[] = [],
): readonly DriftFinding[] {
  const findings: DriftFinding[] = [];
  const seen = new Set<string>();

  for (const entry of baseline) {
    const failure = unreachable.find((candidate) => candidate.topic === entry.topic);
    if (failure !== undefined) {
      findings.push({
        topic: entry.topic,
        kind: 'unreachable',
        // Unreachable is reported, never treated as unchanged: silence is not
        // evidence that a page still says what it used to.
        detail: `${entry.url} could not be read: ${failure.reason}`,
      });
      seen.add(entry.topic);
      continue;
    }

    const current = observed.find((candidate) => candidate.topic === entry.topic);
    if (current === undefined) {
      findings.push({
        topic: entry.topic,
        kind: 'missing',
        detail: `${entry.url} is tracked but was not retrieved`,
      });
      continue;
    }
    seen.add(entry.topic);

    if (current.digest !== entry.digest) {
      findings.push({
        topic: entry.topic,
        kind: 'changed',
        detail: `${entry.url} has changed since it was reviewed on ${entry.reviewedAt}`,
      });
      continue;
    }
    if (current.lastEdited !== entry.lastEdited) {
      findings.push({
        topic: entry.topic,
        kind: 'edited',
        detail: `${entry.url} was edited (${entry.lastEdited ?? 'unknown'} to ${current.lastEdited ?? 'unknown'}) without changing its text`,
      });
    }
  }

  for (const page of observed) {
    if (!seen.has(page.topic) && !baseline.some((entry) => entry.topic === page.topic)) {
      findings.push({
        topic: page.topic,
        kind: 'untracked',
        detail: `${page.url} is retrievable but has no reviewed baseline`,
      });
    }
  }

  return findings;
}

/** Drift that can change what the server tells a developer. */
export function requiresReview(findings: readonly DriftFinding[]): boolean {
  return findings.some(
    (finding) =>
      finding.kind === 'changed' || finding.kind === 'missing' || finding.kind === 'untracked',
  );
}
