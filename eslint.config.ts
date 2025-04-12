// eslint.config.js
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import imports from 'eslint-plugin-import';
// eslint-disable-next-line
import svelteConfig from './svelte.config.js';
import eslintPluginReadableTailwind from 'eslint-plugin-readable-tailwind';

const isWindows = process.platform === 'win32';

// npx eslint "C:\code\cmsWrapper\cms\private\client\src\routes\+layout.svelte"
// npx eslint "/mnt/c/code/cmsWrapper/cms/private/client/src/routes/+layout.svelte"
// npx eslint "C:\code\cmsWrapper\cms\private\scripts\eslint\api-no-direct-return.ts"

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/backup/**', '**/cdk.out/**']
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    // See more details at: https://typescript-eslint.io/packages/parser/
    languageOptions: {
      parserOptions: {
        // projectService: true,
        // project: './tsconfig.json',
        extraFileExtensions: ['.svelte'], // Add support for additional file extensions, such as .svelte
        parser: ts.parser,
        // Specify a parser for each language, if needed:
        // parser: {
        //   ts: ts.parser,
        //   js: espree,    // Use espree for .js files (add: import espree from 'espree')
        //   typescript: ts.parser
        // },
        // We recommend importing and specifying svelte.config.js.
        // By doing so, some rules in eslint-plugin-svelte will automatically read the configuration and adjust their behavior accordingly.
        // While certain Svelte settings may be statically loaded from svelte.config.js even if you don’t specify it,
        // explicitly specifying it ensures better compatibility and functionality.
        svelteConfig
      }
    },
    plugins: {
      'readable-tailwind': eslintPluginReadableTailwind
    },
    rules: {
      // enable all recommended rules to warn
      ...eslintPluginReadableTailwind.configs.warning.rules,
      'readable-tailwind/multiline': [
        'warn',
        { group: 'newLine', lineBreakStyle: isWindows ? 'windows' : 'unix', printWidth: 120 }
      ]
      // 'readable-tailwind/sort-classes': ['warn', { entryPoint: 'base/frontend/admin/src/app.css' }]
    }
  },
  {
    files: ['**/*.ts'],
    // See more details at: https://typescript-eslint.io/packages/parser/
    plugins: {
      import: imports
    },
    rules: {
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          ts: 'never',
          tsx: 'never',
          js: 'always',
          jsx: 'never'
        }
      ]
    }
  },
  {
    rules: {
      // Override or add rule settings here, such as:
      // 'svelte/rule-name': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
);
