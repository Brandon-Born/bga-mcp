import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPolicyBoundary } from '../../src/policy.js';
import { validateStateMachine } from '../../src/rules/state-machine.js';
import { loadProjectContext } from '../../src/tools/project-context.js';

const projectsRoot = fileURLToPath(new URL('../fixtures/projects/', import.meta.url));

interface ExpectedFixture {
  readonly stateMachine?: {
    readonly status: string;
    readonly summary: Record<string, number>;
    readonly codes: string[];
  };
}

async function validate(fixture: string) {
  const root = resolve(projectsRoot, fixture);
  const policy = await createPolicyBoundary({ projectRoots: [root] });
  const context = await loadProjectContext(policy, root, { withPhpSources: true });
  return {
    result: validateStateMachine(context.model, context.phpSources),
    context,
    expected: JSON.parse(await readFile(resolve(root, 'expected.json'), 'utf8')) as ExpectedFixture,
  };
}

describe('state-machine validation against the fixture corpus', () => {
  it('passes the valid legacy fixture with no findings at all', async () => {
    const { result, context } = await validate('legacy');
    expect(context.model.states.definitions).toHaveLength(3);
    expect(context.phpSources.length).toBeGreaterThan(0);
    expect(result).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
  });

  it('finds exactly the defects the broken fixture declares', async () => {
    const { result, expected } = await validate('legacy-broken');
    const declared = expected.stateMachine;
    if (declared === undefined) {
      throw new Error('The broken fixture must declare its expected state-machine findings');
    }

    expect(result.status).toBe(declared.status);
    expect(result.summary).toEqual(declared.summary);
    expect(result.findings.map((finding) => finding.code)).toEqual(declared.codes);

    // The certain findings must be facts, and the handler findings must not be.
    const byKind = Object.fromEntries(
      result.findings.map((finding) => [finding.code, finding.kind]),
    );
    expect(byKind['state.transition.target-exists']).toBe('issue');
    expect(byKind['state.unreachable']).toBe('issue');
    expect(byKind['state.action.handler-missing']).toBe('heuristic');
    expect(byKind['state.args.handler-missing']).toBe('heuristic');

    const target = result.findings.find(
      (finding) => finding.code === 'state.transition.target-exists',
    );
    expect(target?.message).toContain('undefined state 42');
    expect(target?.locations[0]?.uri).toBe('states.inc.php');
    expect(target?.suggestions[0]?.message).toContain('42');
  });

  it('reads modern state classes and reports what it cannot interpret', async () => {
    const clean = await validate('modern');
    expect(clean.result.status).toBe('passed');

    const broken = await validate('modern-broken');
    const codes = broken.result.findings.map((finding) => finding.code);
    expect(codes).toContain('state.transition.target-exists');
    expect(codes).toContain('project.states.unsupported');
    const unreadable = broken.result.findings.find(
      (finding) => finding.kind === 'unsupported-syntax',
    );
    expect(unreadable?.message).toContain('non-literal id');
  });

  it('produces byte-identical results across repeated runs', async () => {
    const first = await validate('legacy-broken');
    const second = await validate('legacy-broken');
    expect(JSON.stringify(first.result)).toBe(JSON.stringify(second.result));
  });
});
