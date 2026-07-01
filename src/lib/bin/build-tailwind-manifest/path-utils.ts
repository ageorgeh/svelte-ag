import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

export function resolveLocalImportPath(specifier: string, importerPath: string): string | null {
  return resolveFileCandidate(path.resolve(path.dirname(importerPath), specifier.split(/[?#]/, 1)[0] ?? specifier));
}

export function resolvePackageEntryFile(packageDir: string, entryTarget: string): string | null {
  return resolveFileCandidate(
    path.resolve(packageDir, entryTarget.startsWith('./') ? entryTarget : `./${entryTarget}`)
  );
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function toPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function resolveFileCandidate(targetPath: string): string | null {
  for (const candidate of [
    ...buildBaseCandidates(targetPath),
    ...buildBaseCandidates(path.join(targetPath, 'index'))
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function buildBaseCandidates(basePath: string): string[] {
  const candidates = new Set([basePath, `${basePath}.js`, `${basePath}.mjs`, `${basePath}.cjs`]);

  for (const candidateBase of [basePath.replace(/\.(?:mjs|cjs|js)$/i, ''), basePath]) {
    candidates.add(`${candidateBase}.ts`);
    candidates.add(`${candidateBase}.tsx`);
    candidates.add(`${candidateBase}.jsx`);
    candidates.add(`${candidateBase}.svelte`);
    candidates.add(`${candidateBase}.svelte.ts`);
    candidates.add(`${candidateBase}.css`);
  }

  return [...candidates];
}
