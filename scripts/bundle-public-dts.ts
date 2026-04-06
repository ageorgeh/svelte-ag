import { copyFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dts } from 'rolldown-plugin-dts';
import { rolldown } from 'rolldown';
import { exists, readPackageJson } from 'ts-ag';
import type { PackageJson } from 'type-fest';

const projectRoot = process.cwd();

// Add packages here when you want their public types embedded into your shipped declarations.
const INLINE_TYPE_PACKAGES = new Set([]);

async function main(): Promise<void> {
  const packageJson = await readPackageJson(path.resolve(projectRoot, 'package.json'));
  if (!packageJson) throw new Error('No package.json found');

  const entries = await getPublicDtsEntries(packageJson);

  if (entries.length === 0) {
    console.log('No public declaration entrypoints found to bundle');
    return;
  }

  for (const entry of entries) {
    await bundleDeclarationEntry(entry);
  }
}

async function getPublicDtsEntries(packageJson: PackageJson): Promise<string[]> {
  const candidates = new Set<string>();

  collectCandidateTargets(packageJson.exports ?? {}, candidates);
  collectCandidateTargets(packageJson.bin ?? {}, candidates);

  const entries: string[] = [];
  for (const candidate of candidates) {
    const declarationPath = resolveDeclarationPath(candidate);
    if (!declarationPath) continue;
    if (!(await exists(declarationPath))) continue;

    entries.push(declarationPath);
  }

  return entries.sort();
}

function collectCandidateTargets(
  value: PackageJson.Exports | string | Partial<Record<string, string>>,
  out: Set<string>
): void {
  if (typeof value === 'string') {
    out.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectCandidateTargets(item, out);
    return;
  }

  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectCandidateTargets(nested, out);
  }
}

function resolveDeclarationPath(target: string): string | null {
  const normalizedTarget = target.startsWith('./') ? target : `./${target}`;

  if (normalizedTarget.endsWith('.d.ts')) {
    return path.resolve(projectRoot, normalizedTarget);
  }

  if (/\.(?:[cm]?js|svelte)$/.test(normalizedTarget)) {
    return path.resolve(projectRoot, normalizedTarget.replace(/\.(?:[cm]?js|svelte)$/, '.d.ts'));
  }

  return null;
}

async function bundleDeclarationEntry(entryPath: string): Promise<void> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'svelte-ag-dts-'));
  const fileName = path.basename(entryPath);
  const mapFileName = `${fileName}.map`;

  const bundle = await rolldown({
    input: entryPath,
    plugins: [
      dts({
        dtsInput: true,
        resolver: 'tsc',
        sourcemap: true
      })
    ],
    external: (id) => shouldExternalizeTypeImport(id)
  });

  try {
    await bundle.write({
      dir: tempDir,
      format: 'es',
      sourcemap: true
    });

    const bundledDtsPath = await findBundledArtifact(tempDir, fileName);
    if (!bundledDtsPath) {
      throw new Error(`Failed to find bundled declaration output for ${fileName}`);
    }

    const bundledCode = await readFile(bundledDtsPath, 'utf8');
    reportBundledTypePackages(entryPath, bundledCode);

    await copyFile(bundledDtsPath, entryPath);

    const bundledMapPath = await findBundledArtifact(tempDir, mapFileName);
    if (bundledMapPath) {
      await copyFile(bundledMapPath, `${entryPath}.map`);
    } else {
      await rm(`${entryPath}.map`, { force: true });
    }

    console.log(`Bundled declaration: ${path.relative(projectRoot, entryPath)}`);
  } finally {
    await bundle.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

function reportBundledTypePackages(entryPath: string, bundledCode: string): void {
  const relativeEntryPath = path.relative(projectRoot, entryPath);
  const bundledPackages = [...getBundledTypePackages(bundledCode)].sort();

  if (bundledPackages.length === 0) return;

  console.log(`Bundled type dependencies for ${relativeEntryPath}: ${bundledPackages.join(', ')}`);

  const unexpectedPackages = bundledPackages.filter((packageName) => !INLINE_TYPE_PACKAGES.has(packageName));
  for (const packageName of unexpectedPackages) {
    console.warn(
      `[bundle-public-dts] ${packageName} is located in node_modules but is not included in INLINE_TYPE_PACKAGES.\nImported by\n- ${relativeEntryPath}`
    );
  }
}

function getBundledTypePackages(code: string): Set<string> {
  const packages = new Set<string>();

  for (const line of code.split('\n')) {
    if (!line.startsWith('//#region ')) continue;

    const regionPath = line.slice('//#region '.length);
    const packageName = getPackageNameFromRegionPath(regionPath);
    if (packageName) packages.add(packageName);
  }

  return packages;
}

function getPackageNameFromRegionPath(regionPath: string): string | null {
  const marker = '/node_modules/';
  const markerIndex = regionPath.lastIndexOf(marker);
  if (markerIndex === -1) return null;

  const packagePath = regionPath.slice(markerIndex + marker.length);
  const [first, second] = packagePath.split('/', 3);
  if (!first) return null;

  return first.startsWith('@') && second ? `${first}/${second}` : first;
}

function shouldExternalizeTypeImport(id: string): boolean {
  const packageName = getBarePackageName(id);
  if (!packageName) return false;

  return !INLINE_TYPE_PACKAGES.has(packageName);
}

function getBarePackageName(id: string): string | null {
  if (
    id.startsWith('.') ||
    id.startsWith('/') ||
    id.startsWith('\0') ||
    id.startsWith('virtual:') ||
    id.startsWith('file:')
  ) {
    return null;
  }

  if (id.startsWith('node:')) return id;

  const [first, second] = id.split('/', 3);
  return first.startsWith('@') && second ? `${first}/${second}` : first;
}

async function findBundledArtifact(rootDir: string, expectedBasename: string): Promise<string | null> {
  const queue: string[] = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) break;

    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (entry.name === expectedBasename) {
        return entryPath;
      }
    }
  }

  return null;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
