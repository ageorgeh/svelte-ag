import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { build, normalizePath, type Plugin, type ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

async function createManifestPackage(packageRoot: string): Promise<void> {
  await mkdir(join(packageRoot, 'search'), { recursive: true });
  await mkdir(join(packageRoot, 'dist'), { recursive: true });

  await writeJson(join(packageRoot, 'package.json'), {
    name: 'safe-pkg',
    version: '1.0.0',
    type: 'module',
    exports: {
      './search': './search/index.js'
    },
    tailwindSources: './dist/tailwind-sources.manifest.jsonc'
  });

  await writeJson(join(packageRoot, 'dist', 'tailwind-sources.manifest.jsonc'), {
    version: 1,
    exports: {
      './search': {
        classes: ['fallback-manifest-class'],
        sources: ['./theme.css'],
        symbols: {
          SearchPopover: {
            classes: ['focus-ring', 'h-fit', 'w-full'],
            sources: ['./theme.css']
          }
        }
      }
    }
  });

  await writeFile(join(packageRoot, 'search', 'index.js'), "export const SearchPopover = 'ready';\n");
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

  return readCollectorOutput(root, 'component-sources.css');
}

async function runCollectorTransform(root: string, id: string, code: string): Promise<string[]> {
  vi.resetModules();
  const { default: componentSourceCollector } = await import('./vite-plugin-component-source-collector.js');
  const collector = await componentSourceCollector({ safePackages: ['safe-pkg'] });
  const configResolved =
    typeof collector.configResolved === 'function' ? collector.configResolved : collector.configResolved?.handler;
  const transform = typeof collector.transform === 'function' ? collector.transform : collector.transform?.handler;
  const buildEnd = typeof collector.buildEnd === 'function' ? collector.buildEnd : collector.buildEnd?.handler;

  await configResolved?.call(
    {} as any,
    {
      root,
      command: 'build'
    } as ResolvedConfig
  );

  await transform?.call({ resolve: async () => null } as any, code, id);

  await buildEnd?.call({} as any);

  return readCollectorOutput(root, 'component-sources.css');
}

async function readCollectorOutput(root: string, fileName: string): Promise<string[]> {
  const contents = await readFile(join(root, fileName), 'utf8');
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
    const classLines = await readCollectorOutput(root, 'component-sources.classes.txt');

    expect(lines).toEqual([
      '/* tailwind-source: ./component-sources.classes.txt */',
      "@source './component-sources.classes.txt';",
      '/* tailwind-source: ./node_modules/safe-pkg/Button.svelte */',
      "@source './node_modules/safe-pkg/Button.svelte';",
      '/* tailwind-source: ./node_modules/safe-pkg/theme.css */',
      "@source './node_modules/safe-pkg/theme.css';"
    ]);
    expect(classLines).toEqual([]);
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
    const classLines = await readCollectorOutput(root, 'component-sources.classes.txt');

    expect(lines).toEqual([
      '/* tailwind-source: ./component-sources.classes.txt */',
      "@source './component-sources.classes.txt';",
      '/* tailwind-source: ./node_modules/safe-pkg/Button.svelte */',
      "@source './node_modules/safe-pkg/Button.svelte';",
      '/* tailwind-source: ./node_modules/safe-pkg/theme.css */',
      "@source './node_modules/safe-pkg/theme.css';"
    ]);
    expect(lines.join('\n')).not.toContain(normalizePath(linkedPackageRoot));
    expect(classLines).toEqual([]);
  });

  it('uses package manifests for external imports when package code has no detectable class attributes', async () => {
    const root = await createProjectRoot();
    await createManifestPackage(join(root, 'node_modules', 'safe-pkg'));
    await writeFile(
      join(root, 'src', 'main.js'),
      ["import { SearchPopover } from 'safe-pkg/search';", 'console.log(SearchPopover);', ''].join('\n')
    );
    await writeFile(join(root, 'src', 'app.css'), '');

    const lines = await runCollectorBuild(root);
    const classLines = await readCollectorOutput(root, 'component-sources.classes.txt');

    expect(lines).toContain(`/* tailwind-source: ./node_modules/safe-pkg/theme.css */`);
    expect(lines).toContain(`@source './node_modules/safe-pkg/theme.css';`);
    expect(classLines).toEqual([
      '/* tailwind-manifest import="safe-pkg/search" export="./search" symbol="SearchPopover" */',
      'focus-ring',
      'h-fit',
      'w-full'
    ]);
    expect(classLines).not.toContain(`fallback-manifest-class`);
  });

  it('uses package manifests for imports inside svelte script blocks', async () => {
    const root = await createProjectRoot();
    await createManifestPackage(join(root, 'node_modules', 'safe-pkg'));

    const lines = await runCollectorTransform(
      root,
      join(root, 'src', 'App.svelte'),
      [
        '<script lang="ts">',
        "  import { type Ignored, SearchPopover } from 'safe-pkg/search';",
        '</script>',
        '',
        '<div>ready</div>',
        ''
      ].join('\n')
    );
    const classLines = await readCollectorOutput(root, 'component-sources.classes.txt');

    expect(lines).toContain(`/* tailwind-source: ./node_modules/safe-pkg/theme.css */`);
    expect(lines).toContain(`@source './node_modules/safe-pkg/theme.css';`);
    expect(classLines).toEqual([
      '/* tailwind-manifest import="safe-pkg/search" export="./search" symbol="SearchPopover" */',
      'focus-ring',
      'h-fit',
      'w-full'
    ]);
    expect(classLines).not.toContain(`fallback-manifest-class`);
  });

  it('adds local script files that use properties whose names mention class', async () => {
    const root = await createProjectRoot();

    const lines = await runCollectorTransform(
      root,
      join(root, 'src', 'contrib.ts'),
      [
        "export const contrib = defineContrib('admin', {",
        '  headerItems: [',
        "    { title: 'Home', iconClass: 'icon-[ic--round-home]' },",
        "    { title: 'Profile', triggerClassName: 'icon-user' }",
        '  ]',
        '});',
        ''
      ].join('\n')
    );

    expect(lines).toContain(`/* tailwind-source: ./src/contrib.ts */`);
    expect(lines).toContain(`@source './src/contrib.ts';`);
  });
});
