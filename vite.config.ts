import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss(), glsl()],
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
