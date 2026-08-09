import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFrameworkVersions } from '../../src/docs/versions.js';

/**
 * Reads the published software versions out of captured official pages.
 *
 * Every case here runs against markup the wiki actually served, because the
 * defect this covers was invisible to text written by this project: anchoring
 * on the words "Software Versions" found the table-of-contents link first, and
 * the live resource reported a forum announcement URL as the platform's only
 * software version. Captures and their provenance are recorded in
 * `tests/fixtures/docs/CAPTURES.md`.
 */

const capturesRoot = fileURLToPath(new URL('../fixtures/docs/', import.meta.url));

async function capture(name: string): Promise<string> {
  return await readFile(resolve(capturesRoot, name), 'utf8');
}

const SECTION =
  /<h2><span class="mw-headline" id="Software_Versions">[\s\S]*?(?=<h3><span class="mw-headline")/u;
const TABLE_OF_CONTENTS = /<div id="toc"[\s\S]*?<\/div>/u;

let current: string;
let older: string;

beforeAll(async () => {
  current = await capture('studio-software-versions.html');
  older = await capture('studio-software-versions-2026-04-01.html');
});

describe('framework versions', () => {
  it('[UNIT-DOC-FRAMEWORK-VERSION] reads the maintained list as the page states it', () => {
    const reading = readFrameworkVersions(current);

    expect(reading.status).toBe('read');
    expect(reading.heading).toBe('Software Versions');
    expect(reading.versions.map((entry) => [entry.software, entry.version, entry.detail])).toEqual([
      // The line names the software before the number and qualifies it after.
      ['Dojo Toolkit', '1.15', null],
      ['PHP', '8.4', null],
      // One line, two environments. Reporting one of them would be a choice
      // the page does not make.
      ['SQL', '5.7', 'MySQL (prod)'],
      ['SQL', '8.0', 'studio'],
      ['Font Awesome', '4.7', null],
      ['Font Awesome', '6.4.0', null],
    ]);
    // Every value carries the line it came from, so the reading is checkable
    // rather than trusted.
    expect(reading.versions[2]?.statedAs).toBe('SQL: MySQL 5.7 (prod) - on studio 8.0');
    expect(reading.versions[0]?.statedAs).toContain('deprecated');
  });

  it('[UNIT-DOC-FRAMEWORK-VERSION] states what it cannot state as one value', () => {
    const reading = readFrameworkVersions(current);

    // Two Font Awesome versions are both available and two SQL versions are
    // both in use. Resolving either into one number would invent a fact.
    expect(reading.conflicts).toEqual([
      { software: 'SQL', versions: ['5.7', '8.0'] },
      { software: 'Font Awesome', versions: ['4.7', '6.4.0'] },
    ]);
  });

  it('[UNIT-DOC-FRAMEWORK-VERSION-ANCHOR] never reads the table of contents, wherever it sits', () => {
    // The capture already carries the navigation that precedes the heading:
    // its entries are "6 Software Versions" and "6.1 PHP Extensions Used",
    // whose section numbers are indistinguishable from release numbers.
    const beforeSection = readFrameworkVersions(current);
    expect(beforeSection.versions.map((entry) => entry.version)).not.toContain('6.1');

    // A skin that renders navigation after the content puts those same
    // entries inside the section, where a bounded read would otherwise take
    // them as the list.
    const navigation = TABLE_OF_CONTENTS.exec(current)?.[0];
    expect(navigation).toBeDefined();
    const reordered = `${current.replace(TABLE_OF_CONTENTS, '')}${navigation ?? ''}`;
    const afterSection = readFrameworkVersions(reordered);

    expect(afterSection.versions).toEqual(beforeSection.versions);
  });

  it('[UNIT-DOC-FRAMEWORK-VERSION-ANCHOR] reads only the section the heading bounds', () => {
    const reading = readFrameworkVersions(current);
    const values = reading.versions.map((entry) => entry.version);

    // The subsection after this one dates itself "as of Apr 1, 2026", and the
    // section after that lists forum URLs ending in numbers. Neither is a
    // version, and both are what the live resource once returned.
    expect(values).not.toContain('1');
    expect(reading.versions.some((entry) => entry.statedAs.includes('forum'))).toBe(false);
    expect(reading.versions.some((entry) => entry.statedAs.includes('http'))).toBe(true);
    // A URL is kept in the evidence line and never read as a value: the
    // Font Awesome lines cite fontawesome.com/v4.7 and state 4.7 themselves.
    expect(values).toEqual(['1.15', '8.4', '5.7', '8.0', '4.7', '6.4.0']);
  });

  it('[UNIT-DOC-FRAMEWORK-VERSION] reports unknown rather than guessing', () => {
    const missing = readFrameworkVersions(current.replace(SECTION, ''));
    expect(missing.status).toBe('unknown');
    expect(missing.versions).toEqual([]);
    expect(missing.reason).toContain('no rendered');

    // A heading with nothing readable under it is not an answer either.
    const emptied = readFrameworkVersions(current.replace(/<ul><li>Dojo[\s\S]*?<\/ul>/u, ''));
    expect(emptied.status).toBe('unknown');
    expect(emptied.reason).toContain('no list');

    expect(readFrameworkVersions('').status).toBe('unknown');
    expect(
      readFrameworkVersions('<h2>Software Versions</h2><p>We run current software.</p>').status,
    ).toBe('unknown');
  });

  it('[UNIT-DOC-FRAMEWORK-VERSION] reads what the page says now, not what it said before', () => {
    const then = readFrameworkVersions(older);
    const now = readFrameworkVersions(current);

    expect(then.status).toBe('read');
    // The same page, four months earlier: one SQL value and no deprecation
    // note. Nothing is carried over from the newer capture.
    expect(then.versions.map((entry) => [entry.software, entry.version])).toEqual([
      ['Dojo Toolkit', '1.15'],
      ['PHP', '8.4'],
      ['SQL', '5.7'],
      ['Font Awesome', '4.7'],
      ['Font Awesome', '6.4.0'],
    ]);
    expect(then.conflicts).toEqual([{ software: 'Font Awesome', versions: ['4.7', '6.4.0'] }]);
    expect(then.versions[0]?.statedAs).not.toContain('deprecated');
    expect(now.versions.length).toBeGreaterThan(then.versions.length);
  });

  it('[UNIT-DOC-FRAMEWORK-VERSION] reports a repeated entry as a conflict rather than choosing', () => {
    // The page is a wiki: an edit that adds a line without removing the old
    // one is the ordinary way it goes wrong.
    const duplicated = current.replace('<li>PHP: 8.4</li>', '<li>PHP: 8.4</li>\n<li>PHP: 8.2</li>');
    const reading = readFrameworkVersions(duplicated);

    expect(reading.versions.filter((entry) => entry.software === 'PHP')).toHaveLength(2);
    expect(reading.conflicts).toContainEqual({ software: 'PHP', versions: ['8.4', '8.2'] });
  });
});
