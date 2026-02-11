import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [vitePreprocess()],

  // https://kit.svelte.dev/docs/configuration#env
  kit: {
    alias: {
      $utils: './src/lib/utils',
      $bits: './src/lib/bits',
      $components: './src/lib/components'
    },
    typescript: {
      config: (config) => {
        config.include.push('../shadcn/**/*.ts');

        config.compilerOptions.paths = {
          ...config.compilerOptions.paths,
          // Don't want these getting resolved but need it for tooling
          $shadcn: ['../shadcn'],
          '$shadcn/*': ['../shadcn/*']
        };

        // config.compilerOptions.isolatedModules = false;
        config.compilerOptions.strict = true;
        config.compilerOptions.declarationMap = true;
        config.compilerOptions.declaration = true;
        config.compilerOptions.strictNullChecks = true;
        config.compilerOptions.skipLibCheck = true;
        // config.compilerOptions.preserveSymlinks = true;

        return config;
      }
    }
  }
};

export default config;
