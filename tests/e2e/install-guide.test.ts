import { resolve } from 'node:path';

import { inject } from 'vitest';

import { exerciseInstallGuide, verifyInstalledVersion } from '../../scripts/lib/install-guide.js';
import { recordInstalledArtifact } from '../helpers/packaged.js';

describe('published installation walkthrough', () => {
  it('accepts the exact installed candidate version and refuses stale or decorated output', () => {
    for (const version of ['1.0.0-rc.1', '1.0.0-rc.2']) {
      expect(() => verifyInstalledVersion(`${version}\n`, version)).not.toThrow();
    }
    expect(() => verifyInstalledVersion('1.0.0-rc.1', '1.0.0-rc.2')).toThrow();
    expect(() => verifyInstalledVersion('wrong 1.0.0-rc.2', '1.0.0-rc.2')).toThrow();
  });
  it('[E2E-INSTALL-GUIDE] follows the guide through public first use, root refusal, repeat install and clean removal', async () => {
    const artifact = inject('packedArtifact');
    await recordInstalledArtifact('install-guide', artifact);
    const result = await exerciseInstallGuide(artifact, resolve(import.meta.dirname, '../..'));
    expect(result.removal).toBe('passed');
    expect(result.projectUnchanged).toBe(true);
  }, 180_000);
});
