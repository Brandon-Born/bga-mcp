import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { inject } from 'vitest';
import { runCommand } from '../helpers/process.js';
import { object } from '../../scripts/lib/publication.js';
import { recordInstalledArtifact } from '../helpers/packaged.js';
it('[E2E-PUBLICATION-CONSUMER] uses and removes the shared immutable artifact through the consumer guide', async () => {
  const artifact = inject('packedArtifact');
  await recordInstalledArtifact('publication-consumer', artifact);
  const bytes = await readFile(artifact);
  expect(bytes.length).toBeGreaterThan(0);
  const root = resolve(import.meta.dirname, '../..');
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga415-guide-test-'));
  let result: Record<string, unknown>;
  try {
    const output = resolve(scratch, 'result.json');
    const run = await runCommand(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        resolve(root, 'scripts/test-publication-guide.ts'),
        artifact,
        root,
        output,
      ],
      { cwd: root, timeoutMs: 150_000 },
    );
    expect(run.exitCode, run.stderr).toBe(0);
    result = object(JSON.parse(await readFile(output, 'utf8')) as unknown);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  expect(result.discovery).toBe('matched installed inventory');
  expect(result.firstUse).toBe('passed');
  expect(result.unconfiguredRoot).toBe('refused');
  expect(result.projectUnchanged).toBe(true);
  expect(result.serverExited).toBe(true);
  expect(result.removal).toBe('passed');
  // Offline packaged proof only: the public registry and OIDC run remain separate acceptance cases.
}, 180_000);
