import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readPublicationConfig } from './lib/publication.js';
import {
  verifyPublicationWorkflow,
  verifyGitHubPublicationWorkflow,
} from './lib/publication-workflow.js';
import { expectSeededFailure, reportOrExit } from './lib/gate.js';
const root = resolve(import.meta.dirname, '..');
readPublicationConfig(JSON.parse(await readFile(resolve(root, 'config/publication.json'), 'utf8')));
const source = await readFile(resolve(root, '.github/workflows/release-publication.yml'), 'utf8');
expectSeededFailure(
  'automatic registry publication',
  verifyPublicationWorkflow(source.replace('workflow_dispatch:', 'push:')),
);
expectSeededFailure(
  'dry-run identity',
  verifyPublicationWorkflow(source.replace('default: dry-run', 'default: publish')),
);
expectSeededFailure(
  'unverified promotion',
  verifyPublicationWorkflow(source.replace('needs: [prepare, verify]', 'needs: prepare')),
);
for (const path of [
  'scripts/prepare-publication.ts',
  'scripts/publish-release.ts',
  'scripts/verify-publication-consumer.ts',
  'scripts/publish-github-release.ts',
  'scripts/verify-github-consumer.ts',
]) {
  const contents = await readFile(resolve(root, path), 'utf8');
  if (/\b(?:npm|pnpm)\s+(?:pack|unpublish)\b/iu.test(contents))
    throw new Error('Publication cannot rebuild or overwrite an immutable release');
}
reportOrExit(
  'Registry publication',
  verifyPublicationWorkflow(source),
  'Manual publication graph, permission separation, immutable admission and independent consumer promotion guards pass. Offline verification does not establish registry publication or publisher account setup.',
);
const github = await readFile(resolve(root, '.github/workflows/release-github.yml'), 'utf8');
for (const changed of [
  github.replace('workflow_dispatch:', 'push:'),
  github.replace('default: dry-run', 'default: publish'),
  github.replace('needs: [prepare, verify]', 'needs: prepare'),
  github.replace('contents: read', 'contents: write'),
])
  expectSeededFailure('GitHub publication isolation', verifyGitHubPublicationWorkflow(changed));
reportOrExit(
  'GitHub download publication',
  verifyGitHubPublicationWorkflow(github),
  'Manual GitHub graph, isolated writer, immutable handoff and independent consumer guards pass; live publication remains separate.',
);
