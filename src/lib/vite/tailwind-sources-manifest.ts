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
  const configuredPath = packageJson.tailwindSources ?? './dist/tailwind-sources.manifest.jsonc';
  const manifestPath = configuredPath.endsWith('.json')
    ? `${configuredPath.slice(0, -'.json'.length)}.jsonc`
    : configuredPath;
  return path.resolve(packageRoot, manifestPath);
}

function formatManifestSourcesComment(label: string, sources: string[]): string {
  const summary = sources.length > 0 ? sources.join(', ') : 'inline-only';
  return `/* tailwind-manifest ${label}; styles from: ${summary} */`;
}

export function serializeTailwindSourceManifest(manifest: TailwindSourceManifest): string {
  const exportEntries = Object.entries(manifest.exports).sort(([left], [right]) => left.localeCompare(right));
  const lines = ['{', `  "version": ${manifest.version},`, '  "exports": {'];

  exportEntries.forEach(([exportKey, exportValue], index) => {
    lines.push(`    ${formatManifestSourcesComment(`export ${JSON.stringify(exportKey)}`, exportValue.sources)}`);
    lines.push(`    ${JSON.stringify(exportKey)}: {`);
    lines.push(`      "classes": ${JSON.stringify(exportValue.classes)},`);
    lines.push(`      "sources": ${JSON.stringify(exportValue.sources)}${exportValue.symbols ? ',' : ''}`);

    if (exportValue.symbols) {
      lines.push('      "symbols": {');
      const symbolEntries = Object.entries(exportValue.symbols).sort(([left], [right]) => left.localeCompare(right));

      symbolEntries.forEach(([symbolName, symbolLeaf], symbolIndex) => {
        lines.push(
          `        ${formatManifestSourcesComment(`symbol ${JSON.stringify(symbolName)}`, symbolLeaf.sources)}`
        );
        lines.push(`        ${JSON.stringify(symbolName)}: {`);
        lines.push(`          "classes": ${JSON.stringify(symbolLeaf.classes)},`);
        lines.push(`          "sources": ${JSON.stringify(symbolLeaf.sources)}`);
        lines.push(`        }${symbolIndex < symbolEntries.length - 1 ? ',' : ''}`);
      });

      lines.push('      }');
    }

    lines.push(`    }${index < exportEntries.length - 1 ? ',' : ''}`);
  });

  lines.push('  }');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function parseTailwindSourceManifest(source: string): TailwindSourceManifest {
  return JSON.parse(source.replace(/\/\*[\s\S]*?\*\//g, '')) as TailwindSourceManifest;
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
