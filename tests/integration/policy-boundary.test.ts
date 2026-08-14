import {
  appendFile,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ERROR_CODES } from '../../src/errors.js';
import { createPolicyBoundary, type PolicyBoundary } from '../../src/policy.js';

let temporaryRoot: string;
let projectRoot: string;
let outsideRoot: string;
let policy: PolicyBoundary;

interface Deferred {
  readonly promise: Promise<void>;
  release: () => void;
}

type OperationOutcome<T> =
  | { readonly kind: 'returned'; readonly value: T }
  | { readonly kind: 'rejected'; readonly error: unknown };

function deferred(): Deferred {
  let release!: () => void;
  const promise = new Promise<void>((settle) => {
    release = settle;
  });
  return { promise, release };
}

async function settleOperation<T>(operation: Promise<T>): Promise<OperationOutcome<T>> {
  return await operation.then(
    (value) => ({ kind: 'returned', value }),
    (error: unknown) => ({ kind: 'rejected', error }),
  );
}

/** Fails promptly if an operation exits before reaching its deterministic test barrier. */
async function waitForBarrier<T>(
  barrier: Promise<void>,
  operation: Promise<T>,
  description: string,
): Promise<void> {
  const prematureSettlement = operation.then(
    () => {
      throw new Error(`${description} returned before reaching its test barrier`);
    },
    (cause: unknown) => {
      throw new Error(`${description} failed before reaching its test barrier`, { cause });
    },
  );
  await Promise.race([barrier, prematureSettlement]);
}

/** Includes a returned value or the public and enumerable parts of a thrown error. */
function observableOutcome(outcome: OperationOutcome<unknown>): string {
  const observed = outcome.kind === 'returned' ? outcome.value : outcome.error;
  const encoded = JSON.stringify({ observed });
  return observed instanceof Error ? `${observed.name}: ${observed.message}\n${encoded}` : encoded;
}

