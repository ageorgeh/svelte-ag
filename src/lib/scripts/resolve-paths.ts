import { cp, glob, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { realpathSync, watch, type FSWatcher } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSingleFileReplaceTscAliasPaths, replaceTscAliasPaths, type SingleFileReplacer } from 'tsc-alias';
import { loadConfig, prepareConfig } from 'tsc-alias/dist/helpers/config.js';
import { Output, TrieNode } from 'tsc-alias/dist/utils/index.js';
import type { Alias } from 'tsc-alias/dist/interfaces.js';

const DEFAULT_INPUTS = ['tsconfig.json'];
const GLOB_EXCLUDES = ['**/node_modules/**', '**/.git/**', '**/.svelte-kit/**', '**/dist/**'];
const LABEL = '[resolve-paths]';
const REPLACEABLE_FILE_EXTENSIONS = {
  inputGlob: '{ts,tsx,js,jsx,mjs,cjs,svelte,d.{mts,cts,ts,tsx}}',
  outputCheck: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'svelte',
    'json',
    'mts',
    'cts',
    'd.ts',
    'd.tsx',
    'd.mts',
    'd.cts'
  ]
} as const;

export interface ResolvePathsProject {
  tsconfigPath: string;
  rootDir: string;
  srcDir: string;
  distDir: string;
}

export interface ResolvePathsOptions {
  cwd?: string;
  excludeAliases?: string[];
  inputs?: string[];
}

export interface ResolvePathsWatcher {
  close(): void;
  projects: ResolvePathsProject[];
}

interface CliOptions {
  excludeAliases: string[];
  inputs: string[];
  watchMode: boolean;
}

type ProjectUpdateResult = 'rebuilt' | 'synced';

function formatPath(targetPath: string, cwd = process.cwd()): string {
  return relative(cwd, targetPath) || '.';
}

function logInfo(message: string): void {
  console.log(`${LABEL} ${message}`);
}

