import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPolicyBoundary } from '../../src/policy.js';
import { validateNotifications } from '../../src/rules/notifications.js';
import { loadProjectContext } from '../../src/tools/project-context.js';

const projectsRoot = fileURLToPath(new URL('../fixtures/projects/', import.meta.url));

interface ExpectedFixture {
  readonly notifications?: {
    readonly status: string;
    readonly summary: Record<string, number>;
    readonly codes: string[];
  };
}

async function trace(fixture: string) {
  const root = resolve(projectsRoot, fixture);
  const policy = await createPolicyBoundary({ projectRoots: [root] });
  const context = await loadProjectContext(policy, root, {
    withPhpSources: true,
    withClientSources: true,
  });
  return {
    result: validateNotifications(context.phpSources, context.clientSources),
    expected: JSON.parse(await readFile(resolve(root, 'expected.json'), 'utf8')) as ExpectedFixture,
  };
}

describe('notification validation against the fixture corpus', () => {
  it('passes the valid legacy fixture and traces its notification both ways', async () => {
    const { result, expected } = await trace('legacy');
    expect(expected.notifications?.status).toBe('passed');
    expect(result.diagnostics).toMatchObject({
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    });

    expect(result.sent).toEqual([
      {
        name: 'playerPassed',
        payloadKeys: ['comment'],
        payloadShape: 'known',
        scope: 'all',
        source: 'bgamcplegacy.game.php',
      },
    ]);
    expect(result.handlers).toEqual([
      {
        name: 'playerPassed',
        binding: 'subscribe',
        bound: true,
        payloadKeys: ['comment'],
        source: 'bgamcplegacy.js',
      },
    ]);
  });

  it('finds exactly the notification defects the broken fixture declares', async () => {
    const { result, expected } = await trace('legacy-broken');
    const declared = expected.notifications;
    if (declared === undefined) {
      throw new Error('The broken fixture must declare its expected notification findings');
    }

    expect(result.diagnostics.status).toBe(declared.status);
    expect(result.diagnostics.summary).toEqual(declared.summary);
    expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual(declared.codes);

    const duplicate = result.diagnostics.findings.find(
      (finding) => finding.code === 'notification.subscription.duplicate',
    );
    expect(duplicate).toMatchObject({ kind: 'issue', certainty: 'certain' });
    expect(duplicate?.locations[0]?.uri).toBe('brokengame.js');

    const silent = result.diagnostics.findings.find(
      (finding) => finding.code === 'notification.sent.not-handled',
    );
    expect(silent?.message).toContain('ghostEvent');
    expect(silent?.kind).toBe('heuristic');

    const mismatches = result.diagnostics.findings.filter(
      (finding) => finding.code === 'notification.payload.mismatch',
    );
    // Ordering is by code, then location: brokengame.game.php before brokengame.js.
    expect(mismatches.map((finding) => finding.message)).toEqual([
      "The server sends 'score' in 'playerPassed', which its handler never reads.",
      "The handler for 'playerPassed' reads 'comment', which the server payload does not contain.",
    ]);
  });

  it('reads the modern notify API and the class-based handlers', async () => {
    const { result } = await trace('modern');
    expect(result.diagnostics.status).toBe('passed');
    expect(result.sent.map((entry) => entry.name)).toEqual(['playerPassed']);
    expect(result.handlers.map((entry) => entry.binding)).toEqual(['method']);

    const broken = await trace('modern-broken');
    const codes = broken.result.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toContain('notification.sent.not-handled');
    expect(codes).toContain('notification.payload.mismatch');
  });

  it('produces byte-identical results across repeated runs', async () => {
    const first = await trace('legacy-broken');
    const second = await trace('legacy-broken');
    expect(JSON.stringify(first.result)).toBe(JSON.stringify(second.result));
  });
});
