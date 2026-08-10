import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createPolicyBoundary, STUDIO_SESSION_ENV } from '../../src/policy.js';
import { checkStudioSetup, formatStudioCheck } from '../../src/studio/check.js';

let scratch: string;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'bga-mcp-check-'));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- the name is a published constant
  delete process.env[STUDIO_SESSION_ENV];
});

describe('studio setup check', () => {
  it('[INT-STUDIO-CHECK-GUIDANCE] names one problem at a time and how to fix it', async () => {
    const offline = await checkStudioSetup(await createPolicyBoundary({}), null);
    expect(offline.ok).toBe(false);
    // One problem, not a cascade: the later checks depend on this one.
    expect(offline.lines.filter((entry) => !entry.ok)).toHaveLength(1);
    expect(offline.lines.at(-1)?.fix).toContain('--allow-network');

    const noExperiment = await checkStudioSetup(
      await createPolicyBoundary({ networkEnabled: true }),
      null,
    );
    expect(noExperiment.lines.at(-1)?.fix).toContain('--experimental-studio-logs');

    const noSession = await checkStudioSetup(
      await createPolicyBoundary({ networkEnabled: true, experimentalStudioLogs: true }),
      null,
    );
    // Says how to obtain a session, not merely that one is missing.
    expect(noSession.lines.at(-1)?.fix).toContain('developer tools');
    expect(noSession.lines.at(-1)?.fix).toContain('Cookie header');
  });

  it('[INT-STUDIO-CHECK-GUIDANCE] catches the setup that used to fail silently', async () => {
    process.env[STUDIO_SESSION_ENV] = 'PHPSESSID=example';
    const report = await checkStudioSetup(
      await createPolicyBoundary({ networkEnabled: true, experimentalStudioLogs: true }),
      null,
    );

    // No declared account returns nothing at run time, which is impossible to
    // tell from a quiet game. Here it is a sentence instead.
    expect(report.ok).toBe(false);
    expect(report.lines.at(-1)?.text).toContain('no log line could ever be returned');
    expect(report.lines.at(-1)?.fix).toContain('--studio-dev-account');
  });

  it.skipIf(process.platform === 'win32')(
    '[INT-STUDIO-CHECK-GUIDANCE] reads the session from a protected file without naming it',
    async () => {
      const file = join(scratch, 'session.txt');
      await writeFile(file, 'PHPSESSID=from-a-file\n', { mode: 0o600 });
      await chmod(file, 0o600);

      const policy = await createPolicyBoundary({
        networkEnabled: true,
        experimentalStudioLogs: true,
        studioSessionFile: file,
        studioDevAccounts: ['mytest0'],
      });
      // Trailing whitespace from an editor must not become part of the cookie.
      expect(await policy.studioSession()).toBe('PHPSESSID=from-a-file');

      const report = await checkStudioSetup(policy, null);
      expect(report.ok).toBe(true);
      // The report says which provider, never which file: this line used to
      // print the absolute path of the operator's credential, and the test of
      // the day required it to.
      expect(report.lines.some((entry) => entry.text.includes(file))).toBe(false);
      expect(report.lines.some((entry) => entry.text.includes('the configured file'))).toBe(true);
      expect(formatStudioCheck(report)).not.toContain(file);
      expect(formatStudioCheck(report)).toContain('treat the first real result as the test');

      const missingFile = await createPolicyBoundary({
        networkEnabled: true,
        experimentalStudioLogs: true,
        studioSessionFile: join(scratch, 'absent.txt'),
      });
      expect(await missingFile.studioSession()).toBeNull();
      expect(missingFile.studioSessionRefusal).toContain('could not be opened');
    },
  );

  it('[INT-STUDIO-CHECK-GUIDANCE] renders a report a person can act on', () => {
    const text = formatStudioCheck({
      ok: false,
      lines: [
        { ok: true, text: 'Network access is enabled.' },
        { ok: false, text: 'No Studio session was found.', fix: 'Set BGA_STUDIO_SESSION.' },
      ],
    });
    expect(text).toContain('ok   Network access is enabled.');
    expect(text).toContain('FAIL No Studio session was found.');
    expect(text).toContain('     Set BGA_STUDIO_SESSION.');
  });
});

