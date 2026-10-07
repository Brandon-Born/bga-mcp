import type * as Filesystem from 'node:fs/promises';

const observation = vi.hoisted(() => ({ signals: [] as (AbortSignal | undefined)[] }));
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof Filesystem>('node:fs/promises');
  return {
    ...actual,
    readFile: async (...arguments_: Parameters<typeof actual.readFile>) => {
      const options = arguments_[1];
      observation.signals.push(
        typeof options === 'object' && options !== null && 'signal' in options
          ? options.signal
          : undefined,
      );
      return await actual.readFile(...arguments_);
    },
  };
});
import { createPolicyBoundary } from '../../src/policy.js';

async function pause(ms: number): Promise<void> {
  await new Promise<void>((ready) => {
    setTimeout(ready, ms);
  });
}
beforeEach(() => {
  observation.signals = [];
});

it('[UNIT-POLICY-OPERATION-CONTEXT] keeps overlapping operation signals distinct and stops late reads before issue', async () => {
  const policy = await createPolicyBoundary();
  let first: AbortSignal | undefined;
  let second: AbortSignal | undefined;
  const slow = policy.runWithTimeout(
    'expired',
    async (signal) => {
      first = signal;
      await pause(30);
      await policy.readPackagedConfig('doc-sources.json');
    },
    5,
  );
  // Attach the rejection observer before the other operation spends any time.
  const slowResult = slow.then(
    () => 'success',
    (error: unknown) => error,
  );
  const fast = policy.runWithTimeout(
    'independent',
    async (signal) => {
      second = signal;
      await pause(40);
      return await policy.readPackagedConfig('doc-sources.json');
    },
    1_000,
  );
  expect(await slowResult).toMatchObject({ code: 'policy.timeout.exceeded' });
  expect(await fast).toContain('canonicalUrl');
  expect(first).not.toBe(second);
  expect(first?.aborted).toBe(true);
  expect(second?.aborted).toBe(false);
  expect(observation.signals).toEqual([second]);
});
it('[UNIT-POLICY-OPERATION-CONTEXT] restores the outer context after an inner timeout and gives standalone reads a bounded signal', async () => {
  const policy = await createPolicyBoundary();
  let outer: AbortSignal | undefined;
  await policy.runWithTimeout(
    'outer',
    async (signal) => {
      outer = signal;
      await expect(
        policy.runWithTimeout(
          'inner',
          async () => {
            await pause(20);
            await policy.readPackagedConfig('doc-sources.json');
          },
          5,
        ),
      ).rejects.toMatchObject({ code: 'policy.timeout.exceeded' });
      await policy.readPackagedConfig('doc-sources.json');
    },
    1_000,
  );
  await policy.readPackagedConfig('doc-sources.json');
  expect(observation.signals).toHaveLength(2);
  expect(observation.signals[0]).toBe(outer);
  expect(observation.signals[1]).toBeInstanceOf(AbortSignal);
  expect(observation.signals[1]).not.toBe(outer);
});
it('[UNIT-POLICY-OPERATION-CONTEXT] cleans its timer when a callback throws synchronously', async () => {
  const policy = await createPolicyBoundary();
  const failure = new Error('original failure');
  await expect(
    policy.runWithTimeout(
      'sync failure',
      () => {
        throw failure;
      },
      5,
    ),
  ).rejects.toBe(failure);
  await pause(15);
  expect(
    await policy.runWithTimeout('next operation', async () => await Promise.resolve('ready'), 100),
  ).toBe('ready');
});
