import type { Plugin, ResolvedConfig } from 'vite';
import { createFilter } from '@rollup/pluginutils';
import { writeIfDifferent } from 'ts-ag';
import path from 'path';
import type { TransformPluginContext } from 'rollup';

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
}

export default function componentSourceCollector(opts: Options = {}): Plugin {
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
    if (!config) return;
    const outPath = path.resolve(config.root, outFile);
    const lines = [...componentFiles]
      .map((d) => `@source '${path.relative(path.dirname(outPath), d)}';`)
      .sort()
      .join('\n');
    // await fs.writeFile(outPath, lines, 'utf8');
    await writeIfDifferent(outPath, lines);
  };

  const classRegex = /class(?:=|:)/;

  /** ---- plugin ----------------------------------------------------------- */

  return {
    name: 'vite-plugin-component-source-collector',
    enforce: 'post',

    configResolved(resolved) {
      config = resolved;
    },

    buildStart() {
      componentFiles.clear();
    },

    async transform(code, id) {
      if (classRegex.test(code)) {
        componentFiles.add(id);

        // dev‑mode: update file immediately
        // if (config.command === 'serve') await writeOutFile();
      }
      if (!initialTransformDone) {
        scheduleInitialWrite();
      }
    },

    async handleHotUpdate(ctx) {
      const output = await ctx.read();
      const id = ctx.file;

      if (classRegex.test(output)) {
        componentFiles.add(id);
      } else {
        componentFiles.delete(id);
      }
      await writeOutFile();
    },

    async buildEnd() {
      console.log('build end');
      await writeOutFile();
    },

    async generateBundle() {
      console.log('generating the bundle');
      await writeOutFile();
    }
  };
}
