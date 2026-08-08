import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createPolicyBoundary, STUDIO_SESSION_ENV } from '../../src/policy.js';
import { buildSetupStatus } from '../../src/setup/status.js';
import { summarizeSetup } from '../../src/tools/check-setup.js';

const SESSION = 'PHPSESSID=abcdef0123456789';

let projectRoot: string;

beforeAll(async () => {
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'bga-mcp-setup-')));
  projectRoot = resolve(scratch, 'game');
  await mkdir(projectRoot, { recursive: true });
  await writeFile(resolve(projectRoot, 'gameinfos.inc.php'), '<?php\n$gameinfos = [];\n');
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- the name is a published constant
  delete process.env[STUDIO_SESSION_ENV];
});

function codes(findings: readonly { code: string }[]): string[] {
  return findings.map((entry) => entry.code);
}

describe('setup status', () => {
  it('[INT-SETUP-STATUS] names what is missing and what to do about it', async () => {
    const status = await buildSetupStatus(await createPolicyBoundary({}));

    expect(status.ready).toBe(false);
    expect(codes(status.findings)).toContain('project.roots.none');
    const roots = status.findings.find((entry) => entry.code === 'project.roots.none');
    // Both ways out, because a client-offered root is now one of them.
    expect(roots?.nextAction).toContain('--project-root');
    expect(roots?.nextAction).toContain('advertises its open folders');

    // A capability that is off is reported as off with the flag that enables
    // it, rather than omitted: a reader cannot ask about what they were never
    // told exists.
    const network = status.findings.find((entry) => entry.code === 'network.disabled');
    expect(network?.status).toBe('unavailable');
    expect(network?.nextAction).toContain('--allow-network');
    expect(codes(status.findings)).toContain('studio.disabled');
  });

  it('[INT-SETUP-STATUS] is ready when the local capabilities can work, whatever is switched off', async () => {
    const status = await buildSetupStatus(
      await createPolicyBoundary({ projectRoots: [projectRoot] }),
    );

    // Optional things being off is not a problem to solve.
    expect(status.ready).toBe(true);
    expect(codes(status.findings)).toContain('project.roots.available');
    expect(status.findings.filter((entry) => entry.status === 'action-needed')).toEqual([]);
  });

  it('[INT-SETUP-STATUS] counts a client-offered root as a root', async () => {
    const policy = await createPolicyBoundary({});
    policy.setClientRootsProvider(() => Promise.resolve([projectRoot]));

    const status = await buildSetupStatus(policy);
    expect(status.ready).toBe(true);
    expect(codes(status.findings)).toContain('project.roots.available');
  });

  it('[INT-SETUP-NO-CREDENTIALS] says whether a session exists, never what it is', async () => {
    process.env[STUDIO_SESSION_ENV] = SESSION;
    const withSession = await buildSetupStatus(
      await createPolicyBoundary({
        projectRoots: [projectRoot],
        experimentalStudioLogs: true,
        studioDevAccounts: ['mytest0'],
      }),
    );

    expect(codes(withSession.findings)).toContain('studio.session.present');
    // The whole report, serialized, must not contain the value.
    expect(JSON.stringify(withSession)).not.toContain(SESSION);
    expect(JSON.stringify(withSession)).not.toContain('PHPSESSID');

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- the name is a published constant
    delete process.env[STUDIO_SESSION_ENV];
    const without = await buildSetupStatus(
      await createPolicyBoundary({ projectRoots: [projectRoot], experimentalStudioLogs: true }),
    );
    expect(codes(without.findings)).toContain('studio.session.missing');
    expect(codes(without.findings)).toContain('studio.accounts.none');
    expect(without.ready).toBe(false);
  });

  it('[INT-SETUP-STATUS] renders a summary that leads with the answer', () => {
    const text = summarizeSetup({
      schemaVersion: 1,
      ready: false,
      findings: [
        { code: 'a', status: 'ok', summary: 'Fine.' },
        { code: 'b', status: 'action-needed', summary: 'Missing.', nextAction: 'Do this.' },
        { code: 'c', status: 'unavailable', summary: 'Off.' },
      ],
    });

    expect(text.split('\n')[0]).toContain('needs something');
    expect(text).toContain('[ok] Fine.');
    expect(text).toContain('[todo] Missing.');
    expect(text).toContain('Do this.');
    expect(text).toContain('[off] Off.');
  });
});
