import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPPORTED_PROTOCOL_VERSIONS } from '../../src/metadata.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

describe('repository safety gates', () => {
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
