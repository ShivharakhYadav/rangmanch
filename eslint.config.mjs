import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
      '**/*.config.{js,mjs,cjs,ts}',
      'apps/api/prisma/migrations/**',
      'load/**',
    ],
  },

  // Base JS + TypeScript recommended (non type-checked → fast, no project service).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Next.js rules, scoped to the web app.
  ...compat.config({ extends: ['next/core-web-vitals'] }).map((cfg) => ({
    ...cfg,
    files: ['apps/web/**/*.{ts,tsx}'],
  })),
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    settings: { next: { rootDir: 'apps/web/' } },
  },

  // Project-wide rule tuning.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Prettier last — turns off formatting-related rules.
  prettier,
);
