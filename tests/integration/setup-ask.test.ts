import { McpServer, type ServerContext } from '@modelcontextprotocol/server';

import { createPolicyBoundary } from '../../src/policy.js';
import { isSetupInputRequired, SetupAsker, splitList } from '../../src/setup/ask.js';

interface FakeClient {
  readonly capabilities: Record<string, unknown> | undefined;
  readonly reply: () => Promise<{ action: string; content?: Record<string, unknown> }>;
  asked: number;
}

/**
 * Stands in for the client half of an elicitation, which is otherwise only
 * reachable through a real connection.
 */
function serverWith(client: FakeClient): McpServer {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  Object.defineProperty(server.server, 'getClientCapabilities', {
    value: () => client.capabilities,
  });
  Object.defineProperty(server.server, 'elicitInput', {
    value: async () => {
      client.asked += 1;
      return await client.reply();
    },
  });
  return server;
}

function requestContext(
  inputResponses?: Record<string, unknown>,
  droppedInputResponseKeys?: readonly string[],
): ServerContext {
  return {
    mcpReq: {
      ...(inputResponses === undefined ? {} : { inputResponses }),
      ...(droppedInputResponseKeys === undefined ? {} : { droppedInputResponseKeys }),
    },
  } as unknown as ServerContext;
}

const ELICITING = { elicitation: {} };

