import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

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
  }
});
