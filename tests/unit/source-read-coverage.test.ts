import { resolve } from 'node:path';

import { DEFAULT_POLICY_CONFIG, PolicyBoundary } from '../../src/policy.js';
import type { ProjectModel } from '../../src/project/model.js';
import { validateActionContracts } from '../../src/rules/action-contracts.js';
import { validateStateMachine } from '../../src/rules/state-machine.js';
import { summarizeFindings, unsupportedSyntaxFinding } from '../../src/rules/uncertainty.js';
import { loadProjectContext } from '../../src/tools/project-context.js';

const root = resolve(import.meta.dirname, '../fixtures/projects/modern');
const limitCode = 'project.source.read-limit';

async function context(
  sources: readonly { path: string; text: string }[],
  options: { withPhpSources?: boolean; withClientSources?: boolean; signal?: AbortSignal } = {
    withPhpSources: true,
    withClientSources: true,
  },
) {
  const policy = await PolicyBoundary.create({ ...DEFAULT_POLICY_CONFIG, projectRoots: [root] });
  const listing = await policy.listProjectFiles(root);
  // A controlled inventory isolates the contract-source budget from metadata
  // and state parsing. Policy still reads the fixture metadata normally.
  vi.spyOn(policy, 'listProjectFiles').mockResolvedValue({
    ...listing,
    files: [
      ...listing.files.filter((file) => !/\.(?:php|js|ts)$/u.test(file.path)),
      ...sources.map((source) => ({ path: source.path, bytes: Buffer.byteLength(source.text) })),
    ],
  });
  const read = policy.readProjectFile.bind(policy);
  const reads = vi
    .spyOn(policy, 'readProjectFile')
    .mockImplementation(async (base, path, input) => {
      const source = sources.find((entry) => entry.path === path);
      return source?.text ?? (await read(base, path, input));
    });
  const project = await loadProjectContext(policy, root, options);
  return {
    project,
    reads,
    limits: project.model.diagnostics.findings.filter((f) => f.code === limitCode),
  };
}

it('does not read an oversized module and still reads a later module that fits', async () => {
  const result = await context([
    { path: 'modules/control/large.php', text: ' '.repeat(262_145) },
    { path: 'modules/control/small.php', text: '<?php class Small {}' },
  ]);
  expect(result.project.phpSources.map((s) => s.path)).toEqual(['modules/control/small.php']);
  expect(result.reads.mock.calls.map((call) => call[1])).not.toContain('modules/control/large.php');
  expect(result.limits).toMatchObject([
    {
      locations: [{ uri: 'modules/control/large.php' }],
      syntax: { language: 'php' },
    },
  ]);
  expect(result.limits[0]?.message).toContain('262144-byte');
});

it('accepts the exact byte boundary and records every later eligible omission', async () => {
  const result = await context([
    { path: 'modules/control/exact.php', text: ' '.repeat(262_144) },
    { path: 'modules/control/after.php', text: '<?php' },
    { path: 'modules/control/after.js', text: 'let a;' },
  ]);
  expect(result.project.phpSources).toHaveLength(1);
  expect(result.project.clientSources).toHaveLength(0);
  expect(result.limits.flatMap((f) => f.locations)).toEqual([
    { uri: 'modules/control/after.js' },
    { uri: 'modules/control/after.php' },
  ]);
});

it('shares the byte budget across PHP and client sources and uses UTF-8 bytes', async () => {
  const result = await context([
    { path: 'modules/control/first.js', text: 'é'.repeat(131_071) },
    { path: 'modules/control/second.php', text: '<?php' },
    { path: 'modules/control/tail.js', text: 'ab' },
  ]);
  expect(result.project.clientSources.map((s) => s.path)).toEqual([
    'modules/control/first.js',
    'modules/control/tail.js',
  ]);
  expect(result.project.phpSources).toHaveLength(0);
  expect(result.limits[0]?.locations).toEqual([{ uri: 'modules/control/second.php' }]);
});

it('accepts exactly 200 sources, counts empty files, and reports all remaining file-limit omissions', async () => {
  const sources = Array.from({ length: 203 }, (_, i) => ({
    path: `modules/control/${String(i)}.php`,
    text: '',
  }));
  const result = await context(sources);
  expect(result.project.phpSources).toHaveLength(200);
  expect(result.limits[0]?.message).toContain('200 source-file limit');
  expect(result.limits[0]?.locations).toEqual(sources.slice(200).map((s) => ({ uri: s.path })));
  expect(
    result.reads.mock.calls.filter((call) => call[1].startsWith('modules/control/')),
  ).toHaveLength(200);
});

