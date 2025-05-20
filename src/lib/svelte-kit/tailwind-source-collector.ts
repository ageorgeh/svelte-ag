import type { MarkupPreprocessor, Preprocessor } from 'svelte/compiler';
import path from 'node:path';
import fs from 'node:fs/promises';

// Compiles all external tailwind sources
const preprocess = () => {
  return {
    name: 'svelte-preprocessor-tailwind-sources',
    markup,
    script
  };
};

export { preprocess as TailwindSourcesPreprocess };

/** All unique component directories */
const componentDirs = new Set<string>();
/** Track which dirs each file contributed so we can update on HMR */
const fileContrib = new Map<
  string,
  { imports: { source: string; names: string[] }[]; content: string; dirs: Set<string> }
>();
function setEmpty(filename: string) {
  fileContrib.set(filename, { imports: [], content: '', dirs: new Set() });
}

// True if an import is not relative
const isExternal = (src: string) => !src.startsWith('.') && !src.startsWith('/') && !src.startsWith('virtual:');

// Gets imports from a code string
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

const inComponent = (code: string, ids: string[]) => {
  // console.log('looking for ', ids, 'in ', code);
  for (const id of ids) {
    // Match $.component(node, () => SomeExpr, ...
    const rx = new RegExp(`<${id}[\\s\\S]*?(?:\\/>|>)`, 'g');
    if (rx.test(code)) return true;
  }
  return false;
};

function addDirs(filename: string) {
  if (!fileContrib.has(filename)) return;
  const details = fileContrib.get(filename)!;
  details.imports.forEach((imp) => {
    if (inComponent(details.content, imp.names)) {
      // TODO Check if this is a directory import
      const src = resolveProjectModule(imp.source);
      details.dirs.add(src);
    }
  });
}
const writeOutFile = async () => {
  const outPath = path.resolve(process.cwd(), 'tailwind-sources.css');
  // Compile all the contrib dirs
  fileContrib.values().forEach((details) => {
    details.dirs.forEach((dir) => {
      componentDirs.add(dir);
    });
  });
  const lines = [...componentDirs]
    .map((d) => `@source '${path.relative(path.dirname(outPath), d)}';`)
    .sort()
    .join('\n');
  await fs.writeFile(outPath, lines, 'utf8');
};

const markup: MarkupPreprocessor = async ({ content, filename }) => {
  if (!filename?.endsWith('svelte')) return;

  if (!fileContrib.has(filename)) setEmpty(filename);
  fileContrib.get(filename)!.content = content;
  if (filename.includes('Header')) {
    console.log(filename, content);
  }
  addDirs(filename);
  await writeOutFile();
};
const script: Preprocessor = async ({ content, filename }) => {
  if (!filename?.endsWith('svelte')) return;

  const imports = parseImports(content);

  if (!fileContrib.has(filename)) setEmpty(filename);
  fileContrib.get(filename)!.imports = imports;

  addDirs(filename);
  await writeOutFile();
};
