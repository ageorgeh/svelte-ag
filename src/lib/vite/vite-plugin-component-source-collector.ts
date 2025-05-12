import type { Plugin, ResolvedConfig } from 'vite';
import { createFilter } from '@rollup/pluginutils';
import fs from 'fs/promises';
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
  const include = opts.include ?? /\.svelte$/;
  const filter = createFilter(include);
  const outFile = opts.outputFile ?? 'component-sources.css';

  /** All unique component directories */
  const componentDirs = new Set<string>();
  /** Track which dirs each file contributed so we can update on HMR */
  const fileContrib = new Map<string, Set<string>>();

  let config: ResolvedConfig;

  /** ---- helpers ---------------------------------------------------------- */

  const isExternal = (src: string) => !src.startsWith('.') && !src.startsWith('/') && !src.startsWith('virtual:');

  const parseImports = (code: string) => {
    // cheap-but-fast import scanner; good enough for Svelte script blocks
    const rx = /import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g;
    const results: { names: string[]; source: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(code))) {
      const clause = m[1].trim();
      const source = m[2].trim();
      if (!isExternal(source)) continue;

      let names: string[] = [];

      if (clause.startsWith('{')) {
        // named import
        names = clause
          .slice(1, -1)
          .split(',')
          .map((s) => s.split(' as ').pop()!.trim());
      } else if (clause.startsWith('*')) {
        // namespace import: * as NS
        const ns = clause.match(/\*\s+as\s+(\w+)/);
        if (ns) names = [ns[1]];
      } else {
        // default (possibly followed by ", { … }")
        names.push(clause.split(',')[0].trim());
      }

      results.push({ names, source });
    }
    return results;
  };

  const inMarkup = (code: string, ids: string[]) => ids.some((id) => new RegExp(`<\\s*${id}(\\s|[>\\.])`).test(code));

  const inComponent = (code: string, ids: string[]) => {
    for (const id of ids) {
      // Match $.component(node, () => SomeExpr, ...
      const rx = new RegExp(`\\$\\.component\\([^,]+,\\s*\\(\\)\\s*=>\\s*(${id}(?:\\.[a-zA-Z_$][\\w$]*)?)`, 'g');
      if (rx.test(code)) return true;
    }
    return false;
  };

  const addDir = async (src: string, importer: string, ctx: TransformPluginContext, collector: Set<string>) => {
    const r = await ctx.resolve(src, importer, { skipSelf: true });
    if (r && !r.id.includes('.vite')) {
      collector.add(path.dirname(r.id));
    }
  };

  const writeOutFile = async () => {
    if (!config) return;
    const outPath = path.resolve(config.root, outFile);
    const lines = [...componentDirs]
      .map((d) => `@source '${path.relative(path.dirname(outPath), d)}';`)
      .sort()
      .join('\n');
    await fs.writeFile(outPath, lines, 'utf8');
  };

  /** ---- plugin ----------------------------------------------------------- */

  return {
    name: 'vite-plugin-component-source-collector',
    enforce: 'post',

    configResolved(resolved) {
      config = resolved;
    },

    buildStart() {
      componentDirs.clear();
      fileContrib.clear();
    },

    async transform(code, id) {
      if (!filter(id)) return;

      const imports = parseImports(code);
      if (!imports.length) return;

      const dirsForFile = new Set<string>();

      for (const imp of imports) {
        if (!inComponent(code, imp.names)) continue;
        // Currently we just naively use the directory of the import cause its assumed the imports are for .../index.js
        await addDir(imp.source, id, this, dirsForFile);
      }

      // store contributions for HMR diffing
      fileContrib.set(id, dirsForFile);

      // merge into global set
      dirsForFile.forEach((d) => componentDirs.add(d));

      // dev‑mode: update file immediately
      if (config.command === 'serve') await writeOutFile();
    },

    async handleHotUpdate(ctx) {
      // drop previous dirs for this file
      const prev = fileContrib.get(ctx.file);
      if (prev) prev.forEach((d) => componentDirs.delete(d));

      const output = ctx.read();

      if (typeof output !== 'string') {
        // transform() will re‑add dirs; wait for it
        output.then(async () => {
          const current = fileContrib.get(ctx.file);
          if (current) current.forEach((d) => componentDirs.add(d));
          await writeOutFile();
        });
      }
    },

    async generateBundle() {
      await writeOutFile();
    }
  };
}