describe('studio setup check against a page', () => {
  const OWN_LINE = '20/06 21:50:56 [info] [T403] [4/mytest0] 0.26 SELECT player_id FROM player';
  const OTHER_LINE = '20/06 21:51:02 [info] [T998] [77/someoneelse] /cinco/playCard.html';

  async function ready(): Promise<Awaited<ReturnType<typeof createPolicyBoundary>>> {
    process.env[STUDIO_SESSION_ENV] = 'PHPSESSID=example';
    return await createPolicyBoundary({
      networkEnabled: true,
      experimentalStudioLogs: true,
      studioDevAccounts: ['mytest0'],
    });
  }

  it('[INT-STUDIO-CHECK-PAGE] says so when the page carries no log lines at all', async () => {
    const report = await checkStudioSetup(await ready(), '1234', () =>
      Promise.resolve({
        url: 'https://studio.boardgamearena.com/studiogame',
        body: '<html><body><div id="logs"></div></body></html>',
      }),
    );

    // This is the open question about the capability, and the check answers it
    // instead of the developer running curl by hand.
    expect(report.ok).toBe(false);
    expect(report.lines.at(-1)?.text).toContain('no recognisable log lines');
    expect(report.lines.at(-1)?.fix).toContain('loaded separately');
  });

  it('[INT-STUDIO-CHECK-OWN-DATA] says none matched without naming whose lines they are', async () => {
    const report = await checkStudioSetup(await ready(), '1234', () =>
      Promise.resolve({
        url: 'https://studio.boardgamearena.com/studiogame',
        body: `<pre>${OTHER_LINE}</pre>`,
      }),
    );

    expect(report.ok).toBe(false);
    // This check used to print the names it found, which is the fastest way to
    // fix a typo and also a way to publish another developer's — or a real
    // player's — name to a terminal and every log that records it.
    const published = `${JSON.stringify(report)}\n${formatStudioCheck(report)}`;
    expect(published).not.toContain('someoneelse');
    expect(published).not.toContain('playCard');
    // Still actionable: a count separates a typo from a page with no lines,
    // and it says where the right name comes from.
    expect(report.lines.at(-1)?.text).toContain('none belong to a declared account');
    expect(report.lines.at(-1)?.fix).toContain('1 attributed line(s) were found');
    expect(report.lines.at(-1)?.fix).toContain('--studio-dev-account');
  });

  it('[INT-STUDIO-CHECK-OWN-DATA] counts your own lines and withholds the rest', async () => {
    const report = await checkStudioSetup(await ready(), '1234', () =>
      Promise.resolve({
        url: 'https://studio.boardgamearena.com/studiogame',
        body: `<pre>${OWN_LINE}\n${OTHER_LINE}\nPHP Fatal error: something exploded</pre>`,
      }),
    );

    expect(report.ok).toBe(true);
    const published = `${JSON.stringify(report)}\n${formatStudioCheck(report)}`;
    expect(published).not.toContain('someoneelse');
    expect(published).not.toContain('something exploded');
    // Nor is the developer's own line published by a check that was only asked
    // whether the setup works.
    expect(published).not.toContain('SELECT player_id');
  });

  it('[INT-STUDIO-CHECK-PAGE] reports what would be returned and what would be withheld', async () => {
    const report = await checkStudioSetup(await ready(), '1234', () =>
      Promise.resolve({
        url: 'https://studio.boardgamearena.com/studiogame',
        body: `<pre>${OWN_LINE}\n${OTHER_LINE}</pre>`,
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.lines.at(-1)?.text).toContain('1 line(s) are yours');
    expect(report.lines.at(-1)?.text).toContain('1 belong to others');
  });

  it('[INT-STUDIO-CHECK-PAGE] explains a failed retrieval as an expired session', async () => {
    const report = await checkStudioSetup(await ready(), '1234', () =>
      Promise.reject(new Error('Studio redirected the request')),
    );

    expect(report.ok).toBe(false);
    expect(report.lines.at(-1)?.fix).toContain('session has expired');
  });
});
