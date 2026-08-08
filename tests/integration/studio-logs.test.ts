import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { DEFAULT_SERVER_CONFIG } from '../../src/config.js';
import { redactText } from '../../src/redaction.js';
import { STUDIO_HOST, STUDIO_SESSION_ENV, createPolicyBoundary } from '../../src/policy.js';
import { READ_STUDIO_LOGS_TOOL, summarizeStudioLogs } from '../../src/tools/read-studio-logs.js';
import { createServerWithPolicy } from '../../src/server.js';

const SESSION = 'PHPSESSID=abcdef0123456789abcdef';

async function callTool(
  overrides: Parameters<typeof createServerWithPolicy>[0],
  argument: Record<string, unknown>,
): Promise<string> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const prepared = await createServerWithPolicy(overrides);
  const server = prepared.create();
  const client = new Client({ name: 'studio-log-test', version: '1.0.0' });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: READ_STUDIO_LOGS_TOOL, arguments: argument });
    return (result.content as { text?: string }[]).map((entry) => entry.text ?? '').join('\n');
  } finally {
    await client.close();
    await server.close();
  }
}

describe('experimental Studio log reading', () => {
  const clearSession = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- the name is a published constant
    delete process.env[STUDIO_SESSION_ENV];
  };

  afterEach(clearSession);

  it('[INT-STUDIO-SESSION-NOT-AN-ARGUMENT] takes the session from the environment and refuses without one', async () => {
    // The published schema has no session field, so a client cannot put a
    // credential in a tool call even by trying.
    const config = {
      ...DEFAULT_SERVER_CONFIG,
      networkEnabled: true,
      experimentalStudioLogs: true,
      studioDevAccounts: ['mytest0'],
    };

    clearSession();
    const missing = await callTool(config, { gameId: '1234' });
    expect(missing).toContain('policy.studio.no-session');
    expect(missing).toContain(STUDIO_SESSION_ENV);

    const rejected = await callTool(config, { gameId: '1234', session: SESSION });
    expect(rejected.toLowerCase()).toMatch(/invalid|unrecognized|schema|expected/u);
  });

  it('[INT-STUDIO-NO-PRODUCTION-LOGS] refuses while the experiment is off, whatever else is configured', async () => {
    process.env[STUDIO_SESSION_ENV] = SESSION;
    // Production errors and Sentry are never requested: the only page this
    // tool asks for is the developer's own studiogame panel, and with the
    // experiment off it does not ask for anything at all.
    const disabled = await callTool(
      {
        ...DEFAULT_SERVER_CONFIG,
        networkEnabled: true,
        experimentalStudioLogs: false,
        studioDevAccounts: ['mytest0'],
      },
      { gameId: '1234' },
    );
    expect(disabled).toContain('policy.studio.disabled');
    expect(disabled).toContain('--experimental-studio-logs');
  });

  it('[INT-STUDIO-HOST-PINNED] has one Studio host and no way for a caller to name another', async () => {
    process.env[STUDIO_SESSION_ENV] = SESSION;
    const policy = await createPolicyBoundary({
      networkEnabled: true,
      experimentalStudioLogs: true,
      studioDevAccounts: ['mytest0'],
    });

    // The host is a constant, not configuration and not an argument.
    expect(STUDIO_HOST).toBe('studio.boardgamearena.com');

    for (const path of ['../etc/passwd', '/absolute', 'a//b']) {
      await expect(policy.fetchStudioPage({ path })).rejects.toMatchObject({
        code: 'policy.studio.not-allowed',
      });
    }

    // A parameter carrying local work is refused before the request is built,
    // exactly as it is for documentation.
    await expect(
      policy.fetchStudioPage({ path: 'studiogame', params: { game: '/Users/dev/secret' } }),
    ).rejects.toMatchObject({ code: 'policy.doc-request.content' });
  });

  it('[UNIT-STUDIO-SESSION-REDACTION] removes the session value from anything published', async () => {
    process.env[STUDIO_SESSION_ENV] = SESSION;
    const policy = await createPolicyBoundary({
      networkEnabled: true,
      experimentalStudioLogs: true,
    });

    // An opaque cookie has no shape to match, so it is removed by value.
    const leaked = `request failed with cookie ${SESSION} attached`;
    const redacted = redactText(leaked, policy.redactionOptions);
    expect(redacted).not.toContain(SESSION);
    expect(redacted).toContain('[redacted-secret]');

    clearSession();
    const withoutSession = await createPolicyBoundary({ networkEnabled: true });
    expect(withoutSession.redactionOptions.secretValues).toEqual([]);
  });
});

describe('studio log summary', () => {
  it('[INT-STUDIO-SUMMARY] says what it withheld without showing any of it', () => {
    const text = summarizeStudioLogs({
      schemaVersion: 1,
      gameId: '1234',
      url: 'https://studio.boardgamearena.com/studiogame?game=1234',
      retrievedAt: '2026-08-07T00:00:00.000Z',
      lines: [
        {
          timestamp: '20/06 21:50:56',
          level: 'info',
          tableId: '403',
          actor: 'mytest0',
          message: 'SELECT player_id FROM player',
        },
      ],
      withheld: { foreign: 2, unattributable: 1, sensitive: 0 },
      ownAccounts: ['mytest0'],
      stability: 'experimental',
      notice: 'n',
    });

    expect(text).toContain('1 log line(s) for game 1234');
    expect(text).toContain('Withheld: 2 foreign, 1 unattributable.');
    // Counting is not showing: nothing about the withheld lines appears.
    expect(text).not.toContain('sensitive');
    expect(text).toContain('Experimental');
  });
});
