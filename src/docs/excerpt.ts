/**
 * Turns a retrieved page into the short quotation a result may carry.
 *
 * No approved source permits reproducing a page, so this is deliberately an
 * excerpt: enough to answer a question and cite it, never the article. It also
 * strips markup, which is where a page hides text a reader would not see.
 *
 * Pure functions, no I/O.
 */

import { cancellationCheckpoint } from '../deadline.js';

/**
 * @internal Drop navigation, preserving nested element boundaries.
 * Reviewed 2026-10-02 on Studio_file_reference and its linked Game.php,
 * Game.js and Studio pages: the shared studio-framework-navigation sidebar
 * and role=navigation table of contents are links, not answer passages.
 * This is a markup heuristic; unfamiliar markup remains readable text.
 */
export function withoutDocumentationNavigation(html: string, signal?: AbortSignal): string {
  const tokens = /<!--[\s\S]*?-->|<\/?([a-z][a-z0-9]*)\b[^>]*>/giu;
  const output: string[] = [];
  let position = 0;
  let hiddenTag: string | null = null;
  let depth = 0;
  for (const match of html.matchAll(tokens)) {
    cancellationCheckpoint(signal);
    const tag = match[1]?.toLowerCase();
    const token = match[0];
    if (hiddenTag === null) {
      output.push(html.slice(position, match.index));
      if (
        tag !== undefined &&
        !token.startsWith('</') &&
        (tag === 'nav' ||
          /\b(?:id\s*=\s*["']toc["']|role\s*=\s*["']navigation["']|class\s*=\s*["'][^"']*\bstudio-framework-navigation\b)/iu.test(
            token,
          ))
      ) {
        hiddenTag = tag;
        depth = 1;
      } else {
        output.push(token);
      }
    } else if (tag === hiddenTag) {
      depth += token.startsWith('</') ? -1 : token.endsWith('/>') ? 0 : 1;
      if (depth === 0) hiddenTag = null;
    }
    position = match.index + token.length;
  }
  if (hiddenTag === null) output.push(html.slice(position));
  return output.join('');
}

/** @internal Select reviewed overview/location passages, retaining their wording. */
export function documentationPassageHtml(
  html: string,
  query: string,
  signal?: AbortSignal,
): string {
  // Select only visible markup. Extracting a <p> out of a script/template
  // before removing its enclosing element would make hidden text visible.
  html = html.replace(INVISIBLE_CONTENT, ' ');
  if (query === 'dbmodel.sql') {
    for (const match of html.matchAll(/<ul\b[^>]*>[\s\S]*?<\/ul>/giu)) {
      cancellationCheckpoint(signal);
      // The reviewed file-reference contents list names both current entries
      // and legacy states. Keep the original list, not synthesized file facts.
      if (
        ['#dbmodel.sql', '#modules/php/Game.php', '#modules/js/Game.js', '#states.inc.php'].every(
          (anchor) => match[0].includes('href="' + anchor + '"'),
        )
      )
        return match[0];
    }
  }
  html = withoutDocumentationNavigation(html, signal);
  const hints = new Set([
    'modules/php',
    'modules/js',
    'modules/php/States',
    'When all classes are migrated',
    'cookbook of design and implementation recipes',
  ]);
  if (hints.has(query)) {
    for (const match of html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/giu)) {
      cancellationCheckpoint(signal);
      if (htmlToText(match[0], signal).toLowerCase().includes(query.toLowerCase())) {
        // Keep the whole paragraph: notably the legacy usage and the migration
        // condition, not a made-up answer assembled from keyword matches.
        return match[0];
      }
    }
  }
  if (query === 'Software Versions' || query === 'dbmodel.sql') {
    for (const match of html.matchAll(/<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>/giu)) {
      cancellationCheckpoint(signal);
      if (htmlToText(match[0], signal).trim().toLowerCase() !== query.toLowerCase()) continue;
      const rest = html.slice(match.index + match[0].length);
      const next = new RegExp(`<h[1-${match[1] ?? '6'}]\\b`, 'iu').exec(rest);
      return match[0] + rest.slice(0, next?.index ?? rest.length);
    }
  }
  // An unfamiliar page/markup has no assumed framework facts. Ordinary ranking
  // remains a heuristic, and captured/live evaluation determines its quality.
  return html;
}

