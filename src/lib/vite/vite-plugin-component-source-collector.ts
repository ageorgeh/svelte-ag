import type { Plugin, ResolvedConfig } from 'vite';
import { init, parse as parseEsm } from 'es-module-lexer';
import { exists, writeIfDifferent } from 'ts-ag';
import { readFile } from 'fs/promises';
import { resolve, join, relative, dirname, isAbsolute, parse as parsePath } from 'path';
import { open } from 'fs/promises';
import { parse as parseSvelte } from 'svelte/compiler';
import {
  ensureRelativeManifestSourcePath,
  getTailwindSourcesManifestPath,
  parseTailwindSourceManifest,
  splitPackageSpecifier,
  type TailwindSourceManifest,
  type TailwindSourceManifestLeaf
} from './tailwind-sources-manifest.js';

interface Options {
  /**
   * File (relative to project root) that will contain the legacy
   * `@source` entries for discovered component and CSS paths.
   * A sibling `./${name}.classes.txt` file is also generated for
   * manifest-derived class tokens.
   * Defaults to `component-sources.css`
   */
  outputFile?: string;
  /**
   * node_modules packages that can be added to the component list
   */
  safePackages: string[];
}

interface ImportRecord {
  namedImports: string[];
  useExportLevel: boolean;
}

interface ManifestClassOrigin {
  importSpecifier: string;
  exportKey: string;
  symbolName: string | null;
}

/** All unique component directories */
const componentFiles = new Set<string>();
const manifestClassGroups = new Map<string, Set<string>>();
let firstRound = true;
const packageJsonCache = new Map<string, Promise<string | null>>();
const packageManifestCache = new Map<string, Promise<TailwindSourceManifest | null>>();
const TAILWIND_TOKEN_PROPERTY_PATTERN = String.raw`(?:class|(?:"[^"\n]*class[^"\n]*"|'[^'\n]*class[^'\n]*'|[A-Za-z_$][\w$]*class[\w$]*))`;

// TODO replace with ts-ag method
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

function getManifestClassGroupKey(origin: ManifestClassOrigin): string {
  return `${origin.importSpecifier}::${origin.exportKey}::${origin.symbolName ?? '*'}`;
}

function formatManifestClassGroupComment(origin: ManifestClassOrigin): string {
  return `/* tailwind-manifest import=${JSON.stringify(origin.importSpecifier)} export=${JSON.stringify(origin.exportKey)} symbol=${JSON.stringify(origin.symbolName ?? '*')} */`;
}

/** Returns the origin details from a group comment */
function parseManifestClassGroupComment(line: string): ManifestClassOrigin | null {
  const match = line.match(/^\/\* tailwind-manifest import=(".*?") export=(".*?") symbol=(".*?") \*\/$/);
  if (!match) return null;

  return {
    importSpecifier: JSON.parse(match[1]),
    exportKey: JSON.parse(match[2]),
    symbolName: JSON.parse(match[3]) === '*' ? null : JSON.parse(match[3])
  };
}

/** Sets the class list for an origin (import specifier,export key,symbol name)  */
function addManifestClassList(origin: ManifestClassOrigin, classes: string[]) {
  const key = getManifestClassGroupKey(origin);
  const classSet = manifestClassGroups.get(key) ?? new Set<string>();
  for (const className of classes) {
    if (className !== '') classSet.add(className);
  }
  manifestClassGroups.set(key, classSet);
}

