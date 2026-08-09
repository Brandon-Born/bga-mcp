import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProjectModel, type ProjectModel } from '../src/project/model.js';
import { auditDatabaseUsage } from '../src/rules/database.js';
import { validateActionContracts } from '../src/rules/action-contracts.js';
import { validateNotifications } from '../src/rules/notifications.js';
import { validateStateMachine } from '../src/rules/state-machine.js';
import type { DiagnosticResult } from '../src/diagnostics.js';

const projectsRoot = fileURLToPath(new URL('./fixtures/projects/', import.meta.url));
const bannedAssetExtensions = new Set([
  '.gif',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.ogg',
  '.png',
  '.svg',
  '.webp',
]);
const bannedSecretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'][^"']{8,}/iu,
  /AKIA[0-9A-Z]{16}/u,
];

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? await listFiles(path) : [path];
    }),
  );
  return nested.flat().sort();
}

async function hashes(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const file of await listFiles(directory)) {
    const portablePath = relative(directory, file).split(sep).join('/');
    result[portablePath] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  }
  return result;
}

interface FixtureRun {
  readonly model: ProjectModel;
  readonly results: Readonly<Record<string, DiagnosticResult>>;
}

/**
 * Runs the product against a fixture.
 *
 * A fixture that only agrees with its own description proves nothing: the
 * declared model and findings have to be what the readers and rules actually
 * produce from those files, which is what this builds.
 */
async function run(directory: string, paths: readonly string[]): Promise<FixtureRun> {
  const read = async (path: string): Promise<string> =>
    await readFile(resolve(directory, path), 'utf8');
  const files = await Promise.all(
    paths.map(async (path) => ({ path, bytes: (await stat(resolve(directory, path))).size })),
  );

  const model = await buildProjectModel(
    { root: directory, files, truncated: false, skippedLinks: [] },
    { read },
  );
  const php = await Promise.all(
    paths
      .filter((path) => path.endsWith('.php'))
      .map(async (path) => ({ path, text: await read(path) })),
  );
  const client = await Promise.all(
    paths
      .filter((path) => /\.(?:js|ts)$/u.test(path))
      .map(async (path) => ({ path, text: await read(path) })),
  );
  const schema = paths.find((path) => path.endsWith('.sql'));

  return {
    model,
    results: {
      stateMachine: validateStateMachine(model, php),
      actionContracts: validateActionContracts(model, client, php).diagnostics,
      notifications: validateNotifications(php, client).diagnostics,
      database: auditDatabaseUsage(
        schema === undefined ? null : { path: schema, text: await read(schema) },
        php,
      ).diagnostics,
    },
  };
}

describe('BGA project fixture corpus', () => {
  it.each([
    'modern',
    'modern-broken',
    'modern-state-classes',
    'modern-unreadable',
    'legacy',
    'legacy-broken',
    'hybrid',
  ])(
    '[GATE-FIXTURE-SAFETY] %s matches its declared baseline and remains safe and immutable',
    async (fixture) => {
      const layout = fixture.startsWith('legacy')
        ? 'legacy'
        : fixture.startsWith('modern')
          ? 'modern'
          : 'hybrid';
      const directory = resolve(projectsRoot, fixture);
      const before = await hashes(directory);
      const expected = JSON.parse(await readFile(resolve(directory, 'expected.json'), 'utf8')) as {
        layout: string;
        files: string[];
        diagnostics: unknown[];
        stateMachine?: { status: string; codes: string[] };
        actionContracts?: { status: string; codes: string[] };
        notifications?: { status: string; codes: string[] };
        database?: { status: string; codes: string[] };
      };
      const actualFiles = Object.keys(before).filter((file) => file !== 'expected.json');

      expect(expected.layout).toBe(layout);
      expect(actualFiles).toEqual(expected.files);
      // A defective fixture may declare model-level findings. A clean one may
      // declare only informational ones — the hybrid fixture reports that its
      // migration is part-way through, which is a fact about the project rather
      // than a defect. That the finding really is informational is proven by
      // E2E-INSPECT-PROJECT-HYBRID, which reads it through the public schema.
      expect(Array.isArray(expected.diagnostics)).toBe(true);
      if (!fixture.endsWith('-broken')) {
        expect(expected.diagnostics.every((code) => typeof code === 'string')).toBe(true);
      }

      // A fixture that seeds defects must declare exactly which findings it
      // expects, so a rule change cannot silently repurpose it. A clean fixture
      // that declares expectations must declare passing ones. A fixture of
      // deliberately unreadable syntax must declare only what the reader
      // reports about itself: the moment it declares a certain finding, some
      // rule has derived a fact from a machine it could not read.
      const kind = fixture.endsWith('-broken')
        ? 'broken'
        : fixture.endsWith('-unreadable')
          ? 'unreadable'
          : 'clean';
      for (const declared of [
        expected.stateMachine,
        expected.actionContracts,
        expected.notifications,
        expected.database,
      ]) {
        if (declared === undefined) {
          continue;
        }
        if (kind === 'broken') {
          expect(declared.status).toBe('findings');
          expect(declared.codes.length).toBeGreaterThan(0);
        } else if (kind === 'unreadable') {
          expect(declared.status).toBe('unsupported');
          expect(declared.codes.length).toBeGreaterThan(0);
          expect(declared.codes.every((code) => code.endsWith('.unsupported'))).toBe(true);
        } else {
          expect(declared.status).toBe('passed');
          expect(declared.codes).toEqual([]);
        }
      }
      if (kind === 'broken') {
        expect(expected.stateMachine).toBeDefined();
        expect(expected.actionContracts).toBeDefined();
        expect(expected.notifications).toBeDefined();
        expect(expected.database).toBeDefined();
      }
      if (kind === 'unreadable') {
        expect(expected.stateMachine).toBeDefined();
      }

      for (const file of actualFiles) {
        expect(bannedAssetExtensions.has(extname(file).toLowerCase())).toBe(false);
        const content = await readFile(resolve(directory, file), 'utf8');
        for (const pattern of bannedSecretPatterns) {
          expect(content).not.toMatch(pattern);
        }
      }

      // The declaration is checked against the product, not against itself: the
      // readers and rules run over these files, and every block the fixture
      // declares must be what they produced.
      const { model, results } = await run(directory, actualFiles);
      expect(model.layout, `${fixture} layout`).toBe(expected.layout);
      expect(
        model.diagnostics.findings.map((finding) => finding.code),
        `${fixture} model diagnostics`,
      ).toEqual(expected.diagnostics);

      for (const [group, declared] of Object.entries({
        stateMachine: expected.stateMachine,
        actionContracts: expected.actionContracts,
        notifications: expected.notifications,
        database: expected.database,
      })) {
        if (declared === undefined) {
          continue;
        }
        const result = results[group];
        expect(result?.status, `${fixture} ${group} status`).toBe(declared.status);
        expect(
          result?.findings.map((finding) => finding.code),
          `${fixture} ${group} findings`,
        ).toEqual(declared.codes);
      }

      expect(await hashes(directory)).toEqual(before);
    },
  );
});
