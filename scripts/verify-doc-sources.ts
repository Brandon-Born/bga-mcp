import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface Source {
  readonly id: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly host: string;
  readonly authority: 'official-maintained' | 'official-host-community-edited' | 'community';
  readonly editable: boolean;
  readonly license: { readonly id: string; readonly statedAt: string };
  readonly allowedUse: {
    readonly link: boolean;
    readonly shortExcerpt: boolean;
    readonly fullTextRedistribution: boolean;
    readonly localIndexing: boolean;
    readonly bulkCrawl: boolean;
    readonly aiTraining: boolean;
  };
  readonly contentSignals: {
    readonly retrievedAt: string;
    readonly robotsUrl: string;
    readonly raw: string;
    readonly search?: string;
    readonly aiTrain?: string;
    readonly use?: string;
    readonly disallowedAgents?: readonly string[];
  };
  readonly retrieval: { readonly mode: string; readonly respectRobots: boolean };
  readonly updateSignal: string;
  readonly retention: {
    readonly storesFullText: boolean;
    readonly storesProvenance: boolean;
    readonly maxCacheDays: number;
  };
  readonly trust: string;
  readonly verifiedAt: string;
}

interface Catalog {
  readonly reviewedAt: string;
  readonly sources: readonly Source[];
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function validator(schema: object): (value: unknown) => string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  return (value) =>
    validate(value)
      ? []
      : (validate.errors ?? []).map(
          (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
        );
}

/**
 * Checks the documentation source catalog.
 *
 * The catalog exists because a documentation capability decides, at runtime,
 * whose text to put in front of a developer's agent. These rules are the ones
 * that cannot be left to that moment: whether a source is allowlisted at all,
 * what its own operator said a machine may do with it, whether the licence
 * permits what we intend, and whether the result can be attributed.
 */
function check(catalog: unknown, validate: (value: unknown) => string[]): GateReport {
  const report = new GateReport();

  for (const error of validate(catalog)) {
    report.require(false, `Documentation source catalog does not match its schema: ${error}`);
  }
  if (report.failed) {
    return report;
  }

  const { sources } = catalog as Catalog;
  const seen = new Set<string>();

  for (const source of sources) {
    report.require(!seen.has(source.id), `Duplicate documentation source id: ${source.id}`);
    seen.add(source.id);

    // Transport and host: a source may only be fetched from the host it was
    // approved on, over HTTPS, and the two must agree.
    let url: URL | null = null;
    try {
      url = new URL(source.canonicalUrl);
    } catch {
      report.require(false, `${source.id} has an unparseable canonical URL`);
    }
    if (url !== null) {
      report.require(url.protocol === 'https:', `${source.id} is not retrieved over HTTPS`);
      report.require(
        url.hostname === source.host,
        `${source.id} declares host ${source.host} but its canonical URL points at ${url.hostname}`,
      );
    }

    // Attribution: a result nobody can trace is not usable as documentation.
    report.require(
      source.retention.storesProvenance,
      `${source.id} does not retain provenance, so a result from it cannot be attributed`,
    );
    report.require(
      source.updateSignal.trim().length > 0,
      `${source.id} records no update signal, so its snapshots cannot be dated`,
    );
    report.require(
      source.license.statedAt.trim().length > 0,
      `${source.id} does not record where its licence was looked for`,
    );

    // Trust: retrieved text is data. No source is exempt, whoever wrote it.
    report.require(
      source.trust === 'untrusted-content',
      `${source.id} is not classified as untrusted content`,
    );

    // Intended use may not exceed what the source itself permits.
    const signals = source.contentSignals;
    report.require(
      !source.allowedUse.aiTraining,
      `${source.id} permits AI training, which this project never does`,
    );
    if (signals.aiTrain === 'no') {
      report.require(
        !source.allowedUse.aiTraining,
        `${source.id} sets ai-train=no but the catalog allows training`,
      );
    }
    if (signals.use === 'reference') {
      report.require(
        !source.allowedUse.fullTextRedistribution,
        `${source.id} sets use=reference but the catalog allows full-text redistribution`,
      );
    }
    if ((signals.disallowedAgents ?? []).length > 0) {
      report.require(
        !source.allowedUse.bulkCrawl,
        `${source.id} refuses named crawlers but the catalog allows bulk crawling`,
      );
    }
    if (source.license.id === 'none-stated') {
      report.require(
        !source.allowedUse.fullTextRedistribution,
        `${source.id} has no stated licence, so its full text may not be redistributed`,
      );
      report.require(
        !source.retention.storesFullText,
        `${source.id} has no stated licence, so its full text may not be retained`,
      );
    }
    report.require(
      !(source.allowedUse.bulkCrawl && !source.retrieval.respectRobots),
      `${source.id} would crawl without respecting robots`,
    );
    report.require(
      source.allowedUse.link,
      `${source.id} cannot be linked, so it cannot be cited and has no use here`,
    );
  }

  return report;
}

/** A catalog that passes every rule, used to seed each failure from. */
function soundCatalog(): { reviewedAt: string; sources: Source[] } {
  return {
    reviewedAt: '2026-08-07',
    sources: [
      {
        id: 'seed-source',
        title: 'Seeded source',
        canonicalUrl: 'https://example.invalid/docs',
        host: 'example.invalid',
        authority: 'official-maintained',
        editable: true,
        license: { id: 'none-stated', statedAt: 'Checked the footer.' },
        allowedUse: {
          link: true,
          shortExcerpt: true,
          fullTextRedistribution: false,
          localIndexing: false,
          bulkCrawl: false,
          aiTraining: false,
        },
        contentSignals: {
          retrievedAt: '2026-08-07',
          robotsUrl: 'https://example.invalid/robots.txt',
          raw: 'User-agent: *\nContent-Signal: search=yes,ai-train=no,use=reference',
          search: 'yes',
          aiTrain: 'no',
          use: 'reference',
          disallowedAgents: ['GPTBot'],
        },
        retrieval: { mode: 'on-demand-single-page', respectRobots: true },
        updateSignal: 'Page last-edited timestamp.',
        retention: { storesFullText: false, storesProvenance: true, maxCacheDays: 30 },
        trust: 'untrusted-content',
        verifiedAt: '2026-08-07',
      },
    ],
  };
}

function seeded(mutate: (source: Source) => Source): { reviewedAt: string; sources: Source[] } {
  const catalog = soundCatalog();
  return { ...catalog, sources: catalog.sources.map((source) => mutate(source)) };
}

async function main(): Promise<void> {
  const schema = await loadJson<object>('config/doc-sources.schema.json');
  const validate = validator(schema);

  // Each seeded defect is a way an approved source could quietly permit more
  // than its operator allows, or produce a result nobody can attribute.
  expectSeededFailure(
    'documentation source transport',
    check(
      seeded((source) => ({
        ...source,
        canonicalUrl: 'http://example.invalid/docs',
      })),
      validate,
    ),
  );
  expectSeededFailure(
    'documentation source host',
    check(
      seeded((source) => ({ ...source, host: 'docs.example.test' })),
      validate,
    ),
  );
  expectSeededFailure(
    'documentation source attribution',
    check(
      seeded((source) => ({
        ...source,
        retention: { ...source.retention, storesProvenance: false },
      })),
      validate,
    ),
  );
  expectSeededFailure(
    'documentation source classification',
    check(
      seeded((source) => ({ ...source, trust: 'trusted' })),
      validate,
    ),
  );
  expectSeededFailure(
    'documentation source use exceeding signals',
    check(
      seeded((source) => ({
        ...source,
        allowedUse: { ...source.allowedUse, fullTextRedistribution: true },
      })),
      validate,
    ),
  );
  expectSeededFailure(
    'documentation source crawl against refusal',
    check(
      seeded((source) => ({
        ...source,
        allowedUse: { ...source.allowedUse, bulkCrawl: true },
      })),
      validate,
    ),
  );
  expectSeededFailure(
    'documentation source incomplete record',
    check(
      // An entry missing a required field is rejected by the schema, so a
      // source cannot be half-classified and still be fetchable.
      seeded((source) => ({ ...source, updateSignal: undefined as unknown as string })),
      validate,
    ),
  );

  const catalog = await loadJson<Catalog>('config/doc-sources.json');
  const report = check(catalog, validate);
  const official = catalog.sources.filter(
    (source) => source.authority === 'official-maintained',
  ).length;
  reportOrExit(
    'documentation source catalog',
    report,
    `Documentation source catalog is complete and its gate detects seeded defects: ` +
      `${String(catalog.sources.length)} allowlisted source(s), ${String(official)} official, ` +
      `reviewed ${catalog.reviewedAt}. No source permits training, bulk crawling, or full-text redistribution.`,
  );
}

await main();
