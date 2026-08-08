/**
 * Turns a retrieved page into the short quotation a result may carry.
 *
 * No approved source permits reproducing a page, so this is deliberately an
 * excerpt: enough to answer a question and cite it, never the article. It also
 * strips markup, which is where a page hides text a reader would not see.
 *
 * Pure functions, no I/O.
 */

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
export function htmlToText(html: string): string {
  const withoutInvisible = html.replace(INVISIBLE_CONTENT, ' ');
  const withBreaks = withoutInvisible.replace(BLOCK_ELEMENTS, '\n').replace(/<br\s*\/?>/giu, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/gu, ' ');
  const decoded = withoutTags
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;|&#39;/giu, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
  return decoded
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/gu, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Reads the document title, when the page has one. */
export function titleOf(html: string, fallback: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html);
  const title = match?.[1] === undefined ? '' : htmlToText(match[1]).trim();
  return title.length > 0 ? title : fallback;
}

/**
 * Takes the passage most likely to answer the query.
 *
 * Whole lines are kept rather than a window around a character offset, so an
 * excerpt is never a sentence cut in half, and the beginning of the page is the
 * fallback because that is where a wiki page states what it is about.
 */
export function excerptFor(text: string, query: string, maxChars: number): string {
  const lines = text.split('\n');
  const terms = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 2);

  let start = 0;
  if (terms.length > 0) {
    const scored = lines.map((line, index) => {
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