function expectChangedPathRefusal(outcome: OperationOutcome<unknown>): void {
  if (outcome.kind !== 'rejected') {
    throw new Error(`The operation returned instead of refusing: ${observableOutcome(outcome)}`);
  }
  expect(outcome.error).toMatchObject({
    name: 'PolicyViolationError',
    code: ERROR_CODES.policyPathSymlinkEscape,
  });
}

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

  it('[INT-POLICY-SINGLE-SWAP-REFUSAL] refuses an intermediate-directory escape after the first containment check', async () => {
    const raceRoot = resolve(temporaryRoot, 'file-race-project');
    const safeDirectory = resolve(raceRoot, 'nested');
    const displacedDirectory = resolve(temporaryRoot, 'file-race-original');
    const outsideDirectory = resolve(temporaryRoot, 'file-race-outside');
    const canary = 'outside-content-must-not-be-read';
    await mkdir(safeDirectory, { recursive: true });
    await mkdir(outsideDirectory, { recursive: true });
    await writeFile(resolve(safeDirectory, 'target.php'), '<?php // safe\n');
    await writeFile(resolve(outsideDirectory, 'target.php'), canary);

    const racePolicy = await createPolicyBoundary({ projectRoots: [raceRoot] });
    const originalResolve = racePolicy.resolveWithinProject.bind(racePolicy);
    const hadOwnResolve = Object.hasOwn(racePolicy, 'resolveWithinProject');
    const resolved = deferred();
    const resumeRead = deferred();
    const resolveSpy = vi
      .spyOn(racePolicy, 'resolveWithinProject')
      .mockImplementation(async (root, path) => {
        const result = await originalResolve(root, path);
        resolved.release();
        await resumeRead.promise;
        return result;
      });

    let reading: Promise<string> | undefined;
    let outcome: OperationOutcome<string> | undefined;
    let displaced = false;
    let linked = false;
    try {
      reading = racePolicy.readProjectFile(raceRoot, 'nested/target.php');
      await waitForBarrier(resolved.promise, reading, 'the intermediate-directory read');
      await rename(safeDirectory, displacedDirectory);
      displaced = true;
      await symlink(
        outsideDirectory,
        safeDirectory,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      linked = true;
      resumeRead.release();
      outcome = await settleOperation(reading);
    } finally {
      // Release the method even if arranging the fixture fails, then let the
      // descriptor close before putting the original pathname back.
      resumeRead.release();
      await reading?.catch(() => undefined);
      try {
        resolveSpy.mockRestore();
      } finally {
        try {
          if (linked) {
            await unlink(safeDirectory);
          }
        } finally {
          if (displaced) {
            await rename(displacedDirectory, safeDirectory);
          }
        }
      }
    }

    expect(Object.hasOwn(racePolicy, 'resolveWithinProject')).toBe(hadOwnResolve);
    expect(observableOutcome(outcome)).not.toContain(canary);
    expectChangedPathRefusal(outcome);
  });

  it('[INT-POLICY-POST-STAT-GROWTH-REFUSAL] rejects growth after descriptor stat instead of returning a plausible prefix', async () => {
    const growthRoot = resolve(temporaryRoot, 'growth-project');
    const target = resolve(growthRoot, 'states.inc.php');
    const original = '<?php $machinestates = [];\n';
    const growth = 'private-growth-marker-after-stat';
    await mkdir(growthRoot, { recursive: true });
    await writeFile(target, original);
    const growthPolicy = await createPolicyBoundary({ projectRoots: [growthRoot] });

    // FileHandle has no exported constructor, but every handle shares this
    // prototype. Growing immediately after the real stat makes the otherwise
    // microscopic stat/read window deterministic without adding a production
    // test hook.
    const probe = await open(target, 'r');
    interface StatHandle {
      stat(): Promise<Stats>;
    }
    const prototype = Object.getPrototypeOf(probe) as StatHandle;
    const originalStat = Object.getOwnPropertyDescriptor(prototype, 'stat')?.value as
      StatHandle['stat'] | undefined;
    await probe.close();
    if (originalStat === undefined) {
      throw new Error('The FileHandle prototype has no stat method to instrument');
    }
    let shouldGrow = true;
    const statSpy = vi.spyOn(prototype, 'stat').mockImplementation(async function (
      this: StatHandle,
    ): Promise<Stats> {
      const info = await originalStat.call(this);
      if (shouldGrow) {
        shouldGrow = false;
        await appendFile(target, growth);
      }
      return info;
    });

    let outcome: OperationOutcome<string> | undefined;
    try {
      outcome = await settleOperation(growthPolicy.readProjectFile(growthRoot, 'states.inc.php'));
    } finally {
      try {
        statSpy.mockRestore();
      } finally {
        await writeFile(target, original);
      }
    }

    expect(Object.getOwnPropertyDescriptor(prototype, 'stat')?.value).toBe(originalStat);
    expect(shouldGrow).toBe(false);
    expect(observableOutcome(outcome)).not.toContain(growth);
    expectChangedPathRefusal(outcome);
  });

  it('[INT-POLICY-TIMEOUT] preserves cancellation while reading a Studio session file', async () => {
    const sessionFile = resolve(temporaryRoot, 'cancelled-studio-session');
    await writeFile(sessionFile, 'PHPSESSID=session-value-for-cancellation', { mode: 0o600 });
    const sessionPolicy = await createPolicyBoundary({ studioSessionFile: sessionFile });
    const controller = new AbortController();
    const reason = new Error('session read expired');

    if (process.platform === 'win32') {
      controller.abort(reason);
      await expect(sessionPolicy.studioSession({ signal: controller.signal })).rejects.toBe(reason);
      return;
    }

    const probe = await open(sessionFile, 'r');
    interface SessionStatHandle {
      stat(): Promise<Stats>;
    }
    const prototype = Object.getPrototypeOf(probe) as SessionStatHandle;
    const originalStat = Object.getOwnPropertyDescriptor(prototype, 'stat')?.value as
      SessionStatHandle['stat'] | undefined;
    await probe.close();
    if (originalStat === undefined) {
      throw new Error('The FileHandle prototype has no stat method to instrument');
    }

    let reachedBarrier = false;
    const statSpy = vi.spyOn(prototype, 'stat').mockImplementation(async function (
      this: SessionStatHandle,
    ): Promise<Stats> {
      const info = await originalStat.call(this);
      reachedBarrier = true;
      controller.abort(reason);
      return info;
    });
    try {
      await expect(sessionPolicy.studioSession({ signal: controller.signal })).rejects.toBe(reason);
    } finally {
      statSpy.mockRestore();
    }
    expect(reachedBarrier).toBe(true);
  });

  it('[INT-POLICY-SINGLE-SWAP-REFUSAL] refuses a configured directory replaced by an outside junction before opendir', async () => {
    const raceRoot = resolve(temporaryRoot, 'directory-race-project');
    const displacedRoot = resolve(temporaryRoot, 'directory-race-original');
    const outsideDirectory = resolve(temporaryRoot, 'directory-race-outside');
    const canaryName = 'outside-directory-canary.php';
    const canaryContent = 'private-directory-content-must-not-be-observed';
    await mkdir(raceRoot, { recursive: true });
    await mkdir(outsideDirectory, { recursive: true });
    await writeFile(resolve(raceRoot, 'inside.php'), '<?php\n');
    await writeFile(resolve(outsideDirectory, canaryName), canaryContent);

    const racePolicy = await createPolicyBoundary({ projectRoots: [raceRoot] });
    const originalResolve = racePolicy.resolveProjectRoot.bind(racePolicy);
    const hadOwnResolve = Object.hasOwn(racePolicy, 'resolveProjectRoot');
    const resolved = deferred();
    const resumeListing = deferred();
    const resolveSpy = vi
      .spyOn(racePolicy, 'resolveProjectRoot')
      .mockImplementation(async (candidate) => {
        const result = await originalResolve(candidate);
        resolved.release();
        await resumeListing.promise;
        return result;
      });

    let listing: Promise<unknown> | undefined;
    let outcome: OperationOutcome<unknown> | undefined;
    let displaced = false;
    let linked = false;
    try {
      listing = racePolicy.listProjectFiles(raceRoot);
      await waitForBarrier(resolved.promise, listing, 'the directory listing');
      await rename(raceRoot, displacedRoot);
      displaced = true;
      await symlink(outsideDirectory, raceRoot, process.platform === 'win32' ? 'junction' : 'dir');
      linked = true;
      resumeListing.release();
      outcome = await settleOperation(listing);
    } finally {
      resumeListing.release();
      await listing?.catch(() => undefined);
      try {
        resolveSpy.mockRestore();
      } finally {
        try {
          if (linked) {
            await unlink(raceRoot);
          }
        } finally {
          if (displaced) {
            await rename(displacedRoot, raceRoot);
          }
        }
      }
    }

    expect(Object.hasOwn(racePolicy, 'resolveProjectRoot')).toBe(hadOwnResolve);
    expect(observableOutcome(outcome)).not.toContain(canaryName);
    expect(observableOutcome(outcome)).not.toContain(canaryContent);
    expectChangedPathRefusal(outcome);
  });
});
