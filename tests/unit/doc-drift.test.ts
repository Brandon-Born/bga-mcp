import {
  compareToBaseline,
  requiresReview,
  type BaselineEntry,
  type ObservedPage,
} from '../../src/docs/drift.js';

const baseline: BaselineEntry[] = [
  {
    topic: 'states',
    url: 'https://en.doc.boardgamearena.com/State_classes:_State_directory',
    lastEdited: 'Wed, 29 Apr 2026 08:34:11 GMT',
    digest: 'aaa',
    reviewedAt: '2026-08-07',
  },
  {
    topic: 'migration',
    url: 'https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide',
    lastEdited: 'Mon, 27 Jul 2026 14:08:00 GMT',
    digest: 'bbb',
    reviewedAt: '2026-08-07',
  },
];

function observed(overrides: Partial<ObservedPage>[] = []): ObservedPage[] {
  const pages = baseline.map((entry) => ({
    topic: entry.topic,
    url: entry.url,
    lastEdited: entry.lastEdited,
    digest: entry.digest,
  }));
  return pages.map((page, index) => ({ ...page, ...(overrides[index] ?? {}) }));
}

describe('documentation drift', () => {
  it('[UNIT-DOC-DRIFT] reports nothing when the pages still say what they said', () => {
    expect(compareToBaseline(baseline, observed())).toEqual([]);
    expect(requiresReview([])).toBe(false);
  });

  it('[UNIT-DOC-DRIFT] reports changed text as drift that needs a person', () => {
    const findings = compareToBaseline(baseline, observed([{ digest: 'ccc' }]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ topic: 'states', kind: 'changed' });
    expect(findings[0]?.detail).toContain('reviewed on 2026-08-07');
    expect(requiresReview(findings)).toBe(true);
  });

  it('[UNIT-DOC-DRIFT] separates an edit that changed nothing from one that changed something', () => {
    // A formatting edit still gets reported, so a reviewer decides rather than
    // a heuristic, but it does not by itself make the guidance stale.
    const findings = compareToBaseline(
      baseline,
      observed([{ lastEdited: 'Fri, 07 Aug 2026 00:00:00 GMT' }]),
    );
    expect(findings[0]).toMatchObject({ kind: 'edited' });
    expect(findings[0]?.detail).toContain('without changing its text');
    expect(requiresReview(findings)).toBe(false);
  });

  it('[UNIT-DOC-DRIFT] never treats an unreachable page as unchanged', () => {
    const findings = compareToBaseline(baseline, [], [{ topic: 'states', reason: 'timed out' }]);
    const unreachable = findings.find((finding) => finding.kind === 'unreachable');
    expect(unreachable?.detail).toContain('timed out');
    // The other tracked page was simply not retrieved, which is also reported.
    expect(findings.some((finding) => finding.kind === 'missing')).toBe(true);
    expect(requiresReview(findings)).toBe(true);
  });

  it('[UNIT-DOC-DRIFT] reports a page nobody reviewed', () => {
    const findings = compareToBaseline(baseline.slice(0, 1), observed());
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ topic: 'migration', kind: 'untracked' });
    expect(findings[0]?.detail).toContain('has no reviewed baseline');
    expect(requiresReview(findings)).toBe(true);
  });
});
