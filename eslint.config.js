import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Builtins a production module may import: data, text, and plumbing.
 *
 * Kept in step with `PURE_BUILTINS` in `scripts/lib/effect-boundary.ts`, which
 * is the gate that enforces this. A repository test compares the two, so the
 * fast feedback here cannot drift away from the rule that fails the build.
 */
const PURE_BUILTINS = [
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
];

/** Globals that reach the network or start a thread without importing anything. */
const RESTRICTED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'importScripts',
];

const BOUNDARY_MESSAGE = 'Route privileged access through the policy boundary in src/policy.ts.';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      '.artifacts/**',
      'conformance-results/**',
      'eslint.config.js',
      'tests/fixtures/projects/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  {
    // BGA-015 and BGA-329: privileged effects belong to the policy boundary.
    // Server code must not reach the filesystem, the network, a subprocess, or
    // an equivalent global around it — in any spelling. The list is an
    // allowlist rather than a denylist, so a Node release that adds an
    // effectful module is refused until somebody decides otherwise.
    files: ['src/**/*.ts'],
    ignores: ['src/policy.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                ...PURE_BUILTINS.flatMap((name) => [`!node:${name}`, `!node:${name}/*`]),
              ],
              message: BOUNDARY_MESSAGE,
            },
            {
              // The same modules named without the prefix, which the rule this
              // replaced did not cover.
              group: [
                'fs',
                'fs/*',
                'net',
                'dns',
                'dns/*',
                'http',
                'https',
                'http2',
                'tls',
                'dgram',
                'child_process',
                'cluster',
                'worker_threads',
                'inspector',
                'module',
                'os',
                'perf_hooks',
                'process',
                'readline',
                'repl',
                'timers',
                'timers/*',
                'v8',
                'vm',
              ],
              message: BOUNDARY_MESSAGE,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...RESTRICTED_GLOBALS.map((name) => ({ name, message: BOUNDARY_MESSAGE })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'binding', message: BOUNDARY_MESSAGE },
        { object: 'process', property: 'dlopen', message: BOUNDARY_MESSAGE },
        { object: 'globalThis', property: 'fetch', message: BOUNDARY_MESSAGE },
      ],
    },
  },
);
