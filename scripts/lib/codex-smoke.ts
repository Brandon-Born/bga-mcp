import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

import { runCommand } from '../../tests/helpers/process.js';
import { waitForProcessExit } from '../../tests/helpers/scenario.js';

import type { SmokeClient } from './client-flow.js';

/** Documented app-server APIs drive the actual Codex MCP stack; no inference turn is started.
 * https://developers.openai.com/codex/app-server: "call a tool on a thread's configured MCP server".
 */
export async function connectCodexSmoke(
  executable: string,
  publicCommand: string,
  project: string,
  disabledServers: string[] = [],
): Promise<{
  client: SmokeClient;
  close: () => Promise<void>;
  processId: number | undefined;
  stderrSeen: () => boolean;
}> {
  const child = spawn(
    executable,
    [
      'app-server',
      '-c',
      `mcp_servers={bga={command=${JSON.stringify(publicCommand)},args=["--project-root",${JSON.stringify(project)}],required=true}}`,
      '-c',
      'features.apps=false',
      '-c',
      'features.plugins=false',
      '-c',
      'analytics.enabled=false',
      ...disabledServers.flatMap((name) => {
        assert(/^[a-zA-Z0-9_-]+$/u.test(name));
        return ['-c', `mcp_servers.${name}.enabled=false`];
      }),
    ],
    { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const exited = once(child, 'exit') as Promise<unknown[]>;
  // Never retain raw stderr or protocol transcripts: fixture responses stay in memory.
  let stderrSeen = false;
  child.stderr.on('data', () => {
    stderrSeen = true;
  });
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let nextId = 0;
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const message = JSON.parse(line) as {
      id?: number;
      method?: string;
      result?: unknown;
      error?: { message: string };
    };
    if (message.method && message.id !== undefined) {
      child.stdin.write(
        `${JSON.stringify({ id: message.id, error: { code: -32601, message: 'Interactive requests are outside this smoke flow' } })}\n`,
      );
      return;
    }
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  child.on('error', (error) => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });
  child.on('exit', () => {
    for (const waiter of pending.values())
      waiter.reject(new Error('Codex app-server exited before response'));
    pending.clear();
  });
  const request = async <T>(method: string, params: unknown): Promise<T> => {
    const id = ++nextId;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        new Promise<T>((resolve, reject) => {
          pending.set(id, { resolve: (value) => resolve(value as T), reject });
          child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Codex request timed out: ${method}`)), 30_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      pending.delete(id);
    }
  };
  const close = async () => {
    const processes = await runCommand('ps', ['-axo', 'pid=,ppid=']);
    assert.equal(processes.exitCode, 0);
    const rows = processes.stdout
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/u).map(Number));
    const descendants = new Set<number>();
    let added = true;
    while (added) {
      added = false;
      for (const [pid, parent] of rows) {
        if (
          pid !== undefined &&
          parent !== undefined &&
          !descendants.has(pid) &&
          (parent === child.pid || descendants.has(parent))
        ) {
          descendants.add(pid);
          added = true;
        }
      }
    }
    child.stdin.end();
    const shutdown = { forced: false };
    const timer = setTimeout(() => {
      shutdown.forced = true;
      child.kill('SIGTERM');
    }, 5_000);
    try {
      const [code] = await exited;
      assert(!shutdown.forced && code === 0, 'Codex did not exit cleanly');
      for (const pid of descendants) await waitForProcessExit(pid, 5_000);
    } finally {
      clearTimeout(timer);
      lines.close();
    }
  };
  try {
    await request('initialize', {
      clientInfo: { name: 'bga-client-smoke', version: '1.0.0' },
      capabilities: { experimentalApi: true, explicitGatewayOauth: true },
    });
    child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    const configuration = await request<{
      config: { mcp_servers?: Record<string, { enabled?: boolean }> };
    }>('config/read', { includeLayers: false });
    const inherited = Object.entries(configuration.config.mcp_servers ?? {})
      .filter(([name, settings]) => name !== 'bga' && settings.enabled !== false)
      .map(([name]) => name);
    if (inherited.length > 0) {
      assert(disabledServers.length === 0, 'Unable to disable inherited MCP servers');
      await close();
      return await connectCodexSmoke(executable, publicCommand, project, inherited);
    }
    const session = await request<{ thread: { id: string } }>('thread/start', {
      cwd: project,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      ephemeral: true,
    });
    const threadId = session.thread.id;
    interface Catalog {
      data: {
        name: string;
        tools: Record<string, { name: string }>;
        resources: { uri: string }[];
        toolsError?: string | null;
      }[];
      nextCursor?: string | null;
    }
    const catalog = async () => {
      const result = await request<Catalog>('mcpServerStatus/list', {
        threadId,
        serverName: 'bga',
        detail: 'full',
      });
      assert(!result.nextCursor, 'Unexpected paginated smoke catalog');
      const server = result.data.find((entry) => entry.name === 'bga');
      assert(server, 'Configured server missing');
      assert(!server.toolsError, 'Codex tool discovery failed');
      return server;
    };
    const client: SmokeClient = {
      listTools: async () => Object.values((await catalog()).tools).map((tool) => tool.name),
      listResources: async () => (await catalog()).resources.map((resource) => resource.uri),
      callTool: async (tool, args) =>
        await request('mcpServer/tool/call', { threadId, server: 'bga', tool, arguments: args }),
      readResource: async (uri) =>
        await request('mcpServer/resource/read', { threadId, server: 'bga', uri }),
    };
    return { client, close, processId: child.pid, stderrSeen: () => stderrSeen };
  } catch (error) {
    await close();
    throw error;
  }
}
