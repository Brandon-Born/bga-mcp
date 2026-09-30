import { resolve } from 'node:path';

import { inject } from 'vitest';

import { exerciseInstallGuide } from '../../scripts/lib/install-guide.js';
import { recordInstalledArtifact } from '../helpers/packaged.js';

describe('published installation walkthrough', () => {
  it('[E2E-INSTALL-GUIDE] follows the guide through public first use, root refusal, repeat install and clean removal', async () => {
    const artifact = inject('packedArtifact');
    await recordInstalledArtifact('install-guide', artifact);
    const result = await exerciseInstallGuide(artifact, resolve(import.meta.dirname, '../..'));
    expect(result.removal).toBe('passed');
    expect(result.projectUnchanged).toBe(true);
  }, 180_000);
});
