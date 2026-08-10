import { isBuiltin } from 'node:module';

import ts from 'typescript';

/**
 * Decides whether a production module can reach a privileged effect.
 *
 * The rule the project states is that only `src/policy.ts` may touch the
 * filesystem, the network, or a subprocess. The rule it enforced until
 * 2026-08-08 was narrower: eight exact `node:` specifiers, matched with a
 * regular expression that wanted single quotes. `fs/promises` without the
 * prefix, `node:dns`, `node:http2`, a dynamic `import()`, a re-export, and
 * global `fetch` all passed a read-only probe of that check. No production
 * module was actually doing any of it — this is a hole in the control, not
 * evidence of one being used — but a control with a hole in it is not what the
 * threat model says is there.
 *
 * Two decisions make this version hold:
 *
 * - **It reads the syntax rather than the text.** Every form that can name a
 *   module is a node in the tree: a static import, a re-export, `import()`,
 *   `require()`, and `import x = require()`. Quoting style, whitespace, and
 *   line breaks stop mattering once the parser has done the work.
 * - **It fails closed.** A builtin that is not on the small allowlist below is
 *   refused, so a Node release that adds an effectful module does not silently
 *   become reachable. Being wrong about a pure module costs one line here;
 *   being wrong about an effectful one costs the boundary.
 *
 * What it deliberately does not do is analyse dependencies. A package from npm
 * can do whatever it likes; that is the supply-chain risk the threat model
 * records separately, and pretending this check covers it would be worse than
 * saying it does not.
 */

/** Builtins with no effect of their own: data, text, and plumbing. */
export const PURE_BUILTINS = new Set([
  'assert',
  'buffer',
  'crypto',
  'events',
  'path',
  'punycode',
  'querystring',
  'stream',
  'string_decoder',
  'url',
  'util',
  'zlib',
]);

/** Globals that reach the network or start a thread without importing anything. */
export const RESTRICTED_GLOBALS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'importScripts',
  'navigator',
]);

/** Members of `process` that open a door the boundary is supposed to own. */
const RESTRICTED_PROCESS_MEMBERS = new Set(['binding', '_linkedBinding', 'dlopen']);

export interface EffectSource {
  /** How the file should be named in a finding. */
  readonly path: string;
  readonly text: string;
}

/** The module a specifier names, without its prefix or subpath. */
function builtinName(specifier: string): string | null {
  const withoutPrefix = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  const root = withoutPrefix.split('/')[0] ?? '';
  if (specifier.startsWith('node:')) {
    // `node:` is a claim about what it is, so it is judged as a builtin even if
    // this Node release has never heard of it.
    return root;
  }
  return isBuiltin(root) ? root : null;
}

function isRestrictedSpecifier(specifier: string): boolean {
  const builtin = builtinName(specifier);
  return builtin !== null && !PURE_BUILTINS.has(builtin);
}

/**
 * Every privileged reach in one file.
 *
 * A type-only import is not a reach: it is erased before anything runs, and
 * refusing it would push readable code into `any` for no protection.
 */
export function findEffectBypasses(source: EffectSource): string[] {
  const found: string[] = [];
  const tree = ts.createSourceFile(
    source.path,
    source.text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );

  const report = (what: string, node: ts.Node): void => {
    const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    found.push(`${source.path}:${String(line + 1)}: ${what}`);
  };

  const checkSpecifier = (specifier: ts.Expression | undefined, node: ts.Node): void => {
    if (specifier !== undefined && ts.isStringLiteral(specifier)) {
      if (isRestrictedSpecifier(specifier.text)) {
        report(specifier.text, node);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      // `import type` is erased before anything runs, so it reaches nothing.
      if (node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword) {
        checkSpecifier(node.moduleSpecifier, node);
      }
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly) {
        checkSpecifier(node.moduleSpecifier, node);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        checkSpecifier(node.moduleReference.expression, node);
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
      if (isDynamicImport || isRequire) {
        checkSpecifier(node.arguments[0], node);
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const { expression, name } = node;
      if (
        ts.isIdentifier(expression) &&
        expression.text === 'process' &&
        RESTRICTED_PROCESS_MEMBERS.has(name.text)
      ) {
        report(`process.${name.text}`, node);
      }
      // `globalThis.fetch` names the same door as bare `fetch`.
      if (
        ts.isIdentifier(expression) &&
        expression.text === 'globalThis' &&
        RESTRICTED_GLOBALS.has(name.text)
      ) {
        report(`globalThis.${name.text}`, node);
      }
    } else if (ts.isIdentifier(node) && RESTRICTED_GLOBALS.has(node.text)) {
      // Only a use of the global itself. An identifier that is the *name* of
      // something — a property, a parameter, a declaration — is somebody
      // else's word that happens to be spelled the same.
      const parent = node.parent as (ts.Node & { readonly name?: ts.Node }) | undefined;
      const isOwnName = parent?.name === node;
      if (!isOwnName) {
        report(node.text, node);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(tree);
  return found;
}
