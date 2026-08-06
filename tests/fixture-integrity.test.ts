import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('BGA project fixture corpus', () => {
  it.each(['modern', 'legacy', 'legacy-broken'])(
    '[GATE-FIXTURE-SAFETY] %s matches its declared baseline and remains safe and immutable',
    async (layout) => {
      const directory = resolve(projectsRoot, layout);
      const before = await hashes(directory);
      const expected = JSON.parse(await readFile(resolve(directory, 'expected.json'), 'utf8')) as {
        layout: string;
        files: string[];
        diagnostics: unknown[];
        stateMachine?: { status: string; codes: string[] };
      };
      const actualFiles = Object.keys(before).filter((file) => file !== 'expected.json');

      expect(expected.layout).toBe(layout.startsWith('legacy') ? 'legacy' : layout);
      expect(actualFiles).toEqual(expected.files);
      expect(expected.diagnostics).toEqual([]);

      // A fixture that seeds defects must declare exactly which findings it expects,
      // so a rule change cannot silently repurpose it.
      if (layout.endsWith('-broken')) {
        expect(expected.stateMachine?.codes.length).toBeGreaterThan(0);
        expect(expected.stateMachine?.status).toBe('findings');
      } else {
        expect(expected.stateMachine).toBeUndefined();
      }

      for (const file of actualFiles) {
        expect(bannedAssetExtensions.has(extname(file).toLowerCase())).toBe(false);
        const content = await readFile(resolve(directory, file), 'utf8');
        for (const pattern of bannedSecretPatterns) {
          expect(content).not.toMatch(pattern);
        }
      }

      expect(await hashes(directory)).toEqual(before);
    },
  );
});
