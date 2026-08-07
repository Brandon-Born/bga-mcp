import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { topicNames } from '../src/docs/topics.js';
import { GateReport, expectSeededFailure, reportOrExit } from './lib/gate.js';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface Question {
  readonly id: string;
  readonly question: string;
  readonly expectedTopic: string | null;
  readonly expectedUrlContains: string | null;
  readonly requiredTerms: readonly string[];
  readonly expectedProvenance: string | null;
  readonly expectNoAnswer?: boolean;
}

interface EvaluationSet {
  readonly thresholds: { readonly minAnswered: number; readonly minAttributed: number };
  readonly questions: readonly Question[];
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

function validator(schema: object): (value: unknown) => string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  return (value) =>
    validate(value)
      ? []
      : (validate.errors ?? []).map(
          (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
        );
}

/**
 * Checks the evaluation set itself, offline.
 *
 * Running the set needs the live wiki; checking that it is a usable set does
 * not. This gate is the part that can run on every commit: that the questions
 * are complete, point at topics that exist, and cover the cases a retrieval
 * capability gets wrong — a question with no answer, and a question shaped like
 * an instruction.
 */
function check(set: unknown, validate: (value: unknown) => string[]): GateReport {
  const report = new GateReport();
  for (const error of validate(set)) {
    report.require(false, `Documentation evaluation set does not match its schema: ${error}`);
  }
  if (report.failed) {
    return report;
  }

  const { questions, thresholds } = set as EvaluationSet;
  const known = new Set(topicNames());
  const seen = new Set<string>();

  for (const question of questions) {
    report.require(!seen.has(question.id), `Duplicate evaluation question id: ${question.id}`);
    seen.add(question.id);
    if (question.expectedTopic !== null) {
      report.require(
        known.has(question.expectedTopic),
        `${question.id} expects topic ${question.expectedTopic}, which is not a known topic`,
      );
    }
    const answerable = question.expectNoAnswer !== true;
    report.require(
      !answerable || question.expectedUrlContains !== null,
      `${question.id} is answerable but names no expected page, so nothing is being measured`,
    );
    report.require(
      answerable || question.expectedTopic === null,
      `${question.id} expects no answer but names a topic`,
    );
  }

  report.require(
    questions.some((question) => question.expectNoAnswer === true),
    'The set has no unanswerable question, so it cannot catch a capability that always answers',
  );
  report.require(
    questions.some((question) => question.expectedProvenance === 'community'),
    'The set has no community-sourced question, so it cannot catch provenance being flattened',
  );
  report.require(
    thresholds.minAttributed === 1,
    'Attribution is not negotiable: minAttributed must be 1',
  );

  return report;
}

function soundSet(): EvaluationSet {
  return {
    thresholds: { minAnswered: 0.8, minAttributed: 1 },
    questions: [
      {
        id: 'states',
        question: 'where do state classes live',
        expectedTopic: 'states',
        expectedUrlContains: 'State_classes',
        requiredTerms: ['modules/php/States'],
        expectedProvenance: 'official',
      },
      {
        id: 'community',
        question: 'community recipes',
        expectedTopic: 'cookbook',
        expectedUrlContains: 'Cookbook',
        requiredTerms: [],
        expectedProvenance: 'community',
      },
      {
        id: 'none',
        question: 'kubernetes ingress',
        expectedTopic: null,
        expectedUrlContains: null,
        requiredTerms: [],
        expectedProvenance: null,
        expectNoAnswer: true,
      },
    ],
  };
}

function seeded(mutate: (set: EvaluationSet) => EvaluationSet): EvaluationSet {
  return mutate(soundSet());
}

async function main(): Promise<void> {
  const schema = await loadJson<object>('config/doc-evaluation.schema.json');
  const validate = validator(schema);
  // The schema is not applied to the seeds: they exercise the rules above it.
  const permissive = (): string[] => [];

  expectSeededFailure(
    'evaluation unknown topic',
    check(
      seeded((set) => ({
        ...set,
        questions: set.questions.map((question) =>
          question.id === 'states' ? { ...question, expectedTopic: 'not-a-topic' } : question,
        ),
      })),
      permissive,
    ),
  );
  expectSeededFailure(
    'evaluation measures nothing',
    check(
      seeded((set) => ({
        ...set,
        questions: set.questions.map((question) =>
          question.id === 'states' ? { ...question, expectedUrlContains: null } : question,
        ),
      })),
      permissive,
    ),
  );
  expectSeededFailure(
    'evaluation always answers',
    check(
      seeded((set) => ({
        ...set,
        questions: set.questions.filter((question) => question.expectNoAnswer !== true),
      })),
      permissive,
    ),
  );
  expectSeededFailure(
    'evaluation flattens provenance',
    check(
      seeded((set) => ({
        ...set,
        questions: set.questions.filter((question) => question.expectedProvenance !== 'community'),
      })),
      permissive,
    ),
  );
  expectSeededFailure(
    'evaluation negotiable attribution',
    check(
      seeded((set) => ({ ...set, thresholds: { ...set.thresholds, minAttributed: 0.5 } })),
      permissive,
    ),
  );

  const set = await loadJson<EvaluationSet>('config/doc-evaluation.json');
  const report = check(set, validate);
  const unanswerable = set.questions.filter((question) => question.expectNoAnswer === true).length;
  reportOrExit(
    'documentation evaluation set',
    report,
    `Documentation evaluation set is complete and its gate detects seeded defects: ` +
      `${String(set.questions.length)} questions, ${String(unanswerable)} of which must return nothing, ` +
      `answered threshold ${String(set.thresholds.minAnswered)}. Run it against the live wiki with \`pnpm test:docs-eval\`.`,
  );
}

await main();
