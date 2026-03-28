import { configDefaults, defineProject } from 'vitest/config';
// import tsconfigPaths from 'vite-tsconfig-paths';

process.env.NODE_ENV = 'development';

export default defineProject({
  root: import.meta.dirname,
  mode: 'development',
  resolve: {
    tsconfigPaths: true
  },
  test: {
    dir: import.meta.dirname,
    exclude: [...configDefaults.exclude],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.unit.test.ts'],
          setupFiles: ['src/test/vitest.setup.ts']
        }
      }
    ]
  }
});
