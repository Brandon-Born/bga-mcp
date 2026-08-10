import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expectSeededFailure, reportOrExit, type GateReport } from './lib/gate.js';
import {
  coverage,
  expectedTables,
  verifyThreatModel,
  type Manifest,
  type ThreatModel,
} from './lib/threat-model.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

/** The checker under its old local name, so the seeds below read as they did. */
const verify = verifyThreatModel;

type Mutate = (model: ThreatModel) => ThreatModel;

/** A different member of the same set, so a seeded value stays legal. */
function other<T extends string>(value: T, options: readonly T[]): T {
  return options.find((option) => option !== value) ?? value;
}

/**
 * One seeded disagreement per compared field.
 *
 * The point of the list is that it is exhaustive over the fields the two files
 * share. A field nobody seeds is a field the gate is free to stop comparing
 * without anyone noticing.
 */
function agreementSeeds(): readonly { readonly field: string; readonly mutate: Mutate }[] {
  const edit = <K extends keyof ThreatModel>(
    key: K,
    change: (entry: ThreatModel[K] extends readonly (infer E)[] ? E : never) => unknown,
  ): Mutate => {
    return (model) => ({
      ...model,
      [key]: (model[key] as readonly unknown[]).map((entry, index) =>
        index === 0 ? change(entry as never) : entry,
      ),
    });
  };

  return [
    { field: 'reviewedAt', mutate: (model) => ({ ...model, reviewedAt: '1999-01-01' }) },
    { field: 'asset name', mutate: edit('assets', (a) => ({ ...a, name: `${a.name} (seeded)` })) },
    {
      field: 'asset description',
      mutate: edit('assets', (a) => ({ ...a, description: `${a.description} (seeded)` })),
    },
    { field: 'actor name', mutate: edit('actors', (a) => ({ ...a, name: `${a.name} (seeded)` })) },
    {
      field: 'actor trust',
      mutate: edit('actors', (a) => ({
        ...a,
        trust: other(a.trust, ['trusted', 'semi-trusted', 'untrusted']),
      })),
    },
    {
      field: 'actor description',
      mutate: edit('actors', (a) => ({ ...a, description: `${a.description} (seeded)` })),
    },
    {
      field: 'boundary name',
      mutate: edit('trustBoundaries', (b) => ({ ...b, name: `${b.name} (seeded)` })),
    },
    {
      field: 'boundary gates',
      mutate: edit('trustBoundaries', (b) => ({ ...b, gates: [...b.gates, 'network'] })),
    },
    {
      field: 'boundary reach',
      mutate: edit('trustBoundaries', (b) => ({
        ...b,
        crossedBy: other(b.crossedBy, ['named', 'every-capability']),
      })),
    },
    {
      field: 'boundary review date',
      mutate: edit('trustBoundaries', (b) => ({ ...b, reviewedAt: '1999-01-01' })),
    },
    {
      field: 'boundary status',
      mutate: edit('trustBoundaries', (b) => ({
        ...b,
        status: other(b.status, ['reviewed', 'unreviewed']),
      })),
    },
    {
      field: 'boundary preconditions',
      mutate: (model) => ({
        ...model,
        trustBoundaries: model.trustBoundaries.map((boundary) =>
          boundary.id === 'TB-DOCS-NETWORK'
            ? { ...boundary, preconditions: (boundary.preconditions ?? []).slice(1) }
            : boundary,
        ),
      }),
    },
    {
      field: 'surface name',
      mutate: edit('outputSurfaces', (s) => ({ ...s, name: `${s.name} (seeded)` })),
    },
    {
      field: 'surface description',
      mutate: edit('outputSurfaces', (s) => ({ ...s, description: `${s.description} (seeded)` })),
    },
    {
      field: 'abuse case title',
      mutate: edit('abuseCases', (c) => ({ ...c, title: `${c.title} (seeded)` })),
    },
    {
      field: 'abuse case actor',
      mutate: (model) => ({
        ...model,
        abuseCases: model.abuseCases.map((abuseCase, index) =>
          index === 0
            ? {
                ...abuseCase,
                actor: other(
                  abuseCase.actor,
                  model.actors.map((actor) => actor.id),
                ),
              }
            : abuseCase,
        ),
      }),
    },
    {
      field: 'abuse case assets',
      mutate: edit('abuseCases', (c) => ({ ...c, assets: c.assets.slice(0, 1) })),
    },
    {
      field: 'abuse case boundary',
      mutate: (model) => ({
        ...model,
        abuseCases: model.abuseCases.map((abuseCase, index) =>
          index === 0
            ? {
                ...abuseCase,
                boundary: other(
                  abuseCase.boundary,
                  model.trustBoundaries.map((boundary) => boundary.id),
                ),
              }
            : abuseCase,
        ),
      }),
    },
    {
      field: 'abuse case surfaces',
      mutate: (model) => ({
        ...model,
        abuseCases: model.abuseCases.map((abuseCase) =>
          abuseCase.id === 'AC-STUDIO-PLAYER-DATA'
            ? { ...abuseCase, surfaces: (abuseCase.surfaces ?? []).slice(1) }
            : abuseCase,
        ),
      }),
    },
    {
      field: 'abuse case mitigations',
      mutate: edit('abuseCases', (c) => ({ ...c, mitigations: c.mitigations.slice(0, 1) })),
    },
    {
      field: 'mitigation title',
      mutate: edit('mitigations', (m) => ({ ...m, title: `${m.title} (seeded)` })),
    },
    {
      // The seeded record has to stay legal, or the schema rejects it first and
      // the agreement check never runs.
      field: 'mitigation control',
      mutate: (model) => ({
        ...model,
        mitigations: model.mitigations.map((mitigation) =>
          mitigation.id === 'TM-BOUNDARY-REVIEW'
            ? { ...mitigation, control: 'automated' as const, scenarios: ['GATE-SEEDED'] }
            : mitigation,
        ),
      }),
    },
    {
      field: 'mitigation status',
      mutate: edit('mitigations', (m) => ({
        ...m,
        status: other(m.status, ['planned', 'implemented', 'verified']),
        backlog: m.backlog ?? 'BGA-018',
      })),
    },
    {
      field: 'mitigation surfaces',
      mutate: (model) => ({
        ...model,
        mitigations: model.mitigations.map((mitigation) =>
          mitigation.id === 'TM-STUDIO-ALL-OUTPUTS-OWN-DATA'
            ? { ...mitigation, surfaces: (mitigation.surfaces ?? []).slice(1) }
            : mitigation,
        ),
      }),
    },
    {
      field: 'mitigation owner',
      mutate: (model) => ({
        ...model,
        mitigations: model.mitigations.map((mitigation) =>
          mitigation.control === 'manual'
            ? { ...mitigation, owner: `${mitigation.owner ?? ''} (seeded)` }
            : mitigation,
        ),
      }),
    },
    {
      field: 'mitigation cadence',
      mutate: (model) => ({
        ...model,
        mitigations: model.mitigations.map((mitigation) =>
          mitigation.control === 'manual'
            ? { ...mitigation, cadence: `${mitigation.cadence ?? ''} (seeded)` }
            : mitigation,
        ),
      }),
    },
    {
      field: 'mitigation evidence',
      mutate: (model) => ({
        ...model,
        mitigations: model.mitigations.map((mitigation) =>
          mitigation.control === 'manual'
            ? { ...mitigation, evidence: `${mitigation.evidence ?? ''} (seeded)` }
            : mitigation,
        ),
      }),
    },
    {
      field: 'mitigation scenarios',
      mutate: (model) => ({
        ...model,
        mitigations: model.mitigations.map((mitigation) =>
          mitigation.control === 'automated'
            ? { ...mitigation, scenarios: (mitigation.scenarios ?? []).slice(0, 1) }
            : mitigation,
        ),
      }),
    },
    {
      field: 'residual risk description',
      mutate: edit('residualRisks', (r) => ({ ...r, description: `${r.description} (seeded)` })),
    },
    {
      field: 'residual risk abuse cases',
      mutate: edit('residualRisks', (r) => ({ ...r, abuseCases: r.abuseCases.slice(0, 1) })),
    },
    {
      field: 'residual risk acceptance',
      mutate: edit('residualRisks', (r) => ({ ...r, acceptedBy: 'Somebody Else' })),
    },
    {
      field: 'row order',
      mutate: (model) => ({
        ...model,
        assets: [...model.assets].reverse(),
      }),
    },
    {
      field: 'row count',
      mutate: (model) => ({ ...model, residualRisks: model.residualRisks.slice(1) }),
    },
  ];
}

