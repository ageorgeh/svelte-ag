import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: [
    // ... other preprocessors
    vitePreprocess()
  ],

  // https://kit.svelte.dev/docs/configuration#env
  kit: {
    alias: {
      $utils: './src/lib/utils'
    },
    // env: {
    //   dir: '../../../../private/client/env/',
    //   publicPrefix: 'PUBLIC'
    // },
    typescript: {
      config: (config) => {
        // Modify the existing config

        config.compilerOptions.paths = {
          ...config.compilerOptions.paths,
          // Don't want these getting resolved but need it for tooling
          $shadcn: ['../shadcn'],
          '$shadcn/*': ['../shadcn/*']
        };

        config.compilerOptions.isolatedModules = false;
        config.compilerOptions.strict = true;
        config.compilerOptions.strictNullChecks = true;
        config.compilerOptions.preserveSymlinks = true;

        // It's recommended to mutate the config object directly
        return config;
      }
    }
  }
};

export default config;
