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

export interface DocumentationTopic {
  readonly topic: string;
  readonly sourceId: string;
  /** Page path within the source, already in wiki form. */
  readonly path: string;
  readonly title: string;
  readonly summary: string;
}

export const DOCUMENTATION_TOPICS: readonly DocumentationTopic[] = [
  {
    topic: 'file-reference',
    sourceId: 'bga-studio-framework-reference',
    path: 'Studio_file_reference',
    title: 'Studio file reference',
    summary: 'Which files a project has, where they live, and which are deprecated.',
  },
  {
    topic: 'game-logic',
    sourceId: 'bga-studio-framework-reference',
    path: 'Main_game_logic:_yourgamename.game.php',
    title: 'Main game logic',
    summary: 'The game class, its location in modules/php, and the legacy flat form.',
  },
  {
    topic: 'states',
    sourceId: 'bga-studio-framework-reference',
    path: 'State_classes:_State_directory',
    title: 'State classes',
    summary: 'State classes under modules/php/States and how they declare transitions.',
  },
  {
    topic: 'client',
    sourceId: 'bga-studio-framework-reference',
    path: 'Game_interface_logic:_yourgamename.js',
    title: 'Game interface logic',
    summary: 'The client entry point in modules/js and the legacy flat file.',
  },
  {
    topic: 'migration',
    sourceId: 'bga-studio-framework-reference',
    path: 'BGA_Studio_Migration_Guide',
    title: 'BGA Studio migration guide',
    summary: 'What moves from the legacy form to the modern one, file by file.',
  },
  {
    topic: 'studio',
    sourceId: 'bga-studio-framework-reference',
    path: 'Studio',
    title: 'BGA Studio',
    summary: 'The Studio overview, including the software versions it runs.',
  },
  {
    topic: 'cookbook',
    sourceId: 'bga-studio-community-pages',
    path: 'BGA_Studio_Cookbook',
    title: 'BGA Studio Cookbook',
    summary: 'Community-contributed recipes. Anyone may edit this page.',
  },
];

export function topicFor(topic: string): DocumentationTopic | null {
  return DOCUMENTATION_TOPICS.find((entry) => entry.topic === topic) ?? null;
}

/** The topic names, for an error that tells a caller what it could have asked for. */
export function topicNames(): readonly string[] {
  return DOCUMENTATION_TOPICS.map((entry) => entry.topic);
}
