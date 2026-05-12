import path from 'node:path';

export interface TailwindSourceManifestLeaf {
  classes: string[];
  sources: string[];
}

export interface TailwindSourceManifestExport extends TailwindSourceManifestLeaf {
  symbols?: Record<string, TailwindSourceManifestLeaf>;
}

export interface TailwindSourceManifest {
  version: 1;
  exports: Record<string, TailwindSourceManifestExport>;
}

export interface TailwindSourcePackageJsonLike {
  tailwindSources?: string;
}

export function splitPackageSpecifier(specifier: string): {
  packageName: string | null;
  subpath: string;
  exportKey: string;
} {
  if (specifier.startsWith('@')) {
    const [scope, name, ...rest] = specifier.split('/');
    const packageName = scope && name ? `${scope}/${name}` : null;
    const subpath = rest.join('/');
    return { packageName, subpath, exportKey: subpath ? `./${subpath}` : '.' };
  }

  const [name, ...rest] = specifier.split('/');
  const packageName = name || null;
  const subpath = rest.join('/');
  return { packageName, subpath, exportKey: subpath ? `./${subpath}` : '.' };
}

export function getTailwindSourcesManifestPath(
  packageRoot: string,
  packageJson: TailwindSourcePackageJsonLike
): string {
  const manifestPath = packageJson.tailwindSources ?? './dist/tailwind-sources.manifest.json';
  return path.resolve(packageRoot, manifestPath);
}

export function normalizeManifestExportFilter(filter: string): string {
  const trimmed = filter.trim();
  if (trimmed === '' || trimmed === '.') return '.';
  return trimmed.startsWith('./') ? trimmed : `./${trimmed}`;
}

export function shouldIncludeManifestExport(exportKey: string, filters: string[]): boolean {
  if (filters.length === 0) return true;

  for (const filter of filters) {
    if (filter === '.') {
      if (exportKey === '.') return true;
      continue;
    }

    if (exportKey === filter || exportKey.startsWith(`${filter}/`)) {
      return true;
    }
  }

  return false;
}

export function escapeInlineTailwindClassName(className: string): string {
  return className.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function ensureRelativeManifestSourcePath(filePath: string): string {
  if (filePath === '.') return './';
  if (filePath.startsWith('./') || filePath.startsWith('../')) return filePath;
  return `./${filePath}`;
}
