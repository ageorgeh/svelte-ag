import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { configDefaults, defineProject } from 'vitest/config';

process.env.NODE_ENV = 'development';

const sveltePlugin = svelte();
const svelteTestingPlugin = svelteTesting();

export default defineProject({
  root: import.meta.dirname,
  mode: 'development',
  ssr: { noExternal: [/^svelte(\/|$)/] },
  resolve: {
    tsconfigPaths: true
  },
  test: {
    dir: import.meta.dirname,
    exclude: [...configDefaults.exclude, '**/dist/**'],
    server: { deps: { inline: [/^svelte(\/|$)/] } },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.unit.test.ts'],
          setupFiles: ['./tests/vitest.setup.ts']
        }
      },
      {
        extends: true,
        resolve: { conditions: ['browser'] },
        plugins: [sveltePlugin, svelteTestingPlugin],
        test: {
          name: 'component',
          environment: 'happy-dom',
          include: ['**/*.comp.test.ts'],
          setupFiles: ['./tests/component.setup.ts']
        }
      }
    ]
  }
});
