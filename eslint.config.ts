import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
// import { importX } from 'eslint-plugin-import-x';
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const isWindows = process.platform === 'win32';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '.git/',
    '**/dist/',
    '**/build/',
    '**/.svelte-kit/',
    '**/.obsidian/',
    './shadcn/'
  ]),
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  // https://github.com/un-ts/eslint-plugin-import-x/issues/439
  // {
  //   plugins: { 'import-x': importX }
  //   // extends: ['import-x/flat/recommended']
  //   // rules: { 'import-x/no-dynamic-require': 'warn' }
  // },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    // Specific svelte options
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte', '.svelte.ts'],
        parser: tseslint.parser,
        svelteFeatures: { experimentalGenerics: true },
        svelteConfig
      }
    },
    plugins: { 'better-tailwindcss': eslintPluginBetterTailwindcss },
    rules: {
      'svelte/no-navigation-without-resolve': ['off'],
      ...eslintPluginBetterTailwindcss.configs['stylistic-warn'].rules,
      'better-tailwindcss/enforce-consistent-line-wrapping': [
        'warn',
        { group: 'newLine', lineBreakStyle: isWindows ? 'windows' : 'unix', printWidth: 120 }
      ]
      // 'better-tailwindcss/sort-classes': ['warn', { entryPoint: 'base/frontend/admin/src/app.css' }]
    },
    settings: { 'better-tailwindcss': { entryPoint: 'src/app.css' } }
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
      // 'import-x/order': ['error'],
      // 'import-x/no-duplicates': ['off'],
      // 'import-x/no-unresolved': ['off']
    }
  }
]);
