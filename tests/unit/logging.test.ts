// secret-scan:allow-file Seeded non-secret sample credentials that prove log redaction.
import { readFile } from 'node:fs/promises';

import { verifyCliErrorBoundary, verifyCliEntryBoundary } from '../../scripts/lib/cli-boundary.js';

import { resolve, sep } from 'node:path';

import { ERROR_CODES, PolicyViolationError } from '../../src/errors.js';
import { formatErrorLog, formatMessageLog } from '../../src/logging.js';

const projectRoot = resolve(sep, 'workspace', 'bgamcptest');
const outsidePath = resolve(sep, 'home', 'developer', '.ssh', 'id_ed25519');

describe('server logging', () => {
  it('[GATE-LOG-REDACTION] rejects a CLI throw outside the safe boundary', async () => {
    const source = await readFile(new URL('../../src/cli-runner.ts', import.meta.url), 'utf8');
    expect(verifyCliErrorBoundary(source).failures).toEqual([]);
    for (const path of ['cli.ts', 'release-cli.ts']) {
      const entry = await readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8');
      expect(verifyCliEntryBoundary(entry).failures).toEqual([]);
      expect(verifyCliEntryBoundary(`${entry}\nthrow new Error("seeded");`).failed).toBe(true);
      expect(
        verifyCliEntryBoundary(
          entry.replace('process.exitCode === undefined || process.exitCode === 0', 'true'),
        ).failed,
      ).toBe(true);
    }
    const mutant = source.replace('  let policy:', '  throw new Error("seeded");\n  let policy:');
    expect(mutant).not.toBe(source);
    expect(verifyCliErrorBoundary(mutant).failures.join('\n')).toContain(
      'outside the error boundary',
    );
  });
  it('[GATE-LOG-REDACTION] redacts every log line before it reaches stderr', () => {
    const line = formatErrorLog(
      'configuration error',
      new PolicyViolationError(ERROR_CODES.policyRootUnavailable, `cannot read ${outsidePath}`, {
        details: { root: outsidePath },
      }),
      { projectRoots: [projectRoot] },
    );
    expect(line).toBe(
      'bga-mcp configuration error [policy.root.unavailable]: cannot read [redacted-path]\n',
    );
    expect(line).not.toContain('id_ed25519');

    expect(
      formatMessageLog('protocol error', 'connection sftp://studio:hunter2@studio.example lost'),
    ).toBe('bga-mcp protocol error: connection sftp://[redacted-connection]@studio.example lost\n');

    expect(formatMessageLog('protocol error', 'token=ghp_abcdefghijklmnopqrstuvwxyz01')).toBe(
      'bga-mcp protocol error: [redacted-credential]\n',
    );

    const unexpected = formatErrorLog('shutdown error', new Error(`socket ${outsidePath} hung up`));
    expect(unexpected).toBe(
      'bga-mcp shutdown error [internal.unexpected]: The server failed unexpectedly. No further detail is safe to report.\n',
    );
  });
});
