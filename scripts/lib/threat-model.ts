import { Ajv2020 } from 'ajv/dist/2020.js';

import { GateReport } from './gate.js';
import { readTables, type MarkdownTable } from './tables.js';

/**
 * Compares the threat model with the document that claims to describe it.
 *
 * The 2026-08-08 adversarial review found `TB-DOCS-NETWORK` recorded as
 * `reviewed` in the machine model and `unreviewed` in the human table, with the
 * gate of the day passing both: it checked that every identifier appeared
 * somewhere in the prose and nothing else. So the comparison here is by field
 * and by cell, and the record renders the document it expects rather than
 * hunting for values inside it.
 *
 * It lives in a library because the gate script proves it detects seeded
 * defects, and a test proves the same thing against the real files.
 */

export interface Asset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface Actor {
  readonly id: string;
  readonly name: string;
  readonly trust: 'trusted' | 'semi-trusted' | 'untrusted';
  readonly description: string;
}

export interface TrustBoundary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: 'reviewed' | 'unreviewed';
  readonly gates: readonly string[];
  /**
   * Which capabilities are judged against this boundary. `every-capability` is
   * for a boundary every result crosses whether or not a capability names it.
   */
  readonly crossedBy: 'named' | 'every-capability';
  readonly reviewedAt: string;
  /** Mitigations that must be implemented before a capability may cross. */
  readonly preconditions?: readonly string[];
}

