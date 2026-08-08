import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createPolicyBoundary } from '../../src/policy.js';

let scratch: string;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-roots-')));
  projectA = resolve(scratch, 'gameA');
  projectB = resolve(scratch, 'gameB');
  for (const root of [projectA, projectB]) {
    await mkdir(root, { recursive: true });
    await writeFile(
      resolve(root, 'gameinfos.inc.php'),
      "<?php\n$gameinfos = ['game_name' => 'X'];\n",
    );
  }
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('project roots offered by the client', () => {
  it('[INT-CLIENT-ROOTS-ADOPTED] uses a client root when none was configured', async () => {
    const policy = await createPolicyBoundary({});
    expect(policy.projectRoots).toEqual([]);

    policy.setClientRootsProvider(() => Promise.resolve([projectA]));
    await policy.ensureClientRoots();

    expect(policy.projectRoots).toEqual([projectA]);
    // A client-offered root is a real root: it resolves and is accepted.
    await expect(policy.resolveProjectRoot(projectA)).resolves.toBe(projectA);
  });

  it('[INT-CLIENT-ROOTS-ADOPTED] checks a client root exactly as it checks a configured one', async () => {
    const policy = await createPolicyBoundary({});
    policy.setClientRootsProvider(() => Promise.resolve([projectA]));

    // Offered by the client does not mean trusted: everything outside is still
    // refused, and the refusal is the same one a configured root produces.
    await expect(policy.resolveProjectRoot(projectB)).rejects.toMatchObject({
      code: 'policy.root.not-allowed',
    });
    await expect(policy.resolveProjectRoot(resolve(projectA, '..'))).rejects.toMatchObject({
      code: 'policy.root.not-allowed',
    });
    await expect(
      policy.readProjectFile(projectA, '../gameB/gameinfos.inc.php'),
    ).rejects.toMatchObject({ code: 'policy.path.traversal' });
  });

  it('[INT-CLIENT-ROOTS-ADOPTED] prefers a configured root and drops one that does not exist', async () => {
    const policy = await createPolicyBoundary({ projectRoots: [projectA] });
    policy.setClientRootsProvider(() =>
      Promise.resolve([projectB, resolve(scratch, 'gone'), projectA]),
    );
    await policy.ensureClientRoots();

    // Configured first, the missing one skipped, and no duplicate for the one
    // that appears in both.
    expect(policy.projectRoots).toEqual([projectA, projectB]);
  });

  it('[INT-CLIENT-ROOTS-ADOPTED] asks once, and again only after the client says they changed', async () => {
    let calls = 0;
    const policy = await createPolicyBoundary({});
    policy.setClientRootsProvider(() => {
      calls += 1;
      return Promise.resolve([projectA]);
    });

    await policy.ensureClientRoots();
    await policy.ensureClientRoots();
    expect(calls).toBe(1);

    policy.invalidateClientRoots();
    await policy.ensureClientRoots();
    expect(calls).toBe(2);
  });

  it('[INT-CLIENT-ROOTS-ADOPTED] treats a client that cannot answer as one without roots', async () => {
    const policy = await createPolicyBoundary({});
    policy.setClientRootsProvider(() => Promise.reject(new Error('no roots capability')));
    await policy.ensureClientRoots();

    // Not an error: a client that offers nothing is the situation this server
    // has always been in, and the refusal says both ways to fix it.
    expect(policy.projectRoots).toEqual([]);
    await expect(policy.resolveProjectRoot(projectA)).rejects.toMatchObject({
      code: 'policy.root.unconfigured',
    });
    await policy.resolveProjectRoot(projectA).catch((error: unknown) => {
      expect((error as Error).message).toContain('client offered none');
    });
  });
});
