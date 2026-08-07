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

  it('reads a modern project through the same tools', async () => {
    await withClient([modernRoot], async (call) => {
      const outcome = await call('inspect_project', { projectRoot: modernRoot });
      expect(outcome.text).toContain('States: 3 definitions');

      const validation = await call('validate_state_machine', { projectRoot: modernRoot });
      expect(validation.structured).toMatchObject({ statesRead: true, stateCount: 3 });
      expect(validation.text).toContain('status passed');
    });
  });

  it('lists every seeded defect in the validation summary text', async () => {
    await withClient([brokenRoot], async (call) => {
      const outcome = await call('validate_state_machine', { projectRoot: brokenRoot });
      expect(outcome.isError).toBe(false);
      expect(outcome.text).toContain('1 errors, 7 warnings');
      expect(outcome.text).toContain('state.transition.target-exists');
      expect(outcome.text).toContain('(likely)');
      expect(outcome.structured).toMatchObject({ phpSourcesRead: 7, stateCount: 4 });

      const contracts = await call('validate_action_contracts', { projectRoot: brokenRoot });
      expect(contracts.text).toContain('3 client calls, 1 entry points');
      expect(contracts.text).toContain('action.argument.mismatch');
    });
  });

  it('traces action contracts, notifications, and database usage in one connection', async () => {
    await withClient([brokenRoot], async (call) => {
      const actions = await call('validate_action_contracts', { projectRoot: brokenRoot });
      expect(actions.isError).toBe(false);
      expect(actions.text).toContain('3 client calls, 1 entry points');
      expect(actions.text).toContain('action.name.convention');

      const notifications = await call('validate_notifications', { projectRoot: brokenRoot });
      expect(notifications.text).toContain('2 sent, 2 handlers');
      expect(notifications.text).toContain('notification.subscription.duplicate');

      const database = await call('audit_database_usage', { projectRoot: brokenRoot });
      expect(database.text).toContain('1 declared tables, 3 readable queries');
      expect(database.text).toContain('database.table.undeclared');
    });
  });

  it('aggregates every validator, honours group selection, and bounds the result', async () => {
    await withClient([brokenRoot], async (call) => {
      const everything = await call('validate_project', { projectRoot: brokenRoot });
      expect(everything.isError).toBe(false);
      expect(everything.text).toContain('status findings');
      expect(everything.structured).toMatchObject({ status: 'findings' });

      const selected = await call('validate_project', {
        projectRoot: brokenRoot,
        groups: ['state-machine'],
      });
      expect(selected.text).toContain('database: skipped');

      const bounded = await call('validate_project', { projectRoot: brokenRoot, maxFindings: 1 });
      expect(bounded.text).toContain('findings were omitted');
      expect(
        (bounded.structured as { diagnostics: { findings: unknown[] } }).diagnostics.findings,
      ).toHaveLength(1);
    });
  });

  it('audits a project against the catalogued pre-release checks', async () => {
    await withClient([brokenRoot], async (call) => {
      const outcome = await call('run_pre_release_audit', { projectRoot: brokenRoot });
      expect(outcome.isError).toBe(false);
      expect(outcome.text).toContain('rule catalog');
      expect(outcome.text).toContain('manual-required');
      expect(outcome.text).toContain('never counted as passed');

      const result = outcome.structured as unknown as {
        catalogVersion: string;
        counts: Record<string, number>;
        checks: { id: string; outcome: string }[];
      };
      expect(result.catalogVersion).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(result.counts['manual-required']).toBeGreaterThan(0);
      expect(result.counts.failed).toBeGreaterThan(0);
      expect(
        result.checks
          .filter((check) => check.id.startsWith('manual.'))
          .every((check) => check.outcome === 'manual-required'),
      ).toBe(true);
    });
  });

  it('reports a clean project as passed across every validator', async () => {
    await withClient([legacyRoot], async (call) => {
      const outcome = await call('validate_project', { projectRoot: legacyRoot });
      expect(outcome.structured).toMatchObject({ status: 'passed' });
      expect(outcome.text).toContain('status passed');
    });
  });

  it('publishes a stable error for a root the server does not allow', async () => {
    await withClient([legacyRoot], async (call) => {
      for (const tool of [
        'inspect_project',
        'validate_state_machine',
        'validate_action_contracts',
        'validate_notifications',
        'audit_database_usage',
        'validate_project',
        'run_pre_release_audit',
        // search_bga_docs is not here: it takes no projectRoot, because it
        // reads documentation rather than a project.
      ]) {
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
