import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  callTool,
  digestDirectory,
  expectSchemaRejections,
  installPackagedServer,
  withPublicPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

interface Result {
  readonly trace?: {
    readonly gameMethods?: readonly string[];
    readonly handlers?: readonly {
      name: string;
      payloadKeys: readonly string[];
      binding: string;
    }[];
    readonly sent?: readonly { name: string; payloadKeys: readonly string[] }[];
  };
  readonly diagnostics: {
    readonly findings: readonly { code: string; kind: string }[];
    readonly summary: { unsupported: number };
  };
}
interface Audit {
  readonly checks: readonly { id: string; outcome: string }[];
  readonly counts: { unsupported: number };
}
let server: PackagedServer<'negative' | 'positive' | 'unknown' | 'legacy' | 'unknownphp'>;
beforeAll(async () => {
  server = await installPackagedServer('executable-contracts', {
    negative: 'comment-contract-reproduction',
    positive: 'comment-contract-controls',
    unknown: 'comment-contract-reproduction',
    legacy: 'legacy',
    unknownphp: 'legacy',
  });
  await writeFile(
    resolve(server.projects.legacy, 'bgamcplegacy.game.php'),
    `<?php
class BgaMcpLegacy extends Table {
  public function stGameSetup() {}
  public function stGameEnd() {}
  /* public function actPass($comment) {} */
}`,
  );
  await writeFile(
    resolve(server.projects.unknownphp, 'bgamcplegacy.game.php'),
    `<?php
class BgaMcpLegacy extends Table {
  public function stGameSetup() {}
  public function stGameEnd() {}
  /* unterminated public function actPass($comment) {}
`,
  );
  await writeFile(
    resolve(server.projects.unknown, 'modules/js/Game.js'),
    'export class Game { notif_markerChanged(args: string) {} }',
  );
}, 240_000);
afterAll(async () => await server.cleanup());

it('[E2E-CONTRACT-INERT-EXAMPLES] exposes the original missing handler through tools, aggregate, resources and pre-release without inventing PHP methods', async () => {
  const root = server.projects.negative;
  const before = await digestDirectory(root);
  const run = await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain(
      'validate_notifications',
    );
    expect((await client.listResources()).resources.map((resource) => resource.uri)).toContain(
      'bga://project/diagnostics',
    );
    await expectSchemaRejections(client, 'validate_notifications', [{ unexpected: true }]);
    const notification = await callTool<Result>(client, 'validate_notifications', {});
    expect(notification.isError).toBe(false);
    expect(notification.structured?.trace?.handlers).toEqual([]);
    expect(notification.structured?.trace?.sent?.map((entry) => entry.name)).toEqual([
      'markerChanged',
    ]);
    expect(notification.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(
      'notification.sent.not-handled',
    );
    const actions = await callTool<Result>(client, 'validate_action_contracts', {});
    expect(actions.structured?.trace?.gameMethods).toEqual(['changeMarker']);
    const aggregate = await callTool<Result>(client, 'validate_project', {});
    expect(aggregate.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(
      'notification.sent.not-handled',
    );
    const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
    expect(
      audit.structured?.checks.find((check) => check.id === 'notification.sent.not-handled')
        ?.outcome,
    ).toBe('failed');
    const resource = await client.readResource({ uri: 'bga://project/diagnostics' });
    const content = resource.contents as { text?: string }[];
    const result = JSON.parse(content[0]?.text ?? '{}') as Result;
    expect(result.diagnostics.findings.map((entry) => entry.code)).toContain(
      'notification.sent.not-handled',
    );
    const summary = await client.readResource({ uri: 'bga://project/summary' });
    expect(JSON.stringify(summary)).not.toContain('exampleOnlyMethod');
  });
  expect(run.stderr).toBe('');
  expect(await digestDirectory(root)).toBe(before);
});

