import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface Check {
  readonly id: string;
  readonly automatable: boolean;
  readonly summary: string;
  readonly owner: string;
  readonly group?: string;
  readonly tool?: string;
  readonly severity?: string;
  readonly certainty?: string;
  readonly implementation?: string;
  readonly sources?: readonly { readonly kind: string; readonly reference: string }[];
  readonly fixtures?: {
    readonly valid: string;
    readonly failing?: string;
    readonly validModern?: string;
    readonly failingModern?: string;
  };
  readonly scenarios?: readonly string[];
  readonly manualReason?: string;
}

interface Catalog {
  readonly catalogVersion: string;
  readonly checks: readonly Check[];
}

interface Sources {
  readonly schema: object;
  /** Rule code to severity and certainty, read from the rule modules. */
  readonly implemented: Map<string, { severity: string; certainty: string }>;
  readonly documentation: string;
  readonly fixtureCodes: Set<string>;
  /** The codes the modern failing fixture declares, checked the same way. */
  readonly modernFixtureCodes: Set<string>;
}

const RULE_DEFINITION =
  /\{\s*code: '([a-z][a-z0-9.-]+)',\s*\n\s*severity: '(\w+)',\s*\n\s*certainty: '(\w+)',/gu;

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

async function readImplementedRules(): Promise<
  Map<string, { severity: string; certainty: string }>
> {
  const rules = new Map<string, { severity: string; certainty: string }>();
  const directory = resolve(repositoryRoot, 'src/rules');
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.ts')) {
      continue;
    }
    const source = await readFile(resolve(directory, file), 'utf8');
    for (const match of source.matchAll(RULE_DEFINITION)) {
      rules.set(match[1] ?? '', { severity: match[2] ?? '', certainty: match[3] ?? '' });
    }
  }
  return rules;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(resolve(repositoryRoot, path));
    return true;
  } catch {
    return false;
  }
}

async function verify(catalog: Catalog, sources: Sources): Promise<GateReport> {
  const report = new GateReport();
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(sources.schema);
  if (!validate(catalog)) {
    report.require(false, `Invalid rule catalog: ${ajv.errorsText(validate.errors)}`);
    return report;
  }

  const seen = new Set<string>();
  const automated = new Set<string>();

  for (const check of catalog.checks) {
    report.require(!seen.has(check.id), `${check.id} is listed more than once`);
    seen.add(check.id);
    report.require(
      sources.documentation.includes(check.id),
      `${check.id} is missing from docs/RULES.md`,
    );

    if (!check.automatable) {
      report.require(
        (check.manualReason ?? '').length > 0,
        `${check.id} is manual but records no reason`,
      );
      continue;
    }
    automated.add(check.id);

    const implemented = sources.implemented.get(check.id);
    report.require(
      implemented !== undefined,
      `${check.id} is catalogued but no rule implements it`,
    );
    if (implemented !== undefined) {
      report.require(
        implemented.severity === check.severity && implemented.certainty === check.certainty,
        `${check.id} is catalogued as ${String(check.severity)}/${String(check.certainty)} but implemented as ${implemented.severity}/${implemented.certainty}`,
      );
    }
    report.require(
      await exists(check.implementation ?? ''),
      `${check.id} names a missing implementation: ${check.implementation ?? ''}`,
    );
    report.require(
      await exists(check.fixtures?.valid ?? ''),
      `${check.id} names a missing valid fixture`,
    );
    for (const [key, codes] of [
      ['failing', sources.fixtureCodes],
      ['failingModern', sources.modernFixtureCodes],
    ] as const) {
      const fixture = check.fixtures?.[key];
      if (fixture !== undefined) {
        report.require(await exists(fixture), `${check.id} names a missing ${key} fixture`);
        report.require(
          codes.has(check.id),
          `${check.id} claims a ${key} fixture, but that fixture does not declare the finding`,
        );
      } else {
        report.require(
          !codes.has(check.id),
          `${check.id} is produced by the ${key} fixture but the catalog does not record it`,
        );
      }
    }
    report.require(
      (check.sources ?? []).length > 0,
      `${check.id} records no source for the requirement`,
    );
  }

  for (const code of sources.implemented.keys()) {
    report.require(automated.has(code), `Rule ${code} is implemented but not catalogued`);
  }
  // Check identifiers are written in backticks; a bare path such as
  // src/rules/database.ts is not a reference to a check.
  for (const match of sources.documentation.matchAll(
    /`((?:state|action|notification|database|manual)\.[a-z0-9.-]+)`/gu,
  )) {
    const id = match[1] ?? '';
    report.require(seen.has(id), `docs/RULES.md references unknown check ${id}`);
  }

  return report;
}

/** Seeds a rule missing from the catalog, a wrong severity, and an undocumented check. */
async function proveGateDetectsSeededDefects(catalog: Catalog, sources: Sources): Promise<void> {
  const dropped = {
    ...catalog,
    checks: catalog.checks.filter((check) => check.id !== 'state.initial.missing'),
  };
  expectSeededFailure('catalogued rule', await verify(dropped, sources));

  const mislabelled = structuredClone(catalog) as unknown as {
    checks: { id: string; severity?: string }[];
  };
  const target = mislabelled.checks.find((check) => check.id === 'state.initial.missing');
  if (target !== undefined) {
    target.severity = 'information';
  }
  expectSeededFailure(
    'catalogued severity',
    await verify(mislabelled as unknown as Catalog, sources),
  );

  expectSeededFailure(
    'catalogue documentation',
    await verify(catalog, { ...sources, documentation: '' }),
  );

  expectSeededFailure(
    'modern failing fixture',
    await verify(catalog, {
      ...sources,
      modernFixtureCodes: new Set([...sources.modernFixtureCodes, 'state.name.missing']),
    }),
  );
}

async function main(): Promise<void> {
  const catalog = await loadJson<Catalog>('config/rule-catalog.json');
  const groups = ['stateMachine', 'actionContracts', 'notifications', 'database'];
  const declaredCodes = async (fixture: string): Promise<Set<string>> => {
    const expected = await loadJson<Record<string, { codes?: string[] }>>(
      `tests/fixtures/projects/${fixture}/expected.json`,
    );
    // An unsupported-syntax code is the reader reporting its own limit, not a
    // catalogued rule, so it is not cross-checked against the catalog.
    return new Set(
      groups
        .flatMap((key) => expected[key]?.codes ?? [])
        .filter((code) => !code.endsWith('.unsupported-syntax')),
    );
  };
  const fixtureCodes = await declaredCodes('legacy-broken');
  const modernFixtureCodes = await declaredCodes('modern-broken');

  const sources: Sources = {
    schema: await loadJson<object>('config/rule-catalog.schema.json'),
    implemented: await readImplementedRules(),
    documentation: await readFile(resolve(repositoryRoot, 'docs/RULES.md'), 'utf8'),
    fixtureCodes,
    modernFixtureCodes,
  };

  await proveGateDetectsSeededDefects(catalog, sources);

  const automated = catalog.checks.filter((check) => check.automatable).length;
  reportOrExit(
    'Rule catalog',
    await verify(catalog, sources),
    `Rule catalog ${catalog.catalogVersion} is consistent and its gate detects seeded defects: ${String(automated)} automated checks matched to their rules and fixtures, ${String(catalog.checks.length - automated)} recorded as manual only.`,
  );
}

await main();
