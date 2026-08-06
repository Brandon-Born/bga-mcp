import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPPORTED_PROTOCOL_VERSIONS } from '../../src/metadata.js';
import { listFiles } from '../../scripts/lib/scenarios.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Modules that reach the filesystem, the network, or a subprocess. */
const PRIVILEGED_IMPORTS = [
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'node:http',
  'node:https',
  'node:net',
  'node:dgram',
  'node:tls',
];

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

describe('repository safety gates', () => {
  it('[GATE-POLICY-IMPORT-BOUNDARY] keeps privileged access inside the policy boundary', async () => {
    const sources = await listFiles(resolve(repositoryRoot, 'src'));
    const offenders: string[] = [];

    for (const file of sources) {
      if (file.endsWith('policy.ts')) {
        continue;
      }
      const source = await readFile(file, 'utf8');
      for (const module of PRIVILEGED_IMPORTS) {
        if (new RegExp(`from '${module}'`, 'u').test(source)) {
          offenders.push(`${file}: ${module}`);
        }
      }
    }

    expect(offenders).toEqual([]);
    expect(sources.some((file) => file.endsWith('policy.ts'))).toBe(true);
    expect(await readFile(resolve(repositoryRoot, 'src/policy.ts'), 'utf8')).toContain(
      "from 'node:fs/promises'",
    );
  });

  it('[GATE-DEPENDENCY-PINNING] pins every dependency and package manager exactly', async () => {
    const packageMetadata = await loadJson<{
      packageManager: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>('package.json');

    expect(packageMetadata.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/u);
    for (const [name, version] of [
      ...Object.entries(packageMetadata.dependencies),
      ...Object.entries(packageMetadata.devDependencies),
    ]) {
      expect(version, `${name} must be pinned to an exact version`).toMatch(
        /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u,
      );
    }

    const workflow = await readFile(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
  });

  it('[GATE-CI-ACTION-PINNING] pins every GitHub Action to a full commit SHA', async () => {
    const workflows = await listFiles(resolve(repositoryRoot, '.github/workflows'), '.yml');
    expect(workflows.length).toBeGreaterThan(0);

    for (const workflow of workflows) {
      const source = await readFile(workflow, 'utf8');
      const uses = [...source.matchAll(/uses:\s*(\S+)/gu)].map((match) => match[1] ?? '');
      expect(uses.length).toBeGreaterThan(0);
      for (const reference of uses) {
        expect(reference, `${workflow} uses an unpinned action`).toMatch(/@[0-9a-f]{40}$/u);
      }
    }
  });

  it('[GATE-COMPATIBILITY-MATRIX] keeps runtime behavior inside the published matrix', async () => {
    const matrix = await loadJson<{
      claims: { dimension: string; value: string; support: string }[];
    }>('config/compatibility.json');
    const manifest = await loadJson<{
      transports: { name: string; protocolVersions: string[] }[];
    }>('config/capabilities.json');

    const supported = (dimension: string): string[] =>
      matrix.claims
        .filter((claim) => claim.dimension === dimension && claim.support === 'supported')
        .map((claim) => claim.value)
        .sort();

    expect(supported('protocol')).toEqual([...SUPPORTED_PROTOCOL_VERSIONS].sort());
    expect(supported('transport')).toEqual(manifest.transports.map((entry) => entry.name).sort());
    expect(supported('protocol')).toEqual(
      [...new Set(manifest.transports.flatMap((entry) => entry.protocolVersions))].sort(),
    );
    expect(matrix.claims.filter((claim) => claim.support === 'unsupported').length).toBeGreaterThan(
      0,
    );
  });
});
