import { Client, type ClientOptions } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { StdioServerParameters } from '@modelcontextprotocol/client/stdio';

export interface McpConnection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
  readonly stderr: () => string;
}

export async function connectStdio(
  command: string,
  arguments_: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly protocolVersion?: string;
    readonly timeoutMs?: number;
    readonly clientOptions?: Omit<ClientOptions, 'versionNegotiation'>;
  } = {},
): Promise<McpConnection> {
  const versionNegotiation =
    options.protocolVersion !== undefined && options.protocolVersion !== '2025-11-25'
      ? { mode: { pin: options.protocolVersion } as const }
      : undefined;
  const client = new Client(
    { name: 'bga-mcp-test-client', version: '1.0.0' },
    options.clientOptions === undefined && versionNegotiation === undefined
      ? undefined
      : {
          ...options.clientOptions,
          ...(versionNegotiation === undefined ? {} : { versionNegotiation }),
        },
  );
  const serverParameters: StdioServerParameters = {
    command,
    args: [...arguments_],
    stderr: 'pipe',
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined
      ? {}
      : {
          env: Object.fromEntries(
            Object.entries(options.env).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          ),
        }),
  };
  const transport = new StdioClientTransport(serverParameters);
  let stderr = '';
  transport.stderr?.on('data', (chunk: unknown) => {
    stderr += String(chunk);
  });

  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('MCP connection timed out')),
      options.timeoutMs ?? 5_000,
    );
  });

  try {
    await Promise.race([client.connect(transport), timeoutPromise]);
  } catch (error) {
    await transport.close().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  return { client, transport, stderr: () => stderr };
}

export function processExists(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
