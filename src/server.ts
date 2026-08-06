import { McpServer } from '@modelcontextprotocol/server';

import { DEFAULT_SERVER_CONFIG, type ServerConfig } from './config.js';
import { SERVER_NAME, SERVER_VERSION } from './metadata.js';
import { PolicyBoundary } from './policy.js';

export interface ServerDependencies {
  /** The prepared policy boundary every future capability must route through. */
  readonly policy: PolicyBoundary;
}

export function createServer(
  config: ServerConfig = DEFAULT_SERVER_CONFIG,
  dependencies?: ServerDependencies,
): McpServer {
  void config;
  void dependencies;
  return new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: {} });
}

/**
 * Builds the policy boundary before any transport is served, so an invalid or
 * unavailable configuration fails at startup instead of at first use.
 */
export async function createServerWithPolicy(config: ServerConfig): Promise<{
  readonly policy: PolicyBoundary;
  readonly create: () => McpServer;
}> {
  const policy = await PolicyBoundary.create(config);
  return { policy, create: () => createServer(config, { policy }) };
}
