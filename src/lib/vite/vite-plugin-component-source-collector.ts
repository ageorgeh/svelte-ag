import type { Plugin, ResolvedConfig } from 'vite';
import { exists, writeIfDifferent } from 'ts-ag';
import { readFile } from 'fs/promises';
import { resolve, join, relative, dirname, isAbsolute } from 'path';
import { open } from 'fs/promises';

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
let firstRound = true;
const packageJsonCache = new Map<string, Promise<string | null>>();

function ensureDotRelative(filePath: string): string {
  if (filePath.startsWith('.')) return filePath;
  return `./${filePath}`;
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function toPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
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

type NormalizeCollectedSourceFilePathOptions = {
  outputFilePath: string;
  root: string;
  safePackages: string[];
};

export async function normalizeCollectedSourceFilePath(
  file: string,
  opts: NormalizeCollectedSourceFilePathOptions
): Promise<string> {
  const cleanedFileName = file.replace(/[?#].*$/, '');
  const resolvedFilePath = isAbsolute(cleanedFileName)
    ? resolve(cleanedFileName)
    : resolve(dirname(opts.outputFilePath), cleanedFileName);

  let currentDirectory = dirname(resolvedFilePath);

  while (true) {
    const packageName = await readPackageNameAt(currentDirectory);
    if (packageName !== null) {
      const currentDirectoryPosix = toPosixPath(currentDirectory);
      const isExternalPackage =
        !isPathInside(opts.root, currentDirectory) || currentDirectoryPosix.includes('/node_modules/');

      if (isExternalPackage && opts.safePackages.includes(packageName)) {
        return resolve(opts.root, 'node_modules', packageName, relative(currentDirectory, resolvedFilePath));
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

export default async function componentSourceCollector(opts: Options = { safePackages: [] }): Promise<Plugin> {
  // constants
  const outFileName = opts.outputFile ?? 'component-sources.css';
  const classRegex = /class(?:=|:)/;
  const importRegex = /@import\s+['"]([^'"]+)['"]/g;

  let outputFilePath: string | undefined = undefined;
  let root: string | undefined = undefined;

  // state
  let config: ResolvedConfig;
  let initialTransformDone = false;
  let initialTransformTimer: NodeJS.Timeout | null = null;

  // init
  function shouldAdd(code: string) {
    return classRegex.test(code);
  }

  async function addPath(file: string) {
    if (
      outputFilePath &&
      file !== '' && // No nothing
      root
    ) {
      const normalizedFilePath = await normalizeCollectedSourceFilePath(file, {
        outputFilePath,
        root,
        safePackages: opts.safePackages
      });

      if (
        !/\.svelte-kit/.test(normalizedFilePath) && // No svelte-kit files
        // No dep files unless marked as safe
        (!/(?:\.pnpm|\.vite)/.test(normalizedFilePath) ||
          opts.safePackages.some((p) => normalizedFilePath.includes(`node_modules/${p}`)))
      ) {
        const relativeFilePath = toPosixPath(relative(dirname(outputFilePath), normalizedFilePath));

        if (normalizedFilePath === outputFilePath || relativeFilePath === outFileName) return;
        // Dont add itself
        componentFiles.add(ensureDotRelative(relativeFilePath));
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

  async function touch(path: string) {
    const handle = await open(path, 'a');
    await handle.close();
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

      console.log('tailwind-sources:configResolved: Command is', config.command);

      await touch(outputFilePath);

      if (config.command === 'build' && firstRound) {
        console.log('tailwind-sources: Clearing files list');
        componentFiles.clear();
        firstRound = false;
      } else if (config.command === 'serve') {
        if (await exists(outputFilePath)) {
          const fileLines = (await readFile(outputFilePath, 'utf8')).split('\n');
          for (const fileLine of fileLines) {
            await addPath(fileLine.replace(/@source\s+'(.*?)';/, '$1'));
          }
          // console.log('config resolved', componentFiles);
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
              await addPath(resolved.id);
            }
          } catch {
            // Cant resolve: dont add
          }
        }
      }

      // Adds all other files with the classRegex
      if (shouldAdd(code)) {
        await addPath(id);
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
