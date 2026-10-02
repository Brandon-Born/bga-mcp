/**
 * The topics `bga://docs/{topic}` resolves to.
 *
 * Resolution is a fixed table rather than a search, for two reasons. A resource
 * must be deterministic — the same URI has to mean the same page every time —
 * and a topic that became an arbitrary path would hand URI text to the page
 * builder, which is exactly what the policy boundary refuses.
 *
 * Every page here was retrieved and read while writing this table, so a topic
 * cannot point at a page nobody checked.
 */

import { cancellationCheckpoint } from '../deadline.js';

export interface DocumentationTopic {
  readonly topic: string;
  readonly sourceId: string;
  /** Page path within the source, already in wiki form. */
  readonly path: string;
  readonly title: string;
  readonly summary: string;
  /**
   * Terms that mean this topic.
   *
   * Curated rather than derived, because the wiki's own ranking answers
   * "where do state classes live" with whichever page mentions those words
   * most, which is not the page that answers the question.
   */
  readonly keywords: readonly string[];
}

export const DOCUMENTATION_TOPICS: readonly DocumentationTopic[] = [
  {
    topic: 'file-reference',
    sourceId: 'bga-studio-framework-reference',
    path: 'Studio_file_reference',
    title: 'Studio file reference',
    summary: 'Which files a project has, where they live, and which are deprecated.',
    keywords: [
      'file',
      'files',
      'structure',
      'directory',
      'layout',
      'project',
      'contains',
      'dbmodel',
      'tpl',
      'css',
    ],
  },
  {
    topic: 'game-logic',
    sourceId: 'bga-studio-framework-reference',
    path: 'Main_game_logic:_Game.php',
    title: 'Main game logic',
    summary: 'The game class, its location in modules/php, and the legacy flat form.',
    keywords: [
      'game logic',
      'game.php',
      'game class',
      'table class',
      'modules/php',
      'server side',
      'php class',
    ],
  },
  {
    topic: 'states',
    sourceId: 'bga-studio-framework-reference',
    path: 'State_classes:_State_directory',
    title: 'State classes',
    summary: 'State classes under modules/php/States and how they declare transitions.',
    keywords: [
      'state',
      'states',
      'state machine',
      'state classes',
      'transition',
      'transitions',
      'states.inc.php',
      'gamestate',
    ],
  },
  {
    topic: 'client',
    sourceId: 'bga-studio-framework-reference',
    path: 'Game_interface_logic:_Game.js',
    title: 'Game interface logic',
    summary: 'The client entry point in modules/js and the legacy flat file.',
    keywords: [
      'client',
      'interface',
      'javascript',
      'js',
      'game.js',
      'modules/js',
      'dojo',
      'front end',
      'browser',
    ],
  },
  {
    topic: 'migration',
    sourceId: 'bga-studio-framework-reference',
    path: 'BGA_Studio_Migration_Guide',
    title: 'BGA Studio migration guide',
    summary: 'What moves from the legacy form to the modern one, file by file.',
    keywords: [
      'migration',
      'migrate',
      'legacy',
      'modern',
      'deprecated',
      'upgrade',
      'remove',
      'moved',
    ],
  },
  {
    topic: 'studio',
    sourceId: 'bga-studio-framework-reference',
    path: 'Studio',
    title: 'BGA Studio',
    summary: 'The Studio overview, including the software versions it runs.',
    keywords: [
      'studio',
      'version',
      'versions',
      'php version',
      'mysql',
      'software',
      'environment',
      'sftp',
    ],
  },
  {
    topic: 'cookbook',
    sourceId: 'bga-studio-community-pages',
    path: 'BGA_Studio_Cookbook',
    title: 'BGA Studio Cookbook',
    summary: 'Community-contributed recipes. Anyone may edit this page.',
    keywords: ['cookbook', 'recipe', 'recipes', 'community', 'example', 'examples', 'snippet'],
  },
];

export function topicFor(topic: string): DocumentationTopic | null {
  return DOCUMENTATION_TOPICS.find((entry) => entry.topic === topic) ?? null;
}

/** The topic names, for an error that tells a caller what it could have asked for. */
export function topicNames(): readonly string[] {
  return DOCUMENTATION_TOPICS.map((entry) => entry.topic);
}

/**
 * Finds the topic a question is about, or `null` when none clearly is.
 *
 * A curated match beats the wiki's own ranking for the questions developers
 * actually ask, and returning `null` rather than a weak guess is what keeps a
 * question the documentation cannot answer unanswered.
 */
export function topicForQuery(query: string, signal?: AbortSignal): DocumentationTopic | null {
  cancellationCheckpoint(signal);
  const lowered = query.toLowerCase();
  // The migration guide says "When all classes are migrated, you can remove
  // the states.inc.php file" (States section, reviewed 2026-10-02). Prefer
  // that conditional passage over the state-class reference for removal questions.
  // This routing is a relevance heuristic, not a rule that authorizes deletion.
  if (/\bstates\.inc\.php\b/u.test(lowered) && /\b(?:remov\w*|delet\w*)\b/u.test(lowered)) {
    return topicFor('migration');
  }
  const scored = DOCUMENTATION_TOPICS.map((topic) => {
    cancellationCheckpoint(signal);
    const haystack = [topic.topic, topic.title, topic.summary].join(' ').toLowerCase();
    let score = 0;
    for (const keyword of topic.keywords) {
      cancellationCheckpoint(signal);
      if (lowered.includes(keyword)) {
        // A longer keyword is a stronger signal than a single common word.
        score += keyword.includes(' ') ? 3 : 2;
      }
    }
    for (const term of lowered.split(/[^a-z0-9.]+/u).filter((word) => word.length > 3)) {
      cancellationCheckpoint(signal);
      if (haystack.includes(term)) {
        score += 1;
      }
    }
    return { topic, score };
  }).sort((left, right) => right.score - left.score);

  const best = scored[0];
  const runnerUp = scored[1];
  if (best === undefined || best.score < 2) {
    return null;
  }
  // A tie means the question did not pick a topic, so nothing is assumed.
  return runnerUp?.score === best.score ? null : best.topic;
}

/**
 * @internal Source-backed location/overview hints; never add every topic keyword.
 * The file reference links current Game.php and Game.js pages, whose opening
 * notes explicitly name modules/php and modules/js and retain legacy usage.
 * Sources and minimal quotations are retained in the BGA-211 capture review.
 * Other questions retain their own terms rather than receiving location facts.
 */
export function documentationPassageQuery(
  topic: DocumentationTopic | null,
  query: string | null,
): string {
  if (topic === null) return query ?? '';
  const location =
    query === null || /\b(?:where|live|location|entry|class|files|contain\w*)\b/iu.test(query);
  switch (topic.topic) {
    case 'game-logic':
      return location ? 'modules/php' : query;
    case 'client':
      return location ? 'modules/js' : query;
    case 'file-reference':
      return location ? 'dbmodel.sql' : query;
    case 'states':
      return location ? 'modules/php/States' : query;
    case 'migration':
      return query === null || /states\.inc\.php/iu.test(query)
        ? 'When all classes are migrated'
        : query;
    case 'studio':
      return query === null || /\b(?:version\w*|software)\b/iu.test(query)
        ? 'Software Versions'
        : query;
    case 'cookbook':
      return query === null || /\b(?:recipe\w*|community|cookbook)\b/iu.test(query)
        ? 'cookbook of design and implementation recipes'
        : query;
    default:
      return query ?? topic.summary;
  }
}
