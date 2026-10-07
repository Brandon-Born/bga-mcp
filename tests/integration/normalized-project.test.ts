import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import { createPolicyBoundary } from '../../src/policy.js';
import { loadProjectContext, normalizedProject } from '../../src/tools/project-context.js';
import { validateActionContracts } from '../../src/rules/action-contracts.js';
import { validateNotifications } from '../../src/rules/notifications.js';
import { auditDatabaseUsage } from '../../src/rules/database.js';
import { createValidatorRunners } from '../../src/rules/validators.js';
import { ERROR_CODES } from '../../src/errors.js';

describe('complete internal normalization', () => {
  it('[INT-NORMALIZED-PROJECT] preserves source limits and isolates a real schema read failure to its validator group', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bga-normalized-limit-'));
    try {
      await cp(resolve(import.meta.dirname, '../fixtures/projects/modern'), root, {
        recursive: true,
      });
      await writeFile(resolve(root, 'modules/js/Oversized.js'), 'x'.repeat(262_145));
      await writeFile(resolve(root, 'dbmodel.sql'), 'x'.repeat(1_048_577));
      const policy = await createPolicyBoundary({ projectRoots: [root] });
      const read = vi.spyOn(policy, 'readProjectFile');
      const context = await loadProjectContext(policy, root, {
        withPhpSources: true,
        withClientSources: true,
      });
      const normalized = normalizedProject(context);
      if (normalized === undefined) throw new Error('Shared normalized model missing.');
      expect(read.mock.calls.some(([, path]) => path === 'modules/js/Oversized.js')).toBe(false);
      expect(
        normalized.sections.actions?.unknowns.some(
          (entry) => entry.source === 'modules/js/Oversized.js',
        ),
      ).toBe(true);
      expect(normalized.sections.database?.unknowns).toContainEqual({
        source: 'dbmodel.sql',
        reason: 'Schema file could not be read.',
      });
      const runners = createValidatorRunners(policy, root, context);
      await expect(runners.find((runner) => runner.id === 'database')?.run()).rejects.toMatchObject(
        { code: ERROR_CODES.policyOutputTooLarge },
      );
      expect(await runners.find((runner) => runner.id === 'action-contracts')?.run()).toBe(
        normalized.actions.diagnostics,
      );
      const aborted = new AbortController();
      aborted.abort();
      await expect(loadProjectContext(policy, root, { signal: aborted.signal })).rejects.toThrow();
    } finally {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });
  it('[INT-NORMALIZED-PROJECT] retains located facts, explicit unknowns and shared validation traces without extending the public model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bga-normalized-'));
    try {
      await cp(resolve(import.meta.dirname, '../fixtures/projects/modern'), root, {
        recursive: true,
      });
      await writeFile(
        resolve(root, 'gameoptions.json'),
        '{"100":{"name":"Mode","values":{"1":{"name":"Base"}},"default":1}}',
      );
      await writeFile(
        resolve(root, 'gamepreferences.json'),
        '{"100":{"name":"Contrast","values":{"1":{"name":"Standard"}}}}',
      );
      await writeFile(
        resolve(root, 'stats.jsonc'),
        '// Original synthetic configuration\n{"table":{"turns":{"id":10,"name":"Turns","type":"int"}},"player":{"turns":{"id":10,"name":"Turns","type":"int"}},}',
      );
      await mkdir(resolve(root, 'tests'));
      await writeFile(
        resolve(root, 'tests/game.test.php'),
        '<?php throw new Exception("never execute test files");',
      );
      await writeFile(resolve(root, 'original.tpl'), '<div>{BOARD}</div>');
      await writeFile(resolve(root, 'original.css'), '#board { color: navy; }');
      const policy = await createPolicyBoundary({ projectRoots: [root] });
      const context = await loadProjectContext(policy, root, {
        withPhpSources: true,
        withClientSources: true,
      });
      const normalized = normalizedProject(context);
      if (normalized === undefined) throw new Error('Shared normalized model missing.');
      expect(Object.keys(normalized.sections).sort()).toEqual([
        'actions',
        'database',
        'metadata',
        'methods',
        'modules',
        'notifications',
        'options',
        'preferences',
        'states',
        'statistics',
        'styles',
        'templates',
        'tests',
        'transitions',
      ]);
      expect(normalized.sections.options?.facts).toEqual([
        {
          key: '100',
          source: 'gameoptions.json',
          sources: ['gameoptions.json'],
          certainty: 'certain',
          value: { name: 'Mode', values: { 1: { name: 'Base' } }, default: 1 },
        },
      ]);
      expect(
        normalized.sections.statistics?.facts.map((entry) => [
          entry.key,
          entry.source,
          entry.certainty,
        ]),
      ).toEqual([
        ['table.turns', 'stats.jsonc', 'certain'],
        ['player.turns', 'stats.jsonc', 'certain'],
      ]);
      expect(normalized.sections.tests?.facts[0]).toMatchObject({
        key: 'tests/game.test.php',
        certainty: 'possible',
      });
      for (const id of ['tests', 'templates', 'styles', 'modules'])
        expect(normalized.sections[id]?.unknowns.length).toBeGreaterThan(0);
      expect(normalized.actions).toEqual(
        validateActionContracts(context.model, context.clientSources, context.phpSources),
      );
      expect(normalized.notifications).toEqual(
        validateNotifications(context.phpSources, context.clientSources),
      );
      expect(normalized.database.audit).toEqual(
        auditDatabaseUsage(normalized.database.source, context.phpSources),
      );
      const runners = createValidatorRunners(policy, root, context);
      expect(await runners.find((runner) => runner.id === 'action-contracts')?.run()).toBe(
        normalized.actions.diagnostics,
      );
      expect(Object.keys(context.model)).not.toContain('normalized');
      expect(
        context.model.detection.signals.find((entry) => entry.id === 'normalized.statistics'),
      ).toMatchObject({ matched: true, files: ['stats.jsonc'] });
      expect(context.phpSources.some((source) => source.path === 'tests/game.test.php')).toBe(
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('[INT-NORMALIZED-PROJECT] retains malformed, legacy and omitted source as unknown rather than claiming empty complete coverage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bga-normalized-unknown-'));
    try {
      await cp(resolve(import.meta.dirname, '../fixtures/projects/legacy'), root, {
        recursive: true,
      });
      await writeFile(resolve(root, 'stats.json'), '[false]');
      await writeFile(resolve(root, 'gameoptions.jsonc'), '{"100":');
      const policy = await createPolicyBoundary({ projectRoots: [root] });
      const context = await loadProjectContext(policy, root);
      const normalized = normalizedProject(context);
      if (normalized === undefined) throw new Error('Shared normalized model missing.');
      expect(normalized.sections.options?.facts).toEqual([]);
      expect(normalized.sections.options?.unknowns.map((entry) => entry.source)).toEqual([
        'gameoptions.inc.php',
        'gameoptions.jsonc',
      ]);
      expect(normalized.sections.statistics?.unknowns).toContainEqual({
        source: 'stats.json',
        reason: 'Configuration is not an object.',
      });
      expect(normalized.sections.methods?.unknowns).toContainEqual({
        source: null,
        reason: 'No PHP contract source was read; absence of methods is unknown.',
      });
      expect(normalized.sections.actions?.unknowns.length).toBeGreaterThan(0);
      expect(normalized.sections.notifications?.unknowns.length).toBeGreaterThan(0);
      expect(normalizedProject({ ...context })).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
