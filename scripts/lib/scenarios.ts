import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

/**
 * A scenario is declared by prefixing a test title with one or more bracketed
 * identifiers, for example:
 *
 *   it('[INT-POLICY-TIMEOUT] aborts a slow operation', …)
 *
 * The declaration is what links an executable test to a manifest entry, a
 * threat-model mitigation, or a compatibility claim. It proves the test exists
 * and runs in `pnpm check`; the test run itself proves it passes.
 */
const DECLARATION = /['"`]((?:\[[A-Z0-9]+(?:-[A-Z0-9]+)+\])+)/gu;
const IDENTIFIER = /\[([A-Z0-9]+(?:-[A-Z0-9]+)+)\]/gu;

export async function listFiles(directory: string, suffix = '.ts'): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return await listFiles(path, suffix);
      }
      return path.endsWith(suffix) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

/** Maps every declared scenario identifier to the test files that declare it. */
export async function collectDeclaredScenarios(testsRoot: string): Promise<Map<string, string[]>> {
  const declared = new Map<string, string[]>();
  for (const file of await listFiles(testsRoot)) {
    const source = await readFile(file, 'utf8');
    const location = relative(testsRoot, file).split(sep).join('/');
    for (const declaration of source.matchAll(DECLARATION)) {
      for (const identifier of (declaration[1] ?? '').matchAll(IDENTIFIER)) {
        const id = identifier[1];
        if (id === undefined) {
          continue;
        }
        declared.set(id, [...(declared.get(id) ?? []), location]);
      }
    }
  }
  return declared;
}
