import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { build, normalizePath, type Plugin } from 'vite';

const tempDirectories: string[] = [];

function svelteFixtureLoader(): Plugin {
  return {
    name: 'svelte-fixture-loader',
    async load(id) {
      if (!id.endsWith('.svelte')) return null;

      const source = await readFile(id, 'utf8');
      return `export default ${JSON.stringify(source)};`;
    }
  };
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function createProjectRoot(): Promise<string> {
  const root = await createTempDirectory('vite-plugin-component-source-collector-');

  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'node_modules'), { recursive: true });

  await writeJson(join(root, 'package.json'), {
    name: 'collector-test-app',
    private: true,
    type: 'module'
  });

  await writeFile(
    join(root, 'src', 'main.js'),
    ["import 'safe-pkg/Button.svelte';", "import './app.css';", ''].join('\n')
  );
  await writeFile(join(root, 'src', 'app.css'), ['@import "safe-pkg/theme.css";', ''].join('\n'));

  return root;
}

async function createSafePackage(packageRoot: string): Promise<void> {
  await mkdir(packageRoot, { recursive: true });
  await writeJson(join(packageRoot, 'package.json'), {
    name: 'safe-pkg',
    version: '1.0.0',
    type: 'module'
  });
  await writeFile(join(packageRoot, 'Button.svelte'), '<button class="pkg-button">Click</button>\n');
  await writeFile(join(packageRoot, 'theme.css'), '.pkg-theme { color: red; }\n');
}

async function runCollectorBuild(root: string): Promise<string[]> {
  vi.resetModules();
  const { default: componentSourceCollector } = await import('./vite-plugin-component-source-collector.js');
  const collector = await componentSourceCollector({ safePackages: ['safe-pkg'] });

  await build({
    configFile: false,
    logLevel: 'silent',
    publicDir: false,
    resolve: {
      preserveSymlinks: false
    },
    root,
    plugins: [collector, svelteFixtureLoader()],
    build: {
      write: false,
      rollupOptions: {
        input: join(root, 'src', 'main.js')
      }
    }
  });

  const contents = await readFile(join(root, 'component-sources.css'), 'utf8');
  return contents
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

describe('vite-plugin-component-source-collector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    await Promise.all(
      tempDirectories.splice(0).map((directory) =>
        rm(directory, {
          recursive: true,
          force: true
        })
      )
    );
  });

  it('collects safe package component and css sources from installed node_modules packages', async () => {
    const root = await createProjectRoot();
    await createSafePackage(join(root, 'node_modules', 'safe-pkg'));

    const lines = await runCollectorBuild(root);

    expect(lines).toEqual([
      "@source './node_modules/safe-pkg/Button.svelte';",
      "@source './node_modules/safe-pkg/theme.css';"
    ]);
  });

  it('normalizes symlinked pnpm-style package sources back to node_modules paths', async () => {
    const root = await createProjectRoot();
    const linkedPackageRoot = await createTempDirectory('vite-plugin-component-source-linked-package-');

    await createSafePackage(linkedPackageRoot);
    await symlink(
      linkedPackageRoot,
      join(root, 'node_modules', 'safe-pkg'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    const lines = await runCollectorBuild(root);

    expect(lines).toEqual([
      "@source './node_modules/safe-pkg/Button.svelte';",
      "@source './node_modules/safe-pkg/theme.css';"
    ]);
    expect(lines.join('\n')).not.toContain(normalizePath(linkedPackageRoot));
  });
});