describe('asking for a missing setting', () => {
  it('[INT-SETUP-ASK-ANSWERED] takes the answer and proceeds', async () => {
    const client: FakeClient = {
      capabilities: ELICITING,
      reply: () => Promise.resolve({ action: 'accept', content: { accounts: 'mytest0, mytest1' } }),
      asked: 0,
    };

    const asker = new SetupAsker('legacy');
    const outcome = await asker.askForListForRequest(
      serverWith(client),
      requestContext(),
      'accounts',
      'Which accounts?',
      'accounts',
    );

    expect(outcome).toEqual({ kind: 'answered', values: ['mytest0', 'mytest1'] });
    expect(client.asked).toBe(1);
  });

  it('[INT-SETUP-ASK-DECLINED] treats declining as an answer and does not ask again', async () => {
    const client: FakeClient = {
      capabilities: ELICITING,
      reply: () => Promise.resolve({ action: 'decline' }),
      asked: 0,
    };
    const server = serverWith(client);
    const asker = new SetupAsker('legacy');

    expect(await asker.askForList(server, 'accounts', 'Which?', 'accounts')).toEqual({
      kind: 'declined',
    });
    // Asking a second time would be nagging, so the decline is remembered.
    expect(await asker.askForList(server, 'accounts', 'Which?', 'accounts')).toEqual({
      kind: 'unsupported',
    });
    expect(client.asked).toBe(1);
    expect(asker.hasDeclined('accounts')).toBe(true);
  });

  it('[INT-SETUP-ASK-UNSUPPORTED] never depends on the client being able to ask', async () => {
    const withoutCapability: FakeClient = {
      capabilities: {},
      reply: () => Promise.resolve({ action: 'accept', content: { accounts: 'mytest0' } }),
      asked: 0,
    };
    const asker = new SetupAsker('legacy');
    expect(
      await asker.askForList(serverWith(withoutCapability), 'accounts', 'Which?', 'accounts'),
    ).toEqual({ kind: 'unsupported' });
    expect(withoutCapability.asked).toBe(0);

    // A client that claims the capability and then fails is the same case.
    const broken: FakeClient = {
      capabilities: ELICITING,
      reply: () => Promise.reject(new Error('not really supported')),
      asked: 0,
    };
    expect(await asker.askForList(serverWith(broken), 'b', 'Which?', 'accounts')).toEqual({
      kind: 'unsupported',
    });

    // On the 2026 era elicitation is a returned input-required result rather
    // than a request the server may push, so nothing is asked there yet.
    const modern = new SetupAsker('modern');
    expect(
      await modern.askForList(
        serverWith({ ...withoutCapability, capabilities: ELICITING }),
        'c',
        'Which?',
        'accounts',
      ),
    ).toEqual({ kind: 'unsupported' });
  });

  it('[INT-SETUP-ASK-ANSWERED] treats an empty or unusable answer as a decline', async () => {
    for (const content of [{ accounts: '   ' }, { accounts: '' }, {}]) {
      const client: FakeClient = {
        capabilities: ELICITING,
        reply: () => Promise.resolve({ action: 'accept', content }),
        asked: 0,
      };
      const asker = new SetupAsker('legacy');
      expect(await asker.askForList(serverWith(client), 'accounts', 'Which?', 'accounts')).toEqual({
        kind: 'declined',
      });
    }

    expect(splitList('a, b; c\nd, ,a')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('[INT-SETUP-ASK-ANSWERED] holds supplied accounts for the session without writing anything', async () => {
    const policy = await createPolicyBoundary({ studioDevAccounts: ['configured0'] });
    policy.rememberStudioAccounts(['asked0', 'configured0']);

    // Configured first, no duplicate, and the supplied one is read by the same
    // privacy rule as the configured one.
    expect(policy.studioDevAccounts).toEqual(['configured0', 'asked0']);
    // Configuration itself is untouched: nothing was persisted.
    expect(policy.config.studioDevAccounts).toEqual(['configured0']);
  });

  it('[INT-SETUP-ASK-UNSUPPORTED] returns the modern question in-band only once', async () => {
    const asker = new SetupAsker('modern');
    const server = serverWith({
      capabilities: {},
      reply: () => Promise.reject(new Error('unused modern request channel')),
      asked: 0,
    });

    const required = await asker.askForListForRequest(
      server,
      requestContext(),
      'accounts',
      'Which accounts?',
      'accounts',
    );
    expect(isSetupInputRequired(required)).toBe(true);
    expect(required).toMatchObject({
      resultType: 'input_required',
      inputRequests: {
        'setup-accounts': { method: 'elicitation/create' },
      },
    });

    for (const context of [requestContext({}), requestContext(undefined, ['setup-accounts'])]) {
      const outcome = await asker.askForListForRequest(
        server,
        context,
        'accounts',
        'Which accounts?',
        'accounts',
      );
      expect(outcome).toEqual({ kind: 'no-value' });
      expect(isSetupInputRequired(outcome)).toBe(false);
    }
  });

  it('[INT-SETUP-ASK-ANSWERED] validates modern answers before retaining them', async () => {
    const server = serverWith({
      capabilities: {},
      reply: () => Promise.reject(new Error('unused modern request channel')),
      asked: 0,
    });
    const answer = async (response: unknown) =>
      await new SetupAsker('modern').askForListForRequest(
        server,
        requestContext({ 'setup-accounts': response }),
        'accounts',
        'Which accounts?',
        'accounts',
      );

    await expect(
      answer({ action: 'accept', content: { accounts: ' mytest0; mytest1 ' } }),
    ).resolves.toEqual({ kind: 'answered', values: ['mytest0', 'mytest1'] });
    for (const response of [
      { action: 'accept', content: { accounts: '  ' } },
      { action: 'accept', content: { accounts: 3 } },
      { action: 'accept' },
    ]) {
      await expect(answer(response)).resolves.toEqual({ kind: 'no-value' });
    }
    await expect(answer({ roots: [] })).resolves.toEqual({ kind: 'unsupported' });
  });

  it('[INT-SETUP-ASK-DECLINED] remembers a modern decline without consulting later input', async () => {
    const server = serverWith({
      capabilities: {},
      reply: () => Promise.reject(new Error('unused modern request channel')),
      asked: 0,
    });
    const asker = new SetupAsker('modern');
    await expect(
      asker.askForListForRequest(
        server,
        requestContext({ 'setup-accounts': { action: 'decline' } }),
        'accounts',
        'Which accounts?',
        'accounts',
      ),
    ).resolves.toEqual({ kind: 'declined' });
    await expect(
      asker.askForListForRequest(
        server,
        requestContext({ 'setup-accounts': { action: 'accept', content: { accounts: 'later' } } }),
        'accounts',
        'Which accounts?',
        'accounts',
      ),
    ).resolves.toEqual({ kind: 'declined' });
    expect(asker.declinedAnything).toBe(true);
  });
});
