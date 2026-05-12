import type { Plugin, ResolvedConfig } from 'vite';
import { exists, writeIfDifferent } from 'ts-ag';
import { readFile } from 'fs/promises';
import { resolve, join, relative, dirname, isAbsolute } from 'path';
import { open } from 'fs/promises';
import {
  ensureRelativeManifestSourcePath,
  escapeInlineTailwindClassName,
  getTailwindSourcesManifestPath,
  splitPackageSpecifier,
  type TailwindSourceManifest,
  type TailwindSourceManifestLeaf
} from './tailwind-sources-manifest.js';

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
const inlineTailwindClasses = new Set<string>();
let firstRound = true;
const packageJsonCache = new Map<string, Promise<string | null>>();
const packageManifestCache = new Map<string, Promise<TailwindSourceManifest | null>>();

function ensureDotRelative(filePath: string): string {
  if (filePath.startsWith('./')) return filePath;
  return `./${filePath}`;
}

async function touch(path: string) {
  const handle = await open(path, 'a');
  await handle.close();
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function toPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function addInlineClassList(classes: string[]) {
  for (const className of classes) {
    if (className !== '') inlineTailwindClasses.add(className);
  }
}

async function readPackageNameAt(directory: string): Promise<string | null> {
  const cached = packageJsonCache.get(directory);
  if (cached) return cached;

  const packageNamePromise = (async () => {
    try {
      const packageJson = await readFile(join(directory, 'package.json'), 'utf8');
      const parsed = JSON.parse(packageJson) as { name?: string };
      return parsed.name ?? null;
    } catch {
      return null;
    }
  })();

  packageJsonCache.set(directory, packageNamePromise);
  return packageNamePromise;
}

export default async function componentSourceCollector(opts: Options = { safePackages: [] }): Promise<Plugin> {
  // constants
  const outFileName = opts.outputFile ?? 'component-sources.css';
  const classAttributeRegex = /(?:^|[^\w-])(?:className|class)\s*(?:=|:)\s*/;
  const importRegex = /@import\s+['"]([^'"]+)['"]/g;

  // state
  let outputFilePath: string;
  let nodeModulesPath: string;
  let config: ResolvedConfig;
  let initialTransformDone = false;
  let initialTransformTimer: NodeJS.Timeout | null = null;

  function shouldAdd(code: string, id: string) {
    // Svelte's `class:` directive toggles local classes and should not be treated as
    // a Tailwind source signal. Including those files can pull in component-local
    // style modules that Tailwind should never parse directly.
    if (id.includes('?svelte&type=style')) return false;
    return classAttributeRegex.test(code);
  }

  async function normalizeCollectedSourceFilePath(file: string): Promise<string> {
    const cleanedFileName = file.replace(/[?#].*$/, '');
    const resolvedFilePath = isAbsolute(cleanedFileName)
      ? resolve(cleanedFileName)
      : resolve(dirname(outputFilePath), cleanedFileName);

    let currentDirectory = dirname(resolvedFilePath);

    while (true) {
      const packageName = await readPackageNameAt(currentDirectory);
      if (packageName !== null) {
        const currentDirectoryPosix = toPosixPath(currentDirectory);
        const isExternalPackage =
          !isPathInside(dirname(nodeModulesPath), currentDirectory) || currentDirectoryPosix.includes('/node_modules/');

        if (isExternalPackage && opts.safePackages.includes(packageName)) {
          return resolve(nodeModulesPath, packageName, relative(currentDirectory, resolvedFilePath));
        }

        return resolvedFilePath;
      }

      const parentDirectory = dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        return resolvedFilePath;
      }
      currentDirectory = parentDirectory;
    }
  }

  async function addPath(file: string) {
    if (!outputFilePath || file === '') return;

    const normalizedFilePath = await normalizeCollectedSourceFilePath(file);
    if (
      /\.svelte-kit/.test(normalizedFilePath) ||
      (/(?:\.pnpm|\.vite)/.test(normalizedFilePath) &&
        !opts.safePackages?.some((packageName) => normalizedFilePath.includes(`node_modules/${packageName}`)))
    ) {
      return;
    }

    const relativeFilePath = toPosixPath(relative(dirname(outputFilePath), normalizedFilePath));
    if (normalizedFilePath === outputFilePath || relativeFilePath === outFileName) return;

    componentFiles.add(ensureDotRelative(relativeFilePath));
  }

  async function readPackageManifest(packageName: string): Promise<TailwindSourceManifest | null> {
    const cached = packageManifestCache.get(packageName);
    if (cached) return cached;

    const manifestPromise = (async () => {
      try {
        const packageRoot = resolve(nodeModulesPath, packageName);
        const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as {
          tailwindSources?: string;
        };
        const manifestPath = getTailwindSourcesManifestPath(packageRoot, packageJson);
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as TailwindSourceManifest;
        return manifest.version === 1 ? manifest : null;
      } catch {
        return null;
      }
    })();

    packageManifestCache.set(packageName, manifestPromise);
    return manifestPromise;
  }

  async function addManifestLeaf(packageName: string, entry: TailwindSourceManifestLeaf) {
    addInlineClassList(entry.classes);

    for (const sourcePath of entry.sources) {
      await addPath(resolve(nodeModulesPath, packageName, ensureRelativeManifestSourcePath(sourcePath)));
    }
  }

  async function addManifestSourcesForCode(code: string) {
    const strippedCode = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const imports = new Map<string, { namedImports: string[]; useExportLevel: boolean }>();
    const importPattern = /(?:^|\n)\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    const sideEffectImportPattern = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

    for (const match of strippedCode.matchAll(importPattern)) {
      const importClause = match[1]?.trim();
      const specifier = match[2];
      if (!importClause || !specifier) continue;

      if (importClause.startsWith('type ')) {
        continue;
      }

      const record = imports.get(specifier) ?? { namedImports: [], useExportLevel: false };

      if (importClause.includes('* as ') || (!importClause.startsWith('{') && !importClause.includes('{'))) {
        record.useExportLevel = true;
      }

      const namedImportsMatch = importClause.match(/\{([\s\S]*?)\}/);
      if (namedImportsMatch) {
        for (const rawImport of namedImportsMatch[1].split(',')) {
          const trimmedImport = rawImport.trim();
          if (trimmedImport === '' || trimmedImport.startsWith('type ')) continue;

          const importedSymbol = trimmedImport.split(/\s+as\s+/i)[0]?.trim();
          if (importedSymbol) {
            record.namedImports.push(importedSymbol);
          }
        }
      }

      imports.set(specifier, record);
    }

    for (const match of strippedCode.matchAll(sideEffectImportPattern)) {
      const specifier = match[1];
      if (!specifier || imports.has(specifier)) continue;

      imports.set(specifier, {
        namedImports: [],
        useExportLevel: true
      });
    }

    for (const [specifier, importRecord] of imports) {
      const { packageName, exportKey } = splitPackageSpecifier(specifier);
      if (!packageName || !opts.safePackages.includes(packageName)) continue;

      const manifest = await readPackageManifest(packageName);
      const exportEntry = manifest?.exports[exportKey];
      if (!exportEntry) continue;

      if (importRecord.useExportLevel || importRecord.namedImports.length === 0 || !exportEntry.symbols) {
        await addManifestLeaf(packageName, exportEntry);
        continue;
      }

      const symbolEntries = importRecord.namedImports
        .map((symbolName) => exportEntry.symbols?.[symbolName] ?? null)
        .filter((entry): entry is TailwindSourceManifestLeaf => entry !== null);

      if (symbolEntries.length !== importRecord.namedImports.length) {
        await addManifestLeaf(packageName, exportEntry);
        continue;
      }

      for (const symbolEntry of symbolEntries) {
        await addManifestLeaf(packageName, symbolEntry);
      }
    }
  }

  function scheduleInitialWrite() {
    if (initialTransformTimer) clearTimeout(initialTransformTimer);
    initialTransformTimer = setTimeout(() => {
      if (!initialTransformDone) {
        void writeOutFile();
        initialTransformDone = true;
      }
    }, 1000);
  }

  const writeOutFile = async () => {
    const pathLines = Array.from(componentFiles)
      .map((filePath) => `@source '${filePath}';`)
      .sort();
    const inlineLines = Array.from(inlineTailwindClasses)
      .sort()
      .map((className) => `@source inline("${escapeInlineTailwindClassName(className)}");`);
    const lines = [...pathLines, ...inlineLines];

    if (outputFilePath) {
      const didWrite = await writeIfDifferent(outputFilePath, lines.join('\n'));
      if (didWrite) console.log('tailwind-sources:wrote', lines.length);
    }
  };

  return {
    name: 'vite-plugin-component-source-collector',
    enforce: 'pre' as const,
    async configResolved(resolved) {
      config = resolved;
      outputFilePath = resolve(config.root, outFileName);

      let current = config.root;
      while (true) {
        if (await exists(join(current, 'package.json'))) {
          nodeModulesPath = join(current, 'node_modules');
          break;
        }
        current = dirname(current);
      }

      console.log('tailwind-sources:configResolved: Command is', config.command);

      await touch(outputFilePath);
      if (config.command === 'build' && firstRound) {
        console.log('tailwind-sources: Clearing files list');
        componentFiles.clear();
        inlineTailwindClasses.clear();
        firstRound = false;
      } else if (config.command === 'serve' && (await exists(outputFilePath))) {
        const fileLines = (await readFile(outputFilePath, 'utf8')).split('\n');
        for (const fileLine of fileLines) {
          const inlineMatch = fileLine.match(/^@source inline\("(.*)"\);$/);
          if (inlineMatch) {
            addInlineClassList([inlineMatch[1].replaceAll('\\"', '"').replaceAll('\\\\', '\\')]);
            continue;
          }

          const sourcePath = fileLine.replace(/@source\s+'(.*?)';/, '$1');
          if (sourcePath === fileLine) continue;

          const resolvedSourcePath = resolve(dirname(outputFilePath), sourcePath);
          if (resolvedSourcePath.endsWith('.css')) {
            await addPath(sourcePath);
            continue;
          }

          try {
            const code = await readFile(resolvedSourcePath, 'utf8');
            if (shouldAdd(code, resolvedSourcePath)) {
              await addPath(sourcePath);
            }
          } catch {
            // Ignore stale source entries that no longer resolve on disk.
          }
        }
      }
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
        'node_modules/.modules.yaml'
      ].map((path) => join(config.root, path));

      server.watcher.add(lockFiles);
      const onChange = async (file: string) => {
        if (!lockFiles.includes(file)) return;
        componentFiles.clear();
        inlineTailwindClasses.clear();
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
      if (!toPosixPath(id).includes('/node_modules/') && !toPosixPath(id).includes('/.vite/')) {
        await addManifestSourcesForCode(code);
      }

      // Adds all imports from css files
      if (id.includes('css') && code.includes('@import')) {
        const matches = code.matchAll(importRegex);
        for (const match of matches) {
          try {
            const resolved = await this.resolve(match[1], id);
            if (resolved) {
              await addPath(resolved.id);
            }
          } catch {
            // Ignore unresolved CSS imports while building the Tailwind source list.
          }
        }
      }

      if (shouldAdd(code, id)) {
        await addPath(id);
      }

      if (!initialTransformDone) {
        scheduleInitialWrite();
      }
    },
    async handleHotUpdate() {
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
