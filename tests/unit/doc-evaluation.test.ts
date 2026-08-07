import {
  scoreQuestion,
  summarizeEvaluation,
  type AnswerUnderTest,
  type EvaluationQuestion,
} from '../../src/docs/evaluation.js';

const THRESHOLDS = { minAnswered: 0.8, minAttributed: 1, maxExcerptChars: 100 };

function answer(overrides: Partial<AnswerUnderTest> = {}): AnswerUnderTest {
  return {
    url: 'https://en.doc.boardgamearena.com/State_classes:_State_directory',
    provenance: 'official',
    excerpt: 'State classes live under modules/php/States.',
    retrievedAt: '2026-08-07T00:00:00.000Z',
    trust: 'untrusted-content',
    ...overrides,
  };
}

const question: EvaluationQuestion = {
  id: 'states',
  question: 'where do state classes live',
  expectedTopic: 'states',
  expectedUrlContains: 'State_classes',
  requiredTerms: ['modules/php/States'],
  expectedProvenance: 'official',
};

describe('documentation retrieval evaluation', () => {
  it('[UNIT-DOC-EVALUATION] passes an answer from the expected page with the expected facts', () => {
    const outcome = scoreQuestion(question, [answer()], 100);
    expect(outcome).toMatchObject({ id: 'states', answered: true, attributed: true, failures: [] });
  });

  it('[UNIT-DOC-EVALUATION] fails an answer from the wrong page, or missing the fact asked for', () => {
    const wrongPage = scoreQuestion(
      question,
      [answer({ url: 'https://en.doc.boardgamearena.com/Studio' })],
      100,
    );
    expect(wrongPage.answered).toBe(false);
    expect(wrongPage.failures[0]).toContain('no result came from the expected page');

    const missingFact = scoreQuestion(
      question,
      [answer({ excerpt: 'Something else entirely.' })],
      100,
    );
    expect(missingFact.answered).toBe(false);
    expect(missingFact.failures[0]).toContain('modules/php/States');

    // Provenance being flattened is a failure even when the page is right.
    const wrongProvenance = scoreQuestion(question, [answer({ provenance: 'community' })], 100);
    expect(wrongProvenance.answered).toBe(false);
    expect(wrongProvenance.failures[0]).toContain('community where official was expected');
  });

  it('[UNIT-DOC-EVALUATION] fails an answer nobody can attribute, whatever it says', () => {
    for (const broken of [
      answer({ url: '' }),
      answer({ retrievedAt: 'whenever' }),
      answer({ provenance: '' }),
      answer({ trust: 'trusted' }),
    ]) {
      const outcome = scoreQuestion(question, [broken], 100);
      expect(outcome.attributed).toBe(false);
      expect(outcome.answered).toBe(false);
    }

    const oversized = scoreQuestion(question, [answer({ excerpt: 'x'.repeat(500) })], 100);
    expect(oversized.failures.some((failure) => failure.includes('above the 100'))).toBe(true);
  });

  it('[UNIT-DOC-EVALUATION] requires nothing to come back for a question the documentation cannot answer', () => {
    const unanswerable: EvaluationQuestion = {
      ...question,
      id: 'none',
      expectedTopic: null,
      expectedUrlContains: null,
      requiredTerms: [],
      expectedProvenance: null,
      expectNoAnswer: true,
    };

    expect(scoreQuestion(unanswerable, [], 100).answered).toBe(true);
    // Returning the nearest page to a question about something else is the
    // failure this catches.
    const invented = scoreQuestion(unanswerable, [answer()], 100);
    expect(invented.answered).toBe(false);
    expect(invented.failures[0]).toContain('something was returned anyway');
  });

  it('[UNIT-DOC-EVALUATION] applies the thresholds, and attribution is not negotiable', () => {
    const outcomes = [
      { id: 'a', answered: true, attributed: true, failures: [] },
      { id: 'b', answered: true, attributed: true, failures: [] },
      { id: 'c', answered: true, attributed: true, failures: [] },
      { id: 'd', answered: true, attributed: true, failures: [] },
      { id: 'e', answered: false, attributed: true, failures: ['wrong page'] },
    ];
    expect(summarizeEvaluation(outcomes, THRESHOLDS)).toMatchObject({
      answered: 4,
      answeredRate: 0.8,
      passed: true,
    });

    // One unattributed answer fails the run even when every answer is right.
    const unattributed = outcomes.map((outcome, index) =>
      index === 0 ? { ...outcome, attributed: false } : outcome,
    );
    expect(summarizeEvaluation(unattributed, THRESHOLDS).passed).toBe(false);

    // An empty run does not pass by having nothing to fail.
    expect(summarizeEvaluation([], THRESHOLDS).passed).toBe(false);
  });
});
