import { existsSync, statSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import { readPackageJson, writeIfDifferent } from 'ts-ag';
import {
  ensureRelativeManifestSourcePath,
  getTailwindSourcesManifestPath,
  normalizeManifestExportFilter,
  shouldIncludeManifestExport,
  type TailwindSourceManifest,
  type TailwindSourceManifestLeaf
} from '../src/lib/vite/tailwind-sources-manifest.js';

type ExportTarget = string | string[] | Record<string, ExportTarget>;

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
  const didWrite = await writeIfDifferent(outputFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return { didWrite, outputFile, exportCount: Object.keys(manifest.exports).length };
}

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

async function readEntrySymbolTargets(entryFile: string): Promise<Map<string, string>> {
  const source = await readFile(entryFile, 'utf8');
  const sourceFile = createTypeScriptSourceFile(entryFile, source);
  const importBindings = new Map<string, string>();
  const symbolTargets = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const moduleSpecifier = statement.moduleSpecifier.text;
      if (!isRelativeSpecifier(moduleSpecifier)) continue;

      const importClause = statement.importClause;
      if (!importClause) continue;

      if (importClause.name) {
        importBindings.set(importClause.name.text, moduleSpecifier);
      }

      const namedBindings = importClause.namedBindings;
      if (!namedBindings) continue;

      if (ts.isNamespaceImport(namedBindings)) {
        importBindings.set(namedBindings.name.text, moduleSpecifier);
        continue;
      }

      for (const element of namedBindings.elements) {
        importBindings.set(element.name.text, moduleSpecifier);
      }
    }

    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) {
      continue;
    }

    if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const moduleSpecifier = statement.moduleSpecifier.text;
      if (!isRelativeSpecifier(moduleSpecifier)) continue;

      if (!statement.exportClause) {
        continue;
      }

      if (ts.isNamespaceExport(statement.exportClause)) {
        const targetFile = resolveLocalImportPath(moduleSpecifier, entryFile);
        if (targetFile) symbolTargets.set(statement.exportClause.name.text, targetFile);
        continue;
      }

      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;

        const targetFile = resolveLocalImportPath(moduleSpecifier, entryFile);
        if (targetFile) symbolTargets.set(element.name.text, targetFile);
      }

      continue;
    }

    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;

      const localName = (element.propertyName ?? element.name).text;
      const localSpecifier = importBindings.get(localName);
      if (!localSpecifier) continue;

      const targetFile = resolveLocalImportPath(localSpecifier, entryFile);
      if (targetFile) {
        symbolTargets.set(element.name.text, targetFile);
      }
    }
  }

  return symbolTargets;
}

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

    for (const specifier of extractLocalSpecifiers(source)) {
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

function collectClassNamesFromFile(filePath: string, source: string, out: Set<string>): void {
  for (const match of source.matchAll(/(?:class|className)\s*=\s*(['"`])([\s\S]*?)\1/g)) {
    addClassTokens(match[2] ?? '', out);
  }

  for (const match of source.matchAll(/(?:class|className)\s*=\s*\{([\s\S]*?)\}/g)) {
    const expression = match[1]?.trim();
    if (!expression) continue;

    const sourceFile = createTypeScriptSourceFile(filePath, `(${expression})`);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && CLASS_COLLECTOR_CALLS.has(getExpressionName(node.expression))) {
        collectStringLiterals(node, out);
      }

      if (ts.isPropertyAssignment(node) && isClassPropertyName(node.name)) {
        collectStringLiterals(node.initializer, out);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  const scriptBlocks = filePath.endsWith('.svelte')
    ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '')
    : [source];

  for (const scriptBlock of scriptBlocks) {
    const sourceFile = createTypeScriptSourceFile(filePath, scriptBlock);

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && CLASS_COLLECTOR_CALLS.has(getExpressionName(node.expression))) {
        collectStringLiterals(node, out);
      }

      if (ts.isPropertyAssignment(node) && isClassPropertyName(node.name)) {
        collectStringLiterals(node.initializer, out);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
}

function collectStringLiterals(node: ts.Node, out: Set<string>): void {
  if (ts.isStringLiteralLike(node)) {
    addClassTokens(node.text, out);
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    addClassTokens(node.text, out);
  }

  ts.forEachChild(node, (child) => collectStringLiterals(child, out));
}

function addClassTokens(value: string, out: Set<string>): void {
  for (const token of value.split(/\s+/)) {
    const trimmed = token.trim();
    if (trimmed === '' || trimmed.includes('${')) continue;
    out.add(trimmed);
  }
}

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

function getExpressionName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return '';
}

function isClassPropertyName(name: ts.PropertyName): boolean {
  return (ts.isIdentifier(name) || ts.isStringLiteral(name)) && (name.text === 'class' || name.text === 'className');
}

function extractLocalSpecifiers(source: string): string[] {
  const stripped = stripComments(source);
  const matches = new Set<string>();
  const patterns = [
    /(?:^|\n)\s*import\s+["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s+(?!type\b)[\w\s{},*$]+\s+from\s+["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+(?!type\b)(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g,
    /@import\s+['"]([^'"]+)['"]/g
  ];

  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier && isRelativeSpecifier(specifier)) {
        matches.add(specifier);
      }
    }
  }

  return [...matches];
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

function resolveLocalImportPath(specifier: string, importerPath: string): string | null {
  const cleanSpecifier = specifier.split('?')[0]?.split('#')[0] ?? specifier;
  const targetPath = path.resolve(path.dirname(importerPath), cleanSpecifier);
  return resolveFileCandidate(targetPath);
}

function resolvePackageEntryFile(packageDir: string, entryTarget: string): string | null {
  const normalizedTarget = entryTarget.startsWith('./') ? entryTarget : `./${entryTarget}`;
  return resolveFileCandidate(path.resolve(packageDir, normalizedTarget));
}

function resolveFileCandidate(targetPath: string): string | null {
  const candidates = [
    targetPath,
    `${targetPath}.js`,
    `${targetPath}.mjs`,
    `${targetPath}.cjs`,
    `${targetPath}.ts`,
    `${targetPath}.tsx`,
    `${targetPath}.svelte`,
    `${targetPath}.css`,
    path.join(targetPath, 'index.js'),
    path.join(targetPath, 'index.mjs'),
    path.join(targetPath, 'index.cjs'),
    path.join(targetPath, 'index.ts'),
    path.join(targetPath, 'index.tsx'),
    path.join(targetPath, 'index.svelte'),
    path.join(targetPath, 'index.css')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

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

function hasWildcardTarget(target: ExportTarget): boolean {
  if (typeof target === 'string') {
    return target.includes('*');
  }

  if (Array.isArray(target)) {
    return target.some(hasWildcardTarget);
  }

  return Object.values(target).some(hasWildcardTarget);
}

function toManifestLeaf(scan: GraphScan): TailwindSourceManifestLeaf {
  return {
    classes: [...scan.classes].sort(),
    sources: [...scan.sources].sort()
  };
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function toPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

async function discoverPackageDirectories(rootDir: string, packagePatterns: string[]): Promise<string[]> {
  const rootPackageJson = path.join(rootDir, 'package.json');
  if (packagePatterns.length === 0 && existsSync(rootPackageJson)) {
    return [rootDir];
  }

  const patternMatchers = packagePatterns.map((pattern) => globToRegExp(pattern));
  const packageDirs: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) break;

    const entries = await readdir(currentDir, { withFileTypes: true });
    const relativeDir = toPosixPath(path.relative(rootDir, currentDir)) || '.';

    if (entries.some((entry) => entry.isFile() && entry.name === 'package.json')) {
      if (patternMatchers.length === 0 || patternMatchers.some((matcher) => matcher.test(relativeDir))) {
        packageDirs.push(currentDir);
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      queue.push(path.join(currentDir, entry.name));
    }
  }

  return packageDirs.sort();
}

async function runBuild(rootDir: string, options: CliOptions): Promise<string[]> {
  const packageDirs = await discoverPackageDirectories(rootDir, options.packagePatterns);

  if (packageDirs.length === 0) {
    throw new Error('[tailwind-manifest] No matching package directories found.');
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

function globToRegExp(pattern: string): RegExp {
  let regex = '^';

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    const nextChar = pattern[i + 1];

    if (char === '*' && nextChar === '*') {
      regex += '.*';
      i += 1;
      continue;
    }

    if (char === '*') {
      regex += '[^/]*';
      continue;
    }

    if (char === '?') {
      regex += '.';
      continue;
    }

    regex += /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
  }

  return new RegExp(regex.replaceAll('\\/', '/').concat('$'));
}

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
