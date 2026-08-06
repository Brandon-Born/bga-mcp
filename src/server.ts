import { McpServer } from '@modelcontextprotocol/server';

import { DEFAULT_SERVER_CONFIG, type ServerConfig } from './config.js';
import { SERVER_NAME, SERVER_VERSION } from './metadata.js';
import { PolicyBoundary } from './policy.js';
import { registerInspectProject } from './tools/inspect-project.js';
import { registerValidateActionContracts } from './tools/validate-action-contracts.js';
import { registerValidateNotifications } from './tools/validate-notifications.js';
import { registerValidateStateMachine } from './tools/validate-state-machine.js';

export interface ServerDependencies {
  /** The prepared policy boundary every capability must route through. */
  readonly policy: PolicyBoundary;
}

export function createServer(config: ServerConfig, dependencies: ServerDependencies): McpServer {
  void config;
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );
  registerInspectProject(server, dependencies.policy);
  registerValidateStateMachine(server, dependencies.policy);
  registerValidateActionContracts(server, dependencies.policy);
  registerValidateNotifications(server, dependencies.policy);
  return server;
}

/** Builds a server with default, fully restrictive configuration. */
export async function createDefaultServer(): Promise<McpServer> {
  return (await createServerWithPolicy(DEFAULT_SERVER_CONFIG)).create();
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
