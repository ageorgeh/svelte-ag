import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type ExportTarget = string | string[] | Record<string, ExportTarget>;

type Issue = {
  chain: string[];
  importer: string;
  reason: string;
  specifier: string;
};

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  exports?: Record<string, ExportTarget>;
};

const baseExport = packageJson.exports?.['.'];

if (!baseExport) {
  console.error('[check-base-export] package.json is missing exports["."].');
  process.exit(1);
}

const entryFiles = collectStringTargets(baseExport).map((target) => path.resolve(repoRoot, target));

if (entryFiles.length === 0) {
  console.error('[check-base-export] exports["."] does not resolve to any file targets.');
  process.exit(1);
}

const visited = new Set<string>();
const issues: Issue[] = [];

for (const entryFile of entryFiles) {
  visitModule(entryFile, [entryFile]);
}

if (issues.length > 0) {
  console.error('[check-base-export] Found unresolved runtime imports reachable from exports["."].');

  for (const issue of issues) {
    console.error(`- ${formatPath(issue.importer)} imports "${issue.specifier}"`);
    console.error(`  Reason: ${issue.reason}`);
    console.error(`  Chain: ${issue.chain.map(formatPath).join(' -> ')}`);
  }

  process.exit(1);
}

console.log(
  `[check-base-export] Base export graph resolved cleanly across ${visited.size} reachable module${visited.size === 1 ? '' : 's'}.`
);

function collectStringTargets(target: ExportTarget): string[] {
  if (typeof target === 'string') {
    return [target];
  }

  if (Array.isArray(target)) {
    return target.flatMap(collectStringTargets);
  }

  return Object.values(target).flatMap(collectStringTargets);
}

function visitModule(modulePath: string, chain: string[]) {
  const resolvedPath = resolveRelativeFile(modulePath);

  if (!resolvedPath) {
    issues.push({
      chain,
      importer: chain.at(-1) ?? modulePath,
      reason: 'File does not exist.',
      specifier: modulePath
    });
    return;
  }

  if (visited.has(resolvedPath)) {
    return;
  }

  visited.add(resolvedPath);

  const source = readFileSync(resolvedPath, 'utf8');
  const specifiers = extractRuntimeSpecifiers(source);

  for (const specifier of specifiers) {
    if (isRelativeSpecifier(specifier)) {
      const nextPath = resolveImportPath(specifier, resolvedPath);

      if (!nextPath) {
        issues.push({
          chain,
          importer: resolvedPath,
          reason: 'Relative import target could not be found in dist.',
          specifier
        });
        continue;
      }

      visitModule(nextPath, [...chain, nextPath]);
      continue;
    }

    if (isBuiltinSpecifier(specifier)) {
      continue;
    }

    try {
      require.resolve(specifier, { paths: [path.dirname(resolvedPath)] });
    } catch (error) {
      if (isResolvableSveltePackage(specifier)) {
        continue;
      }

      issues.push({
        chain,
        importer: resolvedPath,
        reason: getResolutionErrorMessage(error),
        specifier
      });
    }
  }
}

function extractRuntimeSpecifiers(source: string): string[] {
  const stripped = stripComments(source);
  const matches = new Set<string>();
  const patterns = [
    /(?:^|\n)\s*import\s+(?!type\b)(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+(?!type\b)(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g
  ];

  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) {
      matches.add(match[1]);
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

function isBuiltinSpecifier(specifier: string): boolean {
  return specifier.startsWith('node:');
}

function resolveImportPath(specifier: string, importerPath: string): string | null {
  const cleanSpecifier = specifier.split('?')[0]?.split('#')[0] ?? specifier;
  const absolutePath = path.resolve(path.dirname(importerPath), cleanSpecifier);

  return resolveRelativeFile(absolutePath);
}

function resolveRelativeFile(targetPath: string): string | null {
  const candidates = [
    targetPath,
    `${targetPath}.js`,
    `${targetPath}.mjs`,
    `${targetPath}.cjs`,
    `${targetPath}.ts`,
    `${targetPath}.svelte`,
    path.join(targetPath, 'index.js'),
    path.join(targetPath, 'index.mjs'),
    path.join(targetPath, 'index.cjs'),
    path.join(targetPath, 'index.ts'),
    path.join(targetPath, 'index.svelte')
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    if (statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function getResolutionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown module resolution error.';
}

function formatPath(filePath: string): string {
  const relativePath = path.relative(repoRoot, filePath);
  return relativePath.length > 0 ? relativePath : filePath;
}

function isResolvableSveltePackage(specifier: string): boolean {
  const { packageName, subpath } = splitPackageSpecifier(specifier);

  if (!packageName) {
    return false;
  }

  const packageJsonFile = path.join(repoRoot, 'node_modules', packageName, 'package.json');

  if (!existsSync(packageJsonFile)) {
    return false;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonFile, 'utf8')) as {
    exports?: Record<string, ExportTarget>;
    main?: string;
    module?: string;
    svelte?: string;
  };

  if (!subpath) {
    if (packageJson.exports?.['.'] && hasRuntimeExportTarget(packageJson.exports['.'])) {
      return true;
    }

    return Boolean(packageJson.svelte || packageJson.module || packageJson.main);
  }

  const exportKey = `./${subpath}`;
  return Boolean(packageJson.exports?.[exportKey] && hasRuntimeExportTarget(packageJson.exports[exportKey]));
}

function splitPackageSpecifier(specifier: string): { packageName: string | null; subpath: string } {
  if (specifier.startsWith('@')) {
    const [scope, name, ...rest] = specifier.split('/');
    return {
      packageName: scope && name ? `${scope}/${name}` : null,
      subpath: rest.join('/')
    };
  }

  const [name, ...rest] = specifier.split('/');
  return {
    packageName: name || null,
    subpath: rest.join('/')
  };
}

function hasRuntimeExportTarget(target: ExportTarget): boolean {
  if (typeof target === 'string') {
    return true;
  }

  if (Array.isArray(target)) {
    return target.some(hasRuntimeExportTarget);
  }

  return Object.entries(target).some(([key, value]) => key !== 'types' && hasRuntimeExportTarget(value));
}
