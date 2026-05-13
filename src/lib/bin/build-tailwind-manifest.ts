import { existsSync, statSync } from 'node:fs';
import { glob, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { init, parse as parseEsm } from 'es-module-lexer';
import { parse as parseSvelte } from 'svelte/compiler';
import ts from 'typescript';
import { readPackageJson, writeIfDifferent } from 'ts-ag';
import {
  ensureRelativeManifestSourcePath,
  getTailwindSourcesManifestPath,
  normalizeManifestExportFilter,
  serializeTailwindSourceManifest,
  shouldIncludeManifestExport,
  type TailwindSourceManifest,
  type TailwindSourceManifestLeaf
} from '../vite/tailwind-sources-manifest.js';

interface ExportTargetMap {
  [key: string]: ExportTarget;
}

type ExportTarget = string | string[] | ExportTargetMap;

type PackageJsonWithExports = {
  name?: string;
  exports?: Record<string, ExportTarget>;
  tailwindSources?: string;
};

type GeneratorOptions = {
  exportFilters: string[];
};

type GraphScan = {
  classes: Set<string>;
  sources: Set<string>;
};

type CliOptions = {
  exportFilters: string[];
  packagePatterns: string[];
  watch: boolean;
};

const WATCH_POLL_INTERVAL_MS = 700;
const CLASS_COLLECTOR_CALLS = new Set(['cn', 'clsx', 'cva', 'tv']);
const IGNORED_DIRECTORIES = new Set(['.git', '.svelte-kit', 'node_modules']);

/** Build a Tailwind source manifest for one package export map. */
export async function generateTailwindManifestForPackage(
  packageDir: string,
  options: GeneratorOptions
): Promise<{ didWrite: boolean; outputFile: string; exportCount: number }> {
  const packageJson = (await readPackageJson(path.join(packageDir, 'package.json'))) as PackageJsonWithExports | null;
  if (!packageJson) {
    throw new Error(`No package.json found in ${packageDir}`);
  }

  const manifest: TailwindSourceManifest = {
    version: 1,
    exports: {}
  };

  const packageExports = packageJson.exports ?? {};
  const exportEntries = Object.entries(packageExports).filter(([exportKey]) =>
    shouldIncludeManifestExport(exportKey, options.exportFilters)
  );

  for (const [exportKey, exportTarget] of exportEntries) {
    if (exportKey.includes('*') || hasWildcardTarget(exportTarget)) {
      console.warn(`[tailwind-manifest] Skipping wildcard export ${exportKey} in ${packageDir}`);
      continue;
    }

    const entryFiles = collectRuntimeTargets(exportTarget)
      .map((target) => resolvePackageEntryFile(packageDir, target))
      .filter((targetPath): targetPath is string => targetPath !== null);

    if (entryFiles.length === 0) {
      continue;
    }

    const exportScan = await scanFileGraph(entryFiles, packageDir);
    const manifestEntry = toManifestLeaf(exportScan);
    const symbols = await collectExportSymbols(entryFiles, packageDir);

    if (Object.keys(symbols).length > 0) {
      manifest.exports[exportKey] = {
        ...manifestEntry,
        symbols
      };
      continue;
    }

    manifest.exports[exportKey] = manifestEntry;
  }

  const outputFile = getTailwindSourcesManifestPath(packageDir, packageJson);
  const didWrite = await writeIfDifferent(outputFile, serializeTailwindSourceManifest(manifest));
  return { didWrite, outputFile, exportCount: Object.keys(manifest.exports).length };
}

/** Resolve exported symbols to their own Tailwind class and CSS source sets. */
async function collectExportSymbols(
  entryFiles: string[],
  packageDir: string
): Promise<Record<string, TailwindSourceManifestLeaf>> {
  const symbols = new Map<string, { classes: Set<string>; sources: Set<string> }>();

  for (const entryFile of entryFiles) {
    const symbolTargets = await readEntrySymbolTargets(entryFile);

    for (const [symbolName, targetFile] of symbolTargets) {
      const scan = await scanFileGraph([targetFile], packageDir);
      const existing = symbols.get(symbolName);

      if (existing) {
        for (const className of scan.classes) existing.classes.add(className);
        for (const sourcePath of scan.sources) existing.sources.add(sourcePath);
        continue;
      }

      symbols.set(symbolName, {
        classes: new Set(scan.classes),
        sources: new Set(scan.sources)
      });
    }
  }

  return Object.fromEntries(
    [...symbols.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([symbolName, scan]) => [symbolName, toManifestLeaf(scan)])
  );
}

/** Map re-exported symbol names from an entry file back to local source files. */
async function readEntrySymbolTargets(entryFile: string, visited = new Set<string>()): Promise<Map<string, string>> {
  if (visited.has(entryFile)) {
    return new Map();
  }

  visited.add(entryFile);

  const source = await readFile(entryFile, 'utf8');
  const importBindings = new Map<string, string>();
  const symbolTargets = new Map<string, string>();

  for (const snippet of getModuleSnippets(entryFile, source)) {
    await init;
    const [imports, exports] = parseEsm(snippet);

    for (const parsedImport of imports) {
      const statement = snippet.slice(parsedImport.ss, parsedImport.se).trim();
      if (statement === '' || /^import\s+type\b/.test(statement) || /^export\s+type\b/.test(statement)) {
        continue;
      }

      if (statement.startsWith('import')) {
        const specifier = parsedImport.n;
        if (!specifier || !isRelativeSpecifier(specifier)) continue;

        for (const localName of readImportBindingNames(statement)) {
          importBindings.set(localName, specifier);
        }
        continue;
      }

      if (!statement.startsWith('export')) {
        continue;
      }

      const specifier = parsedImport.n;
      if (!specifier || !isRelativeSpecifier(specifier)) continue;

      const targetFile = resolveLocalImportPath(specifier, entryFile);
      if (!targetFile) continue;

      if (/^export\s+\*\s+from\b/.test(statement)) {
        const nestedTargets = await readEntrySymbolTargets(targetFile, visited);
        for (const [symbolName, nestedTargetFile] of nestedTargets) {
          if (!symbolTargets.has(symbolName)) {
            symbolTargets.set(symbolName, nestedTargetFile);
          }
        }
        continue;
      }

      const statementExports = exports.filter(
        (exportRecord) => exportRecord.s >= parsedImport.ss && exportRecord.e <= parsedImport.se
      );
      for (const exportRecord of statementExports) {
        symbolTargets.set(exportRecord.n, targetFile);
      }
    }

    for (const exportRecord of exports) {
      const localName = exportRecord.ln ?? exportRecord.n;
      const localSpecifier = importBindings.get(localName);
      if (!localSpecifier) continue;

      const targetFile = resolveLocalImportPath(localSpecifier, entryFile);
      if (!targetFile) continue;

      if (!symbolTargets.has(exportRecord.n)) {
        symbolTargets.set(exportRecord.n, targetFile);
      }
    }
  }

  visited.delete(entryFile);
  return symbolTargets;
}

/** Walk local imports reachable from entry files and collect classes plus CSS sources. */
async function scanFileGraph(entryFiles: string[], packageDir: string): Promise<GraphScan> {
  const scan: GraphScan = {
    classes: new Set<string>(),
    sources: new Set<string>()
  };
  const visited = new Set<string>();

  const visit = async (filePath: string) => {
    if (visited.has(filePath) || !isPathInside(packageDir, filePath)) {
      return;
    }

    visited.add(filePath);

    const source = await readFile(filePath, 'utf8');
    collectClassNamesFromFile(filePath, source, scan.classes);

    if (filePath.endsWith('.css')) {
      scan.sources.add(ensureRelativeManifestSourcePath(toPosixPath(path.relative(packageDir, filePath))));
    }

    for (const specifier of await extractLocalSpecifiers(filePath, source)) {
      const targetFile = resolveLocalImportPath(specifier, filePath);
      if (!targetFile) continue;
      await visit(targetFile);
    }
  };

  for (const entryFile of entryFiles) {
    await visit(entryFile);
  }

  return scan;
}

/** Extract likely Tailwind class tokens from markup and script expressions. */
function collectClassNamesFromFile(filePath: string, source: string, out: Set<string>): void {
  const markupSource = getClassAttributeSource(filePath, source);

  for (const match of markupSource.matchAll(/(?:class|className)\s*=\s*(['"`])([\s\S]*?)\1/g)) {
    addClassTokens(match[2] ?? '', out);
  }

  for (const match of markupSource.matchAll(/(?:class|className)\s*=\s*\{([\s\S]*?)\}/g)) {
    const expression = match[1]?.trim();
    if (!expression) continue;

    const sourceFile = createTypeScriptSourceFile(filePath, `(${expression})`);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && CLASS_COLLECTOR_CALLS.has(getExpressionName(node.expression))) {
        collectStringLiterals(node, out);
      }

      if (ts.isPropertyAssignment(node) && isTailwindTokenPropertyName(node.name)) {
        collectStringLiterals(node.initializer, out);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  for (const scriptBlock of getModuleSnippets(filePath, source)) {
    const sourceFile = createTypeScriptSourceFile(filePath, scriptBlock);

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && CLASS_COLLECTOR_CALLS.has(getExpressionName(node.expression))) {
        collectStringLiterals(node, out);
      }

      if (ts.isPropertyAssignment(node) && isTailwindTokenPropertyName(node.name)) {
        collectStringLiterals(node.initializer, out);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
}

function getClassAttributeSource(filePath: string, source: string): string {
  if (!filePath.endsWith('.svelte')) {
    return source;
  }

  return source.replaceAll(/<!--[\s\S]*?-->/g, '');
}

function getModuleSnippets(filePath: string, source: string): string[] {
  if (!filePath.endsWith('.svelte')) {
    return [source];
  }

  try {
    const ast = parseSvelte(source, { filename: filePath, modern: true });
    const scripts = [ast.module, ast.instance].filter(Boolean);
    return scripts.map((script) => {
      const content = script!.content as unknown as { start: number; end: number };
      return source.slice(content.start, content.end);
    });
  } catch {
    return [source];
  }
}

/** Recursively collect class tokens from string literal nodes. */
function collectStringLiterals(node: ts.Node, out: Set<string>): void {
  if (ts.isStringLiteralLike(node)) {
    addClassTokens(node.text, out);
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    addClassTokens(node.text, out);
  }

  ts.forEachChild(node, (child) => collectStringLiterals(child, out));
}

/** Split whitespace-delimited class strings into manifest tokens. */
function addClassTokens(value: string, out: Set<string>): void {
  for (const token of value.split(/\s+/)) {
    const trimmed = token.trim();
    if (trimmed === '' || trimmed.includes('${')) continue;
    out.add(trimmed);
  }
}

/** Parse source text with a script kind inferred from the file extension. */
function createTypeScriptSourceFile(filePath: string, source: string): ts.SourceFile {
  const scriptKind = filePath.endsWith('.js')
    ? ts.ScriptKind.JS
    : filePath.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : filePath.endsWith('.tsx')
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS;

  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

/** Get a stable function name from simple call expressions. */
function getExpressionName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return '';
}

/** Match object keys commonly used to hold Tailwind token strings. */
function isTailwindTokenPropertyName(name: ts.PropertyName): boolean {
  return (ts.isIdentifier(name) || ts.isStringLiteral(name)) && /class/i.test(name.text);
}

/** Find relative imports/exports with module-lexer and CSS imports with a fallback regex. */
async function extractLocalSpecifiers(filePath: string, source: string): Promise<string[]> {
  const matches = new Set<string>();

  await init;

  const collectEsmSpecifiers = async (snippet: string) => {
    const [imports] = parseEsm(snippet);

    for (const parsedImport of imports) {
      const specifier = parsedImport.n;
      if (!specifier || !isRelativeSpecifier(specifier)) continue;

      const statement = snippet.slice(parsedImport.ss, parsedImport.se).trim();
      if (statement === '' || /^import\s+type\b/.test(statement) || /^export\s+type\b/.test(statement)) {
        continue;
      }

      if (!statement.startsWith('import') && !statement.startsWith('export')) continue;
      matches.add(specifier);
    }
  };

  if (filePath.endsWith('.svelte')) {
    for (const snippet of getModuleSnippets(filePath, source)) {
      await collectEsmSpecifiers(snippet);
    }
  } else {
    await collectEsmSpecifiers(source);
  }

  for (const match of source.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (specifier && isRelativeSpecifier(specifier)) {
      matches.add(specifier);
    }
  }

  return [...matches];
}

/** Check whether a module specifier resolves to a local file. */
function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

/** Resolve a relative import from one file to an on-disk source file. */
function resolveLocalImportPath(specifier: string, importerPath: string): string | null {
  const cleanSpecifier = specifier.split('?')[0]?.split('#')[0] ?? specifier;
  const targetPath = path.resolve(path.dirname(importerPath), cleanSpecifier);
  return resolveFileCandidate(targetPath);
}

/** Resolve a package export target to its runtime source file. */
function resolvePackageEntryFile(packageDir: string, entryTarget: string): string | null {
  const normalizedTarget = entryTarget.startsWith('./') ? entryTarget : `./${entryTarget}`;
  return resolveFileCandidate(path.resolve(packageDir, normalizedTarget));
}

/** Try supported source extensions and index files for a target path. */
function resolveFileCandidate(targetPath: string): string | null {
  const candidates = [...buildBaseCandidates(targetPath), ...buildBaseCandidates(path.join(targetPath, 'index'))];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function buildBaseCandidates(basePath: string): string[] {
  const candidates = new Set<string>();
  const addCandidatesForBase = (candidateBase: string) => {
    candidates.add(candidateBase);
    candidates.add(`${candidateBase}.js`);
    candidates.add(`${candidateBase}.mjs`);
    candidates.add(`${candidateBase}.cjs`);
    candidates.add(`${candidateBase}.ts`);
    candidates.add(`${candidateBase}.tsx`);
    candidates.add(`${candidateBase}.jsx`);
    candidates.add(`${candidateBase}.svelte`);
    candidates.add(`${candidateBase}.svelte.ts`);
    candidates.add(`${candidateBase}.css`);
  };

  addCandidatesForBase(basePath);

  const emittedBasePath = stripEmittedModuleExtension(basePath);
  if (emittedBasePath !== basePath) {
    addCandidatesForBase(emittedBasePath);
  }

  return [...candidates];
}

function stripEmittedModuleExtension(targetPath: string): string {
  return targetPath.replace(/\.(?:mjs|cjs|js)$/i, '');
}

function readImportBindingNames(statement: string): string[] {
  const fromMatch = statement.match(/^import\s+([\s\S]*?)\s+from\s*['"][^'"]+['"]\s*;?$/);
  if (!fromMatch) {
    return [];
  }

  const importClause = fromMatch[1]?.trim();
  if (!importClause || importClause.startsWith('type ')) {
    return [];
  }

  const bindingNames: string[] = [];
  const namedImportsMatch = importClause.match(/\{([\s\S]*?)\}/);

  if (namedImportsMatch) {
    for (const rawImport of namedImportsMatch[1].split(',')) {
      const trimmedImport = rawImport.trim();
      if (trimmedImport === '' || trimmedImport.startsWith('type ')) continue;

      const aliasParts = trimmedImport.split(/\s+as\s+/i).map((part) => part.trim());
      const localName = aliasParts.at(-1);
      if (localName) {
        bindingNames.push(localName);
      }
    }
  }

  const remainingClause = importClause
    .replace(/\{[\s\S]*?\}/, '')
    .trim()
    .replace(/,$/, '')
    .trim();
  if (remainingClause !== '') {
    for (const segment of remainingClause
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)) {
      if (segment.startsWith('* as ')) {
        bindingNames.push(segment.slice(5).trim());
        continue;
      }

      if (!segment.startsWith('type ')) {
        bindingNames.push(segment);
      }
    }
  }

  return bindingNames;
}

/** Flatten runtime export targets while skipping type-only branches. */
function collectRuntimeTargets(target: ExportTarget): string[] {
  if (typeof target === 'string') {
    return target.endsWith('.d.ts') ? [] : [target];
  }

  if (Array.isArray(target)) {
    return target.flatMap(collectRuntimeTargets);
  }

  return Object.entries(target).flatMap(([key, value]) => {
    if (key === 'types') {
      return [];
    }

    return collectRuntimeTargets(value);
  });
}

/** Detect wildcard exports that cannot be resolved to fixed source files. */
function hasWildcardTarget(target: ExportTarget): boolean {
  if (typeof target === 'string') {
    return target.includes('*');
  }

  if (Array.isArray(target)) {
    return target.some(hasWildcardTarget);
  }

  return Object.values(target).some(hasWildcardTarget);
}

/** Convert collected sets into the manifest's sorted JSON shape. */
function toManifestLeaf(scan: GraphScan): TailwindSourceManifestLeaf {
  return {
    classes: [...scan.classes].sort(),
    sources: [...scan.sources].sort()
  };
}

/** Guard graph traversal so scans stay inside the current package. */
function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

/** Normalize file paths for manifest stability across platforms. */
function toPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

/** Resolve package directories from `package.json` globs relative to the working directory. */
async function discoverPackageDirectories(rootDir: string, packagePatterns: string[]): Promise<string[]> {
  const rootPackageJson = path.join(rootDir, 'package.json');
  if (packagePatterns.length === 0 && existsSync(rootPackageJson)) {
    return [rootDir];
  }

  const packageJsonPaths = new Set<string>();

  for (const pattern of packagePatterns) {
    for await (const matchedPath of glob(pattern, { cwd: rootDir })) {
      const absolutePath = path.resolve(rootDir, matchedPath);
      if (path.basename(absolutePath) !== 'package.json') {
        continue;
      }

      packageJsonPaths.add(absolutePath);
    }
  }

  return [...packageJsonPaths].map((packageJsonPath) => path.dirname(packageJsonPath)).sort();
}

/** Generate manifests for every matching package and report what changed. */
async function runBuild(rootDir: string, options: CliOptions): Promise<string[]> {
  const packageDirs = await discoverPackageDirectories(rootDir, options.packagePatterns);

  if (packageDirs.length === 0) {
    throw new Error('[tailwind-manifest] No matching package.json files found.');
  }

  for (const packageDir of packageDirs) {
    const result = await generateTailwindManifestForPackage(packageDir, {
      exportFilters: options.exportFilters
    });
    const relativeOutputPath = path.relative(rootDir, result.outputFile) || result.outputFile;
    console.log(
      `[tailwind-manifest] ${result.didWrite ? 'wrote' : 'unchanged'} ${relativeOutputPath} (${result.exportCount} exports)`
    );
  }

  return packageDirs;
}

/** Rebuild manifests when any tracked package directory snapshot changes. */
async function runWatch(rootDir: string, options: CliOptions): Promise<void> {
  const packageDirs = await runBuild(rootDir, options);
  const snapshots = new Map<string, string>();

  for (const packageDir of packageDirs) {
    snapshots.set(packageDir, await createDirectorySnapshot(packageDir));
  }

  console.log(`[tailwind-manifest] watching ${packageDirs.length} package${packageDirs.length === 1 ? '' : 's'}`);

  const interval = setInterval(async () => {
    for (const packageDir of packageDirs) {
      const nextSnapshot = await createDirectorySnapshot(packageDir);
      if (snapshots.get(packageDir) === nextSnapshot) {
        continue;
      }

      snapshots.set(packageDir, nextSnapshot);

      try {
        const result = await generateTailwindManifestForPackage(packageDir, {
          exportFilters: options.exportFilters
        });
        const relativeOutputPath = path.relative(rootDir, result.outputFile) || result.outputFile;
        console.log(
          `[tailwind-manifest] ${result.didWrite ? 'wrote' : 'unchanged'} ${relativeOutputPath} (${result.exportCount} exports)`
        );
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

/** Hash directory contents into a cheap polling snapshot for watch mode. */
async function createDirectorySnapshot(packageDir: string): Promise<string> {
  const files: string[] = [];
  const queue = [packageDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) break;

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          queue.push(path.join(currentDir, entry.name));
        }
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      const fileStat = await stat(absolutePath);
      files.push(`${toPosixPath(path.relative(packageDir, absolutePath))}:${fileStat.size}:${fileStat.mtimeMs}`);
    }
  }

  return files.sort().join('|');
}

/** Parse manifest builder CLI flags into runtime options. */
function parseCliArgs(argv: string[]): CliOptions {
  const packagePatterns: string[] = [];
  const exportFilters: string[] = [];
  let watch = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--watch') {
      watch = true;
      continue;
    }

    if (arg === '--packages') {
      const value = argv[i + 1];
      if (!value) throw new Error('--packages requires a value');
      packagePatterns.push(
        ...value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      );
      i += 1;
      continue;
    }

    if (arg === '--exports') {
      const value = argv[i + 1];
      if (!value) throw new Error('--exports requires a value');
      exportFilters.push(
        ...value
          .split(',')
          .map((part) => normalizeManifestExportFilter(part))
          .filter(Boolean)
      );
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { exportFilters, packagePatterns, watch };
}

/** Run the manifest builder once or in watch mode from the current working directory. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(argv);
  const rootDir = process.cwd();

  if (options.watch) {
    await runWatch(rootDir, options);
    return;
  }

  await runBuild(rootDir, options);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
