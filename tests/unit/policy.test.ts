import { ERROR_CODES } from '../../src/errors.js';
import {
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_OPERATION_TIMEOUT_MS,
  DEFAULT_POLICY_CONFIG,
  MAX_OPERATION_TIMEOUT_MS,
  MAX_OUTPUT_BYTES_LIMIT,
  createPolicyBoundary,
} from '../../src/policy.js';

async function expectViolation(operation: () => Promise<unknown>, code: string): Promise<void> {
  await expect(operation()).rejects.toMatchObject({ name: 'PolicyViolationError', code });
}

describe('policy boundary defaults', () => {
  it('defaults to local, read-only, network-off operation', () => {
    expect(DEFAULT_POLICY_CONFIG).toEqual({
      projectRoots: [],
      remoteProjects: [],
      operationTimeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
      networkEnabled: false,
      mutationsEnabled: false,
    });
  });

  it('[INT-POLICY-ROOT-UNCONFIGURED] denies every project path when no root is configured', async () => {
    const policy = await createPolicyBoundary();
    expect(policy.projectRoots).toEqual([]);
    await expectViolation(
      async () => await policy.resolveProjectRoot(process.cwd()),
      ERROR_CODES.policyRootUnconfigured,
    );
    await expectViolation(
      async () => await policy.resolveWithinProject(process.cwd(), 'states.inc.php'),
      ERROR_CODES.policyRootUnconfigured,
    );
  });

  it.each([
    [{ operationTimeoutMs: 0 }],
    [{ operationTimeoutMs: -1 }],
    [{ operationTimeoutMs: 1.5 }],
    [{ operationTimeoutMs: MAX_OPERATION_TIMEOUT_MS + 1 }],
    [{ maxOutputBytes: 0 }],
    [{ maxOutputBytes: MAX_OUTPUT_BYTES_LIMIT + 1 }],
    [{ remoteProjects: ['../escape'] }],
    [{ remoteProjects: [''] }],
    [{ projectRoots: ['relative/path'] }],
  ])('fails closed on invalid configuration %j', async (overrides) => {
    await expectViolation(
      async () => await createPolicyBoundary(overrides),
      ERROR_CODES.configInvalid,
    );
  });

  it('[INT-POLICY-REMOTE-NOT-ALLOWED] accepts only allowlisted Studio projects', async () => {
    const policy = await createPolicyBoundary({ remoteProjects: ['bgamcptest'] });
    expect(() => policy.assertRemoteProjectAllowed('bgamcptest')).not.toThrow();
    expect(() => policy.assertRemoteProjectAllowed('someoneelsesgame')).toThrow('not allowlisted');
    try {
      policy.assertRemoteProjectAllowed('someoneelsesgame');
    } catch (error) {
      expect(error).toMatchObject({ code: ERROR_CODES.policyRemoteNotAllowed });
    }
  });

  it('[INT-POLICY-NETWORK-DISABLED] refuses network use unless it is enabled', async () => {
    const offline = await createPolicyBoundary();
    expect(() => offline.assertNetworkAllowed('docs-index')).toThrow(/Network access is disabled/u);
    const online = await createPolicyBoundary({ networkEnabled: true });
    expect(() => online.assertNetworkAllowed('docs-index')).not.toThrow();
  });

  it('[INT-POLICY-MUTATION-NOT-REQUESTED] requires enablement, execute mode, and a confirmed target', async () => {
    const readOnly = await createPolicyBoundary({ remoteProjects: ['bgamcptest'] });
    expect(() =>
      readOnly.assertMutationAllowed(
        { mode: 'execute', confirmedTarget: 'bgamcptest' },
        'bgamcptest',
      ),
    ).toThrow(/Mutations are disabled/u);

    const enabled = await createPolicyBoundary({
      remoteProjects: ['bgamcptest'],
      mutationsEnabled: true,
    });
    expect(() => enabled.assertMutationAllowed({ mode: 'preview' }, 'bgamcptest')).toThrow(
      /requires mode "execute"/u,
    );
    expect(() =>
      enabled.assertMutationAllowed({ mode: 'execute', confirmedTarget: 'other' }, 'bgamcptest'),
    ).toThrow(/confirmedTarget/u);
    expect(() =>
      enabled.assertMutationAllowed(
        { mode: 'execute', confirmedTarget: 'bgamcptest' },
        'bgamcptest',
      ),
    ).not.toThrow();
  });

  it('[INT-POLICY-TIMEOUT] aborts and reports an operation that outlives its deadline', async () => {
    const policy = await createPolicyBoundary({ operationTimeoutMs: 20 });
    let aborted = false;
    await expectViolation(
      async () =>
        await policy.runWithTimeout('slow-scan', async (signal) => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'never returned';
        }),
      ERROR_CODES.policyTimeoutExceeded,
    );
    expect(aborted).toBe(true);

    await expect(
      policy.runWithTimeout('fast-scan', async () => await Promise.resolve('done')),
    ).resolves.toBe('done');
    await expectViolation(
      async () =>
        await policy.runWithTimeout('bad-deadline', async () => await Promise.resolve(1), 0),
      ERROR_CODES.configInvalid,
    );
  });

  it('[INT-POLICY-OUTPUT-LIMIT] rejects a result larger than the configured budget', async () => {
    const policy = await createPolicyBoundary({ maxOutputBytes: 16 });
    expect(policy.assertOutputWithinLimit('summary', 'small')).toBe('small');
    expect(() => policy.assertOutputWithinLimit('summary', 'x'.repeat(17))).toThrow(
      /above the 16 byte limit/u,
    );
    try {
      policy.assertOutputWithinLimit('summary', '€'.repeat(17));
    } catch (error) {
      expect(error).toMatchObject({
        code: ERROR_CODES.policyOutputTooLarge,
        details: { operation: 'summary', bytes: 51, maxOutputBytes: 16 },
      });
    }
  });
});
