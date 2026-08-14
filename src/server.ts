import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/server';

import { DEFAULT_SERVER_CONFIG, type ServerConfig } from './config.js';
import { SERVER_NAME, SERVER_VERSION } from './metadata.js';
import { PolicyBoundary } from './policy.js';
import {
  parseReleaseInventory,
  releaseIncludes,
  type ReleaseInventory,
  type ServerProfile,
} from './release.js';
import { registerDocumentationResources } from './resources/docs-resources.js';
import { registerProjectResources } from './resources/project-resources.js';
import type { RuleCatalog } from './rules/pre-release.js';
import { registerRunPreReleaseAudit } from './tools/run-pre-release-audit.js';
import { registerAuditDatabaseUsage } from './tools/audit-database-usage.js';
import { SetupAsker } from './setup/ask.js';
import { registerCheckSetup } from './tools/check-setup.js';
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
  /** Undefined for development; otherwise the only capabilities a release may advertise. */
  readonly releaseInventory?: ReleaseInventory;
}

export function createServer(
  config: ServerConfig,
  dependencies: ServerDependencies,
  era: 'legacy' | 'modern' = 'legacy',
): McpServer {
  void config;
  // One asker per connection, so a developer who declines is not asked again
  // until they start a new session.
  const asker = new SetupAsker(era);
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      ...(dependencies.releaseInventory === undefined
        ? {}
        : {
            supportedProtocolVersions: [...dependencies.releaseInventory.protocolVersions],
          }),
    },
  );
  // First, because it is what a caller reaches for when something refuses.
  const included = (kind: 'tools' | 'resources' | 'prompts', name: string): boolean =>
    releaseIncludes(dependencies.releaseInventory, kind, name);

  if (included('tools', 'check_setup')) registerCheckSetup(server, dependencies.policy, era);
  if (included('tools', 'inspect_project'))
    registerInspectProject(server, dependencies.policy, era);
  if (included('tools', 'validate_state_machine'))
    registerValidateStateMachine(server, dependencies.policy, era);
  if (included('tools', 'validate_action_contracts'))
    registerValidateActionContracts(server, dependencies.policy, era);
  if (included('tools', 'validate_notifications'))
    registerValidateNotifications(server, dependencies.policy, era);
  if (included('tools', 'audit_database_usage'))
    registerAuditDatabaseUsage(server, dependencies.policy, era);
  if (included('tools', 'validate_project'))
    registerValidateProject(server, dependencies.policy, era);
  // Advertised whether or not the network is enabled: the tool exists, and
  // without --allow-network every call refuses with the same stable code.
  if (included('tools', 'search_bga_docs')) registerSearchBgaDocs(server, dependencies.policy);
  if (included('tools', 'read_studio_logs'))
    registerReadStudioLogs(server, dependencies.policy, asker);
  if (
    included('resources', 'bga://project/summary') ||
    included('resources', 'bga://project/states') ||
    included('resources', 'bga://project/diagnostics')
  ) {
    registerProjectResources(server, dependencies.policy, era);
  }
  if (
    included('resources', 'bga://docs/{topic}') ||
    included('resources', 'bga://framework/version')
  ) {
    registerDocumentationResources(server, dependencies.policy);
  }
  if (included('tools', 'run_pre_release_audit'))
    registerRunPreReleaseAudit(server, dependencies.policy, dependencies.ruleCatalog, era);
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
export async function createServerWithPolicy(
  config: ServerConfig,
  profile: ServerProfile = 'development',
): Promise<{
  readonly policy: PolicyBoundary;
  readonly create: (context?: { readonly era?: 'legacy' | 'modern' }) => McpServer;
}> {
  const policy = await PolicyBoundary.create(config);
  const ruleCatalog = JSON.parse(
    await policy.readPackagedConfig('rule-catalog.json'),
  ) as RuleCatalog;
  const releaseInventory =
    profile === 'development'
      ? undefined
      : parseReleaseInventory(JSON.parse(await policy.readPackagedConfig('release.json')));

  return {
    policy,
    create: (context) => {
      const era = context?.era ?? 'legacy';
      const server = createServer(
        config,
        {
          policy,
          ruleCatalog,
          ...(releaseInventory === undefined ? {} : { releaseInventory }),
        },
        era,
      );
      wireClientRoots(server, policy, era);
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
 * below is wired only on the era that supports it; modern handlers return that
 * in-band request from `resolveProjectRootForRequest`.
 */
function wireClientRoots(
  server: McpServer,
  policy: PolicyBoundary,
  era: 'legacy' | 'modern',
): void {
  if (era !== 'legacy') {
    return;
  }

  policy.setClientRootsProvider(async (signal) => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated on the 2026 era only, and this path is legacy-only by construction
    const capabilities = server.server.getClientCapabilities();
    if (capabilities?.roots === undefined) {
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- same: roots/list is a wire request on the era this branch serves
    const listed = await server.server.listRoots(
      undefined,
      signal === undefined ? undefined : { signal },
    );
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
