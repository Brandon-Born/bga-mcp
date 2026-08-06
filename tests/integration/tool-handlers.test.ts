import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { DEFAULT_SERVER_CONFIG } from '../../src/config.js';
import { createServerWithPolicy } from '../../src/server.js';

const projectsRoot = fileURLToPath(new URL('../fixtures/projects/', import.meta.url));
const legacyRoot = resolve(projectsRoot, 'legacy');
const brokenRoot = resolve(projectsRoot, 'legacy-broken');
const modernRoot = resolve(projectsRoot, 'modern');

interface CallOutcome {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: Record<string, unknown> | undefined;
}

async function withClient<T>(
  roots: readonly string[],
  use: (
    call: (tool: string, arguments_: Record<string, unknown>) => Promise<CallOutcome>,
  ) => Promise<T>,
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const prepared = await createServerWithPolicy({ ...DEFAULT_SERVER_CONFIG, projectRoots: roots });
  const server = prepared.create();
  const client = new Client({ name: 'tool-handler-test', version: '1.0.0' });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return await use(async (tool, arguments_) => {
      const result = await client.callTool({ name: tool, arguments: arguments_ });
      const content = result.content as { text?: string }[];
      return {
        isError: result.isError === true,
        text: content.map((entry) => entry.text ?? '').join('\n'),
        structured: result.structuredContent as Record<string, unknown> | undefined,
      };
    });
  } finally {
    await client.close();
    await server.close();
  }
}

describe('tool handlers over a real client connection', () => {
  it('returns the project model and its text summary', async () => {
    await withClient([legacyRoot], async (call) => {
      const outcome = await call('inspect_project', { projectRoot: legacyRoot });
      expect(outcome.isError).toBe(false);
      expect(outcome.structured).toMatchObject({ layout: 'legacy', gameKey: 'bgamcplegacy' });
      expect(outcome.text).toContain('legacy layout (certain)');
      expect(outcome.text).toContain('Components present:');
      expect(outcome.text).toContain('States: 3 definitions with 2 transitions');
    });
  });

  it('summarizes a project whose states cannot be read', async () => {
    await withClient([modernRoot], async (call) => {
      const outcome = await call('inspect_project', { projectRoot: modernRoot });
      expect(outcome.text).toContain('States: not readable');

      const validation = await call('validate_state_machine', { projectRoot: modernRoot });
      expect(validation.structured).toMatchObject({ statesRead: false, stateCount: 0 });
      expect(validation.text).toContain('status unsupported');
    });
  });

  it('lists every seeded defect in the validation summary text', async () => {
    await withClient([brokenRoot], async (call) => {
      const outcome = await call('validate_state_machine', { projectRoot: brokenRoot });
      expect(outcome.isError).toBe(false);
      expect(outcome.text).toContain('1 errors, 8 warnings');
      expect(outcome.text).toContain('state.transition.target-exists');
      expect(outcome.text).toContain('(likely)');
      expect(outcome.structured).toMatchObject({ phpSourcesRead: 7, stateCount: 4 });
    });
  });

  it('publishes a stable error for a root the server does not allow', async () => {
    await withClient([legacyRoot], async (call) => {
      for (const tool of ['inspect_project', 'validate_state_machine']) {
        const outcome = await call(tool, { projectRoot: brokenRoot });
        expect(outcome.isError).toBe(true);
        expect(outcome.text).toContain('policy.root.not-allowed');
        expect(outcome.text).not.toContain(brokenRoot);
        expect(outcome.structured).toBeUndefined();
      }
    });
  });

  it('refuses a result that exceeds the configured output budget', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const prepared = await createServerWithPolicy({
      ...DEFAULT_SERVER_CONFIG,
      projectRoots: [legacyRoot],
      maxOutputBytes: 128,
    });
    const server = prepared.create();
    const client = new Client({ name: 'budget-test', version: '1.0.0' });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: 'validate_state_machine',
        arguments: { projectRoot: legacyRoot },
      });
      expect(result.isError).toBe(true);
      expect((result.content as { text?: string }[])[0]?.text).toContain('policy.output.too-large');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
