import { defineConfig, globalIgnores } from 'eslint/config';
import { configs, plugins } from 'eslint-config-airbnb-extended';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '.next/**',
    '.vercel/**',
    'next-env.d.ts',
    'src/lib/database.types.ts',
    'test-results/**',
    'playwright-report/**',
  ]),
  plugins.stylistic,
  plugins.importX,
  plugins.react,
  plugins.reactA11y,
  plugins.reactHooks,
  plugins.next,
  plugins.typescriptEslint,
  ...configs.base.recommended,
  ...configs.base.typescript,
  ...configs.next.recommended,
  ...configs.next.typescript,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
    },
  },
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { process: 'readonly' } } },
  {
    files: ['tests/**', 'scripts/**', '*.config.*'],
    rules: { 'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }] },
  },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'react/require-default-props': [
        'error',
        { forbidDefaultForRequired: true, functions: 'defaultArguments' },
      ],
      '@stylistic/max-len': [
        'error',
        {
          code: 100,
          tabWidth: 2,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either', depth: 25 }],
    },
  },
]);
