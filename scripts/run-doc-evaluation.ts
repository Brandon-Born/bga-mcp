import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import {
  scoreQuestion,
  summarizeEvaluation,
  type AnswerUnderTest,
  type EvaluationQuestion,
  type EvaluationThresholds,
  type QuestionOutcome,
} from '../src/docs/evaluation.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface EvaluationSet {
  readonly updatedAt: string;
  readonly thresholds: EvaluationThresholds;
  readonly questions: readonly EvaluationQuestion[];
}

interface SearchResult {
  readonly results?: readonly {
    readonly url?: string;
    readonly provenance?: string;
    readonly excerpt?: string;
    readonly retrievedAt?: string;
    readonly trust?: string;
  }[];
}

/**
 * Runs the maintained question set against the live documentation.
 *
 * Deliberately not part of `pnpm check`. It needs the network and a third
 * party's wiki, so putting it in the commit gate would make every commit
 * depend on someone else's uptime and would send traffic nobody asked for.
 * It is run before a documentation release, and when the drift monitor
 * (BGA-206) reports a source has changed.
 */
async function main(): Promise<void> {
  const set = JSON.parse(
    await readFile(resolve(repositoryRoot, 'config/doc-evaluation.json'), 'utf8'),
  ) as EvaluationSet;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(repositoryRoot, 'dist/cli.js'), '--allow-network'],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'bga-mcp-doc-evaluation', version: '1.0.0' });
  await client.connect(transport);

  const outcomes: QuestionOutcome[] = [];
  try {
    for (const question of set.questions) {
      const response = await client.callTool(
        { name: 'search_bga_docs', arguments: { query: question.question, maxResults: 5 } },
        { timeout: 60_000 },
      );

      // A refusal is not an answer; it is scored as one that did not arrive,
      // so a capability that errors on everything cannot pass by returning
      // nothing to questions that expect nothing.
      const structured = (response.structuredContent ?? {}) as SearchResult;
      const answers: AnswerUnderTest[] =
        response.isError === true
          ? []
          : (structured.results ?? []).map((result) => ({
              url: result.url ?? '',
              provenance: result.provenance ?? '',
              excerpt: result.excerpt ?? '',
              retrievedAt: result.retrievedAt ?? '',
              trust: result.trust ?? '',
            }));

      const outcome = scoreQuestion(question, answers, set.thresholds.maxExcerptChars);
      outcomes.push(outcome);
      const mark = outcome.answered ? 'PASS' : 'FAIL';
      process.stdout.write(`${mark} ${question.id}: ${question.question}\n`);
      for (const failure of outcome.failures) {
        process.stdout.write(`     - ${failure}\n`);
      }
    }
  } finally {
    await client.close();
  }

  const summary = summarizeEvaluation(outcomes, set.thresholds);
  process.stdout.write(
    `\n${String(summary.answered)}/${String(summary.total)} answered ` +
      `(threshold ${String(set.thresholds.minAnswered)}), ` +
      `${String(summary.attributed)}/${String(summary.total)} attributed ` +
      `(threshold ${String(set.thresholds.minAttributed)}). Set updated ${set.updatedAt}.\n`,
  );
  if (!summary.passed) {
    process.stderr.write(
      'Documentation retrieval is below its thresholds. Do not release documentation capabilities until this passes or the set is deliberately revised.\n',
    );
    process.exitCode = 1;
  }
}

await main();