export interface OutputSurface {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface AbuseCase {
  readonly id: string;
  readonly title: string;
  readonly actor: string;
  readonly assets: readonly string[];
  readonly boundary: string;
  readonly impact: string;
  readonly mitigations: readonly string[];
  /** Present when the abuse is that protected data is published. */
  readonly surfaces?: readonly string[];
}

export interface Mitigation {
  readonly id: string;
  readonly title: string;
  readonly boundary: string;
  readonly control: 'automated' | 'manual';
  readonly status: 'planned' | 'implemented' | 'verified';
  readonly surfaces?: readonly string[];
  readonly scenarios?: readonly string[];
  readonly owner?: string;
  readonly cadence?: string;
  readonly evidence?: string;
  readonly backlog?: string;
}

export interface ResidualRisk {
  readonly id: string;
  readonly description: string;
  readonly abuseCases: readonly string[];
  readonly acceptedBy: string;
}

export interface ThreatModel {
  readonly reviewedAt: string;
  readonly assets: readonly Asset[];
  readonly actors: readonly Actor[];
  readonly trustBoundaries: readonly TrustBoundary[];
  readonly outputSurfaces: readonly OutputSurface[];
  readonly abuseCases: readonly AbuseCase[];
  readonly mitigations: readonly Mitigation[];
  readonly residualRisks: readonly ResidualRisk[];
}

export interface Manifest {
  readonly capabilities: Record<
    'tools' | 'resources' | 'prompts',
    readonly { readonly name: string; readonly stability: string; readonly boundary: string }[]
  >;
  readonly adapters: readonly {
    readonly name: string;
    readonly stability: string;
    readonly boundary?: string;
  }[];
}

/** How an empty list is written in the document, so absence is stated rather than blank. */
export const NONE = '—';

function list(values: readonly string[] | undefined): string {
  return values === undefined || values.length === 0 ? NONE : values.join(', ');
}

function checkSchema(schema: object, model: unknown, report: GateReport): void {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  report.require(validate(model), `Invalid threat model: ${ajv.errorsText(validate.errors)}`);
}

function checkReferences(model: ThreatModel, report: GateReport): void {
  const assets = new Set(model.assets.map((asset) => asset.id));
  const actors = new Set(model.actors.map((actor) => actor.id));
  const boundaries = new Set(model.trustBoundaries.map((boundary) => boundary.id));
  const mitigations = new Map(model.mitigations.map((mitigation) => [mitigation.id, mitigation]));
  const abuseCases = new Set(model.abuseCases.map((abuseCase) => abuseCase.id));
  const surfaces = new Set(model.outputSurfaces.map((surface) => surface.id));
  const usedMitigations = new Set<string>();
  const usedAssets = new Set<string>();
  const usedActors = new Set<string>();
  const usedBoundaries = new Set<string>();
  const usedSurfaces = new Set<string>();

  for (const abuseCase of model.abuseCases) {
    report.require(
      actors.has(abuseCase.actor),
      `${abuseCase.id} references unknown ${abuseCase.actor}`,
    );
    report.require(
      boundaries.has(abuseCase.boundary),
      `${abuseCase.id} references unknown ${abuseCase.boundary}`,
    );
    usedActors.add(abuseCase.actor);
    usedBoundaries.add(abuseCase.boundary);
    for (const asset of abuseCase.assets) {
      report.require(assets.has(asset), `${abuseCase.id} references unknown ${asset}`);
      usedAssets.add(asset);
    }
    for (const mitigation of abuseCase.mitigations) {
      report.require(
        mitigations.has(mitigation),
        `${abuseCase.id} references unknown ${mitigation}`,
      );
      usedMitigations.add(mitigation);
    }
    for (const surface of abuseCase.surfaces ?? []) {
      report.require(surfaces.has(surface), `${abuseCase.id} references unknown ${surface}`);
      usedSurfaces.add(surface);
    }
  }

  for (const mitigation of model.mitigations) {
    report.require(
      boundaries.has(mitigation.boundary),
      `${mitigation.id} references unknown ${mitigation.boundary}`,
    );
    usedBoundaries.add(mitigation.boundary);
    report.require(
      usedMitigations.has(mitigation.id),
      `${mitigation.id} mitigates no recorded abuse case`,
    );
    report.require(
      mitigation.control !== 'manual' || (mitigation.owner ?? '').length > 0,
      `${mitigation.id} is a manual control without an owner`,
    );
    report.require(
      mitigation.control !== 'automated' || (mitigation.scenarios ?? []).length > 0,
      `${mitigation.id} is an automated control without a scenario`,
    );
    for (const surface of mitigation.surfaces ?? []) {
      report.require(surfaces.has(surface), `${mitigation.id} references unknown ${surface}`);
    }
  }

  for (const risk of model.residualRisks) {
    for (const abuseCase of risk.abuseCases) {
      report.require(abuseCases.has(abuseCase), `${risk.id} references unknown ${abuseCase}`);
    }
  }

  for (const [kind, declared, used] of [
    ['asset', assets, usedAssets],
    ['actor', actors, usedActors],
    ['trust boundary', boundaries, usedBoundaries],
    ['output surface', surfaces, usedSurfaces],
  ] as const) {
    for (const id of declared) {
      report.require(used.has(id), `${kind} ${id} is recorded but never referenced`);
    }
  }
}

export interface Coverage {
  readonly abuseCase: string;
  readonly boundary: string;
  readonly surface: string;
  /** Mitigations that name this surface, whatever their status. */
  readonly named: readonly Mitigation[];
  /** Those of them that exist today. */
  readonly protecting: readonly Mitigation[];
}

/**
 * Reads the model as "who protects what, where".
 *
 * A control that covers one output is not a control that covers the data. The
 * 2026-08-08 review found the Studio privacy rule enforced on the MCP result
 * and nowhere else, which read as complete because nothing recorded the other
 * surfaces. Coverage is per surface, so a control that reaches only one of them
 * cannot describe itself as protecting the asset.
 */
export function coverage(model: ThreatModel): readonly Coverage[] {
  const mitigations = new Map(model.mitigations.map((mitigation) => [mitigation.id, mitigation]));
  const rows: Coverage[] = [];

  for (const abuseCase of model.abuseCases) {
    for (const surface of abuseCase.surfaces ?? []) {
      const named = abuseCase.mitigations
        .map((id) => mitigations.get(id))
        .filter((mitigation): mitigation is Mitigation => mitigation !== undefined)
        .filter((mitigation) => (mitigation.surfaces ?? []).includes(surface));
      rows.push({
        abuseCase: abuseCase.id,
        boundary: abuseCase.boundary,
        surface,
        named,
        protecting: named.filter((mitigation) => mitigation.status !== 'planned'),
      });
    }
  }

  return rows;
}

/**
 * The open surfaces something advertised across `boundary` must answer for.
 *
 * A capability answers for its own boundary and for every boundary the model
 * says all results cross. TB-OUTPUT is the second kind: every tool result and
 * every error goes through it, and no capability names it, so scoping this to
 * the named boundary alone would have made the rule unable to reach the one
 * place all output actually leaves.
 */
function openSurfacesFor(
  model: ThreatModel,
  boundary: string,
): readonly { readonly boundary: string; readonly abuseCase: string; readonly surface: string }[] {
  const universal = new Set(
    model.trustBoundaries
      .filter((entry) => entry.crossedBy === 'every-capability')
      .map((entry) => entry.id),
  );
  return coverage(model)
    .filter((row) => row.protecting.length === 0)
    .filter((row) => row.boundary === boundary || universal.has(row.boundary))
    .map((row) => ({ boundary: row.boundary, abuseCase: row.abuseCase, surface: row.surface }));
}

/**
 * BGA-013 acceptance: a capability whose boundary is still unreviewed may not
 * be advertised, and a mitigation on such a boundary may not claim more than
 * planned status. BGA-018 adds the surface composition: nothing is verified
 * across a boundary where protected data can still be published unprotected.
 */
function checkBoundaryGate(model: ThreatModel, manifest: Manifest, report: GateReport): void {
  const boundaries = new Map(model.trustBoundaries.map((boundary) => [boundary.id, boundary]));
  const mitigations = new Map(model.mitigations.map((mitigation) => [mitigation.id, mitigation]));

  for (const mitigation of model.mitigations) {
    const boundary = boundaries.get(mitigation.boundary);
    report.require(
      boundary?.status !== 'unreviewed' ||
        mitigation.status !== 'verified' ||
        mitigation.control === 'automated',
      `${mitigation.id} claims verification on an unreviewed boundary without an automated control`,
    );
  }

  // A reviewed boundary may still be closed: its preconditions name the
  // mitigations that must exist before anything crosses it.
  for (const boundary of model.trustBoundaries) {
    for (const id of boundary.preconditions ?? []) {
      report.require(mitigations.has(id), `${boundary.id} names unknown precondition ${id}`);
      report.require(
        mitigations.get(id)?.boundary === boundary.id,
        `${boundary.id} names precondition ${id}, which belongs to another boundary`,
      );
    }
  }

  const advertised = [
    ...manifest.capabilities.tools,
    ...manifest.capabilities.resources,
    ...manifest.capabilities.prompts,
  ];
  for (const capability of advertised) {
    const boundary = boundaries.get(capability.boundary);
    report.require(
      boundary !== undefined,
      `Capability ${capability.name} names unknown boundary ${capability.boundary}`,
    );
    if (boundary === undefined) {
      continue;
    }
    report.require(
      boundary.status === 'reviewed',
      `Capability ${capability.name} is advertised across unreviewed boundary ${boundary.id}`,
    );
    for (const id of boundary.preconditions ?? []) {
      report.require(
        mitigations.get(id)?.status !== 'planned',
        `Capability ${capability.name} is advertised while ${boundary.id} precondition ${id} is still planned`,
      );
    }
    for (const open of openSurfacesFor(model, boundary.id)) {
      // A capability is not verified while a control it depends on is not.
      report.require(
        capability.stability !== 'verified',
        `Capability ${capability.name} claims verification while ${open.abuseCase} can still publish through ${open.surface} on ${open.boundary}`,
      );
    }
  }

  for (const adapter of manifest.adapters) {
    const boundary = adapter.boundary === undefined ? undefined : boundaries.get(adapter.boundary);
    report.require(
      boundary?.status === 'reviewed',
      `Adapter ${adapter.name} is advertised without a reviewed boundary`,
    );
    for (const id of boundary?.preconditions ?? []) {
      report.require(
        mitigations.get(id)?.status !== 'planned',
        `Adapter ${adapter.name} is advertised while ${boundary?.id ?? ''} precondition ${id} is still planned`,
      );
    }
    for (const open of openSurfacesFor(model, boundary?.id ?? '')) {
      report.require(
        adapter.stability !== 'verified',
        `Adapter ${adapter.name} claims verification while ${open.abuseCase} can still publish through ${open.surface} on ${open.boundary}`,
      );
    }
  }
}

/**
 * Every surface an abuse case can publish through must be somebody's job.
 *
 * An open surface — one only planned work covers — is not a failure here. It is
 * work that has not happened yet, it already names its backlog item because the
 * schema requires one of every planned control, and it stops anything on that
 * boundary from calling itself verified.
 */
function checkSurfaceCoverage(model: ThreatModel, report: GateReport): void {
  for (const row of coverage(model)) {
    report.require(
      row.named.length > 0,
      `${row.abuseCase} can publish through ${row.surface}, but none of its mitigations covers that surface`,
    );
  }
}

function describeState(row: Coverage): string {
  if (row.protecting.length > 0) {
    return 'protected';
  }
  const owners = [...new Set(row.named.map((mitigation) => mitigation.backlog ?? '?'))];
  return `open: ${owners.join(', ')}`;
}

export interface ExpectedTable {
  readonly name: string;
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** The document, as the record says it should read. */
export function expectedTables(model: ThreatModel): readonly ExpectedTable[] {
  return [
    {
      name: 'Assets',
      header: ['ID', 'Asset', 'Why it matters'],
      rows: model.assets.map((asset) => [asset.id, asset.name, asset.description]),
    },
    {
      name: 'Actors',
      header: ['ID', 'Actor', 'Trust', 'Why that level'],
      rows: model.actors.map((actor) => [actor.id, actor.name, actor.trust, actor.description]),
    },
    {
      name: 'Trust boundaries',
      header: ['ID', 'Boundary', 'Gates', 'Crossed by', 'Reviewed', 'Status', 'Preconditions'],
      rows: model.trustBoundaries.map((boundary) => [
        boundary.id,
        boundary.name,
        list(boundary.gates),
        boundary.crossedBy,
        boundary.reviewedAt,
        boundary.status,
        list(boundary.preconditions),
      ]),
    },
    {
      name: 'Output surfaces',
      header: ['ID', 'Surface', 'What reaches it'],
      rows: model.outputSurfaces.map((surface) => [surface.id, surface.name, surface.description]),
    },
    {
      name: 'Abuse cases',
      header: ['ID', 'Abuse case', 'Actor', 'Assets', 'Boundary', 'Surfaces', 'Mitigations'],
      rows: model.abuseCases.map((abuseCase) => [
        abuseCase.id,
        abuseCase.title,
        abuseCase.actor,
        list(abuseCase.assets),
        abuseCase.boundary,
        list(abuseCase.surfaces),
        list(abuseCase.mitigations),
      ]),
    },
    {
      name: 'Mitigations',
      header: ['ID', 'Mitigation', 'Control', 'Status', 'Surfaces', 'Owner', 'Cadence', 'Evidence'],
      rows: model.mitigations.map((mitigation) => [
        mitigation.id,
        mitigation.title,
        mitigation.control,
        mitigation.status,
        list(mitigation.surfaces),
        mitigation.owner ?? NONE,
        mitigation.cadence ?? NONE,
        mitigation.control === 'manual'
          ? (mitigation.evidence ?? NONE)
          : list(mitigation.scenarios),
      ]),
    },
    {
      name: 'Surface coverage',
      header: ['Abuse case', 'Surface', 'Protected by', 'State'],
      rows: coverage(model).map((row) => [
        row.abuseCase,
        row.surface,
        list(row.named.map((mitigation) => mitigation.id)),
        describeState(row),
      ]),
    },
    {
      name: 'Residual risks',
      header: ['ID', 'Residual risk', 'Abuse cases', 'Accepted by'],
      rows: model.residualRisks.map((risk) => [
        risk.id,
        risk.description,
        list(risk.abuseCases),
        risk.acceptedBy,
      ]),
    },
  ];
}

const sameHeader = (table: MarkdownTable, expected: ExpectedTable): boolean =>
  table.header.length === expected.header.length &&
  table.header.every((cell, index) => cell === expected.header[index]);

/** Compares the document with the record, cell by cell. */
function checkAgreement(model: ThreatModel, documentation: string, report: GateReport): void {
  report.require(
    documentation.includes(`Reviewed: ${model.reviewedAt}.`),
    `The document does not state the recorded review date ${model.reviewedAt}`,
  );

  const tables = readTables(documentation);
  for (const expected of expectedTables(model)) {
    const matches = tables.filter((table) => sameHeader(table, expected));
    report.require(
      matches.length === 1,
      matches.length === 0
        ? `The document has no ${expected.name} table with the columns ${expected.header.join(' | ')}`
        : `The document has ${String(matches.length)} tables with the ${expected.name} columns`,
    );
    const table = matches[0];
    if (table === undefined) {
      continue;
    }

    report.require(
      table.rows.length === expected.rows.length,
      `Document disagrees: the ${expected.name} table has ${String(table.rows.length)} rows and the record has ${String(expected.rows.length)}`,
    );
    for (const [index, row] of expected.rows.entries()) {
      const actual = table.rows[index];
      if (actual === undefined) {
        continue;
      }
      for (const [column, value] of row.entries()) {
        report.require(
          actual[column] === value,
          `Document disagrees: ${expected.name} row ${String(index + 1)}, column ${expected.header[column] ?? String(column)} reads ${JSON.stringify(actual[column] ?? '')} and the record says ${JSON.stringify(value)}`,
        );
      }
    }
  }
}

/** Nothing may be named in one file and unknown in the other. */
function checkIdentifiers(model: ThreatModel, documentation: string, report: GateReport): void {
  const identifiers = [
    ...model.assets.map((asset) => asset.id),
    ...model.actors.map((actor) => actor.id),
    ...model.trustBoundaries.map((boundary) => boundary.id),
    ...model.outputSurfaces.map((surface) => surface.id),
    ...model.abuseCases.map((abuseCase) => abuseCase.id),
    ...model.mitigations.map((mitigation) => mitigation.id),
    ...model.residualRisks.map((risk) => risk.id),
  ];
  const known = new Set(identifiers);

  for (const id of identifiers) {
    report.require(documentation.includes(id), `${id} is missing from docs/THREAT_MODEL.md`);
  }
  for (const match of documentation.matchAll(
    /\b(?:ASSET|ACTOR|TB|AC|TM|RR|SURFACE)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/gu,
  )) {
    report.require(known.has(match[0]), `docs/THREAT_MODEL.md references unknown ${match[0]}`);
  }
}

export function verifyThreatModel(
  model: ThreatModel,
  manifest: Manifest,
  documentation: string,
  schema: object,
): GateReport {
  const report = new GateReport();
  checkSchema(schema, model, report);
  if (!report.failed) {
    checkReferences(model, report);
    checkBoundaryGate(model, manifest, report);
    checkSurfaceCoverage(model, report);
    checkIdentifiers(model, documentation, report);
    checkAgreement(model, documentation, report);
  }
  return report;
}