function logError(message: string): void {
  console.error(`${LABEL} ${message}`);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function resolveDirectInput(input: string, cwd: string): Promise<string[]> {
  const absoluteInputPath = isAbsolute(input) ? input : resolve(cwd, input);

  if (!(await pathExists(absoluteInputPath))) {
    return [];
  }

  const inputStats = await stat(absoluteInputPath);

  if (inputStats.isDirectory()) {
    const nestedTsconfigPath = resolve(absoluteInputPath, 'tsconfig.json');
    return (await pathExists(nestedTsconfigPath)) ? [nestedTsconfigPath] : [];
  }

  return [absoluteInputPath];
}

async function expandInput(input: string, cwd: string): Promise<string[]> {
  const directMatches = await resolveDirectInput(input, cwd);

  if (directMatches.length > 0) {
    return directMatches;
  }

  const matches = await Array.fromAsync(
    glob(input, {
      cwd,
      exclude: GLOB_EXCLUDES
    })
  );

  return matches.map((match) => resolve(cwd, match));
}

function normalizeAliasPrefix(alias: string): string {
  return alias.replace(/\/\*$/, '').replace(/\/+$/, '');
}

function normalizeExcludedAliases(excludedAliases: string[] = []): string[] {
  return [...new Set(excludedAliases.map(normalizeAliasPrefix).filter(Boolean))];
}

function createTemporaryPath(rootDir: string, prefix: string): string {
  return resolve(rootDir, `.${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
}

function createSilentOutput(): Output {
  return new Output(false, false);
}

async function createFilteredAliasTrie(
  project: ResolvePathsProject,
  excludedAliases: string[],
  outDir: string
): Promise<TrieNode<Alias> | undefined> {
  if (excludedAliases.length === 0) {
    return undefined;
  }

  const normalizedExcludedAliases = new Set(excludedAliases.map(normalizeAliasPrefix).filter(Boolean));
  const output = createSilentOutput();
  const loadedConfig = loadConfig(project.tsconfigPath, output);

  if (!loadedConfig.paths) {
    return undefined;
  }

  const filteredPaths = Object.fromEntries(
    Object.entries(loadedConfig.paths).filter(([alias]) => !normalizedExcludedAliases.has(normalizeAliasPrefix(alias)))
  );
  const preparedConfig = await prepareConfig({
    configFile: project.tsconfigPath,
    fileExtensions: {
      inputGlob: REPLACEABLE_FILE_EXTENSIONS.inputGlob,
      outputCheck: [...REPLACEABLE_FILE_EXTENSIONS.outputCheck]
    },
    outDir,
    output
  });

  return TrieNode.buildAliasTrie(preparedConfig, filteredPaths);
}

function isReplaceableOutputFile(filePath: string): boolean {
  const normalizedFilePath = filePath.toLowerCase();

  return REPLACEABLE_FILE_EXTENSIONS.outputCheck.some((extension) =>
    normalizedFilePath.endsWith(`.${extension.toLowerCase()}`)
  );
}

async function createSingleFileAliasReplacer(
  project: ResolvePathsProject,
  excludedAliases: string[]
): Promise<SingleFileReplacer> {
  return prepareSingleFileReplaceTscAliasPaths({
    aliasTrie: await createFilteredAliasTrie(project, excludedAliases, project.distDir),
    configFile: project.tsconfigPath,
    outDir: project.distDir,
    fileExtensions: {
      inputGlob: REPLACEABLE_FILE_EXTENSIONS.inputGlob,
      outputCheck: [...REPLACEABLE_FILE_EXTENSIONS.outputCheck]
    }
  });
}

async function resolveAliases(
  project: ResolvePathsProject,
  outDir: string,
  options: ResolvePathsOptions = {}
): Promise<void> {
  await replaceTscAliasPaths({
    aliasTrie: await createFilteredAliasTrie(project, options.excludeAliases ?? [], outDir),
    configFile: project.tsconfigPath,
    outDir,
    fileExtensions: {
      inputGlob: REPLACEABLE_FILE_EXTENSIONS.inputGlob,
      outputCheck: [...REPLACEABLE_FILE_EXTENSIONS.outputCheck]
    }
  });
}

async function copyProjectSource(project: ResolvePathsProject, outDir: string): Promise<void> {
  await rm(outDir, {
    force: true,
    recursive: true
  });
  await mkdir(dirname(outDir), { recursive: true });
  await cp(project.srcDir, outDir, {
    force: true,
    recursive: true
  });
}

async function collectProjectTree(rootDir: string, currentDir = rootDir): Promise<string[]> {
  if (!(await pathExists(currentDir))) {
    return [];
  }

  const entries = await readdir(currentDir, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(currentDir, entry.name);
    const relativePath = relative(rootDir, entryPath);

    paths.push(relativePath);

    if (entry.isDirectory()) {
      paths.push(...(await collectProjectTree(rootDir, entryPath)));
    }
  }

  return paths;
}

async function publishStagedProject(stageDir: string, distDir: string): Promise<void> {
  const stagedPaths = await collectProjectTree(stageDir);
  const stagedPathSet = new Set(stagedPaths);

  for (const relativePath of stagedPaths
    .filter((path) => path !== '')
    .sort((left, right) => left.localeCompare(right))) {
    const stagedPath = resolve(stageDir, relativePath);
    const distPath = resolve(distDir, relativePath);
    const stagedStats = await stat(stagedPath);

    if (stagedStats.isDirectory()) {
      await mkdir(distPath, { recursive: true });
      continue;
    }

    await mkdir(dirname(distPath), { recursive: true });
    await rename(stagedPath, distPath);
  }

  if (!(await pathExists(distDir))) {
    return;
  }

  const distPaths = await collectProjectTree(distDir);

  for (const relativePath of distPaths.sort((left, right) => right.length - left.length || right.localeCompare(left))) {
    if (!stagedPathSet.has(relativePath)) {
      await rm(resolve(distDir, relativePath), {
        force: true,
        recursive: true
      });
    }
  }
}

async function resolveFileContents(
  project: ResolvePathsProject,
  distPath: string,
  sourceContents: string,
  excludedAliases: string[]
): Promise<string> {
  if (!isReplaceableOutputFile(distPath)) {
    return sourceContents;
  }

  const resolveAliasesInFile = await createSingleFileAliasReplacer(project, excludedAliases);

  return resolveAliasesInFile({
    fileContents: sourceContents,
    filePath: distPath
  });
}

async function publishFileAtomically(
  project: ResolvePathsProject,
  sourcePath: string,
  distPath: string,
  excludedAliases: string[]
): Promise<void> {
  const tempPath = createTemporaryPath(dirname(distPath), basename(distPath));

  await mkdir(dirname(distPath), { recursive: true });

  if (isReplaceableOutputFile(distPath)) {
    const sourceContents = await readFile(sourcePath, 'utf8');
    const resolvedContents = await resolveFileContents(project, distPath, sourceContents, excludedAliases);
    await writeFile(tempPath, resolvedContents, 'utf8');
  } else {
    await cp(sourcePath, tempPath, { force: true });
  }

  await rename(tempPath, distPath);
}

async function syncProjectSourcePath(
  project: ResolvePathsProject,
  sourceRelativePath: string,
  excludedAliases: string[]
): Promise<ProjectUpdateResult> {
  const sourcePath = resolve(project.srcDir, sourceRelativePath);
  const normalizedRelativePath = relative(project.srcDir, sourcePath);

  if (normalizedRelativePath.startsWith('..') || isAbsolute(normalizedRelativePath)) {
    await buildProject(project, {
      excludeAliases: excludedAliases
    });
    return 'rebuilt';
  }

  const distPath = resolve(project.distDir, normalizedRelativePath);

  if (!(await pathExists(sourcePath))) {
    await rm(distPath, {
      force: true,
      recursive: true
    });
    return 'synced';
  }

  const sourceStats = await stat(sourcePath);

  if (!sourceStats.isFile()) {
    await buildProject(project, {
      excludeAliases: excludedAliases
    });
    return 'rebuilt';
  }

  await publishFileAtomically(project, sourcePath, distPath, excludedAliases);

  return 'synced';
}

export async function buildProject(project: ResolvePathsProject, options: ResolvePathsOptions = {}): Promise<void> {
  const excludedAliases = normalizeExcludedAliases(options.excludeAliases);
  const stageDir = createTemporaryPath(project.rootDir, basename(project.distDir));

  try {
    await copyProjectSource(project, stageDir);
    await resolveAliases(project, stageDir, {
      ...options,
      excludeAliases: excludedAliases
    });
    await publishStagedProject(stageDir, project.distDir);
  } finally {
    await rm(stageDir, {
      force: true,
      recursive: true
    });
  }
}

export async function findProjects(options: ResolvePathsOptions = {}): Promise<ResolvePathsProject[]> {
  const cwd = options.cwd ?? process.cwd();
  const inputs = options.inputs && options.inputs.length > 0 ? options.inputs : DEFAULT_INPUTS;
  const resolvedTsconfigPaths = new Set<string>();

  for (const input of inputs) {
    const matches = await expandInput(input, cwd);

    if (matches.length === 0) {
      throw new Error(`No tsconfig.json files matched "${input}" from ${formatPath(cwd, cwd)}`);
    }

    for (const match of matches) {
      if (basename(match) !== 'tsconfig.json') {
        continue;
      }

      resolvedTsconfigPaths.add(resolve(match));
    }
  }

  const projects = await Promise.all(
    [...resolvedTsconfigPaths]
      .sort((left, right) => left.localeCompare(right))
      .map(async (tsconfigPath) => {
        const rootDir = dirname(tsconfigPath);
        const srcDir = resolve(rootDir, 'src');

        if (!(await pathExists(srcDir))) {
          throw new Error(`Missing src directory for ${formatPath(tsconfigPath, cwd)} at ${formatPath(srcDir, cwd)}`);
        }

        return {
          distDir: resolve(rootDir, 'dist'),
          rootDir,
          srcDir,
          tsconfigPath
        } satisfies ResolvePathsProject;
      })
  );

  if (projects.length === 0) {
    throw new Error(`No tsconfig.json files matched: ${inputs.join(', ')}`);
  }

  return projects;
}

export async function buildProjects(options: ResolvePathsOptions = {}): Promise<ResolvePathsProject[]> {
  const cwd = options.cwd ?? process.cwd();
  const projects = await findProjects(options);

  await Promise.all(
    projects.map(async (project) => {
      await buildProject(project, options);
      logInfo(
        `updated ${formatPath(project.distDir, cwd)} from ${formatPath(project.srcDir, cwd)} using ${formatPath(project.tsconfigPath, cwd)}`
      );
    })
  );

  return projects;
}

function createDebouncedProjectRunner(
  project: ResolvePathsProject,
  cwd: string,
  options: ResolvePathsOptions
): {
  close(): void;
  schedule(reason: string, sourceRelativePath?: string): void;
} {
  let closed = false;
  let activeBuild: Promise<void> | undefined;
  let pendingReason: string | undefined;
  let pendingFullRebuild = false;
  let pendingSourcePaths = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const excludedAliases = normalizeExcludedAliases(options.excludeAliases);

  const run = async (): Promise<void> => {
    if (closed) {
      return;
    }

    if (activeBuild) {
      return;
    }

    const reason = pendingReason ?? 'change';
    const fullRebuild = pendingFullRebuild;
    const sourcePaths = fullRebuild ? [] : [...pendingSourcePaths].sort((left, right) => left.localeCompare(right));
    pendingReason = undefined;
    pendingFullRebuild = false;
    pendingSourcePaths = new Set<string>();

    activeBuild = (async () => {
      if (fullRebuild || sourcePaths.length === 0) {
        logInfo(`rebuilding ${formatPath(project.tsconfigPath, cwd)} after ${reason}`);
        await buildProject(project, {
          ...options,
          excludeAliases: excludedAliases
        });
        logInfo(`watch updated ${formatPath(project.distDir, cwd)}`);
        return;
      }

      logInfo(
        `updating ${sourcePaths.length} changed path(s) in ${formatPath(project.tsconfigPath, cwd)} after ${reason}`
      );

      for (const sourcePath of sourcePaths) {
        const result = await syncProjectSourcePath(project, sourcePath, excludedAliases);

        if (result === 'rebuilt') {
          logInfo(`watch updated ${formatPath(project.distDir, cwd)}`);
          return;
        }
      }

      logInfo(`watch updated ${formatPath(project.distDir, cwd)}`);
    })();

    try {
      await activeBuild;
    } finally {
      activeBuild = undefined;

      if (pendingReason) {
        await run();
      }
    }
  };

  return {
    close() {
      closed = true;

      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    schedule(reason: string, sourceRelativePath?: string) {
      if (closed) {
        return;
      }

      pendingReason = reason;
      if (sourceRelativePath) {
        if (!pendingFullRebuild) {
          pendingSourcePaths.add(sourceRelativePath);
        }
      } else {
        pendingFullRebuild = true;
        pendingSourcePaths.clear();
      }

      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = undefined;
        void run().catch((error) => {
          logError(`watch rebuild failed for ${formatPath(project.tsconfigPath, cwd)}: ${(error as Error).message}`);
        });
      }, 100);
    }
  };
}

function watchProject(project: ResolvePathsProject, cwd: string, options: ResolvePathsOptions): FSWatcher[] {
  const runner = createDebouncedProjectRunner(project, cwd, options);

  const sourceWatcher = watch(project.srcDir, { recursive: true }, (_eventType, fileName) => {
    const suffix = fileName ? ` (${fileName.toString()})` : '';
    runner.schedule(`src change${suffix}`, fileName?.toString());
  });
  const configWatcher = watch(project.tsconfigPath, () => {
    runner.schedule('tsconfig change');
  });

  return [
    sourceWatcher,
    configWatcher,
    {
      close() {
        runner.close();
      }
    } as FSWatcher
  ];
}

export async function watchProjects(options: ResolvePathsOptions = {}): Promise<ResolvePathsWatcher> {
  const cwd = options.cwd ?? process.cwd();
  const projects = await buildProjects(options);
  const watchers = projects.flatMap((project) => watchProject(project, cwd, options));

  logInfo(`watching ${projects.length} project(s)`);

  return {
    close() {
      for (const watcher of watchers) {
        watcher.close();
      }
    },
    projects
  };
}

export function parseCliArgs(args: string[]): CliOptions {
  const excludeAliases: string[] = [];
  const inputs: string[] = [];
  let watchMode = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '-w' || arg === '--watch') {
      watchMode = true;
      continue;
    }

    if (arg === '--exclude-alias') {
      const value = args[index + 1];

      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --exclude-alias');
      }

      excludeAliases.push(
        ...value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      );
      index += 1;
      continue;
    }

    if (arg.startsWith('--exclude-alias=')) {
      excludeAliases.push(
        ...arg
          .slice('--exclude-alias='.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      );
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option "${arg}"`);
    }

    inputs.push(arg);
  }

  return {
    excludeAliases,
    inputs,
    watchMode
  };
}

function printUsage(): void {
  console.log(
    [
      'Usage: resolve-paths [--watch] [tsconfig.json path or glob ...]',
      '',
      'Examples:',
      '  resolve-paths',
      '  resolve-paths tsconfig.json',
      "  resolve-paths --exclude-alias '$shared,$generated' tsconfig.json",
      "  resolve-paths 'packages/*/tsconfig.json'",
      "  resolve-paths --watch 'packages/*/tsconfig.json'"
    ].join('\n')
  );
}

function normalizeExecutablePath(targetPath: string): string {
  try {
    return realpathSync.native(targetPath);
  } catch {
    return resolve(targetPath);
  }
}

export function isDirectExecution(entryPath = process.argv[1], moduleUrl = import.meta.url): boolean {
  if (!entryPath) {
    return false;
  }

  return normalizeExecutablePath(entryPath) === normalizeExecutablePath(fileURLToPath(moduleUrl));
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { excludeAliases, inputs, watchMode } = parseCliArgs(args);

  if (watchMode) {
    await watchProjects({ excludeAliases, inputs });
    return;
  }

  await buildProjects({ excludeAliases, inputs });
}

if (isDirectExecution()) {
  void main().catch((error) => {
    logError((error as Error).message);
    process.exit(1);
  });
}
