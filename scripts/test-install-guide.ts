import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { exerciseInstallGuide } from './lib/install-guide.js';
import { scanText } from './lib/secret-scan.js';
import { readSigningCandidate } from './release-signing.js';

const root = resolve(import.meta.dirname, '..');
const packet = process.env.BGA_MCP_SIGNED_CANDIDATE;
assert(packet, 'Supply the independently signature-verified original signed candidate directory');
const receipt = JSON.parse(
  await readFile(resolve(root, 'docs/verification/release-candidate-v1.0.0-rc.6.json'), 'utf8'),
) as unknown;
const candidate = await readSigningCandidate(packet, receipt);
const result = await exerciseInstallGuide(resolve(packet, candidate.identity.artifactName), root);
assert.equal(result.artifactDigest, candidate.identity.artifactDigest);
const output = `${JSON.stringify({ ...result, candidateCommit: candidate.identity.sourceCommit, candidateTag: candidate.identity.sourceTag, signaturePrerequisite: 'independent BGA-404 verification required', rebuilt: false }, null, 2)}\n`;
assert.equal(scanText(output, 'install-guide-original.json').length, 0);
await writeFile(resolve(root, '.artifacts/install-guide-original.json'), output);
process.stdout.write('Original candidate installation guide passed; sanitized receipt retained.\n');
