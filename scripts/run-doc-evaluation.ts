import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateDocumentation,
  type EvaluationSet,
  type ReviewedExpectations,
} from './lib/documentation-evaluation.js';
import { installDocumentationArtifact } from './lib/install-documentation-artifact.js';
import { connectStdio } from '../tests/helpers/mcp.js';
import { waitForProcessExit } from '../tests/helpers/scenario.js';
import { runCommand } from '../tests/helpers/process.js';

const root = resolve(import.meta.dirname, '..');
/** Deliberate live evaluation; never part of the offline commit gate. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const artifactAt = args.indexOf('--artifact');
  const outputAt = args.indexOf('--output');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--artifact', '--output'].includes(args[i] ?? '') || args[i + 1] === undefined)
      throw new Error('expected --artifact PATH or --output PATH');
  }
  const set = JSON.parse(
    await readFile(resolve(root, 'config/doc-evaluation.json'), 'utf8'),
  ) as EvaluationSet;
  const reviewed = JSON.parse(
    await readFile(resolve(root, 'tests/fixtures/docs/relevance/expectations.json'), 'utf8'),
  ) as ReviewedExpectations;
  const source = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: root });
  const state = await runCommand('git', ['status', '--porcelain'], { cwd: root });
  if (source.exitCode !== 0 || state.exitCode !== 0)
    throw new Error('cannot identify evaluation source');
  const installed = await installDocumentationArtifact(
    root,
    artifactAt < 0 ? undefined : resolve(args[artifactAt + 1] ?? ''),
  );
  try {
    const connection = await connectStdio(process.execPath, [installed.cli, '--allow-network'], {
      timeoutMs: 10_000,
    });
    let result;
    const pid = connection.transport.pid;
    try {
      result = await evaluateDocumentation(connection.client, set, reviewed);
    } finally {
      await connection.client.close();
      if (pid !== null) await waitForProcessExit(pid);
    }
    if (connection.stderr() !== '')
      throw new Error('installed documentation server wrote to stderr');
    const receipt = {
      schemaVersion: 1,
      mode: 'live-installed',
      evaluatedAt: new Date().toISOString(),
      harnessSourceCommit: source.stdout.trim(),
      artifactSource:
        artifactAt < 0 ? 'current-working-tree-package' : 'original-bytes-source-not-inferred',
      sourceDirty: state.stdout.trim() !== '',
      artifactDigest: installed.digest,
      thresholds: set.thresholds,
      rankingQuality: result,
      sourceReview: {
        captureReviewedAt: reviewed.reviewedAt,
        captures: reviewed.captures.map(({ topic, url, revision }) => ({ topic, url, revision })),
        driftStatus: 'not-inferred-from-ranking',
        note: 'Changed or missing facts require a separate official-page drift review. Captures are never rewritten by this command.',
      },
      publicReleaseEvaluated: false,
    };
    for (const kind of ['questions', 'topics'] as const)
      for (const outcome of result[kind]) {
        process.stdout.write(
          `${outcome.answered && outcome.attributed ? 'PASS' : 'FAIL'} ${kind}/${outcome.id}${outcome.failures.length === 0 ? '' : ': ' + outcome.failures.join('; ')}\n`,
        );
      }
    process.stdout.write(
      `${String(result.summary.answered)}/${String(result.summary.total)} questions; ${String(result.topics.filter((topic) => topic.answered).length)}/7 topics. Artifact ${installed.digest}.\n`,
    );
    if (outputAt >= 0)
      await writeFile(resolve(args[outputAt + 1] ?? ''), JSON.stringify(receipt, null, 2) + '\n');
    if (!result.passed) process.exitCode = 1;
  } finally {
    await installed.cleanup();
  }
}
await main();
