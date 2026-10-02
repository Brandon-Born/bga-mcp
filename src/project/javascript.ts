import { parse, type AnyNode, type Program } from 'acorn';

import type { ParseOutcome } from './parse.js';
import { cancellationCheckpoint } from '../deadline.js';

/** Parse, never execute. Acorn advises parse over its heuristic standalone tokenizer.
 * https://github.com/acornjs/acorn/blob/master/acorn/README.md
 * https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-comments:
 * "Comments behave like white space and are discarded".
 */
export function readJavaScript(source: string, signal?: AbortSignal): ParseOutcome<Program | null> {
  cancellationCheckpoint(signal);
  try {
    const options = {
      ecmaVersion: 'latest',
      onToken: () => cancellationCheckpoint(signal),
      onComment: () => cancellationCheckpoint(signal),
    } as const;
    let value: Program;
    try {
      value = parse(source, { ...options, sourceType: 'module' });
    } catch (error) {
      cancellationCheckpoint(signal);
      if (!(error instanceof SyntaxError)) throw error;
      // Legacy scripts need not be strict modules; this is another full parse,
      // never recovery through raw source or heuristic tokenization.
      value = parse(source, { ...options, sourceType: 'script' });
    }
    cancellationCheckpoint(signal);
    return { value, unsupported: [] };
  } catch (error) {
    cancellationCheckpoint(signal);
    if (!(error instanceof SyntaxError) && !(error instanceof RangeError)) throw error;
    // Do not reflect parser messages: they can contain untrusted source text.
    return { value: null, unsupported: ['client syntax could not be parsed as JavaScript'] };
  }
}

function isNode(value: unknown): value is AnyNode {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string' &&
    'start' in value &&
    typeof value.start === 'number'
  );
}

/** Iterative AST traversal retains executable template substitutions, not literal text. */
export function* walkJavaScript(root: AnyNode, signal?: AbortSignal): Generator<AnyNode> {
  const pending = [root];
  while (pending.length > 0) {
    cancellationCheckpoint(signal);
    const node = pending.pop();
    if (node === undefined) continue;
    yield node;
    const children: AnyNode[] = [];
    for (const value of Object.values(node) as unknown[]) {
      if (isNode(value)) children.push(value);
      else if (Array.isArray(value)) {
        for (const entry of value as unknown[]) {
          cancellationCheckpoint(signal);
          if (isNode(entry)) children.push(entry);
        }
      }
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      cancellationCheckpoint(signal);
      const child = children[index];
      if (child !== undefined) pending.push(child);
    }
  }
}
