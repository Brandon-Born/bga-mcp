import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

/**
 * The rules every project tool shares.
 *
 * A guarantee that holds for `inspect_project` and nowhere else is not a
 * guarantee. These scenarios call each tool that takes a project and assert
 * the same thing of all of them: a refusal names its stable code and no
 * absolute path, a successful result carries no absolute path either, and an
 * omitted `projectRoot` resolves or refuses the same way everywhere.
 */

/** Every tool whose input takes a project root. */
const PROJECT_TOOLS = [
  'inspect_project',
  'validate_state_machine',
  'validate_action_contracts',
  'validate_notifications',
  'audit_database_usage',
  'validate_project',
  'run_pre_release_audit',
] as const;

let server: PackagedServer<'cleangame' | 'othergame'>;
let cleanRoot: string;
let otherRoot: string;

async function withServer<T>(
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<T> {
  return (await withPackagedServer(server.cli, arguments_, use)).result;
}

beforeAll(async () => {
  server = await installPackagedServer('toolboundary', {
    cleangame: 'legacy',
    othergame: 'modern',
  });
  cleanRoot = server.projects.cleangame;
  otherRoot = server.projects.othergame;
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('packaged project tools share one boundary', () => {
  it('[E2E-TOOLS-REDACTION] refuses an unlisted root and returns no absolute path from any tool', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      for (const name of PROJECT_TOOLS) {
        const refused = await callTool(client, name, { projectRoot: otherRoot });
        expect(refused.isError, name).toBe(true);
        expect(refused.text, name).toContain('policy.root.not-allowed');
        // The refusal says what the rule is without echoing where the caller
        // pointed, which is the path an error message most easily leaks.
        expect(JSON.stringify(refused), name).not.toContain(otherRoot);

        const allowed = await callTool(client, name, { projectRoot: cleanRoot });
        expect(allowed.isError, name).toBe(false);
        // A successful result is project-relative throughout: the configured
        // root is where the caller's machine stops being anybody's business.
        expect(JSON.stringify(allowed), name).not.toContain(cleanRoot);
      }
    });
  });

  it('[E2E-TOOLS-DEFAULT-ROOT] resolves or refuses an omitted projectRoot the same way in every tool', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      for (const name of PROJECT_TOOLS) {
        const omitted = await callTool(client, name, {});
        const explicit = await callTool(client, name, { projectRoot: cleanRoot });
        expect(omitted.isError, name).toBe(false);
        // The sole configured root is what an omitted argument means, so the
        // two calls are the same call.
        expect(JSON.stringify(omitted.structured), name).toBe(JSON.stringify(explicit.structured));
      }
    });

    await withServer(['--project-root', cleanRoot, '--project-root', otherRoot], async (client) => {
      for (const name of PROJECT_TOOLS) {
        const ambiguous = await callTool(client, name, {});
        expect(ambiguous.isError, name).toBe(true);
        expect(ambiguous.text, name).toContain('resource.project.ambiguous');
      }
    });
  });
});
