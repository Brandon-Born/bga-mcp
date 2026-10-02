import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { promisify } from 'node:util';

import ts from 'typescript';

import type { CompatibilityMatrix } from './compatibility.js';
import {
  frameworkHolds,
  type FrameworkHold,
  type FrameworkLedger,
  type FrameworkReview,
  type FrameworkSource,
} from './framework-change.js';
import { GateReport } from './gate.js';
import { collectDeclaredScenarios } from './scenarios.js';

export const FRAMEWORK_INPUTS = [
  'src',
  'scripts',
  'tests',
  'config',
  'docs',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'README.md',
  'SECURITY.md',
  'package.json',
  'pnpm-lock.yaml',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.build.json',
  'eslint.config.js',
  '.github',
  '.gitignore',
];
export interface DependencyGroup {
  readonly role: 'semantic' | 'proof' | 'unrelated';
  readonly sources: '*' | 'scenarios' | readonly string[];
  readonly reason: string;
  readonly paths: readonly string[];
}
export interface DependencyMap {
  readonly schemaVersion: number;
  readonly groups: readonly DependencyGroup[];
  readonly generatedImports?: readonly {
    readonly file: string;
    readonly expression: string;
    readonly reason: string;
    readonly dependencies: readonly string[];
  }[];
}
export interface DependencyFile {
  readonly path: string;
  readonly text: string | null;
  readonly tracked: boolean;
  readonly regular: boolean;
}
export interface DependencyEntry {
  readonly path: string;
  readonly digest: string;
  readonly reason: string;
}
export interface FrameworkDependencies {
  readonly semanticDigest: string;
  readonly proofDigest: string;
  readonly semantic: readonly DependencyEntry[];
  readonly proof: readonly DependencyEntry[];
  readonly issues: readonly string[];
}
export interface FrameworkProof {
  readonly dependencyDigest: string;
  readonly evidenceDigest: string;
  readonly evidenceCommit: string;
  readonly ciRun: string;
  readonly recordedAt: string;
}
const sha = /^sha256:[0-9a-f]{64}$/u;
const execute = promisify(execFile);
export const dependencyDigest = (value: unknown): string =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const safePath = (path: string): boolean =>
  path !== '' &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  !path.split('/').some((part) => part === '..' || part === '.' || part === '');

/** Exact paths only: new files never inherit an exemption from a directory glob. */
export function verifyDependencyMap(
  map: DependencyMap,
  sources: readonly FrameworkSource[],
): GateReport {
  const report = new GateReport();
  report.require(map.schemaVersion === 1, 'Unknown dependency map version');
  const paths = new Set<string>();
  for (const group of map.groups) {
    report.require(
      group.reason.trim() !== '' && group.paths.length > 0,
      'Unexplained dependency group',
    );
    report.require(
      group.sources !== 'scenarios' || group.role === 'proof',
      'Scenario mapping is proof-only',
    );
    if (group.sources !== '*' && group.sources !== 'scenarios') {
      report.require(group.sources.length > 0, 'Empty source mapping');
      for (const url of group.sources)
        report.require(
          sources.some((source) => source.url === url),
          `Unmapped dependency source ${url}`,
        );
    }
    for (const path of group.paths) {
      report.require(
        safePath(path) && !paths.has(path),
        `Unsafe or ambiguous dependency path ${path}`,
      );
      paths.add(path);
    }
  }
  for (const path of [
    'config/framework-dependencies.json',
    'config/framework-review.schema.json',
    'scripts/framework-change.ts',
    'scripts/lib/framework-change.ts',
    'scripts/lib/framework-dependencies.ts',
  ])
    report.require(
      map.groups.some(
        (group) => group.role === 'semantic' && group.sources === '*' && group.paths.includes(path),
      ),
      `Framework gate dependency must remain shared: ${path}`,
    );
  const generated = new Set<string>();
  for (const entry of map.generatedImports ?? []) {
    const key = `${entry.file}:${entry.expression}`;
    report.require(
      !generated.has(key) &&
        entry.expression.trim() !== '' &&
        entry.reason.trim() !== '' &&
        entry.dependencies.length > 0 &&
        entry.dependencies.every(safePath) &&
        map.groups.some((group) => group.role === 'proof' && group.paths.includes(entry.file)),
      `Invalid reviewed generated import: ${entry.file}`,
    );
    generated.add(key);
  }
  return report;
}

