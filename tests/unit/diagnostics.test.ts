import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';

import {
  DIAGNOSTIC_CONTRACT_VERSION,
  DIAGNOSTIC_SCHEMA_ID,
  getDiagnosticResultJsonSchema,
  parseDiagnosticResult,
} from '../../src/diagnostics.js';
import { diagnosticScenarios, diagnosticScenarioNames } from '../fixtures/diagnostic-results.js';

const schemaPath = fileURLToPath(new URL('../../config/diagnostics.schema.json', import.meta.url));

describe('diagnostic contract', () => {
  it('keeps the distributed JSON Schema identical to the runtime contract', async () => {
    const distributed = JSON.parse(await readFile(schemaPath, 'utf8')) as object;
    const generated = getDiagnosticResultJsonSchema();
    expect(distributed).toEqual(generated);
    expect(distributed).toMatchObject({
      $id: DIAGNOSTIC_SCHEMA_ID,
      properties: { schemaVersion: { $ref: '#/$defs/__schema0' } },
    });

    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(distributed);
    for (const scenario of diagnosticScenarioNames) {
      expect(validate(diagnosticScenarios[scenario]), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it.each(diagnosticScenarioNames)('round-trips the %s scenario', (scenario) => {
    const serialized = JSON.stringify(diagnosticScenarios[scenario]);
    expect(parseDiagnosticResult(JSON.parse(serialized))).toEqual(diagnosticScenarios[scenario]);
  });

  it('rejects a contract version it does not implement', () => {
    const invalid = structuredClone(diagnosticScenarios.success) as { schemaVersion: number };
    invalid.schemaVersion = DIAGNOSTIC_CONTRACT_VERSION + 1;
    expect(() => parseDiagnosticResult(invalid)).toThrow();
  });

  it('keeps factual findings and suggestions structurally distinct', () => {
    const invalid = structuredClone(diagnosticScenarios.error) as {
      findings: Record<string, unknown>[];
    };
    const finding = invalid.findings[0];
    if (finding === undefined) {
      throw new Error('Error scenario has no seeded finding');
    }
    finding.suggestion = 'Suggestions cannot masquerade as finding facts.';
    expect(() => parseDiagnosticResult(invalid)).toThrow();
  });

  it('requires uncertain heuristic evidence for heuristic findings', () => {
    const certain = structuredClone(diagnosticScenarios.heuristic) as {
      findings: { certainty: string }[];
    };
    const certainFinding = certain.findings[0];
    if (certainFinding === undefined) {
      throw new Error('Heuristic scenario has no seeded finding');
    }
    certainFinding.certainty = 'certain';
    expect(() => parseDiagnosticResult(certain)).toThrow();

    const unsupportedEvidence = structuredClone(diagnosticScenarios.heuristic) as {
      findings: { evidence: { kind: string }[] }[];
    };
    const evidence = unsupportedEvidence.findings[0]?.evidence[0];
    if (evidence === undefined) {
      throw new Error('Heuristic scenario has no seeded evidence');
    }
    evidence.kind = 'source';
    expect(() => parseDiagnosticResult(unsupportedEvidence)).toThrow(
      'Heuristic findings require heuristic evidence',
    );
  });

  it('prevents certain findings from relying on heuristic evidence', () => {
    const invalid = structuredClone(diagnosticScenarios.error) as {
      findings: { evidence: { kind: string }[] }[];
    };
    const evidence = invalid.findings[0]?.evidence[0];
    if (evidence === undefined) {
      throw new Error('Error scenario has no seeded evidence');
    }
    evidence.kind = 'heuristic';
    expect(() => parseDiagnosticResult(invalid)).toThrow(
      'Certain findings cannot rely on heuristic evidence',
    );
  });

  it('rejects stale aggregate counts and status', () => {
    const staleSummary = structuredClone(diagnosticScenarios.warning) as {
      summary: { warnings: number };
    };
    staleSummary.summary.warnings = 0;
    expect(() => parseDiagnosticResult(staleSummary)).toThrow('Summary warnings must equal 1');

    const staleStatus = structuredClone(diagnosticScenarios.unsupported) as { status: string };
    staleStatus.status = 'findings';
    expect(() => parseDiagnosticResult(staleStatus)).toThrow('Status must be unsupported');
  });

  it('rejects reversed source ranges', () => {
    const invalid = structuredClone(diagnosticScenarios.error) as {
      findings: { locations: { range?: { end?: { line: number; column: number } } }[] }[];
    };
    const end = invalid.findings[0]?.locations[0]?.range?.end;
    if (end === undefined) {
      throw new Error('Error scenario has no seeded range end');
    }
    end.column = 1;
    expect(() => parseDiagnosticResult(invalid)).toThrow(
      'Location range end must not precede its start',
    );
  });
});
