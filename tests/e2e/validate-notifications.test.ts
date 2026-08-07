import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  digestDirectory,
  expectSchemaRejections,
  installPackagedServer,
  readFixtureExpectations,
  withPackagedServer,
  type PackagedServer,
  type ToolResponse,
} from '../helpers/packaged.js';

interface NotificationResult {
  readonly schemaVersion: number;
  readonly layout: string;
  readonly serverSourcesRead: number;
  readonly clientSourcesRead: number;
  readonly trace: {
    sent: { name: string; payloadKeys: string[]; scope: string; source: string }[];
    handlers: { name: string; binding: string; payloadKeys: string[]; source: string }[];
  };
  readonly rules: { code: string; certainty: string; falsePositives: string[] }[];
  readonly diagnostics: {
    status: string;
    summary: Record<string, number>;
    findings: { kind: string; code: string; certainty: string; message: string }[];
  };
}

let server: PackagedServer<'cleangame' | 'brokengame' | 'moderngame'>;
let cleanRoot: string;
let brokenRoot: string;
let modernRoot: string;
let expectedBroken: { status: string; summary: Record<string, number>; codes: string[] };

async function callValidate(
  client: Client,
  argument: unknown,
): Promise<ToolResponse<NotificationResult>> {
  return await callTool<NotificationResult>(client, 'validate_notifications', argument);
}

async function withServer<T>(
  arguments_: readonly string[],
  use: (client: Client) => Promise<T>,
): Promise<T> {
  return (await withPackagedServer(server.cli, arguments_, use)).result;
}

beforeAll(async () => {
  server = await installPackagedServer('notifs', {
    cleangame: 'legacy',
    brokengame: 'legacy-broken',
    moderngame: 'modern',
  });
  cleanRoot = server.projects.cleangame;
  brokenRoot = server.projects.brokengame;
  modernRoot = server.projects.moderngame;
  expectedBroken = (
    await readFixtureExpectations<{
      notifications: { status: string; summary: Record<string, number>; codes: string[] };
    }>('legacy-broken')
  ).notifications;
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('packaged validate_notifications', () => {
  it('[E2E-VALIDATE-NOTIFICATIONS-CLEAN] traces a healthy notification contract both ways', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await callValidate(client, { projectRoot: cleanRoot }),
    );

    expect(response.isError).toBe(false);
    const result = response.structured;
    expect(result).toMatchObject({ schemaVersion: 1, layout: 'legacy' });
    expect(result?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
    expect(result?.trace.sent).toEqual([
      {
        name: 'playerPassed',
        payloadKeys: ['comment'],
        scope: 'all',
        source: 'bgamcplegacy.game.php',
      },
    ]);
    expect(result?.trace.handlers).toEqual([
      {
        name: 'playerPassed',
        binding: 'subscribe',
        payloadKeys: ['comment'],
        source: 'bgamcplegacy.js',
      },
    ]);
    expect(result?.serverSourcesRead).toBeGreaterThan(0);
    expect(result?.clientSourcesRead).toBeGreaterThan(0);

    for (const rule of result?.rules ?? []) {
      if (rule.certainty !== 'certain') {
        expect(rule.falsePositives.length).toBeGreaterThan(0);
      }
    }
    expect(response.text).toContain('status passed');
  });

  it('[E2E-VALIDATE-NOTIFICATIONS-SEEDED-DEFECTS] finds exactly the seeded notification defects', async () => {
    const response = await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(false);
    const diagnostics = response.structured?.diagnostics;
    expect(diagnostics?.status).toBe(expectedBroken.status);
    expect(diagnostics?.summary).toEqual(expectedBroken.summary);
    expect(diagnostics?.findings.map((finding) => finding.code)).toEqual(expectedBroken.codes);

    const duplicate = diagnostics?.findings.find(
      (finding) => finding.code === 'notification.subscription.duplicate',
    );
    expect(duplicate).toMatchObject({ kind: 'issue', certainty: 'certain' });

    const silent = diagnostics?.findings.find(
      (finding) => finding.code === 'notification.sent.not-handled',
    );
    expect(silent).toMatchObject({ kind: 'heuristic', certainty: 'likely' });
    expect(silent?.message).toContain('ghostEvent');

    expect(response.text).toContain('notification.payload.mismatch');
    expect(response.text).toContain('(likely)');
  });

  it('[E2E-VALIDATE-NOTIFICATIONS-UNTRACEABLE] never reports a clean contract it could not trace', async () => {
    const response = await withServer(
      ['--project-root', modernRoot],
      async (client) => await callValidate(client, { projectRoot: modernRoot }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured?.diagnostics.status).toBe('findings');
    expect(response.structured?.diagnostics.findings[0]).toMatchObject({
      code: 'notification.trace.unavailable',
      certainty: 'certain',
    });
  });

  it('[E2E-VALIDATE-NOTIFICATIONS-IMMUTABLE] changes nothing in the project it validates', async () => {
    const before = await digestDirectory(brokenRoot);
    await withServer(
      ['--project-root', brokenRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );
    expect(await digestDirectory(brokenRoot)).toBe(before);
  });

  it('[E2E-VALIDATE-NOTIFICATIONS-DETERMINISTIC] returns identical results for repeated calls', async () => {
    const [first, second] = await withServer(['--project-root', brokenRoot], async (client) => [
      await callValidate(client, { projectRoot: brokenRoot }),
      await callValidate(client, { projectRoot: brokenRoot }),
    ]);
    expect(JSON.stringify(first.structured)).toBe(JSON.stringify(second.structured));
  });

  it('[E2E-VALIDATE-NOTIFICATIONS-INVALID-INPUT] rejects input that does not match the published schema', async () => {
    await withServer(['--project-root', cleanRoot], async (client) => {
      await expectSchemaRejections(client, 'validate_notifications', [
        {},
        { projectRoot: 7 },
        { projectRoot: '' },
        { root: cleanRoot },
      ]);
    });
  });

  it('[E2E-VALIDATE-NOTIFICATIONS-UNLISTED-ROOT] refuses a root the server was not started with', async () => {
    const response = await withServer(
      ['--project-root', cleanRoot],
      async (client) => await callValidate(client, { projectRoot: brokenRoot }),
    );

    expect(response.isError).toBe(true);
    expect(response.text).toContain('policy.root.not-allowed');
    expect(JSON.stringify(response)).not.toContain(brokenRoot);
  });
});