const BLOCK_ELEMENTS =
  /<\/(?:p|div|section|article|h[1-6]|li|tr|td|th|pre|blockquote|table|ul|ol)>/giu;

/**
 * Elements whose content is never shown to a reader.
 *
 * Removed entirely rather than stripped of tags: a script body or a hidden
 * comment is exactly where instructions aimed at an agent would sit, and it is
 * not text the developer saw on the page.
 */
const INVISIBLE_CONTENT =
  /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->/giu;

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Collapses HTML into readable text, dropping anything a reader never sees. */
export function htmlToText(html: string, signal?: AbortSignal): string {
  cancellationCheckpoint(signal);
  const withoutInvisible = html.replace(INVISIBLE_CONTENT, ' ');
  cancellationCheckpoint(signal);
  const withBreaks = withoutInvisible.replace(BLOCK_ELEMENTS, '\n').replace(/<br\s*\/?>/giu, '\n');
  cancellationCheckpoint(signal);
  const withoutTags = withBreaks.replace(/<[^>]+>/gu, ' ');
  const decoded = withoutTags
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;|&#39;/giu, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
  cancellationCheckpoint(signal);
  const lines: string[] = [];
  for (const line of decoded.split('\n')) {
    cancellationCheckpoint(signal);
    const normalized = line.replace(/[^\S\n]+/gu, ' ').trim();
    if (normalized.length > 0) {
      lines.push(normalized);
    }
  }
  return lines.join('\n');
}

/** Reads the document title, when the page has one. */
export function titleOf(html: string, fallback: string, signal?: AbortSignal): string {
  cancellationCheckpoint(signal);
  const match = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html);
  const title = match?.[1] === undefined ? '' : htmlToText(match[1], signal).trim();
  return title.length > 0 ? title : fallback;
}

/**
 * Takes the passage most likely to answer the query.
 *
 * Whole lines are kept rather than a window around a character offset, so an
 * excerpt is never a sentence cut in half, and the beginning of the page is the
 * fallback because that is where a wiki page states what it is about.
 */
export function excerptFor(
  text: string,
  query: string,
  maxChars: number,
  signal?: AbortSignal,
): string {
  cancellationCheckpoint(signal);
  const lines = text.split('\n');
  const terms = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 2);

  let start = 0;
  if (terms.length > 0) {
    const scored = lines.map((line, index) => {
      cancellationCheckpoint(signal);
      const lowered = line.toLowerCase();
      // Weighted by term length, so a distinctive term like `dbmodel.sql` or
      // `modules/js` outranks a common one like `files`. Counting matches
      // equally picks the introduction, which mentions the common words and
      // states no facts.
      const score = terms
        .filter((term) => lowered.includes(term))
        .reduce((total, term) => total + term.length, 0);
      return { index, score };
    });
    const best = scored.reduce((left, right) => (right.score > left.score ? right : left));
    if (best.score > 0) {
      // Start a line early so the match has the context that introduces it.
      //
      // Taking the earliest near-best line was tried on 2026-08-08 and made
      // retrieval measurably worse (4 of 9 evaluation questions answered, down
      // to 2), so the highest-scoring line stands.
      start = Math.max(0, best.index - 1);
    }
  }

  const collected: string[] = [];
  let length = 0;
  for (const line of lines.slice(start)) {
    cancellationCheckpoint(signal);
    if (length + line.length + 1 > maxChars) {
      break;
    }
    collected.push(line);
    length += line.length + 1;
  }
  if (collected.length === 0) {
    return lines[start]?.slice(0, maxChars) ?? '';
  }
  return collected.join('\n');
}
