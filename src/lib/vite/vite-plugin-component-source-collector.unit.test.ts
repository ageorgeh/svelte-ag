import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { normalizeCollectedSourceFilePath } from './vite-plugin-component-source-collector.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'svelte-ag-component-source-collector-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function createFile(filePath: string, contents = '') {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('normalizeCollectedSourceFilePath', () => {
  it('canonicalizes pnpm store paths for safe packages', async () => {
    const baseDirectory = await createTemporaryDirectory();
    const appRoot = join(baseDirectory, 'app');
    const outputFilePath = join(appRoot, 'component-sources.css');
    const pnpmPackageRoot = join(
      appRoot,
      'node_modules',
      '.pnpm',
      'svelte-ag@1.0.56_hash',
      'node_modules',
      'svelte-ag'
    );
    const sourceFilePath = join(pnpmPackageRoot, 'dist', 'lib', 'components', 'dnd', 'DndDroppable.svelte');

    await createFile(join(pnpmPackageRoot, 'package.json'), JSON.stringify({ name: 'svelte-ag' }));
    await createFile(sourceFilePath);

    const normalizedPath = await normalizeCollectedSourceFilePath(sourceFilePath, {
      outputFilePath,
      root: appRoot,
      safePackages: ['svelte-ag']
    });

    expect(normalizedPath).toBe(
      join(appRoot, 'node_modules', 'svelte-ag', 'dist', 'lib', 'components', 'dnd', 'DndDroppable.svelte')
    );
  });

  it('canonicalizes linked package paths outside the project root', async () => {
    const baseDirectory = await createTemporaryDirectory();
    const appRoot = join(baseDirectory, 'app');
    const outputFilePath = join(appRoot, 'component-sources.css');
    const linkedPackageRoot = join(baseDirectory, 'packages', 'svelte-ag');
    const sourceFilePath = join(linkedPackageRoot, 'dist', 'lib', 'components', 'dnd', 'DndDroppable.svelte');

    await createFile(join(linkedPackageRoot, 'package.json'), JSON.stringify({ name: 'svelte-ag' }));
    await createFile(sourceFilePath);

    const normalizedPath = await normalizeCollectedSourceFilePath(sourceFilePath, {
      outputFilePath,
      root: appRoot,
      safePackages: ['svelte-ag']
    });

    expect(normalizedPath).toBe(
      join(appRoot, 'node_modules', 'svelte-ag', 'dist', 'lib', 'components', 'dnd', 'DndDroppable.svelte')
    );
  });

  it('leaves project files unchanged even when the project matches a safe package name', async () => {
    const baseDirectory = await createTemporaryDirectory();
    const appRoot = join(baseDirectory, 'svelte-ag');
    const outputFilePath = join(appRoot, 'component-sources.css');
    const sourceFilePath = join(appRoot, 'src', 'lib', 'components', 'Button.svelte');

    await createFile(join(appRoot, 'package.json'), JSON.stringify({ name: 'svelte-ag' }));
    await createFile(sourceFilePath);

    const normalizedPath = await normalizeCollectedSourceFilePath(sourceFilePath, {
      outputFilePath,
      root: appRoot,
      safePackages: ['svelte-ag']
    });

    expect(normalizedPath).toBe(sourceFilePath);
  });
});
