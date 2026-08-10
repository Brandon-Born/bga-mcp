import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPPORTED_PROTOCOL_VERSIONS } from '../../src/metadata.js';
import {
  findEffectBypasses,
  PURE_BUILTINS,
  RESTRICTED_GLOBALS,
} from '../../scripts/lib/effect-boundary.js';
import { listFiles } from '../../scripts/lib/scenarios.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Modules that reach the filesystem, the network, or a subprocess. */
const PRIVILEGED_IMPORTS = [
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'node:http',
  'node:https',
  'node:net',
  'node:dgram',
  'node:tls',
];

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

describe('repository safety gates', () => {
  it('[GATE-POLICY-IMPORT-BOUNDARY] keeps privileged access inside the policy boundary', async () => {
    const sources = await listFiles(resolve(repositoryRoot, 'src'));
    const offenders: string[] = [];

    for (const file of sources) {
      if (file.endsWith('policy.ts')) {
        continue;
      }
      const source = await readFile(file, 'utf8');
      for (const module of PRIVILEGED_IMPORTS) {
        if (new RegExp(`from '${module}'`, 'u').test(source)) {
          offenders.push(`${file}: ${module}`);
        }
      }
    }

    expect(offenders).toEqual([]);
    expect(sources.some((file) => file.endsWith('policy.ts'))).toBe(true);
    expect(await readFile(resolve(repositoryRoot, 'src/policy.ts'), 'utf8')).toContain(
      "from 'node:fs/promises'",
    );
  });

  it('[GATE-POLICY-COMPLETE-EFFECT-BOUNDARY] refuses every spelling of a privileged reach', () => {
    // The check has to detect what the 2026-08-08 probe got past, so each of
    // those forms is seeded here and required to be found. A gate proven only
    // against the tree it guards proves that the tree is clean, not that the
    // gate works.
    const seeded: [string, string][] = [
      ['a prefix-less specifier', "import { readFile } from 'fs/promises';"],
      ['double quotes', 'import dns from "node:dns";'],
      ['a module the old list never named', "import http2 from 'node:http2';"],
      ['a re-export', "export * from 'node:child_process';"],
      ['a dynamic import', "const fs = await import('node:fs');"],
      ['require', "const net = require('node:net');"],
      ['import equals', "import net = require('node:net');"],
      ['a subpath', "import { setTimeout } from 'node:timers/promises';"],
      ['a builtin nobody listed', "import { open } from 'node:inspector';"],
      ['the global fetch', 'const answer = await fetch("https://example.com");'],
      ['fetch through globalThis', 'const answer = await globalThis.fetch("https://example.com");'],
      ['a worker', "const worker = new Worker('./work.js');"],
      ['a raw binding', "const binding = process.binding('fs');"],
    ];

    for (const [what, text] of seeded) {
      expect(
        findEffectBypasses({ path: 'seeded.ts', text }),
        `${what} was not detected`,
      ).not.toEqual([]);
    }

    // And it has to accept what production code legitimately does, or the only
    // way to pass it would be to write worse code.
    const allowed = [
      "import { relative, resolve } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "import type { Readable } from 'node:stream';",
      "import { z } from 'zod';",
      "import { publishResult } from './publish.js';",
      'const handler = { fetch: (input: string) => input };',
      'process.exitCode = 1;',
    ];
    for (const text of allowed) {
      expect(findEffectBypasses({ path: 'allowed.ts', text }), text).toEqual([]);
    }
  });

  it('[GATE-POLICY-COMPLETE-EFFECT-BOUNDARY] finds no privileged reach outside the policy boundary', async () => {
    const sources = await listFiles(resolve(repositoryRoot, 'src'));
    const offenders: string[] = [];

    for (const file of sources) {
      if (file.endsWith('policy.ts')) {
        continue;
      }
      offenders.push(
        ...findEffectBypasses({
          path: relative(repositoryRoot, file),
          text: await readFile(file, 'utf8'),
        }),
      );
    }

    expect(offenders).toEqual([]);
    // The boundary itself still holds what everything else may not, so this is
    // a statement about where the effects are rather than about their absence.
    expect(
      findEffectBypasses({
        path: 'src/policy.ts',
        text: await readFile(resolve(repositoryRoot, 'src/policy.ts'), 'utf8'),
      }).length,
    ).toBeGreaterThan(0);
  });

  it('[GATE-POLICY-COMPLETE-EFFECT-BOUNDARY] keeps the editor rule and the gate saying the same thing', async () => {
    // Two mechanisms enforce one rule: ESLint is the feedback a developer gets
    // while typing, and the gate above is what fails the build. They are
    // checked against each other here, because a fast rule that has quietly
    // become laxer than the slow one is worse than no fast rule at all.
    const configuration = await readFile(resolve(repositoryRoot, 'eslint.config.js'), 'utf8');

    for (const builtin of PURE_BUILTINS) {
      expect(configuration, `${builtin} is allowed by the gate but not by lint`).toContain(
        `'${builtin}'`,
      );
    }
    for (const global of RESTRICTED_GLOBALS) {
      // `navigator` is refused by the gate and not by lint: ESLint's own
      // recommended environment already treats it as a browser global that
      // production code here has no reason to name.
      if (global === 'navigator') {
        continue;
      }
      expect(configuration, `${global} is refused by the gate but not by lint`).toContain(
        `'${global}'`,
      );
    }
    expect(configuration).toContain("'no-restricted-globals'");
    expect(configuration).toContain("'no-restricted-properties'");
    // The allowlist is an allowlist in both: a bare `node:*` group with
    // negations, rather than a list of the modules somebody thought of.
    expect(configuration).toContain("'node:*'");
  });

  it('[GATE-DEPENDENCY-PINNING] pins every dependency and package manager exactly', async () => {
    const packageMetadata = await loadJson<{
      packageManager: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>('package.json');

    expect(packageMetadata.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/u);
    for (const [name, version] of [
      ...Object.entries(packageMetadata.dependencies),
      ...Object.entries(packageMetadata.devDependencies),
    ]) {
      expect(version, `${name} must be pinned to an exact version`).toMatch(
        /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u,
      );
    }

    const workflow = await readFile(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
  });

  it('[GATE-CI-ACTION-PINNING] pins every GitHub Action to a full commit SHA', async () => {
    const workflows = await listFiles(resolve(repositoryRoot, '.github/workflows'), '.yml');
    expect(workflows.length).toBeGreaterThan(0);

    for (const workflow of workflows) {
      const source = await readFile(workflow, 'utf8');
      const uses = [...source.matchAll(/uses:\s*(\S+)/gu)].map((match) => match[1] ?? '');
      expect(uses.length).toBeGreaterThan(0);
      for (const reference of uses) {
        expect(reference, `${workflow} uses an unpinned action`).toMatch(/@[0-9a-f]{40}$/u);
      }
    }
  });

  it('[GATE-COMPATIBILITY-MATRIX] keeps runtime behavior inside the published matrix', async () => {
    const matrix = await loadJson<{
      claims: { dimension: string; value: string; support: string }[];
    }>('config/compatibility.json');
    const manifest = await loadJson<{
      transports: { name: string; protocolVersions: string[] }[];
    }>('config/capabilities.json');

    const supported = (dimension: string): string[] =>
      matrix.claims
        .filter((claim) => claim.dimension === dimension && claim.support === 'supported')
        .map((claim) => claim.value)
        .sort();

    expect(supported('protocol')).toEqual([...SUPPORTED_PROTOCOL_VERSIONS].sort());
    expect(supported('transport')).toEqual(manifest.transports.map((entry) => entry.name).sort());
    expect(supported('protocol')).toEqual(
      [...new Set(manifest.transports.flatMap((entry) => entry.protocolVersions))].sort(),
    );
    expect(matrix.claims.filter((claim) => claim.support === 'unsupported').length).toBeGreaterThan(
      0,
    );
  });
});
