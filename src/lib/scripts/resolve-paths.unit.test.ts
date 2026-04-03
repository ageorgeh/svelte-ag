import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { buildProjects, isDirectExecution, watchProjects } from './resolve-paths.js';

const tempDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function createProject(root: string): Promise<void> {
  await mkdir(join(root, 'src', 'lib'), { recursive: true });
  await mkdir(join(root, 'src', 'components'), { recursive: true });

  await writeJson(join(root, 'tsconfig.json'), {
    compilerOptions: {
      baseUrl: '.',
      paths: {
        '$components/*': ['src/components/*'],
        '$lib/*': ['src/lib/*']
      }
    }
  });

  await writeFile(
    join(root, 'src', 'index.ts'),
    [
      "import { answer } from '$lib/utils';",
      "import Button from '$components/Button.svelte';",
      '',
      'export { answer, Button };',
      ''
    ].join('\n')
  );
  await writeFile(join(root, 'src', 'lib', 'utils.ts'), 'export const answer = 42;\n');
  await writeFile(join(root, 'src', 'components', 'Button.svelte'), '<button>Click</button>\n');
  await writeFile(join(root, 'src', 'styles.css'), '.root { color: red; }\n');
}

async function createProjectWithExternalAlias(root: string): Promise<void> {
  const sharedRoot = join(root, '..', 'shared');

  await mkdir(join(root, 'src', 'lib'), { recursive: true });
  await mkdir(sharedRoot, { recursive: true });

  await writeJson(join(root, 'tsconfig.json'), {
    compilerOptions: {
      baseUrl: '.',
      paths: {
        '$lib/*': ['src/lib/*'],
        '$shared/*': ['../shared/*']
      }
    },
    include: ['src/**/*.ts']
  });

  await writeFile(
    join(root, 'src', 'index.ts'),
    [
      "import { answer } from '$lib/utils';",
      "import { sharedAnswer } from '$shared/utils';",
      '',
      'export { answer, sharedAnswer };',
      ''
    ].join('\n')
  );
  await writeFile(join(root, 'src', 'lib', 'utils.ts'), 'export const answer = 42;\n');
  await writeFile(join(sharedRoot, 'utils.ts'), 'export const sharedAnswer = 7;\n');
}

async function waitFor(assertion: () => Promise<void> | void, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw lastError;
}

describe('resolve-paths', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    await Promise.all(
      tempDirectories.splice(0).map((directory) =>
        rm(directory, {
          force: true,
          recursive: true
        })
      )
    );
  });

  it('copies a project src tree into dist and resolves tsconfig path aliases', async () => {
    const root = await createTempDirectory('resolve-paths-project-');
    await createProject(root);

    const projects = await buildProjects({
      inputs: [join(root, 'tsconfig.json')]
    });

    expect(projects).toHaveLength(1);
    await expect(readFile(join(root, 'dist', 'lib', 'utils.ts'), 'utf8')).resolves.toBe('export const answer = 42;\n');
    await expect(readFile(join(root, 'dist', 'styles.css'), 'utf8')).resolves.toBe('.root { color: red; }\n');

    const indexSource = await readFile(join(root, 'dist', 'index.ts'), 'utf8');
    expect(indexSource).toContain("from './lib/utils'");
    expect(indexSource).toContain("from './components/Button.svelte'");
    expect(indexSource).not.toContain('$lib/utils');
    expect(indexSource).not.toContain('$components/Button.svelte');
  });

  it('supports globbed tsconfig inputs across multiple projects', async () => {
    const workspaceRoot = await createTempDirectory('resolve-paths-workspace-');
    const packageARoot = join(workspaceRoot, 'packages', 'a');
    const packageBRoot = join(workspaceRoot, 'packages', 'b');

    await createProject(packageARoot);
    await createProject(packageBRoot);

    const projects = await buildProjects({
      cwd: workspaceRoot,
      inputs: ['packages/*/tsconfig.json']
    });

    expect(projects).toHaveLength(2);

    const packageAIndex = await readFile(join(packageARoot, 'dist', 'index.ts'), 'utf8');
    const packageBIndex = await readFile(join(packageBRoot, 'dist', 'index.ts'), 'utf8');

    expect(packageAIndex).toContain("from './lib/utils'");
    expect(packageBIndex).toContain("from './components/Button.svelte'");
  });

  it('does not resolve explicitly excluded aliases', async () => {
    const root = await createTempDirectory('resolve-paths-excluded-alias-');
    await createProjectWithExternalAlias(root);

    await buildProjects({
      excludeAliases: ['$shared'],
      inputs: [join(root, 'tsconfig.json')]
    });

    const indexSource = await readFile(join(root, 'dist', 'index.ts'), 'utf8');
    expect(indexSource).toContain("from './lib/utils'");
    expect(indexSource).toContain("from '$shared/utils'");
    expect(indexSource).not.toContain('../shared/utils');
  });

  it('rebuilds dist in watch mode when src files change or are removed', async () => {
    const root = await createTempDirectory('resolve-paths-watch-');
    await createProject(root);

    const watcher = await watchProjects({
      inputs: [join(root, 'tsconfig.json')]
    });
    const utilsDistPath = join(root, 'dist', 'lib', 'utils.ts');
    const utilsBefore = await stat(utilsDistPath);

    try {
      await writeFile(
        join(root, 'src', 'index.ts'),
        ["import { answer } from '$lib/utils';", '', 'export const doubled = answer * 2;', ''].join('\n')
      );
      await unlink(join(root, 'src', 'styles.css'));

      await waitFor(async () => {
        const indexSource = await readFile(join(root, 'dist', 'index.ts'), 'utf8');
        expect(indexSource).toContain("from './lib/utils'");
        expect(indexSource).toContain('export const doubled = answer * 2;');
        expect(indexSource).not.toContain('$lib/utils');
      });
      await waitFor(async () => {
        await expect(readFile(join(root, 'dist', 'styles.css'), 'utf8')).rejects.toMatchObject({
          code: 'ENOENT'
        });
      });

      const utilsAfter = await stat(utilsDistPath);
      expect(utilsAfter.mtimeMs).toBe(utilsBefore.mtimeMs);
    } finally {
      watcher.close();
    }
  });

  it('treats symlinked entry paths as direct execution of the same module', async () => {
    const root = await createTempDirectory('resolve-paths-symlink-');
    const actualFilePath = join(root, 'actual.js');
    const symlinkPath = join(root, 'linked.js');

    await writeFile(actualFilePath, 'export {};\n');
    await symlink(actualFilePath, symlinkPath);

    expect(isDirectExecution(symlinkPath, pathToFileURL(actualFilePath).href)).toBe(true);
  });
});
