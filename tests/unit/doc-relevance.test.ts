import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlToText, documentationPassageHtml } from '../../src/docs/excerpt.js';
import {
  DOCUMENTATION_TOPICS,
  documentationPassageQuery,
  topicForQuery,
} from '../../src/docs/topics.js';
import {
  scoreReviewed,
  type ReviewedExpectations,
  type EvaluationSet,
} from '../../scripts/lib/documentation-evaluation.js';

const root = resolve(import.meta.dirname, '../../tests/fixtures/docs/relevance');

describe('reviewed documentation relevance', () => {
  it('[UNIT-DOC-RELEVANCE-ORACLE] requires all original questions/topics, exact sources and bounded unchanged captures', async () => {
    const reviewed = JSON.parse(
      await readFile(resolve(root, 'expectations.json'), 'utf8'),
    ) as ReviewedExpectations;
    const set = JSON.parse(
      await readFile(resolve(root, '../../../../config/doc-evaluation.json'), 'utf8'),
    ) as EvaluationSet;
    expect(set.thresholds).toEqual({ minAnswered: 0.8, minAttributed: 1, maxExcerptChars: 1200 });
    expect(set.questions).toHaveLength(9);
    expect(reviewed.questions.map((question) => question.id)).toEqual(
      set.questions.map((question) => question.id),
    );
    expect(reviewed.captures.map((capture) => capture.topic).sort()).toEqual(
      DOCUMENTATION_TOPICS.map((topic) => topic.topic).sort(),
    );
    for (const original of set.questions) {
      const expected = reviewed.questions.find((entry) => entry.id === original.id);
      expect(expected?.requiredTerms).toEqual(expect.arrayContaining([...original.requiredTerms]));
      expect(expected?.expectNoAnswer).toBe(original.expectNoAnswer === true);
    }
    for (const capture of reviewed.captures) {
      const html = await readFile(resolve(root, capture.file), 'utf8');
      expect(createHash('sha256').update(html).digest('hex')).toBe(capture.sha256);
      expect(htmlToText(html).split(/\s+/u)).toHaveLength(capture.quotedWords);
      expect(capture.quotedWords).toBeLessThanOrEqual(25);
      expect(capture.revision).toBeGreaterThan(0);
      expect(capture.sourcePolicy).toContain('config/doc-sources.json#bga-studio-');
      const topic = DOCUMENTATION_TOPICS.find((entry) => entry.topic === capture.topic) ?? null;
      const selected = htmlToText(
        documentationPassageHtml(html, documentationPassageQuery(topic, null)),
      );
      for (const term of capture.requiredTerms) expect(selected).toContain(term);
      for (const term of capture.forbiddenTerms) expect(selected).not.toContain(term);
    }
    expect(topicForQuery('when can states.inc.php be removed')?.topic).toBe('migration');
    expect(topicForQuery('how do I deploy a Kubernetes ingress controller')).toBeNull();
  });
  it('[UNIT-DOC-RELEVANCE-ORACLE] hidden paragraphs and nested navigation cannot become selected excerpts', () => {
    const html =
      '<script>"<p>modules/php hidden-script</p>"</script><template><p>modules/php hidden-template</p></template><nav><div><p>modules/php hidden-navigation</p></div></nav><p>modules/php visible-source</p>';
    const selected = htmlToText(documentationPassageHtml(html, 'modules/php'));
    expect(selected).toBe('modules/php visible-source');
    expect(selected).not.toContain('hidden-');
  });
  it('[UNIT-DOC-RELEVANCE-ORACLE] rejects refusal masquerading as no-answer and correct-page wrong-passages', () => {
    const question = {
      id: 'none',
      question: 'no answer',
      expectedTopic: null,
      expectedUrlContains: null,
      requiredTerms: [],
      expectedProvenance: null,
      expectNoAnswer: true,
    } as const;
    expect(scoreReviewed(question, [], 1200, null, [], 'lookup failed')).toMatchObject({
      answered: false,
      attributed: false,
    });
    expect(scoreReviewed(question, [], 1200, null, [])).toMatchObject({
      answered: true,
      attributed: true,
    });
    const answer = {
      url: 'https://en.doc.boardgamearena.com/Studio',
      provenance: 'official',
      excerpt: 'Contents\nPHP: 8.4',
      retrievedAt: '2026-10-02',
      trust: 'untrusted-content',
    };
    const studio = {
      ...question,
      id: 'studio',
      expectNoAnswer: false,
      expectedUrlContains: 'Studio',
      requiredTerms: ['PHP'],
      expectedProvenance: 'official',
    } as const;
    expect(scoreReviewed(studio, [answer], 1200, answer.url, ['Contents']).answered).toBe(false);
    expect(
      scoreReviewed(studio, [{ ...answer, url: answer.url + 'Other' }], 1200, answer.url, [])
        .answered,
    ).toBe(false);
  });
});
