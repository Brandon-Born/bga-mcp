import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface Mitigation {
  readonly id: string;
  readonly boundary: string;
  readonly control: 'automated' | 'manual';
  readonly status: 'planned' | 'implemented' | 'verified';
  readonly scenarios?: readonly string[];
  readonly owner?: string;
  readonly backlog?: string;
}

interface ThreatModel {
  readonly assets: readonly { readonly id: string }[];
  readonly actors: readonly { readonly id: string }[];
  readonly trustBoundaries: readonly {
    readonly id: string;
    readonly status: 'reviewed' | 'unreviewed';
    readonly gates: readonly string[];
    /** Mitigations that must be implemented before a capability may cross. */
    readonly preconditions?: readonly string[];
  }[];
  readonly abuseCases: readonly {
    readonly id: string;
    readonly actor: string;
    readonly assets: readonly string[];
    readonly boundary: string;
    readonly mitigations: readonly string[];
  }[];
  readonly mitigations: readonly Mitigation[];
  readonly residualRisks: readonly {
    readonly id: string;
    readonly abuseCases: readonly string[];
  }[];
}

interface Manifest {
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

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
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
  const usedMitigations = new Set<string>();
  const usedAssets = new Set<string>();
  const usedActors = new Set<string>();
  const usedBoundaries = new Set<string>();

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
  ] as const) {
    for (const id of declared) {
      report.require(used.has(id), `${kind} ${id} is recorded but never referenced`);
    }
  }
}

/**
 * BGA-013 acceptance: a capability whose boundary is still unreviewed may not
 * be advertised, and a mitigation on such a boundary may not claim more than
 * planned status.
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
  }
}

function checkDocumentation(model: ThreatModel, documentation: string, report: GateReport): void {
  const identifiers = [
    ...model.assets.map((asset) => asset.id),
    ...model.actors.map((actor) => actor.id),
    ...model.trustBoundaries.map((boundary) => boundary.id),
    ...model.abuseCases.map((abuseCase) => abuseCase.id),
    ...model.mitigations.map((mitigation) => mitigation.id),
    ...model.residualRisks.map((risk) => risk.id),
  ];
  const known = new Set(identifiers);

  for (const id of identifiers) {
    report.require(documentation.includes(id), `${id} is missing from docs/THREAT_MODEL.md`);
  }
  for (const match of documentation.matchAll(
    /\b(?:ASSET|ACTOR|TB|AC|TM|RR)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/gu,
  )) {
    report.require(known.has(match[0]), `docs/THREAT_MODEL.md references unknown ${match[0]}`);
  }
}

function verify(
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
    checkDocumentation(model, documentation, report);
  }
  return report;
}

/** Seeds an unmitigated abuse case, an orphan mitigation, and a shipped adapter. */
function proveGateDetectsSeededDefects(
  model: ThreatModel,
  manifest: Manifest,
  documentation: string,
  schema: object,
): void {
  const tampered = structuredClone(model) as unknown as {
    abuseCases: { mitigations: string[] }[];
    mitigations: { owner?: string; control: string }[];
  };
  tampered.abuseCases[0]?.mitigations.push('TM-DOES-NOT-EXIST');
  const manual = tampered.mitigations.find((mitigation) => mitigation.control === 'manual');
  if (manual !== undefined) {
    delete manual.owner;
  }
  expectSeededFailure(
    'threat model reference',
    verify(tampered as unknown as ThreatModel, manifest, documentation, schema),
  );

  expectSeededFailure(
    'threat model boundary',
    verify(
      model,
      {
        ...manifest,
        adapters: [{ name: 'studio-sftp', stability: 'implemented', boundary: 'TB-STUDIO' }],
      },
      documentation,
      schema,
    ),
  );

  // A reviewed boundary whose preconditions are still planned must stay closed.
  const seededDocsCapability = {
    ...manifest,
    capabilities: {
      ...manifest.capabilities,
      tools: [
        ...manifest.capabilities.tools,
        { name: 'search_bga_docs', stability: 'verified', boundary: 'TB-DOCS-NETWORK' },
      ],
    },
  };
  expectSeededFailure(
    'boundary precondition',
    verify(model, seededDocsCapability, documentation, schema),
  );

  expectSeededFailure(
    'threat model documentation',
    verify(model, manifest, `${documentation}\nTM-UNDOCUMENTED-CONTROL\n`, schema),
  );
}

async function main(): Promise<void> {
  const schema = await loadJson<object>('config/threat-model.schema.json');
  const model = await loadJson<ThreatModel>('config/threat-model.json');
  const manifest = await loadJson<Manifest>('config/capabilities.json');
  const documentation = await readFile(resolve(repositoryRoot, 'docs/THREAT_MODEL.md'), 'utf8');

  proveGateDetectsSeededDefects(model, manifest, documentation, schema);

  reportOrExit(
    'Threat model',
    verify(model, manifest, documentation, schema),
    `Threat model is consistent and its gate detects seeded defects: ${String(model.abuseCases.length)} abuse cases, ${String(model.mitigations.length)} mitigations, ${String(model.residualRisks.length)} recorded residual risks.`,
  );
}

await main();
