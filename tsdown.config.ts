import svelte from 'rollup-plugin-svelte';
import { sveltePreprocess } from 'svelte-preprocess';
import { defineConfig } from 'tsdown';

import { svelteDtsPlugin } from './scripts/tsdown-plugin-svelte-dts.js';
import { svelteModuleTsPlugin } from './scripts/tsdown-plugin-svelte-module-ts.js';

export default defineConfig({
  dts: true,
  entry: 'src/lib/*',
  platform: 'neutral',
  exports: true,
  plugins: [
    svelteModuleTsPlugin(),
    svelte({ preprocess: sveltePreprocess() }),
    svelteDtsPlugin({
      declarationDir: './dist',
      libRoot: './src/lib',
      tsconfig: 'tsconfig.json'
    })
  ]
});
