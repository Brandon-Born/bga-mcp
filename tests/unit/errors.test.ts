import { resolve, sep } from 'node:path';

import {
  BgaMcpError,
  ERROR_CODES,
  ERROR_CONTRACT_VERSION,
  PUBLIC_ERROR_CODES,
  PolicyViolationError,
  getPublicErrorJsonSchema,
  parsePublicError,
  toPublicError,
} from '../../src/errors.js';
import { REDACTED_CREDENTIAL, REDACTED_PATH } from '../../src/redaction.js';

const projectRoot = resolve(sep, 'workspace', 'bgamcptest');

describe('public error contract', () => {
  it('publishes stable, unique codes and a parseable schema', () => {
    expect(new Set(PUBLIC_ERROR_CODES).size).toBe(PUBLIC_ERROR_CODES.length);
    expect(PUBLIC_ERROR_CODES).toContain('policy.path.symlink-escape');
    for (const code of PUBLIC_ERROR_CODES) {
      expect(code).toMatch(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
    }
    expect(getPublicErrorJsonSchema()).toMatchObject({ type: 'object' });
    expect(() => parsePublicError({ schemaVersion: 1, code: 'made.up', message: 'x' })).toThrow();
    expect(() =>
      parsePublicError({
        schemaVersion: ERROR_CONTRACT_VERSION,
        code: ERROR_CODES.policyTimeoutExceeded,
        message: 'timed out',
      }),
    ).not.toThrow();
  });

  it('keeps known failures actionable and redacts their details', () => {
    const error = new PolicyViolationError(
      ERROR_CODES.policyPathSymlinkEscape,
      `states.inc.php resolves to ${resolve(sep, 'home', 'developer', '.ssh', 'id_ed25519')}`,
      { details: { requestedPath: 'states.inc.php', token: 'ghp_abcdefghijklmnopqrstuvwxyz01' } },
    );
    const published = toPublicError(error, { projectRoots: [projectRoot] });

    expect(published.code).toBe(ERROR_CODES.policyPathSymlinkEscape);
    expect(published.message).toContain(REDACTED_PATH);
    expect(published.message).not.toContain('id_ed25519');
    expect(published.details).toEqual({
      requestedPath: 'states.inc.php',
      token: REDACTED_CREDENTIAL,
    });
    expect(parsePublicError(published)).toEqual(published);
  });

  it('omits empty details and preserves the error hierarchy', () => {
    const error = new BgaMcpError(ERROR_CODES.configInvalid, 'bad configuration');
    expect(toPublicError(error)).toEqual({
      schemaVersion: ERROR_CONTRACT_VERSION,
      code: ERROR_CODES.configInvalid,
      message: 'bad configuration',
    });
    expect(new PolicyViolationError(ERROR_CODES.configInvalid, 'x')).toBeInstanceOf(BgaMcpError);
  });

  it('[UNIT-ERROR-UNEXPECTED-COLLAPSE] collapses unknown failures without leaking internals', () => {
    const internal = new TypeError(
      `cannot read ${resolve(sep, 'home', 'developer', '.ssh', 'id_ed25519')} using ghp_abcdefghijklmnopqrstuvwxyz01`,
    );
    const published = toPublicError(internal);

    expect(published).toEqual({
      schemaVersion: ERROR_CONTRACT_VERSION,
      code: ERROR_CODES.internalUnexpected,
      message: 'The server failed unexpectedly. No further detail is safe to report.',
      details: { kind: 'TypeError' },
    });
    expect(JSON.stringify(published)).not.toContain('id_ed25519');
    expect(JSON.stringify(published)).not.toContain('ghp_');
    expect(JSON.stringify(published)).not.toContain('at ');

    expect(toPublicError('a raw string secret ghp_abcdefghijklmnopqrstuvwxyz01')).toEqual({
      schemaVersion: ERROR_CONTRACT_VERSION,
      code: ERROR_CODES.internalUnexpected,
      message: 'The server failed unexpectedly. No further detail is safe to report.',
      details: { kind: 'string' },
    });
  });
});
