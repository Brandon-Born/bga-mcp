import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { expectSeededFailure, reportOrExit } from './lib/gate.js';
import {
  type CandidateSource,
  type VersionPolicySummary,
  verifyCandidateSource,
  verifyCandidateWorkflow,
} from './lib/release-candidate.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

async function loadText(path: string): Promise<string> {
  return await readFile(resolve(repositoryRoot, path), 'utf8');
}

async function main(): Promise<void> {
  const workflow = await loadText('.github/workflows/release-candidate.yml');
  const schema = JSON.parse(await loadText('config/release-candidate.schema.json')) as object;
  const policy = JSON.parse(await loadText('config/version-policy.json')) as VersionPolicySummary;
  new Ajv2020({ allErrors: true, strict: true }).compile(schema);

  const report = verifyCandidateWorkflow(workflow);
  for (const [name, defective] of [
    ['automatic candidate trigger', `${workflow}\npush:\n  branches: [main]\n`],
    ['candidate identity permission', workflow.replace('contents: read', 'id-token: write')],
    ['candidate publish path', `${workflow}\n# npm publish\n`],
    ['candidate credential', `${workflow}\n# NPM_TOKEN\n`],
    ['candidate rebuild omission', workflow.replace('pnpm release:candidate', 'pnpm check')],
    [
      'unpinned candidate upload',
      workflow.replace(/actions\/upload-artifact@[0-9a-f]{40}/u, 'actions/upload-artifact@v7'),
    ],
  ] as const) {
    expectSeededFailure(name, verifyCandidateWorkflow(defective));
  }

  const soundSource: CandidateSource = {
    tag: 'v1.0.0-rc.1',
    commit: '1'.repeat(40),
    tagCommit: '1'.repeat(40),
    clean: true,
    packageName: 'bga-mcp',
    packageVersion: '1.0.0-rc.1',
    manifestVersion: '1.0.0-rc.1',
    metadataVersion: '1.0.0-rc.1',
    lockDigest: `sha256:${'2'.repeat(64)}`,
  };
  if (verifyCandidateSource(soundSource, policy).failed) {
    throw new Error('Release candidate source gate rejected its sound control');
  }
  for (const [name, defective] of [
    ['dirty candidate source', { ...soundSource, clean: false }],
    ['untagged candidate source', { ...soundSource, tagCommit: '0'.repeat(40) }],
    ['wrong candidate version', { ...soundSource, packageVersion: '1.0.0' }],
    ['candidate metadata drift', { ...soundSource, metadataVersion: '0.0.0-development' }],
  ] as const) {
    expectSeededFailure(name, verifyCandidateSource(defective, policy));
  }

  reportOrExit(
    'Release candidate',
    report,
    'Release-candidate workflow is tag-gated, read-only, credential-free, and non-publishing; its gate detects automatic triggers, elevated permissions, publication paths, unpinned retention, dirty sources, wrong refs, and version drift.',
  );
}

await main();
