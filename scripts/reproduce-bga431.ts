import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { digestDirectory } from './lib/install-guide.js';
import { connectStdio } from '../tests/helpers/mcp.js';
import { waitForProcessExit } from '../tests/helpers/scenario.js';

// Manual correctness probe, deliberately outside the passing verification suite.
// It fails against rc.2; a reproduced defect is not a verified capability.
const publicCommand = process.argv[2];
assert(publicCommand, 'Pass the public command from an independently verified installation');
const repository = resolve(import.meta.dirname, '..');
const fixture = resolve(repository, 'tests/fixtures/projects/comment-contract-reproduction');
const project = await mkdtemp(resolve(tmpdir(), 'bga431-'));
try {
  await cp(fixture, project, { recursive: true });
  const before = await digestDirectory(project);
  const connection = await connectStdio(publicCommand, ['--project-root', project]);
  const processId = connection.transport.pid;
  assert.notEqual(processId, null);
  const calls: Record<string, unknown> = {};
  const resources: Record<string, unknown> = {};
  try {
    const discovery = await connection.client.listTools();
    assert(discovery.tools.some((tool) => tool.name === 'validate_notifications'));
    for (const name of [
      'validate_notifications',
      'validate_action_contracts',
      'validate_project',
      'run_pre_release_audit',
    ]) {
      const result = await connection.client.callTool({ name, arguments: {} });
      assert.notEqual(result.isError, true);
      calls[name] = result.structuredContent;
    }
    for (const uri of ['bga://project/diagnostics', 'bga://project/summary']) {
      resources[uri] = await connection.client.readResource({ uri });
    }
  } finally {
    await connection.client.close();
    if (processId !== null) await waitForProcessExit(processId);
  }
  assert.equal(await digestDirectory(project), before);
  const javascript = await readFile(resolve(fixture, 'modules/js/Game.js'), 'utf8');
  // Execute only this original, repository-owned example as an independent oracle.
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
  )) as { Game: { prototype: object } };
  const liveHandlers = Object.getOwnPropertyNames(module.Game.prototype).filter((name) =>
    name.startsWith('notif_'),
  );
  assert.deepEqual(liveHandlers, []);
  const notifications = calls.validate_notifications as {
    trace: { handlers: { name: string }[] };
    diagnostics: { findings: { code: string; message: string }[] };
  };
  const actions = calls.validate_action_contracts as { trace: { gameMethods: string[] } };
  const failures = [
    ...(notifications.trace.handlers.some((handler) => handler.name === 'markerChanged')
      ? ['comment-only notification method reported as live']
      : []),
    ...(!notifications.diagnostics.findings.some(
      (finding) =>
        finding.code === 'notification.sent.not-handled' &&
        finding.message.includes('markerChanged'),
    )
      ? ['missing-handler diagnostic suppressed']
      : []),
    ...(actions.trace.gameMethods.includes('exampleOnlyMethod')
      ? ['comment-only PHP method reported as live']
      : []),
  ];
  await mkdir(resolve(repository, '.artifacts'), { recursive: true });
  await writeFile(
    resolve(repository, '.artifacts/bga431-reproduction.json'),
    `${JSON.stringify(
      {
        owner: 'BGA-431',
        recordedAt: new Date().toISOString(),
        fixtureDigest: `sha256:${before}`,
        runnerDigest: `sha256:${createHash('sha256')
          .update(await readFile(import.meta.filename))
          .digest('hex')}`,
        liveHandlers,
        failures,
        calls,
        resources,
        projectUnchanged: true,
        serverExited: true,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify({ liveHandlers, failures, projectUnchanged: true, serverExited: true }),
  );
  assert.deepEqual(failures, [], 'BGA-431 correctness assertions failed; see reproduction receipt');
} finally {
  await rm(project, { recursive: true, force: true });
}