it('[E2E-CONTRACT-EXECUTABLE-CONTROLS] retains live modern and legacy contracts beside comments, strings, regex and templates without phantom reads or subscriptions', async () => {
  const root = server.projects.positive;
  const before = await digestDirectory(root);
  await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
    const response = await callTool<Result>(client, 'validate_notifications', {});
    expect(response.isError).toBe(false);
    expect(response.structured?.trace?.handlers).toEqual([
      expect.objectContaining({ name: 'legacyChanged', binding: 'method', payloadKeys: ['value'] }),
      expect.objectContaining({
        name: 'markerChanged',
        binding: 'method',
        payloadKeys: ['marker', 'note'],
      }),
    ]);
    expect(response.structured?.trace?.sent).toEqual([
      expect.objectContaining({ name: 'markerChanged', payloadKeys: ['marker', 'note'] }),
      expect.objectContaining({ name: 'legacyChanged', payloadKeys: ['value'] }),
    ]);
    expect(response.structured?.diagnostics.findings).toEqual([]);
    const actions = await callTool<Result>(client, 'validate_action_contracts', {});
    expect(actions.structured?.trace?.gameMethods).toEqual(['changeMarker', 'realHelper']);
  });
  expect(await digestDirectory(root)).toBe(before);
});

it('[E2E-CONTRACT-UNKNOWN-GRAMMAR] preserves syntax uncertainty everywhere without raw-text handlers or missing-side guesses', async () => {
  const root = server.projects.unknown;
  const before = await digestDirectory(root);
  await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
    const response = await callTool<Result>(client, 'validate_notifications', {});
    expect(response.structured?.trace?.handlers).toEqual([]);
    expect(response.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
    expect(
      response.structured?.diagnostics.findings.some((entry) => entry.kind === 'heuristic'),
    ).toBe(false);
    const aggregate = await callTool<Result>(client, 'validate_project', {
      groups: ['notifications'],
    });
    expect(aggregate.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
    const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
    expect(audit.structured?.counts.unsupported).toBeGreaterThan(0);
    const resource = await client.readResource({ uri: 'bga://project/diagnostics' });
    expect(JSON.stringify(resource)).toContain('notification.unsupported-syntax');
    expect(JSON.stringify(resource)).not.toContain('notification.sent.not-handled');
  });
  expect(await digestDirectory(root)).toBe(before);
});

it('[E2E-CONTRACT-COMMENT-METHOD-MISSING] keeps the legacy dispatcher action unresolved when the game method exists only in a comment', async () => {
  const root = server.projects.legacy;
  const before = await digestDirectory(root);
  await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
    const response = await callTool<Result>(client, 'validate_action_contracts', {});
    expect(response.structured?.trace?.gameMethods).toEqual(['stGameEnd', 'stGameSetup']);
    expect(response.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(
      'action.game-method.missing',
    );
    const aggregate = await callTool<Result>(client, 'validate_project', {
      groups: ['action-contracts'],
    });
    expect(aggregate.structured?.diagnostics.findings.map((entry) => entry.code)).toContain(
      'action.game-method.missing',
    );
  });
  expect(await digestDirectory(root)).toBe(before);
});

it('[E2E-CONTRACT-UNKNOWN-PHP] exposes unreadable server lexical context without inventing game methods or claiming their absence', async () => {
  const root = server.projects.unknownphp;
  const before = await digestDirectory(root);
  await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
    const actions = await callTool<Result>(client, 'validate_action_contracts', {});
    expect(actions.structured?.trace?.gameMethods).toEqual([]);
    expect(actions.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
    expect(actions.structured?.diagnostics.findings.map((entry) => entry.code)).not.toContain(
      'action.game-method.missing',
    );
    const notifications = await callTool<Result>(client, 'validate_notifications', {});
    expect(notifications.structured?.trace?.sent).toEqual([]);
    expect(notifications.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
    expect(notifications.structured?.diagnostics.findings.map((entry) => entry.code)).not.toContain(
      'notification.handled.not-sent',
    );
    const audit = await callTool<Audit>(client, 'run_pre_release_audit', {});
    expect(audit.structured?.counts.unsupported).toBeGreaterThan(0);
    const resource = await client.readResource({ uri: 'bga://project/diagnostics' });
    expect(JSON.stringify(resource)).toContain('unterminated');
  });
  expect(await digestDirectory(root)).toBe(before);
});
