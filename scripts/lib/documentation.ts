import { access, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { DOCUMENTATION_TOPICS } from '../../src/docs/topics.js';
import { DEFAULT_POLICY_CONFIG } from '../../src/policy.js';
import { GateReport } from './gate.js';
import type { CapabilityManifest, ManifestEntry, ReleaseInventory } from './release.js';

export const DOCUMENTATION_FILES = [
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/INSTALL.md',
  'docs/VERSIONING.md',
] as const;
export const INVENTORY_DOCUMENTS = ['README.md', 'AGENTS.md', 'docs/INSTALL.md'] as const;
const start = '<!-- inventory:start -->';
const end = '<!-- inventory:end -->';

export interface DiscoveryInventory {
  readonly tools: readonly string[];
  readonly templates: readonly string[];
  readonly resources: readonly string[];
  readonly prompts: readonly string[];
}

interface DocumentedEntry {
  readonly kind: keyof DiscoveryInventory;
  readonly name: string;
  readonly stability: ManifestEntry['stability'];
  readonly boundary: string;
}

function entriesFor(
  manifest: CapabilityManifest,
  release: ReleaseInventory,
  profile: 'public' | 'development',
): DocumentedEntry[] {
  const entries: DocumentedEntry[] = [];
  for (const kind of ['tools', 'resources', 'prompts'] as const) {
    const selected = manifest.capabilities[kind].filter(
      (entry) => profile === 'development' || release.capabilities[kind].includes(entry.name),
    );
    for (const entry of selected) {
      if (kind === 'resources' && entry.name === 'bga://docs/{topic}') {
        entries.push({ ...entry, kind: 'templates' });
        for (const topic of DOCUMENTATION_TOPICS) {
          entries.push({ ...entry, kind: 'resources', name: `bga://docs/${topic.topic}` });
        }
      } else {
        if (entry.name.includes('{')) throw new Error(`Unmodelled resource template ${entry.name}`);
        entries.push({ ...entry, kind });
      }
    }
  }
  return entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

function network(entry: DocumentedEntry): boolean {
  switch (entry.boundary) {
    case 'TB-LOCAL-FILESYSTEM':
      return false;
    case 'TB-DOCS-NETWORK':
    case 'TB-STUDIO-READ':
      return true;
    default:
      throw new Error(`Unmodelled documentation boundary ${entry.boundary}`);
  }
}

/** Count listed resources independently of templates, including fixed template expansions. */
export function expectedDiscovery(
  manifest: CapabilityManifest,
  release: ReleaseInventory,
  profile: 'public' | 'development',
): DiscoveryInventory {
  const entries = entriesFor(manifest, release, profile);
  return Object.fromEntries(
    (['tools', 'templates', 'resources', 'prompts'] as const).map((kind) => [
      kind,
      entries
        .filter((entry) => entry.kind === kind)
        .map((entry) => entry.name)
        .sort(),
    ]),
  ) as unknown as DiscoveryInventory;
}

/** One checked block shared by public, install and canonical agent documentation. */
export function inventoryBlock(manifest: CapabilityManifest, release: ReleaseInventory): string {
  if (
    DEFAULT_POLICY_CONFIG.networkEnabled ||
    DEFAULT_POLICY_CONFIG.mutationsEnabled ||
    DEFAULT_POLICY_CONFIG.experimentalStudioLogs
  ) {
    throw new Error('Documented local/read-only/network-off defaults differ from policy');
  }
  const lines = [
    start,
    'Generated in a repository checkout by `corepack pnpm docs:inventory` from the capability manifest, release selection, topic table and policy defaults; installed MCP discovery checks both profiles.',
    '',
    'Network access is off by default. The public command excludes network surfaces and refuses network/Studio flags. In the development profile, `--allow-network` enables documentation search, topic reads and framework-version reads; Studio reads additionally require `--experimental-studio-logs`, an authorized account and session. The experimental Studio reader cannot read the browser-rendered log panel. No profile provides synchronization, uploads or other mutations.',
    '',
    'Resource templates are URI patterns returned by `resources/templates/list`; concrete resources are individually listed URIs returned by `resources/list`. Counts below include each separately, including the fixed documentation-topic expansions.',
  ];
  for (const profile of ['public', 'development'] as const) {
    const entries = entriesFor(manifest, release, profile);
    const discovery = expectedDiscovery(manifest, release, profile);
    const count = (stability: string) =>
      entries.filter((entry) => entry.stability === stability).length;
    lines.push(
      '',
      `**${profile === 'public' ? 'Public command (bga-mcp)' : 'Development entry point (dist/cli.js)'}**`,
      '',
      `Tools: ${String(discovery.tools.length)}; resource templates: ${String(discovery.templates.length)}; concrete resources: ${String(discovery.resources.length)}; prompts: ${String(discovery.prompts.length)}. Discovery entries by manifest stability: verified ${String(count('verified'))}, implemented ${String(count('implemented'))}, experimental ${String(count('experimental'))}. Network-backed entries: ${String(entries.filter(network).length)} (permission off by default).`,
      '',
      '| Kind | Discovery name / URI | Manifest stability | Trust boundary | Network permission |',
      '| --- | --- | --- | --- | --- |',
      ...entries.map(
        (entry) =>
          `| ${entry.kind} | \`${entry.name}\` | ${entry.stability} | ${entry.boundary} | ${network(entry) ? 'explicit opt-in' : 'local'} |`,
      ),
    );
  }
  lines.push(
    '',
    'Manifest stability describes the recorded scenario coverage, not general game correctness. Implemented and experimental entries are excluded from the public release. The development protocol adapter remains implemented; it is not a verified public transport.',
    end,
  );
  return lines.join('\n');
}

export function replaceInventory(text: string, block: string): string {
  const begin = text.indexOf(start);
  const finish = text.indexOf(end);
  if (begin < 0 || finish < begin || text.includes(start, begin + start.length)) {
    throw new Error('Document must contain exactly one inventory block');
  }
  return text.slice(0, begin) + block + text.slice(finish + end.length);
}

export function verifyInventoryText(
  text: string,
  manifest: CapabilityManifest,
  release: ReleaseInventory,
): GateReport {
  const report = new GateReport();
  const normalize = (value: string): string =>
    value.replace(/^ *\|(?: *:?-+:? *\|)+ *$/gmu, '').replace(/\s+/gu, '');
  report.require(
    normalize(text) === normalize(replaceInventory(text, inventoryBlock(manifest, release))),
    'Stale documented inventory, counts, stability or boundaries',
  );
  return report;
}

export function verifyDiscovery(
  actual: DiscoveryInventory,
  manifest: CapabilityManifest,
  release: ReleaseInventory,
  profile: 'public' | 'development',
): GateReport {
  const report = new GateReport();
  const expected = expectedDiscovery(manifest, release, profile);
  for (const kind of ['tools', 'templates', 'resources', 'prompts'] as const) {
    report.require(
      JSON.stringify([...actual[kind]].sort()) === JSON.stringify(expected[kind]),
      `${profile} ${kind} discovery differs from documented inventory`,
    );
  }
  return report;
}

/** Checks shipped Markdown inline/reference links, images and explicit help paths offline. */
export async function verifyDocumentationPaths(
  root: string,
  documents: Readonly<Record<string, string>>,
  helpTexts: readonly string[] = [],
): Promise<GateReport> {
  const report = new GateReport();
  const check = async (file: string, target: string): Promise<void> => {
    if (target.startsWith('https://github.com/Brandon-Born/bga-mcp/blob/')) {
      report.require(
        /^https:\/\/github\.com\/Brandon-Born\/bga-mcp\/blob\/[a-f0-9]{40}\//u.test(target),
        `${file}: repository-only documentation needs an immutable source URL: ${target}`,
      );
    }
    if (/^(?:https?:|mailto:|#)/u.test(target)) return;
    const path = decodeURIComponent(target.split(/[?#]/u)[0] ?? '');
    if (path === '') return;
    const resolved = resolve(root, dirname(file), path);
    const local = relative(root, resolved);
    report.require(
      !isAbsolute(path) && !local.startsWith('..') && !isAbsolute(local),
      `${file}: path escapes package: ${target}`,
    );
    try {
      await access(resolved);
    } catch {
      report.require(false, `${file}: missing packaged path ${target}`);
    }
  };
  for (const [file, source] of Object.entries(documents)) {
    // Code examples are not Markdown links. Reference definitions are checked independently.
    const text = source.replace(/```[^\n]*\n[\s\S]*?```/gu, '');
    for (const match of text.matchAll(
      /\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)|^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gmu,
    )) {
      await check(file, match[1] ?? match[2] ?? '');
    }
  }
  for (const help of helpTexts) {
    for (const match of help.matchAll(
      /\b(?:docs\/[^\s)]+\.md|(?:README|AGENTS|SECURITY|CONTRIBUTING)\.md)\b/gu,
    )) {
      await check('help', match[0]);
    }
  }
  return report;
}

export async function readDocumentation(root: string): Promise<Record<string, string>> {
  return Object.fromEntries<string>(
    await Promise.all(
      DOCUMENTATION_FILES.map(
        async (file) => [file, await readFile(resolve(root, file), 'utf8')] as const,
      ),
    ),
  );
}
