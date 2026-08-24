import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPolicyBoundary } from '../../src/policy.js';
import { validateActionContracts } from '../../src/rules/action-contracts.js';
import { loadProjectContext } from '../../src/tools/project-context.js';

const projectsRoot = fileURLToPath(new URL('../fixtures/projects/', import.meta.url));

interface ExpectedFixture {
  readonly actionContracts?: {
    readonly status: string;
    readonly summary: Record<string, number>;
    readonly codes: string[];
  };
}

async function trace(fixture: string) {
  const root = resolve(projectsRoot, fixture);
  const policy = await createPolicyBoundary({ projectRoots: [root] });
  const context = await loadProjectContext(policy, root, {
    withPhpSources: true,
    withClientSources: true,
  });
  return {
    result: validateActionContracts(context.model, context.clientSources, context.phpSources),
    expected: JSON.parse(await readFile(resolve(root, 'expected.json'), 'utf8')) as ExpectedFixture,
  };
}

describe('action contract validation against the fixture corpus', () => {
  it('passes the valid legacy fixture and traces its one action end to end', async () => {
    const { result, expected } = await trace('legacy');
    expect(expected.actionContracts?.status).toBe('passed');
    expect(result.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });

    expect(result.clientCalls).toEqual([
      {
        action: 'actPass',
        argumentNames: ['comment'],
        argumentShape: 'known',
        // The literal the client writes out, kept so a parameter attribute's
        // documented check can be compared against it.
        argumentValues: { comment: "'no play'" },
        style: 'ajaxcall',
        source: 'bgamcplegacy.js',
      },
    ]);
    expect(result.entryPoints).toEqual([
      {
        action: 'actPass',
        argumentNames: ['comment'],
        scope: 'legacy-dispatcher',
        scopeId: 'bgamcplegacy.action.php',
        source: 'bgamcplegacy.action.php',
      },
    ]);
    expect(result.declaredActions).toEqual(['actPass']);
    expect(result.gameMethods).toContain('actPass');
  });

  it('finds exactly the contract defects the broken fixture declares', async () => {
    const { result, expected } = await trace('legacy-broken');
    const declared = expected.actionContracts;
    if (declared === undefined) {
      throw new Error('The broken fixture must declare its expected contract findings');
    }

    expect(result.diagnostics.status).toBe(declared.status);
    expect(result.diagnostics.summary).toEqual(declared.summary);
    expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual(declared.codes);

    // The client sends cardId; the entry point reads comment. Both directions are reported.
    const mismatches = result.diagnostics.findings.filter(
      (finding) => finding.code === 'action.argument.mismatch',
    );
    expect(mismatches.map((finding) => finding.message)).toEqual([
      "The client sends argument 'cardId' to 'actPass', which its entry point does not read.",
      "The entry point for 'actPass' reads argument 'comment', which the client does not send.",
    ]);

    const convention = result.diagnostics.findings.find(
      (finding) => finding.code === 'action.name.convention',
    );
    expect(convention).toMatchObject({ kind: 'issue', certainty: 'certain' });
    expect(convention?.message).toContain('passTurn');

    for (const finding of result.diagnostics.findings) {
      if (finding.code === 'action.name.convention') {
        continue;
      }
      expect(finding.kind).toBe('heuristic');
    }
  });

  it('traces a modern contract through autowired actions', async () => {
    const { result } = await trace('modern');
    expect(result.diagnostics.status).toBe('passed');
    expect(result.entryPoints.map((entry) => entry.action).sort()).toEqual(['actPass', 'actPlay']);
    expect(result.clientCalls.every((call) => call.style === 'performAction')).toBe(true);

    const broken = await trace('modern-broken');
    expect(broken.result.diagnostics.findings.map((finding) => finding.code)).toContain(
      'action.entry-point.missing',
    );
  });

  it('produces byte-identical results across repeated runs', async () => {
    const first = await trace('legacy-broken');
    const second = await trace('legacy-broken');
    expect(JSON.stringify(first.result)).toBe(JSON.stringify(second.result));
  });
});
