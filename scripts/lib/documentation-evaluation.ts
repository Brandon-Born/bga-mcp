import type { Client } from '@modelcontextprotocol/client';
import {
  scoreQuestion,
  summarizeEvaluation,
  type AnswerUnderTest,
  type EvaluationQuestion,
  type EvaluationThresholds,
  type QuestionOutcome,
} from '../../src/docs/evaluation.js';

export interface CaptureExpectation {
  readonly topic: string;
  readonly file: string;
  readonly url: string;
  readonly authority: string;
  readonly retrievedAt: string;
  readonly revision: number;
  readonly sourcePolicy: string;
  readonly sha256: string;
  readonly quotedWords: number;
  readonly requiredTerms: readonly string[];
  readonly forbiddenTerms: readonly string[];
}
export interface ReviewedExpectations {
  readonly reviewedAt: string;
  readonly captures: readonly CaptureExpectation[];
  readonly questions: readonly {
    readonly id: string;
    readonly expectedPage: string | null;
    readonly requiredTerms: readonly string[];
    readonly forbiddenTerms: readonly string[];
    readonly expectNoAnswer: boolean;
  }[];
}
export interface EvaluationSet {
  readonly updatedAt: string;
  readonly thresholds: EvaluationThresholds;
  readonly questions: readonly EvaluationQuestion[];
}

/** Errors and malformed responses cannot earn a vacuous no-answer pass. */
export function scoreReviewed(
  question: EvaluationQuestion,
  answers: readonly AnswerUnderTest[],
  maxChars: number,
  expectedPage: string | null,
  forbidden: readonly string[],
  error?: string,
): QuestionOutcome {
  const outcome = scoreQuestion(question, answers, maxChars);
  const failures = [...outcome.failures];
  if (error !== undefined) failures.push(error);
  if (expectedPage !== null) {
    const match = answers.find((answer) => answer.url.split(/[?#]/u)[0] === expectedPage);
    if (match === undefined) failures.push('no answer from the reviewed canonical page');
    else
      for (const fact of forbidden) {
        if (match.excerpt.toLowerCase().includes(fact.toLowerCase()))
          failures.push(`unrelated passage includes "${fact}"`);
      }
  }
  return {
    id: question.id,
    answered: outcome.answered && failures.length === 0,
    attributed: error === undefined && outcome.attributed,
    failures,
  };
}

function answersFrom(value: unknown): AnswerUnderTest[] {
  if (!Array.isArray(value)) throw new Error('malformed result list');
  return value.map((item: Record<string, unknown>) => ({
    url: typeof item.url === 'string' ? item.url : '',
    provenance: typeof item.provenance === 'string' ? item.provenance : '',
    excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
    retrievedAt: typeof item.retrievedAt === 'string' ? item.retrievedAt : '',
    trust: typeof item.trust === 'string' ? item.trust : '',
  }));
}

/** Same maintained oracle for the installed offline replay and deliberate live run. */
export async function evaluateDocumentation(
  client: Client,
  set: EvaluationSet,
  reviewed: ReviewedExpectations,
) {
  const questions: QuestionOutcome[] = [];
  const topics: QuestionOutcome[] = [];
  const observations: {
    id: string;
    kind: 'question' | 'topic';
    urls: string[];
    retrievedAt: string[];
  }[] = [];
  for (const question of set.questions) {
    const expected = reviewed.questions.find((entry) => entry.id === question.id);
    if (expected === undefined) throw new Error(`missing reviewed expectation: ${question.id}`);
    let answers: AnswerUnderTest[] = [];
    let error: string | undefined;
    try {
      const response = await client.callTool(
        { name: 'search_bga_docs', arguments: { query: question.question, maxResults: 5 } },
        { timeout: 60_000 },
      );
      if (response.isError === true)
        error = 'lookup refused or failed; empty answers are not evidence';
      else {
        const structured = response.structuredContent as
          { results?: unknown; degraded?: boolean } | undefined;
        answers = answersFrom(structured?.results);
        if (question.expectNoAnswer === true && structured?.degraded === true) {
          error = 'degraded lookup cannot establish that no documentation answer exists';
        }
      }
    } catch {
      error = 'lookup failed or returned malformed content';
    }
    questions.push(
      scoreReviewed(
        {
          ...question,
          requiredTerms: [...new Set([...question.requiredTerms, ...expected.requiredTerms])],
        },
        answers,
        set.thresholds.maxExcerptChars,
        expected.expectedPage,
        expected.forbiddenTerms,
        error,
      ),
    );
    observations.push({
      id: question.id,
      kind: 'question',
      urls: answers.map((answer) => answer.url),
      retrievedAt: answers.map((answer) => answer.retrievedAt),
    });
  }
  for (const capture of reviewed.captures) {
    let answers: AnswerUnderTest[] = [];
    let error: string | undefined;
    try {
      const response = await client.readResource(
        { uri: `bga://docs/${capture.topic}` },
        { timeout: 60_000 },
      );
      const content = response.contents[0];
      const text = content !== undefined && 'text' in content ? content.text : undefined;
      if (typeof text !== 'string') throw new Error('missing resource content');
      answers = answersFrom([JSON.parse(text) as unknown]);
    } catch {
      error = 'resource failed or returned malformed content';
    }
    const question: EvaluationQuestion = {
      id: capture.topic,
      question: capture.topic,
      expectedTopic: capture.topic,
      expectedUrlContains: capture.url,
      requiredTerms: capture.requiredTerms,
      expectedProvenance: capture.authority === 'official-maintained' ? 'official' : 'community',
    };
    topics.push(
      scoreReviewed(
        question,
        answers,
        set.thresholds.maxExcerptChars,
        capture.url,
        capture.forbiddenTerms,
        error,
      ),
    );
    observations.push({
      id: capture.topic,
      kind: 'topic',
      urls: answers.map((answer) => answer.url),
      retrievedAt: answers.map((answer) => answer.retrievedAt),
    });
  }
  const summary = summarizeEvaluation(questions, set.thresholds);
  return {
    questions,
    topics,
    summary,
    observations,
    passed: summary.passed && topics.every((outcome) => outcome.answered && outcome.attributed),
  };
}
