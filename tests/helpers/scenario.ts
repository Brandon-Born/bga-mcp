import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { connectStdio, processExists } from './mcp.js';

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? await listFiles(path) : [path];
    }),
  );
  return nested.flat().sort();
}

async function directoryDigest(directory: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of await listFiles(directory)) {
    hash.update(relative(directory, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

export async function waitForProcessExit(processId: number, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (processExists(processId) && Date.now() < deadline) {
    await new Promise((resolve_) => setTimeout(resolve_, 10));
  }
  if (processExists(processId)) {
    throw new Error(`Server process ${String(processId)} did not exit during cleanup`);
  }
}

export async function runToolScenario(options: {
  readonly command: string;
  readonly arguments: readonly string[];
  readonly toolName: string;
  readonly toolArguments: Record<string, unknown>;
  readonly expectedResult: unknown;
  readonly root: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}): Promise<void> {
  const before = await directoryDigest(options.root);
  const connection = await connectStdio(options.command, options.arguments, {
    env: { ...process.env, ...options.env },
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  const processId = connection.transport.pid;

  try {
    const tools = await connection.client.listTools();
    if (!tools.tools.some((tool) => tool.name === options.toolName)) {
      throw new Error(`Tool was not discovered: ${options.toolName}`);
    }
    const result = await connection.client.callTool(
      {
        name: options.toolName,
        arguments: options.toolArguments,
      },
      { timeout: options.timeoutMs ?? 2_000 },
    );
    if (result.isError === true) {
      throw new Error(`Tool returned an MCP error: ${JSON.stringify(result.content)}`);
    }
    if (!isDeepStrictEqual(result.content, options.expectedResult)) {
      throw new Error(`Unexpected tool response: ${JSON.stringify(result.content)}`);
    }
    const after = await directoryDigest(options.root);
    if (after !== before) {
      throw new Error('Tool changed the protected test root');
    }
  } finally {
    await connection.client.close();
    if (processId !== null) {
      await waitForProcessExit(processId);
    }
  }
}
