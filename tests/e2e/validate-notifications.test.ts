import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  deriveProject,
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
    sent: {
      name: string;
      payloadKeys: string[];
      payloadShape: string;
      scope: string;
      source: string;
    }[];
    handlers: { name: string; binding: string; payloadKeys: string[]; source: string }[];
  };
  readonly rules: { code: string; certainty: string; falsePositives: string[] }[];
  readonly diagnostics: {
    status: string;
    summary: Record<string, number>;
    findings: { kind: string; code: string; certainty: string; message: string }[];
  };
}

let server: PackagedServer<
  | 'cleangame'
  | 'brokengame'
  | 'moderngame'
  | 'moderncleangame'
  | 'stateclassgame'
  | 'hybridgame'
  | 'unreadablegame'
>;
let cleanRoot: string;
let brokenRoot: string;
let modernRoot: string;
let modernCleanRoot: string;
let hybridRoot: string;
let unreadableRoot: string;
let stateClassRoot: string;
let oneSidedRoot: string;
let expectedModern: { status: string; summary: Record<string, number>; codes: string[] } =
  {} as never;
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
    moderngame: 'modern-broken',
    moderncleangame: 'modern',
    hybridgame: 'hybrid',
    unreadablegame: 'modern-unreadable',
    stateclassgame: 'modern-state-classes',
  });
  cleanRoot = server.projects.cleangame;
  brokenRoot = server.projects.brokengame;
  modernRoot = server.projects.moderngame;
  modernCleanRoot = server.projects.moderncleangame;
  hybridRoot = server.projects.hybridgame;
  unreadableRoot = server.projects.unreadablegame;
  stateClassRoot = server.projects.stateclassgame;
  oneSidedRoot = await deriveProject(server, modernCleanRoot, 'onesided', ['modules/js']);
  expectedBroken = (
    await readFixtureExpectations<{
      notifications: { status: string; summary: Record<string, number>; codes: string[] };
    }>('legacy-broken')
  ).notifications;
  expectedModern = (
    await readFixtureExpectations<{
      notifications: { status: string; summary: Record<string, number>; codes: string[] };
    }>('modern-broken')
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
        payloadShape: 'known',
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
      ['--project-root', oneSidedRoot],
      async (client) => await callValidate(client, { projectRoot: oneSidedRoot }),
    );

    // The readers understand this layout; the project is simply missing one
    // side of the contract, and that is reported rather than passed.
    expect(response.isError).toBe(false);
    expect(response.structured?.diagnostics.status).toBe('findings');
    expect(response.structured?.diagnostics.findings[0]?.message).toContain(
      'no readable client source',
    );
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
        // An omitted projectRoot now means the sole configured root, so it is
        // valid input rather than malformed; the refusals are proven by the
        // default-root scenarios.
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

  it('[E2E-VALIDATE-NOTIFICATIONS-MODERN-CLEAN] passes a modern project built to the documented shapes', async () => {
    const response = await withServer(
      ['--project-root', modernCleanRoot],
      async (client) => await callValidate(client, { projectRoot: modernCleanRoot }),
    );

    expect(response.isError).toBe(false);
    const structured = response.structured;
    expect(structured?.layout).toBe('modern');
    expect(structured?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
    expect(structured?.trace.sent.map((entry) => entry.name)).toEqual(['playerPassed']);
    expect(structured?.trace.handlers.map((entry) => entry.binding)).toEqual(['method']);
  });

  it('[E2E-VALIDATE-NOTIFICATIONS-MODERN-DEFECTS] finds exactly the defects the modern broken fixture declares', async () => {
    const response = await withServer(
      ['--project-root', modernRoot],
      async (client) => await callValidate(client, { projectRoot: modernRoot }),
    );

    expect(response.isError).toBe(false);
    expect(response.structured?.diagnostics.status).toBe(expectedModern.status);
    expect(response.structured?.diagnostics.summary).toEqual(expectedModern.summary);
    expect(response.structured?.diagnostics.findings.map((finding) => finding.code)).toEqual(
      expectedModern.codes,
    );
  });
  it('[E2E-VALIDATE-NOTIFICATIONS-STATE-CLASSES] reads the state-class shortcut, the registration, and the types the framework predefines', async () => {
    const response = await withServer(
      ['--project-root', stateClassRoot],
      async (client) => await callValidate(client, { projectRoot: stateClassRoot }),
    );

    expect(response.isError).toBe(false);
    const structured = response.structured;

    // Regression, observed through the installed package: `$this->notif->all`
    // in a state class was ignored, so its handler looked unsent.
    expect(structured?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
    expect(structured?.trace.sent.map((entry) => entry.name).sort()).toEqual([
      'message',
      'tokenChosen',
    ]);
    // `message` is a predefined type that "shows on players log and have no
    // other effect", so sending it without a handler is not a defect.
    expect(structured?.trace.handlers.map((entry) => entry.name)).toEqual(['tokenChosen']);
  });
  it('[E2E-VALIDATE-NOTIFICATIONS-HYBRID] reads a part-migrated project through the public boundary', async () => {
    const response = await withServer(
      ['--project-root', hybridRoot],
      async (client) => await callValidate(client, { projectRoot: hybridRoot }),
    );

    expect(response.isError).toBe(false);
    // Nothing in the hybrid fixture is a defect: its metadata, client and one
    // state are still in the older form while its game logic and another state
    // have moved, and every capability must read that as one project.
    expect(response.structured?.layout).toBe('hybrid');
    expect(response.structured?.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });
  });
  it('[E2E-VALIDATE-NOTIFICATIONS-UNSUPPORTED-SYNTAX] reports a computed notification type rather than guessing at it', async () => {
    const response = await withServer(
      ['--project-root', unreadableRoot],
      async (client) => await callValidate(client, { projectRoot: unreadableRoot }),
    );

    expect(response.isError).toBe(false);
    const findings = response.structured?.diagnostics.findings ?? [];

    // The result is the reader stating its own limit, and nothing else: no
    // certain claim is derived from what it could not read.
    expect(response.structured?.diagnostics.status).toBe('unsupported');
    expect(findings.map((finding) => finding.code)).toEqual(['notification.unsupported-syntax']);
    expect(findings.every((finding) => finding.kind === 'unsupported-syntax')).toBe(true);
    expect(findings[0]?.message.length).toBeGreaterThan(20);
  });
});
