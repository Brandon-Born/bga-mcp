/**
 * Reads the tables out of a Markdown document.
 *
 * A human-readable document is only a view of a machine-readable record if
 * something compares the two, and comparing prose is not possible. Tables are,
 * so every field a document and its record share is carried in a table and read
 * back from here.
 *
 * This is deliberately small: a table is a run of consecutive lines beginning
 * with a pipe, whose second line is the alignment row. Anything else in the
 * document is ignored.
 */

export interface MarkdownTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** 1-based line number of the header, so a failure can be located. */
  readonly line: number;
}

const ALIGNMENT = /^:?-{3,}:?$/u;

/** Splits one row into trimmed cells, dropping the empty edges the pipes make. */
function cells(row: string): string[] {
  const trimmed = row.trim();
  const inner = trimmed.slice(
    trimmed.startsWith('|') ? 1 : 0,
    trimmed.endsWith('|') ? -1 : undefined,
  );
  return inner.split('|').map((cell) => cell.trim());
}

function isAlignmentRow(row: string): boolean {
  const parts = cells(row);
  return parts.length > 0 && parts.every((part) => ALIGNMENT.test(part));
}

export function readTables(markdown: string): readonly MarkdownTable[] {
  const lines = markdown.split('\n');
  const tables: MarkdownTable[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index] ?? '';
    const alignment = lines[index + 1] ?? '';
    if (!header.trimStart().startsWith('|') || !isAlignmentRow(alignment)) {
      continue;
    }

    const rows: string[][] = [];
    let cursor = index + 2;
    while ((lines[cursor] ?? '').trimStart().startsWith('|')) {
      rows.push(cells(lines[cursor] ?? ''));
      cursor += 1;
    }
    tables.push({ header: cells(header), rows, line: index + 1 });
    index = cursor - 1;
  }

  return tables;
}
