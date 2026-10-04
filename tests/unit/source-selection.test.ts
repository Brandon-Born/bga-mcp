import { buildProjectModel } from '../../src/project/model.js';
import { InspectProjectOutputSchema, summarize } from '../../src/tools/inspect-project.js';
import type { ProjectListing } from '../../src/policy.js';

async function model(paths: string[], partial: Partial<ProjectListing> = {}) {
  const read = vi.fn(() => Promise.resolve('{}'));
  const listing: ProjectListing = {
    root: '/game/demo',
    files: paths.map((path) => ({ path, bytes: 2 })),
    skippedLinks: [],
    unreadablePaths: [],
    truncated: false,
    ...partial,
  };
  return { project: await buildProjectModel(listing, { read }), read };
}

it('partitions every inventoried path once without guessing execution from names or ignore rules', async () => {
  const paths = [
    'demo.game.php',
    'demo.action.php',
    'demo.view.php',
    'demo.js',
    'gameinfos.inc.php',
    'material.inc.php',
    'gameoptions.inc.php',
    'stats.inc.php',
    'modules/tests/Backup.php',
    'modules/odd/_ide_helper.php',
    'modules/lib/client.ts',
    '_ide_helper.php',
    'modules/lib/types.d.ts',
    'bga-framework.d.ts',
    'tests/example.php',
    'misc/generator.js',
    'src-disabled/Game.ts',
    'private/modules/php/Game.php',
    'gameinfos.jsonc',
    'gameoptions.json',
    'gamepreferences.jsonc',
    'stats.jsonc',
    'dbmodel.sql',
    'other.sql',
    '.gitignore',
    'package.json',
    'demo.css',
    'demo_demo.tpl',
  ];
  const { project, read } = await model(paths);
  const groups = project.detection.signals.filter((entry) => entry.id.startsWith('source.'));
  const selected = (id: string) => groups.find((entry) => entry.id === id)?.files;
  expect(groups.flatMap((entry) => entry.files).sort()).toEqual([...paths].sort());
  expect(selected('source.selected.php')).toEqual(paths.slice(0, 3).concat(paths.slice(4, 10)));
  expect(selected('source.selected.client')).toEqual(['demo.js', 'modules/lib/client.ts']);
  expect(selected('source.excluded.editor')).toEqual(paths.slice(11, 14));
  expect(selected('source.unknown')).toEqual(paths.slice(14, 18));
  expect(selected('source.selected.configuration')).toEqual(paths.slice(18, 23));
  expect(selected('source.inventory.other')).toEqual(paths.slice(23));
  expect(groups.every((entry) => entry.matched === entry.files.length > 0)).toBe(true);
  expect(read.mock.calls).toHaveLength(1); // Metadata only; no unknown/editor/tool bodies.
  expect(project.diagnostics.status).not.toBe('passed');
  expect(
    project.diagnostics.findings.some(
      (finding) => finding.code === 'project.source.unsupported-syntax',
    ),
  ).toBe(true);
});

it('keeps the complete selection beyond component and layout display caps', async () => {
  const paths = Array.from({ length: 205 }, (_, i) => `modules/lib/source-${String(i)}.php`);
  const { project } = await model(paths);
  expect(
    project.detection.signals.find((entry) => entry.id === 'source.selected.php')?.files,
  ).toEqual(paths);
  expect(summarize(InspectProjectOutputSchema.parse(project))).toContain(
    '199 more in detection.signals',
  );
  expect(summarize(InspectProjectOutputSchema.parse(project))).toContain(
    'Eligible files are candidates',
  );
});

it.each([{ truncated: true }, { skippedLinks: ['linked'] }, { unreadablePaths: ['closed'] }])(
  'keeps incomplete listing visible beside eligible files: %j',
  async (partial) => {
    const { project } = await model(['modules/lib/runtime.php'], partial);
    expect(summarize(InspectProjectOutputSchema.parse(project))).toContain(
      'partial (see listing findings)',
    );
    expect(summarize(InspectProjectOutputSchema.parse(project))).not.toContain('listing completed');
  },
);

it('checks cancellation before selecting sources', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    buildProjectModel(
      { root: '/game', files: [], skippedLinks: [], unreadablePaths: [], truncated: false },
      { read: () => Promise.resolve('') },
      { signal: controller.signal },
    ),
  ).rejects.toThrow();
});
