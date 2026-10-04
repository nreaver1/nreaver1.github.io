import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const config = [
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Domain logic must not depend on the web layer.
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/components/*', 'react', 'react-dom', 'next/*'],
              message: 'Server/domain code must stay framework-free.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    ignores: [
      '.next/**',
      '.next-e2e/**',
      '.next-e2e-prod/**',
      '.pglite/**',
      'node_modules/**',
      'drizzle/meta/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      '*.tmp.mjs',
    ],
  },
];

export default config;