function readImportRecord(statement: string): ImportRecord | null {
  const trimmedStatement = statement.trim();
  if (!trimmedStatement.startsWith('import')) return null;

  const fromMatch = trimmedStatement.match(/^import\s+([\s\S]*?)\s+from\s*$/);
  if (fromMatch) {
    const importClause = fromMatch[1]?.trim();
    if (!importClause || importClause.startsWith('type ')) return null;

    const record: ImportRecord = { namedImports: [], useExportLevel: false };

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

    return record;
  }

  if (/^import\s*$/.test(trimmedStatement)) {
    return {
      namedImports: [],
      useExportLevel: true
    };
  }

  return null;
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
  const outFilePath = parsePath(outFileName);
  const manifestClassesFileName = join(outFilePath.dir, `${outFilePath.name}.classes.txt`);
  const classAttributeRegex = new RegExp(String.raw`(?:^|[^\w-])${TAILWIND_TOKEN_PROPERTY_PATTERN}\s*(?:=|:)\s*`, 'i');
  const importRegex = /@import\s+['"]([^'"]+)['"]/g;

  // state
  let outputFilePath: string;
  let manifestClassesFilePath: string;
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

  function formatPathSourceLines(filePath: string): string[] {
    return [`/* tailwind-source: ${filePath} */`, `@source '${filePath}';`];
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
        const manifest = parseTailwindSourceManifest(await readFile(manifestPath, 'utf8'));
        return manifest.version === 1 ? manifest : null;
      } catch {
        return null;
      }
    })();

    packageManifestCache.set(packageName, manifestPromise);
    return manifestPromise;
  }

  async function addManifestLeaf(packageName: string, entry: TailwindSourceManifestLeaf, origin: ManifestClassOrigin) {
    addManifestClassList(origin, entry.classes);

    for (const sourcePath of entry.sources) {
      await addPath(resolve(nodeModulesPath, packageName, ensureRelativeManifestSourcePath(sourcePath)));
    }
  }

  /**
   * Reads the imports present in the code and finds manifests for any of
   * the packages that it imports
   */
  async function addManifestSourcesForCode(code: string, id: string) {
    const imports = new Map<string, ImportRecord>();

    const rewriteImports = async (snippet: string) => {
      const [parsedImports] = parseEsm(snippet);

      for (const parsedImport of parsedImports) {
        const specifier = parsedImport.n;
        if (!specifier) continue;

        const statementPrefix = snippet.slice(parsedImport.ss, parsedImport.s - 1);
        const recordDelta = readImportRecord(statementPrefix);
        if (!recordDelta) continue;

        const record = imports.get(specifier) ?? { namedImports: [], useExportLevel: false };
        if (recordDelta.useExportLevel) {
          record.useExportLevel = true;
        }
        if (recordDelta.namedImports.length > 0) {
          record.namedImports.push(...recordDelta.namedImports);
        }
        imports.set(specifier, record);
      }
    };

    if (id.replace(/[?#].*$/, '').endsWith('.svelte')) {
      try {
        const ast = parseSvelte(code, { filename: id, modern: true });
        const scripts = [ast.module, ast.instance].filter(Boolean);

        for (const script of scripts) {
          const content = script!.content as unknown as { start: number; end: number };
          await rewriteImports(code.slice(content.start, content.end));
        }
      } catch {
        await rewriteImports(code);
      }
    } else {
      await rewriteImports(code);
    }

    for (const [specifier, importRecord] of imports) {
      const { packageName, exportKey } = splitPackageSpecifier(specifier);
      if (!packageName || !opts.safePackages.includes(packageName)) continue;

      const manifest = await readPackageManifest(packageName);
      const exportEntry = manifest?.exports[exportKey];
      if (!exportEntry) continue;

      if (importRecord.useExportLevel || importRecord.namedImports.length === 0 || !exportEntry.symbols) {
        await addManifestLeaf(packageName, exportEntry, {
          importSpecifier: specifier,
          exportKey,
          symbolName: null
        });
        continue;
      }

      const symbolEntries = importRecord.namedImports
        .map((symbolName) => ({
          symbolName,
          entry: exportEntry.symbols?.[symbolName] ?? null
        }))
        .filter((entry): entry is { symbolName: string; entry: TailwindSourceManifestLeaf } => entry.entry !== null);

      if (symbolEntries.length !== importRecord.namedImports.length) {
        await addManifestLeaf(packageName, exportEntry, {
          importSpecifier: specifier,
          exportKey,
          symbolName: null
        });
        continue;
      }

      for (const symbolEntry of symbolEntries) {
        await addManifestLeaf(packageName, symbolEntry.entry, {
          importSpecifier: specifier,
          exportKey,
          symbolName: symbolEntry.symbolName
        });
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

  /**
   * Compiles and writes the output files if they are different
   */
  async function writeOutFile() {
    const pathLines = Array.from([...componentFiles, `./${manifestClassesFileName}`]).sort();
    const pathOutput = pathLines.flatMap((filePath) => formatPathSourceLines(filePath)).join('\n');
    const manifestClassLines = Array.from(manifestClassGroups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([groupKey, classNames]) => {
        const [importSpecifier, exportKey, symbolToken] = groupKey.split('::');
        const origin: ManifestClassOrigin = {
          importSpecifier,
          exportKey,
          symbolName: symbolToken === '*' ? null : symbolToken
        };

        return [formatManifestClassGroupComment(origin), ...Array.from(classNames).sort(), ''];
      });
    const manifestClassOutput = manifestClassLines.join('\n').trimEnd();

    if (outputFilePath) {
      const didWritePaths = await writeIfDifferent(outputFilePath, pathOutput);
      const didWriteClasses = await writeIfDifferent(manifestClassesFilePath, manifestClassOutput);

      if (didWritePaths || didWriteClasses) {
        console.log(
          'tailwind-sources:wrote',
          pathLines.length,
          'paths and',
          Array.from(manifestClassGroups.values()).reduce((count, classSet) => count + classSet.size, 0),
          'classes'
        );
      }
    }
  }

  return {
    name: 'vite-plugin-component-source-collector',
    enforce: 'pre' as const,
    async buildStart() {
      await init; // init es-module-lexer
    },

    /**
     * Reads the existing files and uses them if this is a dev server
     */
    async configResolved(resolved) {
      config = resolved;
      outputFilePath = resolve(config.root, outFileName);
      manifestClassesFilePath = resolve(config.root, manifestClassesFileName);

      // walk up and find the node_modules path
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
      await touch(manifestClassesFilePath);
      if (config.command === 'build' && firstRound) {
        console.log('tailwind-sources: Clearing files list');
        componentFiles.clear();
        manifestClassGroups.clear();
        firstRound = false;
      } else if (config.command === 'serve' && (await exists(outputFilePath))) {
        const fileLines = (await readFile(outputFilePath, 'utf8')).split('\n');
        for (const fileLine of fileLines) {
          if (/^\/\* tailwind-source: .* \*\/$/.test(fileLine)) {
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

        if (await exists(manifestClassesFilePath)) {
          const classLines = (await readFile(manifestClassesFilePath, 'utf8')).split('\n');
          let currentOrigin: ManifestClassOrigin | null = null;

          for (const rawLine of classLines) {
            const fileLine = rawLine.trim();
            if (fileLine === '') continue;

            const parsedOrigin = parseManifestClassGroupComment(fileLine);
            if (parsedOrigin) {
              currentOrigin = parsedOrigin;
              continue;
            }

            if (currentOrigin) {
              addManifestClassList(currentOrigin, [fileLine]);
            }
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
        manifestClassGroups.clear();
      };

      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);
    },

    /**
     * Adds @source records based on transformed code that matches the class regex
     * and is a src file or is in the safe packages list
     *
     * Adds manifest sources by analyzing src file imports
     */
    async transform(code, id) {
      // console.log('tailwind-sources:transform', id);
      if (!toPosixPath(id).includes('/node_modules/') && !toPosixPath(id).includes('/.vite/')) {
        await addManifestSourcesForCode(code, id);
      }

      // Adds all imports from css files
      if (id.includes('css') && code.includes('@import')) {
        const matches = code.matchAll(importRegex);
        for (const match of matches) {
          try {
            const resolved = await this.resolve(match[1], id);
            if (resolved) await addPath(resolved.id);
          } catch {
            // Ignore unresolved CSS imports while building the Tailwind source list.
          }
        }
      }

      // add files matching class regex
      if (shouldAdd(code, id)) await addPath(id);

      // debounce a write
      if (!initialTransformDone) scheduleInitialWrite();
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
