import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { type ClientMatrix, verifyClientMatrix } from './lib/client-matrix.js';
import { expectSeededFailure, reportOrExit } from './lib/gate.js';

function row(matrix: ClientMatrix, index = 0) {
  const client = matrix.clients[index];
  if (client === undefined) throw new Error('Missing seeded client row');
  return client;
}

const root = resolve(import.meta.dirname, '..');
const matrix = JSON.parse(
  await readFile(resolve(root, 'config/client-smoke.json'), 'utf8'),
) as ClientMatrix;
const omitted = structuredClone(matrix);
omitted.clients = omitted.clients.filter((entry) => entry.status !== 'supported');
expectSeededFailure('omitted supported client', await verifyClientMatrix(omitted, root));
const overclaimed = structuredClone(matrix);
row(overclaimed, 0).version = '99.0.0';
expectSeededFailure('unmeasured client version', await verifyClientMatrix(overclaimed, root));
const missingScenario = structuredClone(matrix);
row(missingScenario, 0).scenarios = ['E2E-NOT-A-CLIENT-TEST'];
expectSeededFailure('missing client scenario', await verifyClientMatrix(missingScenario, root));
const missingReceipt = structuredClone(matrix);
row(missingReceipt, 1).receipt = 'docs/verification/absent-client.json';
expectSeededFailure('missing controlled evidence', await verifyClientMatrix(missingReceipt, root));
reportOrExit(
  'Client smoke matrix',
  await verifyClientMatrix(matrix, root),
  'Client claims match pinned versions, runnable packaged scenarios, CI platforms and exact-candidate controlled evidence; seeded overclaims are refused.',
);
