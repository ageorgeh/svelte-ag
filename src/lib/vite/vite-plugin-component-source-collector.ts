import type { Plugin, ResolvedConfig } from 'vite';
import { exists, writeIfDifferent } from 'ts-ag';
import { readFile } from 'fs/promises';
import { resolve, relative, dirname } from 'path';

interface Options {
  /**
   * File (relative to project root) that will contain one
   * directory per line (e.g. `node_modules/svelte-ag/components/sidebar`)
   * Defaults to `component-sources.txt`
   */
  outputFile?: string;
  /**
   * Filter for source files (default: `/\.svelte$/`)
   */
  include?: RegExp | RegExp[];
  /**
   * node_modules packages that can be added to the component list
   */
  safePackages: string[];
}

/** All unique component directories */
const componentFiles = new Set<string>();

export default function componentSourceCollector(opts: Options = { safePackages: [] }): Plugin {
  // constants
  const outFileName = opts.outputFile ?? 'component-sources.css';
  const classRegex = /class(?:=|:)/;
  const importRegex = /@import\s+['"]([^'"]+)['"]/g;

  // state
  let config: ResolvedConfig;
  let firstRound = true;
  let initialTransformDone = false;
  let initialTransformTimer: NodeJS.Timeout | null = null;

  function shouldAdd(code: string) {
    return classRegex.test(code);
  }

  function addPath(file: string) {
    if (
      file !== '' && // No nothing
      !/\.svelte-kit/.test(file) && // No svelte-kit files
      // No dep files unless marked as safe
      (!/\.pnpm|.vite/.test(file) || opts.safePackages.some((p) => file.includes(`node_modules/${p}`)))
    ) {
      const outPath = resolve(config.root, outFileName);
      const cleanedFileName = file.replace(/\?v=.*$/, '');

      componentFiles.add(relative(dirname(outPath), cleanedFileName));
    }
  }

  function scheduleInitialWrite() {
    if (initialTransformTimer) clearTimeout(initialTransformTimer);
    initialTransformTimer = setTimeout(() => {
      if (!initialTransformDone) {
        writeOutFile();
        initialTransformDone = true;
      }
    }, 1000); // adjust delay as needed
  }

  const writeOutFile = async () => {
    const outPath = resolve(config.root, outFileName);

    const lines = Array.from(componentFiles)
      .map((d) => `@source '${d}';`)
      .sort();

    const didWrite = await writeIfDifferent(outPath, lines.join('\n'));
    if (didWrite) console.log('Wrote', lines.length);
  };

  // ---- plugin ---- //

  return {
    name: 'vite-plugin-component-source-collector',
    enforce: 'post',

    async configResolved(resolved) {
      config = resolved;
      const outPath = resolve(config.root, outFileName);

      if (config.command === 'build' && firstRound) {
        componentFiles.clear();
        firstRound = false;
      } else if (config.command === 'serve') {
        if (await exists(outPath)) {
          const fileLines = (await readFile(outPath, 'utf8')).split('\n');
          fileLines.forEach((l) => addPath(l.replace(/@source\s+'(.*?)';/, '$1')));
          // console.log('config resolved', componentFiles);
        }
      }
      console.log('tailwind-sources:configResolved:command', config.command);
    },

    buildStart() {
      // console.log('tailwind-sources:buildStart', componentFiles);
      // componentFiles.clear();
    },

    async transform(code, id) {
      // console.log('tailwind-sources:transform', id);
      // Adds all imports from css files
      if (id.includes('css') && code.includes('@import')) {
        const matches = code.matchAll(importRegex);

        for (const match of matches) {
          // console.log('MATching', match);
          const resolved = await this.resolve(match[1], id);
          if (resolved) {
            addPath(resolved.id);
          }
        }
      }

      // Adds all other files with the classRegex
      if (shouldAdd(code)) {
        addPath(id);
      }

      if (!initialTransformDone) {
        scheduleInitialWrite();
      }
    },

    async handleHotUpdate(_ctx) {
      await writeOutFile();
    },

    async buildEnd() {
      console.log('tailwind-sources:buildEnd');
      await writeOutFile();
    },

    async generateBundle() {
      console.log('tailwind-sources:generateBundle');
      await writeOutFile();
    }
  };
}
