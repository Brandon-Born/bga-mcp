import { McpServer } from '@modelcontextprotocol/server';

import { DEFAULT_SERVER_CONFIG, type ServerConfig } from './config.js';
import { SERVER_NAME, SERVER_VERSION } from './metadata.js';
import { PolicyBoundary } from './policy.js';
import { registerDocumentationResources } from './resources/docs-resources.js';
import { registerProjectResources } from './resources/project-resources.js';
import type { RuleCatalog } from './rules/pre-release.js';
import { registerRunPreReleaseAudit } from './tools/run-pre-release-audit.js';
import { registerAuditDatabaseUsage } from './tools/audit-database-usage.js';
import { registerInspectProject } from './tools/inspect-project.js';
import { registerSearchBgaDocs } from './tools/search-bga-docs.js';
import { registerValidateActionContracts } from './tools/validate-action-contracts.js';
import { registerValidateNotifications } from './tools/validate-notifications.js';
import { registerValidateProject } from './tools/validate-project.js';
import { registerValidateStateMachine } from './tools/validate-state-machine.js';

export interface ServerDependencies {
  /** The prepared policy boundary every capability must route through. */
  readonly policy: PolicyBoundary;
  /** The pre-release checks shipped with the package. */
  readonly ruleCatalog: RuleCatalog;
}

export function createServer(config: ServerConfig, dependencies: ServerDependencies): McpServer {
  void config;
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );
  registerInspectProject(server, dependencies.policy);
  registerValidateStateMachine(server, dependencies.policy);
  registerValidateActionContracts(server, dependencies.policy);
  registerValidateNotifications(server, dependencies.policy);
  registerAuditDatabaseUsage(server, dependencies.policy);
  registerValidateProject(server, dependencies.policy);
  // Advertised whether or not the network is enabled: the tool exists, and
  // without --allow-network every call refuses with the same stable code.
  registerSearchBgaDocs(server, dependencies.policy);
  registerProjectResources(server, dependencies.policy);
  registerDocumentationResources(server, dependencies.policy);
  registerRunPreReleaseAudit(server, dependencies.policy, dependencies.ruleCatalog);
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
  const ruleCatalog = JSON.parse(
    await policy.readPackagedConfig('rule-catalog.json'),
  ) as RuleCatalog;
  return { policy, create: () => createServer(config, { policy, ruleCatalog }) };
}
