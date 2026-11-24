import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Imports the engine must never use: it is pure rules with no platform or content. */
const ENGINE_FORBIDDEN = [
  'react',
  'react-dom',
  'zustand',
  '@tactics/content',
  '@tactics/sprites',
  '@tactics/ai',
];

/**
 * Imports the AI must never use. It plays through the engine's public API like any
 * other player, and works with whatever ruleset it is given, so only its tests may
 * load the real content.
 */
const AI_FORBIDDEN = ['react', 'react-dom', 'zustand', '@tactics/content', '@tactics/sprites'];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ENGINE_FORBIDDEN }],
      'no-restricted-globals': ['error', 'window', 'document'],
    },
  },
  {
    files: ['packages/ai/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: AI_FORBIDDEN }],
      'no-restricted-globals': ['error', 'window', 'document'],
    },
  },
  {
    files: ['packages/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: ['react', 'react-dom', '@tactics/sprites', '@tactics/ai'] },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
