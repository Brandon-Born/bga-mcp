import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { type ClientMatrix, verifyClientMatrix } from '../../scripts/lib/client-matrix.js';

function row(matrix: ClientMatrix, index = 0) {
  const client = matrix.clients[index];
  if (client === undefined) throw new Error('Missing seeded client row');
  return client;
}

it('[GATE-CLIENT-MATRIX] refuses unsupported version, missing scenario, environment and controlled evidence claims', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const original = JSON.parse(
    await readFile(resolve(root, 'config/client-smoke.json'), 'utf8'),
  ) as ClientMatrix;
  expect((await verifyClientMatrix(original, root)).failures).toEqual([]);
  const version = structuredClone(original);
  row(version, 0).version = '99.0.0';
  expect((await verifyClientMatrix(version, root)).failures.length).toBeGreaterThan(0);
  const scenario = structuredClone(original);
  row(scenario, 0).scenarios = ['E2E-UNKNOWN-CLIENT'];
  expect((await verifyClientMatrix(scenario, root)).failures.length).toBeGreaterThan(0);
  const environment = structuredClone(original);
  row(environment, 0).platforms = ['imaginary-platform'];
  expect((await verifyClientMatrix(environment, root)).failures.length).toBeGreaterThan(0);
  const receipt = JSON.parse(
    await readFile(resolve(root, 'docs/verification/codex-client-v1.0.0-rc.1.json'), 'utf8'),
  ) as Record<string, unknown>;
  const wrongArtifact = structuredClone(receipt);
  wrongArtifact.artifactDigest = `sha256:${'0'.repeat(64)}`;
  expect(
    (await verifyClientMatrix(original, root, { 'CLIENT-CODEX-APP-SERVER': wrongArtifact }))
      .failures.length,
  ).toBeGreaterThan(0);
  const changedRunner = structuredClone(receipt);
  changedRunner.runnerDigests = {};
  expect(
    (await verifyClientMatrix(original, root, { 'CLIENT-CODEX-APP-SERVER': changedRunner }))
      .failures.length,
  ).toBeGreaterThan(0);
  const controlled = structuredClone(original);
  row(controlled, 1).version = '99.0.0';
  expect((await verifyClientMatrix(controlled, root)).failures.length).toBeGreaterThan(0);
});
