import type { Plugin, ResolvedConfig } from 'vite';
import { exists, writeIfDifferent } from 'ts-ag';
import { readFile } from 'fs/promises';
import { resolve, join, relative, dirname } from 'path';

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

  let outputFilePath: string | undefined = undefined;
  let root: string | undefined = undefined;

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
      outputFilePath &&
      file !== '' && // No nothing
      !/\.svelte-kit/.test(file) && // No svelte-kit files
      // No dep files unless marked as safe
      (!/\.pnpm|.vite/.test(file) || opts.safePackages.some((p) => file.includes(`node_modules/${p}`)))
    ) {
      const cleanedFileName = file.replace(/\?v=.*$/, '');
      const relativeFilePath = relative(dirname(outputFilePath), cleanedFileName);

      if (relativeFilePath !== outputFilePath) {
        // Dont add itself
        componentFiles.add(relativeFilePath);
      }
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
    const lines = Array.from(componentFiles)
      .map((d) => `@source '${d}';`)
      .sort();

    if (outputFilePath) {
      const didWrite = await writeIfDifferent(outputFilePath, lines.join('\n'));
      if (didWrite) console.log('Wrote', lines.length);
    }
  };

  // ---- plugin ---- //

  return {
    name: 'vite-plugin-component-source-collector',
    enforce: 'pre', // i want to see comments

    /**
     * Setup. Add exisitng files to internal state if dev
     */
    async configResolved(resolved) {
      config = resolved;
      root = config.root;
      outputFilePath = resolve(root, outFileName);

      if (config.command === 'build' && firstRound) {
        componentFiles.clear();
        firstRound = false;
      } else if (config.command === 'serve') {
        if (await exists(outputFilePath)) {
          const fileLines = (await readFile(outputFilePath, 'utf8')).split('\n');
          fileLines.forEach((l) => addPath(l.replace(/@source\s+'(.*?)';/, '$1')));
          // console.log('config resolved', componentFiles);
        }
      }
      console.log('tailwind-sources:configResolved:command', config.command);
    },

    /**
     * Reset list on lock file changed
     */
    configureServer(server) {
      const lockFiles = [
        'pnpm-lock.yaml',
        'package-lock.json',
        'yarn.lock',
        'bun.lockb',
        'bun.lock',
        'npm-shrinkwrap.json',
        // pnpm install-state changes:
        'node_modules/.modules.yaml'
      ].map((p) => join(root!, p));
      server.watcher.add(lockFiles);
      const onChange = async (file: string) => {
        if (!lockFiles.includes(file)) return;
        componentFiles.clear();
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);
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
          try {
            const resolved = await this.resolve(match[1], id);
            if (resolved) {
              addPath(resolved.id);
            }
          } catch {
            // Cant resolve: dont add
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
