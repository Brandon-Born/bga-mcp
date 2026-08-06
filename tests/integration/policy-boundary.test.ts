import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ERROR_CODES } from '../../src/errors.js';
import { createPolicyBoundary, type PolicyBoundary } from '../../src/policy.js';

let temporaryRoot: string;
let projectRoot: string;
let outsideRoot: string;
let policy: PolicyBoundary;

async function expectViolation(operation: () => Promise<unknown>, code: string): Promise<void> {
  await expect(operation()).rejects.toMatchObject({ name: 'PolicyViolationError', code });
}

beforeAll(async () => {
  temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-policy-')));
  projectRoot = resolve(temporaryRoot, 'project');
  outsideRoot = resolve(temporaryRoot, 'outside');
  await mkdir(resolve(projectRoot, 'modules/php'), { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  await writeFile(resolve(projectRoot, 'states.inc.php'), '<?php $machinestates = [];\n');
  await writeFile(resolve(projectRoot, 'modules/php/Game.php'), '<?php\n');
  await writeFile(resolve(outsideRoot, 'id_ed25519'), 'seeded-private-key-material\n');
  await symlink(
    outsideRoot,
    resolve(projectRoot, 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  policy = await createPolicyBoundary({ projectRoots: [projectRoot] });
});

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('policy boundary on a real filesystem', () => {
  it('resolves allowed roots and in-root files', async () => {
    expect(policy.projectRoots).toEqual([projectRoot]);
    await expect(policy.resolveProjectRoot(projectRoot)).resolves.toBe(projectRoot);
    await expect(policy.resolveWithinProject(projectRoot, 'modules/php/Game.php')).resolves.toBe(
      resolve(projectRoot, 'modules/php/Game.php'),
    );
    await expect(policy.resolveWithinProject(projectRoot, './states.inc.php')).resolves.toBe(
      resolve(projectRoot, 'states.inc.php'),
    );
  });

  it('[INT-POLICY-ROOT-NOT-ALLOWED] refuses a root that was never configured', async () => {
    await expectViolation(
      async () => await policy.resolveProjectRoot(outsideRoot),
      ERROR_CODES.policyRootNotAllowed,
    );
    await expectViolation(
      async () => await policy.resolveProjectRoot(resolve(temporaryRoot, 'missing')),
      ERROR_CODES.policyPathNotFound,
    );
    await expectViolation(
      async () => await policy.resolveWithinProject(outsideRoot, 'id_ed25519'),
      ERROR_CODES.policyRootNotAllowed,
    );
  });

  it('[INT-POLICY-PATH-TRAVERSAL] rejects escaping paths before touching the filesystem', async () => {
    const candidates = [
      '../outside/id_ed25519',
      'modules/../../outside/id_ed25519',
      '..\\outside\\id_ed25519',
      resolve(outsideRoot, 'id_ed25519'),
      'C:\\Windows\\System32\\drivers\\etc\\hosts',
      '',
      'states.inc.php\0.txt',
    ];
    for (const candidate of candidates) {
      await expectViolation(
        async () => await policy.resolveWithinProject(projectRoot, candidate),
        ERROR_CODES.policyPathTraversal,
      );
    }
  });

  it('[INT-POLICY-SYMLINK-ESCAPE] rejects an in-root link that resolves outside the root', async () => {
    await expectViolation(
      async () => await policy.resolveWithinProject(projectRoot, 'escape/id_ed25519'),
      ERROR_CODES.policyPathSymlinkEscape,
    );
    await expectViolation(
      async () => await policy.resolveWithinProject(projectRoot, 'escape'),
      ERROR_CODES.policyPathSymlinkEscape,
    );
    await expectViolation(
      async () => await policy.resolveWithinProject(projectRoot, 'modules/php/Missing.php'),
      ERROR_CODES.policyPathNotFound,
    );
  });

  it('[E2E-POLICY-ROOT-UNAVAILABLE] refuses to start with a root that does not exist', async () => {
    await expectViolation(
      async () => await createPolicyBoundary({ projectRoots: [resolve(temporaryRoot, 'missing')] }),
      ERROR_CODES.policyRootUnavailable,
    );
  });

  it('reports in-root paths and hides outside paths in published errors', async () => {
    const failure = await policy
      .resolveWithinProject(projectRoot, 'escape/id_ed25519')
      .then(() => undefined)
      .catch((error: unknown) => error);
    expect(JSON.stringify(failure)).not.toContain(outsideRoot);
    expect(policy.redactionOptions.projectRoots).toEqual([projectRoot]);
  });
});
