import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

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
    // BGA-015: privileged effects belong to the policy boundary. Server code
    // must not reach the filesystem, network, or a subprocess around it.
    files: ['src/**/*.ts'],
    ignores: ['src/policy.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'node:fs',
            'node:fs/promises',
            'node:child_process',
            'node:http',
            'node:https',
            'node:net',
            'node:dgram',
            'node:tls',
          ].map((name) => ({
            name,
            message: 'Route privileged access through the policy boundary in src/policy.ts.',
          })),
        },
      ],
    },
  },
);