/** A seeded defect must fail for the reason it was seeded, not incidentally. */
function expectFailureAbout(name: string, report: GateReport, needle: string): void {
  expectSeededFailure(name, report);
  if (!report.failures.some((failure) => failure.includes(needle))) {
    throw new Error(
      `The ${name} gate failed, but not about ${needle}:\n- ${report.failures.join('\n- ')}`,
    );
  }
}

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
  // The precondition being planned is seeded too, rather than relied on: as the
  // real preconditions are implemented one by one, a gate that only worked
  // while they were all planned would quietly stop proving anything.
  const seededPlannedPrecondition: ThreatModel = {
    ...model,
    mitigations: model.mitigations.map((mitigation) =>
      mitigation.boundary === 'TB-DOCS-NETWORK'
        ? { ...mitigation, status: 'planned' as const }
        : mitigation,
    ),
  };
  expectSeededFailure(
    'boundary precondition',
    verify(seededPlannedPrecondition, seededDocsCapability, documentation, schema),
  );

  expectSeededFailure(
    'threat model documentation',
    verify(model, manifest, `${documentation}\nTM-UNDOCUMENTED-CONTROL\n`, schema),
  );

  // Every field the two files share, one at a time.
  for (const seed of agreementSeeds()) {
    expectFailureAbout(
      `${seed.field} agreement`,
      verify(seed.mutate(model), manifest, documentation, schema),
      seed.field === 'reviewedAt' ? 'review date' : 'Document disagrees',
    );
  }

  // A surface nobody covers is a hole in the model, not an open task.
  expectFailureAbout(
    'surface coverage',
    verify(
      {
        ...model,
        mitigations: model.mitigations.filter(
          (mitigation) => mitigation.id !== 'TM-STUDIO-ALL-OUTPUTS-OWN-DATA',
        ),
        abuseCases: model.abuseCases.map((abuseCase) => ({
          ...abuseCase,
          mitigations: abuseCase.mitigations.filter(
            (id) => id !== 'TM-STUDIO-ALL-OUTPUTS-OWN-DATA',
          ),
        })),
      },
      manifest,
      documentation,
      schema,
    ),
    'none of its mitigations covers that surface',
  );

  // Nothing may call itself verified across a surface that is still open.
  //
  // The seed opens a surface as well as claiming the capability, rather than
  // relying on one being open today. A rule that could only be demonstrated
  // while some item happened to be outstanding would stop being demonstrable
  // on the day that item landed — which is the day it matters most, and which
  // is exactly what happened when BGA-321 and BGA-328 closed the last open
  // surface on the boundary this seed used.
  const openedSurface: ThreatModel = {
    ...model,
    mitigations: model.mitigations.map((mitigation) =>
      mitigation.boundary === 'TB-STUDIO-READ'
        ? { ...mitigation, status: 'planned' as const, backlog: mitigation.backlog ?? 'BGA-312' }
        : mitigation,
    ),
  };
  expectFailureAbout(
    'verified across an open surface',
    verify(
      openedSurface,
      {
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          tools: manifest.capabilities.tools.map((tool) =>
            tool.name === 'read_studio_logs' ? { ...tool, stability: 'verified' } : tool,
          ),
        },
      },
      documentation,
      schema,
    ),
    'claims verification while',
  );
}

async function main(): Promise<void> {
  const schema = await loadJson<object>('config/threat-model.schema.json');
  const model = await loadJson<ThreatModel>('config/threat-model.json');
  const manifest = await loadJson<Manifest>('config/capabilities.json');
  const documentation = await readFile(resolve(repositoryRoot, 'docs/THREAT_MODEL.md'), 'utf8');

  proveGateDetectsSeededDefects(model, manifest, documentation, schema);

  const rows = coverage(model);
  const open = rows.filter((row) => row.protecting.length === 0);
  const compared = expectedTables(model).reduce(
    (total, table) => total + table.rows.length * table.header.length,
    0,
  );
  reportOrExit(
    'Threat model',
    verify(model, manifest, documentation, schema),
    `Threat model is consistent with its document and its gate detects seeded defects: ${String(model.abuseCases.length)} abuse cases, ${String(model.mitigations.length)} mitigations, ${String(model.residualRisks.length)} recorded residual risks, ${String(compared)} fields compared cell for cell, and ${String(rows.length - open.length)} of ${String(rows.length)} output surfaces protected today${open.length === 0 ? '' : ` (open: ${open.map((row) => `${row.abuseCase}/${row.surface}`).join(', ')})`}.`,
  );
}

await main();