it('does not charge excluded helpers, unknown-scope files or an unrequested language', async () => {
  const result = await context(
    [
      { path: '_ide_helper.php', text: ' '.repeat(262_145) },
      { path: 'modules/control/types.d.ts', text: ' '.repeat(262_145) },
      { path: 'local.php', text: ' '.repeat(262_145) },
      { path: 'modules/control/client.js', text: ' '.repeat(262_145) },
      { path: 'modules/control/small.php', text: '<?php' },
    ],
    { withPhpSources: true },
  );
  expect(result.limits).toEqual([]);
  expect(result.project.phpSources.map((s) => s.path)).toEqual(['modules/control/small.php']);
  expect(
    result.project.model.diagnostics.findings.some(
      (f) => f.code === 'project.source.unsupported-syntax',
    ),
  ).toBe(true);
});

it('does not invent source-read limits when only the structural model was requested', async () => {
  const result = await context(
    [{ path: 'modules/control/large.php', text: ' '.repeat(262_145) }],
    {},
  );
  expect(result.limits).toEqual([]);
  expect(result.project.phpSources).toEqual([]);
});

it('retains separate byte and file limits when both occur in one deterministic pass', async () => {
  const sources = [
    { path: 'modules/control/large.php', text: ' '.repeat(262_145) },
    ...Array.from({ length: 201 }, (_, i) => ({
      path: `modules/control/${String(i)}.php`,
      text: '<?php',
    })),
  ];
  const first = await context(sources);
  const second = await context(sources);
  expect(first.limits).toEqual(second.limits);
  expect(first.limits).toHaveLength(2);
  expect(first.limits.flatMap((f) => f.locations)).toEqual([
    { uri: sources[201]?.path },
    { uri: sources[0]?.path },
  ]);
});

it('does not convert an aborted load into an ordinary partial-coverage result', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    context([{ path: 'modules/control/large.php', text: ' '.repeat(262_145) }], {
      withPhpSources: true,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
});

function limited(model: ProjectModel, language: string): ProjectModel {
  return {
    ...model,
    diagnostics: summarizeFindings([
      ...model.diagnostics.findings,
      unsupportedSyntaxFinding({
        code: limitCode,
        construct: 'omitted eligible source',
        language,
        uri: 'modules/control/omitted.php',
      }),
    ]),
  };
}

async function legacy() {
  const path = resolve(import.meta.dirname, '../fixtures/projects/legacy');
  const policy = await PolicyBoundary.create({ ...DEFAULT_POLICY_CONFIG, projectRoots: [path] });
  return await loadProjectContext(policy, path, { withPhpSources: true, withClientSources: true });
}

it('withholds missing PHP handlers while retaining independent state-graph defects', async () => {
  const project = await legacy();
  const model = {
    ...project.model,
    states: {
      ...project.model.states,
      definitions: project.model.states.definitions.map((state) => ({
        ...state,
        transitions: { ...state.transitions, control: 123456 },
      })),
    },
  };
  const sources = [
    { path: 'bgamcplegacy.game.php', text: '<?php class Game { function unrelated() {} }' },
  ];
  const baseline = validateStateMachine(model, sources);
  expect(baseline.findings.some((f) => f.code.endsWith('handler-missing'))).toBe(true);
  const partial = validateStateMachine(limited(model, 'php'), sources);
  expect(partial.findings.some((f) => f.code.endsWith('handler-missing'))).toBe(false);
  expect(partial.findings.some((f) => f.code === 'state.transition.target-exists')).toBe(true);
  expect(partial.findings.some((f) => f.code === limitCode)).toBe(true);
});

it('withholds missing legacy game methods on omitted PHP without losing the readable trace', async () => {
  const project = await legacy();
  const sources = project.phpSources.map((source) =>
    source.path.endsWith('.game.php')
      ? { ...source, text: '<?php class Game { function unrelated() {} }' }
      : source,
  );
  const baseline = validateActionContracts(project.model, project.clientSources, sources);
  expect(baseline.diagnostics.findings.some((f) => f.code === 'action.game-method.missing')).toBe(
    true,
  );
  const partial = validateActionContracts(
    limited(project.model, 'php'),
    project.clientSources,
    sources,
  );
  expect(partial.diagnostics.findings.some((f) => f.code === 'action.game-method.missing')).toBe(
    false,
  );
  expect(partial.entryPoints).toEqual(baseline.entryPoints);
  expect(partial.clientCalls).toEqual(baseline.clientCalls);
});

it('withholds uncalled actions only when client coverage is incomplete', async () => {
  const project = await legacy();
  const clients = [{ path: 'bgamcplegacy.js', text: 'const other = true;' }];
  const baseline = validateActionContracts(project.model, clients, project.phpSources);
  expect(baseline.diagnostics.findings.some((f) => f.code === 'action.declared.not-called')).toBe(
    true,
  );
  const partial = validateActionContracts(
    limited(project.model, 'client'),
    clients,
    project.phpSources,
  );
  expect(partial.diagnostics.findings.some((f) => f.code === 'action.declared.not-called')).toBe(
    false,
  );
  const phpOnly = validateActionContracts(
    limited(project.model, 'php'),
    clients,
    project.phpSources,
  );
  expect(phpOnly.diagnostics.findings.some((f) => f.code === 'action.declared.not-called')).toBe(
    true,
  );
});
