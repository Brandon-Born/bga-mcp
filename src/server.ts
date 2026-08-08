import { fileURLToPath } from 'node:url';

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
import { registerReadStudioLogs } from './tools/read-studio-logs.js';
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
  registerReadStudioLogs(server, dependencies.policy);
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
  readonly create: (context?: { readonly era?: 'legacy' | 'modern' }) => McpServer;
}> {
  const policy = await PolicyBoundary.create(config);
  const ruleCatalog = JSON.parse(
    await policy.readPackagedConfig('rule-catalog.json'),
  ) as RuleCatalog;

  return {
    policy,
    create: (context) => {
      const server = createServer(config, { policy, ruleCatalog });
      wireClientRoots(server, policy, context?.era ?? 'legacy');
      return server;
    },
  };
}

/**
 * Lets the client tell the server which projects it has open.
 *
 * This is the difference between a developer editing a launcher configuration
 * file and one that simply works, so it is worth the era handling below.
 *
 * `roots/list` is a server-to-client request on the 2025 era. On 2026-07-28 it
 * was deprecated (SEP-2577) and the SDK throws rather than sending it: there,
 * roots arrive through the multi-round-trip input-required flow instead, which
 * a capability has to ask for in its own result. So the push-style adoption
 * below is wired only on the era that supports it, and the newer era keeps the
 * existing behaviour — an explicit root — until that flow is built.
 */
function wireClientRoots(
  server: McpServer,
  policy: PolicyBoundary,
  era: 'legacy' | 'modern',
): void {
  if (era !== 'legacy') {
    return;
  }

  policy.setClientRootsProvider(async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated on the 2026 era only, and this path is legacy-only by construction
    const capabilities = server.server.getClientCapabilities();
    if (capabilities?.roots === undefined) {
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- same: roots/list is a wire request on the era this branch serves
    const listed = await server.server.listRoots();
    return listed.roots
      .map((root) => root.uri)
      .filter((uri) => uri.startsWith('file://'))
      .map((uri) => fileURLToPath(uri));
  });

  // A client that opens another project mid-session should not have to
  // reconnect for the server to notice.
  server.server.setNotificationHandler('notifications/roots/list_changed', () => {
    policy.invalidateClientRoots();
  });
}
