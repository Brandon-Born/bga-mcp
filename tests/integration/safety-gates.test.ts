// secret-scan:allow-file Seeded non-secret sample credentials that prove the scanner works.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  ALLOW_MARKER,
  SECRET_RULES,
  formatFindings,
  scanDirectory,
  scanText,
} from '../../scripts/lib/secret-scan.js';

/** Split so the literal never appears as a single token in the repository. */
const SEEDED = {
  'aws-access-key': ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
  'github-token': ['ghp', '_abcdefghijklmnopqrstuvwxyz012345'].join(''),
  'slack-token': ['xoxb', '-1234567890-abcdefghij'].join(''),
  'npm-token': ['npm', `_${'a'.repeat(36)}`].join(''),
  'private-key': '-----BEGIN OPENSSH PRIVATE KEY-----',
  'url-credential': 'sftp://studio-user:hunter2@studio.example.com/project',
  'assigned-secret': 'client_secret = s3cr3t-value-that-is-long',
  'private-key-body': `MIIE${'A'.repeat(60)}`,
} as const;

let seedRoot: string;

beforeAll(async () => {
  seedRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-safety-'));
});

afterAll(async () => {
  await rm(seedRoot, { recursive: true, force: true });
});

describe('secret and artifact safety gates', () => {
  it('[GATE-SECRET-SCAN-SOURCE] detects every known credential format without printing it', () => {
    for (const rule of SECRET_RULES) {
      const secret = SEEDED[rule.id as keyof typeof SEEDED];
      expect(secret, `no seeded value for rule ${rule.id}`).toBeDefined();
      const findings = scanText(`const value = ${secret};`, 'seeded.ts');
      expect(findings.map((finding) => finding.rule)).toContain(rule.id);
      expect(findings[0]?.line).toBe(1);

      const report = formatFindings(findings);
      expect(report).not.toContain(secret);
      expect(report).toContain('(masked)');
    }

    expect(scanText('const clean = "no credentials here";', 'clean.ts')).toEqual([]);
    expect(scanText(`// ${ALLOW_MARKER} reason\n${SEEDED['aws-access-key']}`, 'seeded.ts')).toEqual(
      [],
    );
  });

  it('[GATE-SECRET-SCAN-ARTIFACT] blocks a seeded credential in retained artifact output', async () => {
    const artifactRoot = resolve(seedRoot, 'conformance-results');
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(
      resolve(artifactRoot, 'evidence.json'),
      `${JSON.stringify({ environment: { token: SEEDED['github-token'] } })}\n`,
    );
    await writeFile(resolve(artifactRoot, 'summary.json'), `${JSON.stringify({ passed: 1 })}\n`);
    await writeFile(resolve(artifactRoot, 'image.bin'), Buffer.from([0, 1, 2, 0]));

    const findings = await scanDirectory(artifactRoot, { repositoryRoot: seedRoot });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: 'conformance-results/evidence.json',
      rule: 'github-token',
    });
    expect(formatFindings(findings)).not.toContain(SEEDED['github-token']);

    await rm(resolve(artifactRoot, 'evidence.json'));
    await expect(scanDirectory(artifactRoot, { repositoryRoot: seedRoot })).resolves.toEqual([]);
  });
});
