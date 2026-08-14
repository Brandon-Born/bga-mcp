import { readSearchResponse } from '../../src/docs/search.js';
import { ERROR_CODES } from '../../src/errors.js';
import { createPolicyBoundary } from '../../src/policy.js';
import { parseJsonc, parseModernMetadata } from '../../src/project/parse.js';
import { validateNotifications } from '../../src/rules/notifications.js';
import { parseStudioLog } from '../../src/studio/logline.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cooperative synchronous deadlines', () => {
  it('[INT-POLICY-TIMEOUT] expires a non-yielding parser from the registered monotonic clock', async () => {
    const policy = await createPolicyBoundary({ operationTimeoutMs: 1_000 });
    let clockReads = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      clockReads += 1;
      // The operation registers at zero. Several parser checkpoints see time
      // below the deadline; a later one advances past it without yielding to
      // the event loop, so the timer itself has no opportunity to fire.
      return clockReads < 5 ? 0 : 1_001;
    });

    const largeComment = `/*${'x'.repeat(8_192)}*/{}`;
    await expect(
      policy.runWithTimeout(
        'synchronous-jsonc',
        async (signal) => {
          parseJsonc(largeComment, signal);
          return await Promise.resolve('unreachable');
        },
        1_000,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.policyTimeoutExceeded });
    expect(clockReads).toBeGreaterThanOrEqual(5);
  });

  it('threads cancellation into project validators, documentation parsing, and Studio parsing', () => {
    const controller = new AbortController();
    const reason = new Error('operation expired');
    controller.abort(reason);

    expect(() => parseModernMetadata('{}', controller.signal)).toThrow(reason);
    expect(() => validateNotifications([], [], controller.signal)).toThrow(reason);
    expect(() => readSearchResponse('{"query":{"search":[]}}', 5, controller.signal)).toThrow(
      reason,
    );
    expect(() => parseStudioLog('', controller.signal)).toThrow(reason);
  });
});
