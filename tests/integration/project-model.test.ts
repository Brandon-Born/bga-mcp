import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPolicyBoundary, type PolicyBoundary } from '../../src/policy.js';
import { buildProjectModel, type ProjectModel } from '../../src/project/model.js';

const fixturesRoot = fileURLToPath(new URL('../fixtures/projects/', import.meta.url));
const modernRoot = resolve(fixturesRoot, 'modern');
const legacyRoot = resolve(fixturesRoot, 'legacy');
const hybridRoot = resolve(fixturesRoot, 'hybrid');

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

  it('describes the hybrid fixture, reading each component in the form it is in', async () => {
    const policy = await createPolicyBoundary({ projectRoots: [hybridRoot] });
    const result = await model(policy, hybridRoot);

    expect(result).toMatchObject({
      layout: 'hybrid',
      gameKey: 'bgamcphybrid',
      metadata: {
        gameName: 'BgaMcpHybridFixture',
        playerCounts: [2, 3],
        // The metadata generation decides this, not the modern game logic.
        source: 'gameinfos.inc.php',
      },
    });

    // The machine is split across both sources, and both are authoritative
    // until the last class exists, so it is read as one machine.
    expect(result.states.sources).toEqual(['states.inc.php', 'modules/php/States/PlayerTurn.php']);
    expect(result.states.definitions.map((state) => [state.id, state.name])).toEqual([
      [1, 'gameSetup'],
      [2, 'PlayerTurn'],
      [99, 'gameEnd'],
    ]);
    // A transition crossing the two sources in each direction resolves.
    expect(result.states.definitions[0]?.transitions).toEqual({ '': 2 });
    expect(result.states.definitions[1]?.transitions).toEqual({ pass: 99 });

    // Nothing is missing: an autowired project needs no <game>.action.php, and
    // a modern game class needs no <game>.view.php.
    expect(
      result.components.filter((component) => component.expected && !component.present),
    ).toEqual([]);
    expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual([
      'project.states.partially-migrated',
    ]);
    expect(result.diagnostics.summary).toMatchObject({ errors: 0, warnings: 0, information: 1 });
  });

  it('prefers the class when a state is declared in both forms', async () => {
    const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-merge-')));
    try {
      await writeFile(
        resolve(temporaryRoot, 'gameinfos.inc.php'),
        "<?php\n$gameinfos = ['game_name' => 'Merge', 'players' => [2]];\n",
      );
      // The state is migrated but not yet removed from states.inc.php, which the
      // migration guide describes as the interim state of a real project.
      await writeFile(
        resolve(temporaryRoot, 'states.inc.php'),
        "<?php\n$machinestates = [\n  2 => ['name' => 'stale', 'type' => 'game', 'transitions' => ['done' => 99]],\n  99 => ['name' => 'gameEnd', 'type' => 'manager'],\n];\n",
      );
      await mkdir(resolve(temporaryRoot, 'modules/php/States'), { recursive: true });
      await writeFile(
        resolve(temporaryRoot, 'modules/php/Game.php'),
        '<?php\nfinal class Game extends \\Bga\\GameFramework\\Table {}\n',
      );
      await writeFile(
        resolve(temporaryRoot, 'modules/php/States/PlayerTurn.php'),
        "<?php\nfinal class PlayerTurn extends GameState\n{\n    public function __construct(protected Game $game)\n    {\n        parent::__construct($game, id: 2, type: StateType::ACTIVE_PLAYER, description: '', transitions: ['pass' => 99]);\n    }\n}\n",
      );

      const policy = await createPolicyBoundary({ projectRoots: [temporaryRoot] });
      const result = await model(policy, temporaryRoot);

      expect(result.layout).toBe('hybrid');
      expect(result.states.definitions.map((state) => state.id)).toEqual([2, 99]);
      // The class is what the framework runs, so it wins over the stale entry.
      expect(result.states.definitions[0]).toMatchObject({
        id: 2,
        name: 'PlayerTurn',
        type: 'activeplayer',
        transitions: { pass: 99 },
      });
      const migrated = result.diagnostics.findings.find(
        (finding) => finding.code === 'project.states.partially-migrated',
      );
      expect(migrated?.evidence[0]?.message).toContain('1 state(s) declared in both forms');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
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
