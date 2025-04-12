import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  // https://stackoverflow.com/questions/73205096/run-sveltekit-dev-with-https
  server: {
    host: 'localhost',
    port: 5180,
    proxy: {},
    fs: {
      allow: ['.']
    }
  },
  build: {
    sourcemap: true
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  },
  css: {
    // https://stackoverflow.com/questions/75056422/how-to-use-vitepreprocess-with-global-scss-mixins-in-sveltekit
    preprocessorOptions: {
      scss: {
        additionalData: '',
        api: 'modern'
      }
    }
  }
});
