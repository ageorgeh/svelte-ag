import path from 'node:path';

import { readPackageJson, writeIfDifferent } from 'ts-ag';
import type { PackageJson } from 'type-fest';

import {
  getTailwindSourcesManifestPath,
  serializeTailwindSourceManifest,
  shouldIncludeManifestExport,
  type TailwindSourceManifest,
  type TailwindSourceManifestLeaf,
  type TailwindSourcePackageJsonLike
} from '../../vite/tailwind-sources-manifest.js';
import { createGraphScanner } from './graph.js';
import { resolvePackageEntryFile } from './path-utils.js';
import type { GeneratorOptions, GraphScan, SymbolManifest } from './types.js';

export async function generateTailwindManifestForPackage(
  packageDir: string,
  options: GeneratorOptions
): Promise<{ didWrite: boolean; outputFile: string; exportCount: number }> {
  const packageJson = (await readPackageJson(path.join(packageDir, 'package.json'))) as PackageJson &
    TailwindSourcePackageJsonLike;
  if (!packageJson) throw new Error(`No package.json found in ${packageDir}`);

  const manifest: TailwindSourceManifest = { version: 1, exports: {} };
  const exports = collectPackageExportEntries(packageJson.exports).filter(([exportKey]) =>
    shouldIncludeManifestExport(exportKey, options.exportFilters)
  );
  const graphScanner = createGraphScanner(packageDir);

  await Promise.all(
    exports.map(async ([exportKey, exportTarget]) => {
      if (exportKey.includes('*') || hasWildcardTarget(exportTarget)) {
        console.warn(`[tailwind-manifest] Skipping wildcard export ${exportKey} in ${packageDir}`);
      } else {
        const entryFiles = collectRuntimeTargets(exportTarget)
          .map((target) => resolvePackageEntryFile(packageDir, target))
          .filter((targetPath): targetPath is string => targetPath !== null);

        if (entryFiles.length === 0) return;

        const manifestEntry = toManifestLeaf(await graphScanner.scanFileGraph(entryFiles));
        const symbols = await collectExportSymbols(entryFiles, graphScanner);

        manifest.exports[exportKey] = Object.keys(symbols).length > 0 ? { ...manifestEntry, symbols } : manifestEntry;
      }
    })
  );

  const outputFile = getTailwindSourcesManifestPath(packageDir, packageJson);
  const didWrite = await writeIfDifferent(outputFile, serializeTailwindSourceManifest(manifest));
  return { didWrite, outputFile, exportCount: Object.keys(manifest.exports).length };
}

async function collectExportSymbols(
  entryFiles: string[],
  graphScanner: ReturnType<typeof createGraphScanner>
): Promise<SymbolManifest> {
  const symbols = new Map<string, GraphScan>();

  for (const entryFile of entryFiles) {
    const targets = await graphScanner.readEntrySymbolTargets(entryFile);
    await Promise.all(
      targets.entries().map(async ([symbolName, targetFile]) => {
        const scan = await graphScanner.scanFileGraph([targetFile]);
        const existing = symbols.get(symbolName);

        if (existing) {
          for (const className of scan.classes) existing.classes.add(className);
          for (const sourcePath of scan.sources) existing.sources.add(sourcePath);
        } else {
          symbols.set(symbolName, { classes: new Set(scan.classes), sources: new Set(scan.sources) });
        }
      })
    );
  }

  return Object.fromEntries(
    [...symbols.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([symbolName, scan]) => [symbolName, toManifestLeaf(scan)])
  );
}

function toManifestLeaf(scan: GraphScan): TailwindSourceManifestLeaf {
  return { classes: [...scan.classes].sort(), sources: [...scan.sources].sort() };
}

function collectRuntimeTargets(target: PackageJson.Exports): string[] {
  if (target === null) return [];
  if (typeof target === 'string') {
    return target.endsWith('.d.ts') ? [] : [target];
  }

  if (Array.isArray(target)) {
    return target.flatMap(collectRuntimeTargets);
  }

  return Object.entries(target).flatMap(([key, value]) => (key === 'types' ? [] : collectRuntimeTargets(value)));
}

function hasWildcardTarget(target: PackageJson.Exports): boolean {
  if (target === null) return false;
  return typeof target === 'string'
    ? target.includes('*')
    : Array.isArray(target)
      ? target.some(hasWildcardTarget)
      : Object.values(target).some(hasWildcardTarget);
}

function collectPackageExportEntries(exports: PackageJson.Exports | undefined): [string, PackageJson.Exports][] {
  if (exports === undefined) return [];
  if (exports === null || typeof exports === 'string' || Array.isArray(exports)) return [['.', exports]];

  const entries = Object.entries(exports);
  const hasSubpathExports = entries.some(([key]) => key === '.' || key.startsWith('./'));
  return hasSubpathExports ? entries : [['.', exports]];
}
