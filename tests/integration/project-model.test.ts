import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPolicyBoundary, type PolicyBoundary } from '../../src/policy.js';
import { buildProjectModel, type ProjectModel } from '../../src/project/model.js';

const fixturesRoot = fileURLToPath(new URL('../fixtures/projects/', import.meta.url));
const modernRoot = resolve(fixturesRoot, 'modern');
const legacyRoot = resolve(fixturesRoot, 'legacy');

async function model(policy: PolicyBoundary, root: string): Promise<ProjectModel> {
  const listing = await policy.listProjectFiles(root);
  return await buildProjectModel(listing, {
    read: async (relativePath) => await policy.readProjectFile(root, relativePath),
  });
}

describe('normalized project model', () => {
  it('describes the modern fixture, including its state classes', async () => {
    const policy = await createPolicyBoundary({ projectRoots: [modernRoot] });
    const result = await model(policy, modernRoot);

    expect(result).toMatchObject({
      schemaVersion: 1,
      layout: 'modern',
      gameKey: 'modern',
      metadata: {
        gameName: 'BgaMcpModernFixture',
        playerCounts: [2],
        source: 'gameinfos.jsonc',
      },
      truncated: false,
      skippedLinks: [],
    });

    // State classes are read into the same shape the legacy declaration gives.
    expect(result.states.parsed).toBe(true);
    expect(result.states.definitions.map((state) => state.name)).toEqual([
      'GameSetup',
      'PlayerTurn',
      'GameEnd',
    ]);
    expect(result.states.definitions[1]).toMatchObject({
      id: 2,
      type: 'activeplayer',
      args: 'getArgs',
      transitions: { play: 2, pass: 99 },
    });
    expect(result.diagnostics.status).toBe('passed');
  });

  it('describes the legacy fixture including its state machine', async () => {
    const policy = await createPolicyBoundary({ projectRoots: [legacyRoot] });
    const result = await model(policy, legacyRoot);

    expect(result).toMatchObject({
      layout: 'legacy',
      gameKey: 'bgamcplegacy',
      metadata: {
        gameName: 'BgaMcpLegacyFixture',
        playerCounts: [2],
        source: 'gameinfos.inc.php',
      },
    });

    expect(result.states.parsed).toBe(true);
    expect(result.states.definitions.map((state) => state.name)).toEqual([
      'gameSetup',
      'playerTurn',
      'gameEnd',
    ]);
    expect(result.states.definitions[1]).toMatchObject({
      id: 2,
      type: 'activeplayer',
      possibleActions: ['actPass'],
      transitions: { pass: 99 },
    });
    expect(result.diagnostics.status).toBe('passed');
  });

  it('reports an unrecognized project as an error rather than a clean result', async () => {
    const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-model-')));
    try {
      await writeFile(resolve(temporaryRoot, 'README.md'), '# not a BGA project\n');
      await mkdir(resolve(temporaryRoot, 'src'));
      await writeFile(resolve(temporaryRoot, 'src/main.rs'), 'fn main() {}\n');

      const policy = await createPolicyBoundary({ projectRoots: [temporaryRoot] });
      const result = await model(policy, temporaryRoot);

      expect(result.layout).toBe('unrecognized');
      expect(result.diagnostics.status).toBe('findings');
      expect(result.diagnostics.findings[0]).toMatchObject({
        code: 'project.layout.unrecognized',
        severity: 'error',
      });
      expect(result.metadata.gameName).toBeNull();
      expect(result.states.parsed).toBe(false);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('reports missing components and unreadable metadata for a partial project', async () => {
    const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-partial-')));
    try {
      await writeFile(
        resolve(temporaryRoot, 'gameinfos.inc.php'),
        '<?php\n$gameinfos = $shared;\n',
      );
      await writeFile(resolve(temporaryRoot, 'partialgame.game.php'), '<?php\nclass X {}\n');

      const policy = await createPolicyBoundary({ projectRoots: [temporaryRoot] });
      const result = await model(policy, temporaryRoot);

      expect(result.layout).toBe('legacy');
      const codes = result.diagnostics.findings.map((finding) => finding.code);
      expect(codes).toContain('project.component.missing');
      expect(codes).toContain('project.states.missing');
      expect(codes).toContain('project.metadata.unsupported');
      expect(result.diagnostics.summary.errors).toBe(0);
      expect(result.diagnostics.summary.warnings).toBeGreaterThan(0);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('never follows a link out of the project root', async () => {
    const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-link-')));
    try {
      const projectRoot = resolve(temporaryRoot, 'project');
      const outside = resolve(temporaryRoot, 'outside');
      await mkdir(projectRoot);
      await mkdir(outside);
      await writeFile(resolve(outside, 'id_ed25519'), 'seeded-key-material\n');
      await writeFile(
        resolve(projectRoot, 'gameinfos.inc.php'),
        "<?php\n$gameinfos = ['game_name' => 'Linked'];\n",
      );
      await writeFile(resolve(projectRoot, 'linked.game.php'), '<?php\nclass X {}\n');
      const { symlink } = await import('node:fs/promises');
      await symlink(
        outside,
        resolve(projectRoot, 'escape'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const policy = await createPolicyBoundary({ projectRoots: [projectRoot] });
      const result = await model(policy, projectRoot);

      expect(result.skippedLinks).toEqual(['escape']);
      expect(JSON.stringify(result)).not.toContain('id_ed25519');
      expect(JSON.stringify(result)).not.toContain('seeded-key-material');
      expect(result.diagnostics.findings.map((finding) => finding.code)).toContain(
        'project.listing.link-skipped',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('stops at the configured listing budget and says so', async () => {
    const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-budget-')));
    try {
      for (let index = 0; index < 12; index += 1) {
        await writeFile(resolve(temporaryRoot, `file-${String(index)}.php`), '<?php\n');
      }
      const policy = await createPolicyBoundary({ projectRoots: [temporaryRoot] });
      const listing = await policy.listProjectFiles(temporaryRoot, { maxEntries: 5 });
      expect(listing.files).toHaveLength(5);
      expect(listing.truncated).toBe(true);

      const result = await buildProjectModel(listing, {
        read: async (path) => await policy.readProjectFile(temporaryRoot, path),
      });
      expect(result.diagnostics.findings.map((finding) => finding.code)).toContain(
        'project.listing.truncated',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
