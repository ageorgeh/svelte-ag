import { existsSync } from 'node:fs';
import { glob, readdir, stat } from 'node:fs/promises';
import { relative, join, resolve, basename, dirname } from 'node:path';

import { normalizeManifestExportFilter } from '../../vite/tailwind-sources-manifest.js';
import { generateTailwindManifestForPackage } from './manifest-generator.js';
import { toPosixPath } from './path-utils.js';
import type { CliOptions } from './types.js';

const IGNORED_DIRECTORIES = new Set(['.git', '.svelte-kit', 'node_modules']);
const WATCH_POLL_INTERVAL_MS = 700;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(argv);
  const rootDir = process.cwd();

  if (options.watch) {
    await runWatch(rootDir, options);
  } else {
    await runBuild(rootDir, options);
  }
}

async function runBuild(rootDir: string, options: CliOptions): Promise<string[]> {
  const packageDirs = await discoverPackageDirectories(rootDir, options.packagePatterns);
  if (packageDirs.length === 0) {
    throw new Error('[tailwind-manifest] No matching package.json files found.');
  }
  await Promise.all(packageDirs.map((packageDir) => buildPackage(rootDir, packageDir, options.exportFilters)));
  return packageDirs;
}

async function runWatch(rootDir: string, options: CliOptions): Promise<void> {
  const packageDirs = await runBuild(rootDir, options);
  const snapshots = new Map(
    await Promise.all(
      packageDirs.map(async (packageDir) => [packageDir, await createDirectorySnapshot(packageDir)] as const)
    )
  );

  console.log(`[tailwind-manifest] watching ${packageDirs.length} package${packageDirs.length === 1 ? '' : 's'}`);

  const interval = setInterval(async () => {
    for (const packageDir of packageDirs) {
      const nextSnapshot = await createDirectorySnapshot(packageDir);
      if (snapshots.get(packageDir) === nextSnapshot) continue;

      snapshots.set(packageDir, nextSnapshot);

      try {
        await buildPackage(rootDir, packageDir, options.exportFilters);
      } catch (error) {
        console.error(error);
      }
    }
  }, WATCH_POLL_INTERVAL_MS);

  process.on('SIGINT', () => {
    clearInterval(interval);
    process.exit(0);
  });

  await new Promise(() => {});
}

function parseCliArgs(argv: string[]): CliOptions {
  const packagePatterns: string[] = [];
  const exportFilters: string[] = [];
  let watch = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (arg === '--watch') {
      watch = true;
    } else if (arg === '--packages') {
      if (!value) throw new Error('--packages requires a value');
      packagePatterns.push(
        ...value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      );
      i += 1;
    } else if (arg === '--exports') {
      if (!value) throw new Error('--exports requires a value');
      exportFilters.push(...value.split(',').map(normalizeManifestExportFilter).filter(Boolean));
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { exportFilters, packagePatterns, watch };
}

async function discoverPackageDirectories(rootDir: string, packagePatterns: string[]): Promise<string[]> {
  if (packagePatterns.length === 0 && existsSync(join(rootDir, 'package.json'))) {
    return [rootDir];
  }

  const packageJsonPaths = new Set<string>();
  for (const pattern of packagePatterns) {
    for await (const matchedPath of glob(pattern, { cwd: rootDir })) {
      const absolutePath = resolve(rootDir, matchedPath);
      if (basename(absolutePath) === 'package.json') {
        packageJsonPaths.add(absolutePath);
      }
    }
  }

  return [...packageJsonPaths].map((packageJsonPath) => dirname(packageJsonPath)).sort();
}

async function buildPackage(rootDir: string, packageDir: string, exportFilters: string[]): Promise<void> {
  const result = await generateTailwindManifestForPackage(packageDir, { exportFilters });
  const relativeOutputPath = relative(rootDir, result.outputFile) || result.outputFile;
  console.log(
    `[tailwind-manifest] ${result.didWrite ? 'wrote' : 'unchanged'} ${relativeOutputPath} (${result.exportCount} exports)`
  );
}

async function createDirectorySnapshot(packageDir: string): Promise<string> {
  const files: string[] = [];
  const queue = [packageDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) break;

    for (const entry of await readdir(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          queue.push(join(currentDir, entry.name));
        }
        continue;
      }

      const absolutePath = join(currentDir, entry.name);
      const fileStat = await stat(absolutePath);
      files.push(`${toPosixPath(relative(packageDir, absolutePath))}:${fileStat.size}:${fileStat.mtimeMs}`);
    }
  }

  return files.sort().join('|');
}
