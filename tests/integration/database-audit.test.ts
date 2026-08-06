import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPolicyBoundary } from '../../src/policy.js';
import { auditDatabaseUsage } from '../../src/rules/database.js';
import { loadProjectContext } from '../../src/tools/project-context.js';

const projectsRoot = fileURLToPath(new URL('../fixtures/projects/', import.meta.url));

interface ExpectedFixture {
  readonly database?: {
    readonly status: string;
    readonly summary: Record<string, number>;
    readonly codes: string[];
  };
}

async function audit(fixture: string) {
  const root = resolve(projectsRoot, fixture);
  const policy = await createPolicyBoundary({ projectRoots: [root] });
  const context = await loadProjectContext(policy, root, { withPhpSources: true });
  const schemaPath = context.model.components
    .find((component) => component.id === 'database')
    ?.files.find((file) => file.endsWith('.sql'));
  const schemaSource =
    schemaPath === undefined
      ? null
      : { path: schemaPath, text: await policy.readProjectFile(root, schemaPath) };

  return {
    result: auditDatabaseUsage(schemaSource, context.phpSources),
    expected: JSON.parse(await readFile(resolve(root, 'expected.json'), 'utf8')) as ExpectedFixture,
  };
}

describe('database audit against the fixture corpus', () => {
  it('passes the valid legacy fixture and reads its schema and queries', async () => {
    const { result, expected } = await audit('legacy');
    expect(expected.database?.status).toBe('passed');
    expect(result.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });

    expect(result.tables).toEqual([
      { name: 'card', columns: ['card_id', 'card_location', 'card_owner'] },
    ]);
    expect(result.queries).toHaveLength(2);
    expect(result.queries.every((query) => query.source === 'bgamcplegacy.game.php')).toBe(true);
    expect(result.queries.every((query) => !query.interpolated)).toBe(true);
  });

  it('finds exactly the database defects the broken fixture declares', async () => {
    const { result, expected } = await audit('legacy-broken');
    const declared = expected.database;
    if (declared === undefined) {
      throw new Error('The broken fixture must declare its expected database findings');
    }

    expect(result.diagnostics.status).toBe(declared.status);
    expect(result.diagnostics.summary).toEqual(declared.summary);
    expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual(declared.codes);

    const undeclaredTable = result.diagnostics.findings.find(
      (finding) => finding.code === 'database.table.undeclared',
    );
    expect(undeclaredTable).toMatchObject({ kind: 'issue', certainty: 'certain' });
    expect(undeclaredTable?.message).toContain("'deck'");

    const undeclaredColumn = result.diagnostics.findings.find(
      (finding) => finding.code === 'database.column.undeclared',
    );
    expect(undeclaredColumn).toMatchObject({ kind: 'heuristic', certainty: 'likely' });
    expect(undeclaredColumn?.message).toContain('card_colour');

    const interpolated = result.diagnostics.findings.find(
      (finding) => finding.code === 'database.query.interpolated',
    );
    expect(interpolated?.kind).toBe('heuristic');

    const unused = result.diagnostics.findings.find(
      (finding) => finding.code === 'database.column.unused',
    );
    expect(unused).toMatchObject({ kind: 'heuristic', certainty: 'possible' });
    expect(unused?.message).toContain('card_unused');
  });

  it('refuses to pass a project whose usage it cannot audit', async () => {
    const { result } = await audit('modern');
    expect(result.diagnostics.status).toBe('findings');
    expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual([
      'database.audit.unavailable',
    ]);
  });

  it('produces byte-identical results across repeated runs', async () => {
    const first = await audit('legacy-broken');
    const second = await audit('legacy-broken');
    expect(JSON.stringify(first.result)).toBe(JSON.stringify(second.result));
  });
});
