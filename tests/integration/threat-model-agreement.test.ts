import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  verifyThreatModel,
  type Manifest,
  type ThreatModel,
} from '../../scripts/lib/threat-model.js';

/**
 * Runs the threat-model gate against the real files, and against the exact
 * contradictions it was written for.
 *
 * The gate script proves it detects a seeded defect in every compared field
 * before it reports, which is the primary evidence. This exercises the same
 * checker from the test suite so the result is recorded as a scenario rather
 * than only as a script that exited zero.
 */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

let model: ThreatModel;
let manifest: Manifest;
let schema: object;
let documentation: string;

async function read<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

beforeAll(async () => {
  model = await read<ThreatModel>('config/threat-model.json');
  manifest = await read<Manifest>('config/capabilities.json');
  schema = await read<object>('config/threat-model.schema.json');
  documentation = await readFile(resolve(repositoryRoot, 'docs/THREAT_MODEL.md'), 'utf8');
});

describe('threat model agreement', () => {
  it('[GATE-THREAT-MODEL-AGREEMENT] the recorded model and the document say the same thing', () => {
    const report = verifyThreatModel(model, manifest, documentation, schema);
    expect(report.failures).toEqual([]);
  });

  it('[GATE-THREAT-MODEL-AGREEMENT] a boundary reviewed in one file and not the other fails', () => {
    // The literal 2026-08-08 finding: TB-DOCS-NETWORK was `reviewed` in the
    // machine model and `unreviewed` in the human table, and the gate of the
    // day passed because it only checked that the identifier appeared.
    const drifted = documentation.replace(
      /(\| TB-DOCS-NETWORK.*?\| 2026-08-07 \| )reviewed/u,
      '$1unreviewed',
    );
    expect(drifted).not.toBe(documentation);

    const report = verifyThreatModel(model, manifest, drifted, schema);
    expect(report.failures.join('\n')).toContain('Trust boundaries');
    expect(report.failures.join('\n')).toContain('Status');
  });

  it('[GATE-THREAT-MODEL-AGREEMENT] a control that drops an output surface fails', () => {
    const narrowed: ThreatModel = {
      ...model,
      mitigations: model.mitigations.map((mitigation) =>
        mitigation.id === 'TM-STUDIO-ALL-OUTPUTS-OWN-DATA'
          ? { ...mitigation, surfaces: ['SURFACE-TOOL-RESULT'] }
          : mitigation,
      ),
    };

    // Covering the MCP result and calling the data protected is the shape of
    // the defect BGA-319 was opened for.
    const report = verifyThreatModel(narrowed, manifest, documentation, schema);
    expect(report.failures.join('\n')).toContain('none of its mitigations covers that surface');
  });

  it('[GATE-THREAT-MODEL-AGREEMENT] nothing may be verified across a surface only planned work covers', () => {
    const claimed: Manifest = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        tools: manifest.capabilities.tools.map((tool) =>
          tool.name === 'read_studio_logs' ? { ...tool, stability: 'verified' } : tool,
        ),
      },
    };
    const withOpenSurface: ThreatModel = {
      ...model,
      mitigations: model.mitigations.map((mitigation) =>
        mitigation.id === 'TM-STUDIO-ALL-OUTPUTS-OWN-DATA'
          ? { ...mitigation, status: 'planned' as const, backlog: 'BGA-319' }
          : mitigation,
      ),
    };

    const report = verifyThreatModel(withOpenSurface, claimed, documentation, schema);
    expect(report.failures.join('\n')).toContain('read_studio_logs claims verification while');
    expect(report.failures.join('\n')).toContain('SURFACE-CLI-STDOUT');
  });
});