/** Include ignored/untracked inputs too; never follow a symlink while making a review identity. */
export async function readDependencyFiles(root: string): Promise<readonly DependencyFile[]> {
  const git = async (...args: string[]): Promise<string[]> =>
    (await execute('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })).stdout
      .split('\0')
      .filter(Boolean);
  const tracked = new Set(await git('ls-files', '-z', '--', ...FRAMEWORK_INPUTS));
  const others = await git(
    'ls-files',
    '-z',
    '--others',
    '--exclude-standard',
    '--',
    ...FRAMEWORK_INPUTS,
  );
  const ignored = await git(
    'ls-files',
    '-z',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--',
    ...FRAMEWORK_INPUTS,
  );
  return Promise.all(
    [...new Set([...tracked, ...others, ...ignored])].sort().map(async (path) => {
      try {
        const stat = await lstat(resolve(root, path));
        const regular = stat.isFile() && !stat.isSymbolicLink();
        return {
          path,
          tracked: tracked.has(path),
          regular,
          text: regular ? await readFile(resolve(root, path), 'utf8') : null,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return { path, tracked: tracked.has(path), regular: true, text: null };
      }
    }),
  );
}

/** Relative imports (including type imports) are proof dependencies, not optional exemptions. */
function imports(file: DependencyFile): { paths: string[]; ambiguous: string[] } {
  if (file.text === null || !/\.(?:ts|js)$/u.test(file.path)) return { paths: [], ambiguous: [] };
  const tree = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.ESNext, true);
  const paths: string[] = [];
  const ambiguous: string[] = [];
  const specifier = (node: ts.Expression | undefined): void => {
    if (node === undefined) return;
    if (!ts.isStringLiteralLike(node)) {
      ambiguous.push(node.getText(tree));
      return;
    }
    if (node.text.startsWith('.'))
      paths.push(posix.normalize(posix.join(posix.dirname(file.path), node.text)));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier(node.moduleSpecifier);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      specifier(node.moduleReference.expression);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      specifier(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { paths, ambiguous };
}
function textIdentity(file: DependencyFile): string {
  // Run counts are checked by verify:evidence separately. Keep every semantic prose byte.
  const text = file.path.endsWith('.md')
    ? (file.text?.replace(/```verification-record\n[^`]*```/gu, '<verification-record>') ?? null)
    : file.text;
  return dependencyDigest([text, file.regular]);
}

/** Explicit mapping + actual claims/scenarios, with all-source fallback for anything uncertain. */
export function frameworkDependencies(
  sources: readonly FrameworkSource[],
  matrix: CompatibilityMatrix,
  map: DependencyMap,
  files: readonly DependencyFile[],
  declarations: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, FrameworkDependencies> {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const mapped = new Map(
    map.groups.flatMap((group) => group.paths.map((path) => [path, group] as const)),
  );
  const policy = verifyDependencyMap(map, sources);
  const graph = new Map(files.map((file) => [file.path, imports(file)]));
  const allScenarioPaths = new Set(
    sources.flatMap((source) =>
      source.scenarios.flatMap((id) => (declarations.get(id) ?? []).map((file) => `tests/${file}`)),
    ),
  );
  return new Map(
    sources.map((source) => {
      const semantic = new Map<string, DependencyEntry>();
      const proof = new Map<string, DependencyEntry>();
      const issues = [...policy.failures];
      const add = (path: string, role: 'semantic' | 'proof', reason: string): void => {
        const file = byPath.get(path);
        const target = role === 'semantic' ? semantic : proof;
        if (!target.has(path))
          target.set(path, {
            path,
            digest: file === undefined ? dependencyDigest(null) : textIdentity(file),
            reason,
          });
        if (file?.text === undefined || file.text === null)
          issues.push(`Missing ${role} dependency: ${path}`);
        else if (!file.regular) issues.push(`Non-regular dependency: ${path}`);
        else if (!file.tracked) issues.push(`Untracked dependency: ${path}`);
      };
      const scenarioPaths = new Set(
        source.scenarios.flatMap((id) =>
          (declarations.get(id) ?? []).map((file) => `tests/${file}`),
        ),
      );
      for (const id of source.scenarios)
        if ((declarations.get(id)?.length ?? 0) === 0) issues.push(`No runnable proof for ${id}`);
      const fixtureRoots = matrix.claims
        .filter((claim) => source.claims.includes(claim.id))
        .flatMap((claim) => claim.fixtures ?? []);
      for (const fixture of fixtureRoots)
        if (!files.some((file) => file.path.startsWith(`${fixture}/`) && file.text !== null))
          issues.push(`Missing affected claim fixture: ${fixture}`);
      for (const file of files) {
        if (file.path === 'config/framework-review.json') continue; // Only observation/review metadata; validated independently.
        const group = mapped.get(file.path);
        if (file.path.startsWith('tests/fixtures/projects/')) {
          const allRoots = matrix.claims.flatMap((claim) => claim.fixtures ?? []);
          if (fixtureRoots.some((path) => file.path.startsWith(`${path}/`)))
            add(file.path, 'semantic', 'Affected claim fixture');
          else if (!allRoots.some((path) => file.path.startsWith(`${path}/`)))
            add(file.path, 'semantic', 'Conservative shared fixture outside BGA claim mapping');
        } else if (group === undefined) {
          add(file.path, 'semantic', 'Unmapped input: conservative all-source hold');
          issues.push(`Unmapped input: ${file.path}`);
        } else if (
          group.role === 'proof' &&
          group.sources === 'scenarios' &&
          !allScenarioPaths.has(file.path)
        ) {
          add(file.path, 'proof', 'Conservative shared proof: no affected scenario mapping');
          issues.push(`Unmapped proving scenario dependency: ${file.path}`);
        } else if (
          group.role !== 'unrelated' &&
          (group.sources === '*' ||
            (group.sources === 'scenarios'
              ? scenarioPaths.has(file.path)
              : group.sources.includes(source.url)))
        )
          add(file.path, group.role, group.reason);
        if (scenarioPaths.has(file.path))
          add(file.path, 'proof', 'Runnable affected scenario declaration');
      }
      // A deleted mapped root must not disappear from the identity. Exemptions cannot hide an import.
      for (const [path, group] of mapped)
        if (
          !byPath.has(path) &&
          group.role !== 'unrelated' &&
          (group.sources === '*' ||
            group.sources === 'scenarios' ||
            group.sources.includes(source.url))
        )
          add(path, group.role, group.reason);
      const follow = (target: Map<string, DependencyEntry>, role: 'semantic' | 'proof'): void => {
        const visited = new Set<string>();
        for (const path of target.keys()) {
          if (visited.has(path)) continue;
          visited.add(path);
          const imported = graph.get(path);
          for (const expression of imported?.ambiguous ?? []) {
            const reviewed =
              role === 'proof'
                ? map.generatedImports?.find(
                    (entry) => entry.file === path && entry.expression === expression,
                  )
                : undefined;
            if (reviewed === undefined) issues.push(`Ambiguous module dependency: ${path}`);
            else
              for (const dependency of reviewed.dependencies)
                add(dependency, 'proof', reviewed.reason);
          }
          for (const requested of imported?.paths ?? []) {
            const candidates = [
              ...new Set([
                requested,
                requested.replace(/\.js$/u, '.ts'),
                `${requested}.ts`,
                `${requested}/index.ts`,
              ]),
            ];
            const resolved = candidates.filter((candidate) => byPath.has(candidate));
            if (resolved.length !== 1) {
              issues.push(`Unresolved or ambiguous dependency: ${path} -> ${requested}`);
              continue;
            }
            const dependency = resolved[0];
            if (dependency !== undefined) add(dependency, role, `Imported by ${path}`);
          }
        }
      };
      follow(semantic, 'semantic');
      follow(proof, 'proof');
      const entries = (values: Map<string, DependencyEntry>): DependencyEntry[] =>
        [...values.values()].sort((a, b) => a.path.localeCompare(b.path));
      const semanticEntries = entries(semantic);
      const proofEntries = entries(proof);
      // Source impact and declaration membership are part of each identity, not just source-file bytes.
      return [
        source.url,
        {
          semanticDigest: dependencyDigest([source.url, source.claims, semanticEntries]),
          proofDigest: dependencyDigest([source.url, source.scenarios, proofEntries]),
          semantic: semanticEntries,
          proof: proofEntries,
          issues: [...new Set(issues)].sort(),
        },
      ];
    }),
  );
}
export async function currentFrameworkDependencies(
  root: string,
  sources: readonly FrameworkSource[],
  matrix: CompatibilityMatrix,
  map: DependencyMap,
): Promise<ReadonlyMap<string, FrameworkDependencies>> {
  return frameworkDependencies(
    sources,
    matrix,
    map,
    await readDependencyFiles(root),
    await collectDeclaredScenarios(resolve(root, 'tests')),
  );
}
export function changedDependencies(
  previous: readonly DependencyEntry[],
  current: readonly DependencyEntry[],
): readonly string[] {
  const old = new Map(previous.map((entry) => [entry.path, entry.digest]));
  const next = new Map(current.map((entry) => [entry.path, entry.digest]));
  return [...new Set([...old.keys(), ...next.keys()])]
    .filter((path) => old.get(path) !== next.get(path))
    .sort();
}
export function refreshFrameworkProof(
  review: FrameworkReview,
  identity: FrameworkDependencies,
  proof: FrameworkProof,
): FrameworkReview {
  if (
    review.dependencies?.semanticDigest !== identity.semanticDigest ||
    dependencyDigest(review.dependencies.semantic) !== dependencyDigest(identity.semantic) ||
    identity.issues.length > 0 ||
    proof.dependencyDigest !== identity.proofDigest
  )
    throw new Error('Proof refresh cannot replace a missing or changed interpretation review.');
  return { ...review, dependencies: identity, proof };
}
export interface ScopedFrameworkHold extends FrameworkHold {
  readonly reasons: readonly string[];
  readonly changedSemanticPaths: readonly string[];
  readonly changedProofPaths: readonly string[];
}
/** Historical interpretation evidence is retained; a proof refresh cannot silently change it. */
export function scopedFrameworkHolds(
  sources: readonly FrameworkSource[],
  ledger: FrameworkLedger,
  identities: ReadonlyMap<string, FrameworkDependencies>,
  now: number,
): readonly ScopedFrameworkHold[] {
  return sources.flatMap((source): ScopedFrameworkHold[] => {
    const review = ledger.observations.find((entry) => entry.url === source.url)?.review;
    const identity = identities.get(source.url);
    const reasons: string[] = [];
    const base = frameworkHolds([source], ledger, review?.implementationDigest ?? '', now)[0];
    if (base !== undefined) reasons.push(`Source/review ${base.state}`);
    if (
      ledger.schemaVersion !== 2 ||
      review?.dependencies === undefined ||
      review.proof === undefined
    )
      reasons.push('Explicit scoped-ledger migration and review required');
    if (identity === undefined) reasons.push('Missing dependency identity');
    else {
      reasons.push(...identity.issues);
      if (
        review?.dependencies !== undefined &&
        review.dependencies.semanticDigest !== identity.semanticDigest
      )
        reasons.push('Framework interpretation dependencies changed');
      if (review?.proof !== undefined && review.proof.dependencyDigest !== identity.proofDigest)
        reasons.push('Proving dependencies changed: current exact-source test evidence required');
      if (
        review?.dependencies !== undefined &&
        (review.implementationDigest !== review.dependencies.semanticDigest ||
          !sha.test(review.dependencies.semanticDigest) ||
          !sha.test(review.dependencies.proofDigest) ||
          review.dependencies.semanticDigest !==
            dependencyDigest([source.url, source.claims, review.dependencies.semantic]) ||
          review.dependencies.proofDigest !==
            dependencyDigest([source.url, source.scenarios, review.dependencies.proof]) ||
          review.dependencies.proofDigest !== review.proof?.dependencyDigest ||
          review.dependencies.issues.length > 0)
      )
        reasons.push('Malformed reviewed dependency identity');
    }
    if (review?.proof !== undefined) {
      const proof = review.proof;
      if (
        !sha.test(proof.dependencyDigest) ||
        !sha.test(proof.evidenceDigest) ||
        !/^[0-9a-f]{40}$/u.test(proof.evidenceCommit) ||
        !/^https:\/\/github\.com\/Brandon-Born\/bga-mcp\/actions\/runs\/[0-9]+$/u.test(
          proof.ciRun,
        ) ||
        !Number.isFinite(Date.parse(proof.recordedAt)) ||
        Date.parse(proof.recordedAt) > now
      )
        reasons.push('Malformed proof provenance');
    }
    return reasons.length === 0
      ? []
      : [
          {
            url: source.url,
            state: base?.state ?? 'stale',
            claims: source.claims,
            scenarios: source.scenarios,
            reasons,
            changedSemanticPaths: changedDependencies(
              review?.dependencies?.semantic ?? [],
              identity?.semantic ?? [],
            ),
            changedProofPaths: changedDependencies(
              review?.dependencies?.proof ?? [],
              identity?.proof ?? [],
            ),
          },
        ];
  });
}
