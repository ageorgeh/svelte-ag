import type { Plugin, ResolvedConfig } from 'vite';
import { writeIfDifferent } from 'ts-ag';
import path from 'path';

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

  run: boolean;

  /**
   * node_modules packages that can be added to the component list
   */
  safePackages: string[];
}

export default function componentSourceCollector(opts: Options = { run: true, safePackages: [] }): Plugin {
  if (opts.run === false) return { name: 'disabled' };

  const outFile = opts.outputFile ?? 'component-sources.css';

  /** All unique component directories */
  const componentFiles = new Set<string>();

  let config: ResolvedConfig;

  /** ---- helpers ---------------------------------------------------------- */
  let initialTransformDone = false;
  let initialTransformTimer: NodeJS.Timeout | null = null;

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
    console.log('writing', componentFiles.size);
    const outPath = path.resolve(config.root, outFile);
    const lines = [...componentFiles]
      .map((d) => `@source '${path.relative(path.dirname(outPath), d)}';`)
      .sort()
      .join('\n');

    const didWrite = await writeIfDifferent(outPath, lines);
    if (didWrite) console.log('Wrote', lines.length);
  };

  const classRegex = /class(?:=|:)/;

  const importRegex = /@import\s+['"]([^'"]+)['"]/g;

  function shouldAdd(fileName: string) {
    return !/\.pnpm|.vite/.test(fileName) || opts.safePackages.some((p) => fileName.includes(`node_modules/${p}`));
  }

  /** ---- plugin ----------------------------------------------------------- */

  return {
    name: 'vite-plugin-component-source-collector',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved;
      // componentFiles.clear();
      console.log('tailwind-sources:configResolved', config.command);
    },

    buildStart() {
      console.log('tailwind-sources:buildStart', componentFiles);
      // componentFiles.clear();
    },

    async transform(code, id) {
      // console.log('tailwind-sources:transform', id);
      // Adds all imports from css files
      if (id.includes('css') && code.includes('@import')) {
        const matches = code.matchAll(importRegex);

        for (const match of matches) {
          const resolved = await this.resolve(match[1], id);
          if (resolved && shouldAdd(resolved.id)) {
            componentFiles.add(resolved.id);
          }
        }
      }
      // TODO ignore .vite files

      // Adds all other files with the classRegex
      if (classRegex.test(code) && shouldAdd(id)) {
        componentFiles.add(id);

        // if (config.command === 'serve') await writeOutFile();
      }
      if (!initialTransformDone) {
        scheduleInitialWrite();
      }
    },

    async handleHotUpdate(ctx) {
      const output = await ctx.read();
      const id = ctx.file;

      console.log('Hot update sources', id, output, classRegex.test(output));

      // if (classRegex.test(output)) {
      //   componentFiles.add(id);
      // } else {
      //   componentFiles.delete(id);
      // }
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
