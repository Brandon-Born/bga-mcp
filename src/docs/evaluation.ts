/**
 * Scores a documentation answer against what the evaluation set expects.
 *
 * Retrieval quality is the one thing about a documentation capability that
 * cannot be asserted once and forgotten: the pages move, the wiki is edited,
 * and an answer that was right last month can quietly become the wrong page.
 * So the expectations live in a maintained set and the scoring lives here,
 * where it can be exercised without a network.
 *
 * Pure functions, no I/O.
 */

export interface EvaluationQuestion {
  readonly id: string;
  readonly question: string;
  readonly expectedTopic: string | null;
  readonly expectedUrlContains: string | null;
  readonly requiredTerms: readonly string[];
  readonly expectedProvenance: 'official' | 'community' | null;
  readonly expectNoAnswer?: boolean;
  readonly expectUntrustedLabel?: boolean;
}

export interface AnswerUnderTest {
  readonly url: string;
  readonly provenance: string;
  readonly excerpt: string;
  readonly retrievedAt: string;
  readonly trust: string;
}

export interface QuestionOutcome {
  readonly id: string;
  readonly answered: boolean;
  readonly attributed: boolean;
  readonly failures: readonly string[];
}

export interface EvaluationThresholds {
  readonly minAnswered: number;
  readonly minAttributed: number;
  readonly maxExcerptChars: number;
}

/** An answer is attributable only when a reader can check it and date it. */
function attributionFailures(answer: AnswerUnderTest): string[] {
  const failures: string[] = [];
  if (!answer.url.startsWith('https://')) {
    failures.push('the result has no canonical URL');
  }
  if (Number.isNaN(Date.parse(answer.retrievedAt))) {
    failures.push('the result has no readable retrieval date');
  }
  if (answer.provenance !== 'official' && answer.provenance !== 'community') {
    failures.push('the result does not say whether it is official or community');
  }
  if (answer.trust !== 'untrusted-content') {
    failures.push('the result is not labelled as untrusted content');
  }
  return failures;
}

/** Scores one question against the answers a run produced for it. */
export function scoreQuestion(
  question: EvaluationQuestion,
  answers: readonly AnswerUnderTest[],
  maxExcerptChars: number,
): QuestionOutcome {
  const failures: string[] = [];

  // Attribution is judged on every answer, including answers to a question that
  // should not have been answered at all.
  const attributionProblems = answers.flatMap((answer) => attributionFailures(answer));
  failures.push(...new Set(attributionProblems));
  for (const answer of answers) {
    if (answer.excerpt.length > maxExcerptChars) {
      failures.push(
        `an excerpt is ${String(answer.excerpt.length)} characters, above the ${String(maxExcerptChars)} limit`,
      );
      break;
    }
  }

  if (question.expectNoAnswer === true) {
    if (answers.length > 0) {
      failures.push('the documentation cannot answer this and something was returned anyway');
    }
    return {
      id: question.id,
      answered: answers.length === 0,
      attributed: failures.length === 0,
      failures,
    };
  }

  const match = answers.find((answer) =>
    question.expectedUrlContains === null
      ? true
      : answer.url.includes(question.expectedUrlContains),
  );
  if (match === undefined) {
    failures.push(
      `no result came from the expected page (${question.expectedUrlContains ?? 'any'})`,
    );
    return { id: question.id, answered: false, attributed: failures.length === 0, failures };
  }

  for (const term of question.requiredTerms) {
    if (!match.excerpt.toLowerCase().includes(term.toLowerCase())) {
      failures.push(`the excerpt does not mention "${term}"`);
    }
  }
  if (question.expectedProvenance !== null && match.provenance !== question.expectedProvenance) {
    failures.push(
      `the result is ${match.provenance} where ${question.expectedProvenance} was expected`,
    );
  }

  return {
    id: question.id,
    answered: failures.length === 0,
    attributed: attributionProblems.length === 0,
    failures,
  };
}

export interface EvaluationSummary {
  readonly total: number;
  readonly answerable: number;
  readonly answered: number;
  readonly attributed: number;
  readonly answeredRate: number;
  readonly attributedRate: number;
  readonly passed: boolean;
}

/** Applies the thresholds. Attribution is fixed at 1: it is not negotiable. */
export function summarizeEvaluation(
  outcomes: readonly QuestionOutcome[],
  thresholds: EvaluationThresholds,
): EvaluationSummary {
  const total = outcomes.length;
  const answered = outcomes.filter((outcome) => outcome.answered).length;
  const attributed = outcomes.filter((outcome) => outcome.attributed).length;
  const answeredRate = total === 0 ? 0 : answered / total;
  const attributedRate = total === 0 ? 0 : attributed / total;
  return {
    total,
    answerable: total,
    answered,
    attributed,
    answeredRate,
    attributedRate,
    passed:
      total > 0 &&
      answeredRate >= thresholds.minAnswered &&
      attributedRate >= thresholds.minAttributed,
  };
}
