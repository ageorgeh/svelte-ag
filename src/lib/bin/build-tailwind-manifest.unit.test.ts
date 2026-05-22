import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseTailwindSourceManifest } from '../vite/tailwind-sources-manifest.js';
import { main } from './build-tailwind-manifest.js';

const tempDirectories: string[] = [];
const originalWorkingDirectory = process.cwd();

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe('build-tailwind-manifest', () => {
  afterEach(async () => {
    process.chdir(originalWorkingDirectory);

    await Promise.all(
      tempDirectories.splice(0).map((directory) =>
        rm(directory, {
          recursive: true,
          force: true
        })
      )
    );
  });

  it('generates manifests for matching package.json globs and filters export prefixes', async () => {
    const repoRoot = await createTempDirectory('tailwind-manifest-monorepo-');
    const packageRoot = join(repoRoot, 'packages', 'module-a');

    await mkdir(join(packageRoot, 'dist', 'admin', 'overrides'), { recursive: true });
    await mkdir(join(packageRoot, 'dist', 'project'), { recursive: true });
    await mkdir(join(packageRoot, 'testing', 'dist'), { recursive: true });

    await writeJson(join(packageRoot, 'package.json'), {
      name: 'module-a',
      private: true,
      type: 'module',
      exports: {
        './testing/*': './testing/dist/*',
        './admin': './dist/admin/index.ts',
        './admin/overrides': './dist/admin/overrides/index.ts',
        './project': './dist/project/index.ts'
      }
    });

    await writeFile(
      join(packageRoot, 'dist', 'admin', 'index.ts'),
      "export { default as AdminPanel } from './AdminPanel.svelte';\n"
    );
    await writeFile(join(packageRoot, 'dist', 'admin', 'AdminPanel.svelte'), '<div class="admin-grid gap-4"></div>\n');
    await writeFile(
      join(packageRoot, 'dist', 'admin', 'overrides', 'index.ts'),
      "export { default as AdminOverride } from './AdminOverride.svelte';\n"
    );
    await writeFile(
      join(packageRoot, 'dist', 'admin', 'overrides', 'AdminOverride.svelte'),
      [
        '<script module lang="ts">',
        "  export { overrideVariants } from './variants.ts';",
        '</script>',
        '<script lang="ts">',
        "  import { cn } from './util.js';",
        '  let { class: className } = $props();',
        '</script>',
        "<div class={cn('override-flex px-2', className)}></div>",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'dist', 'admin', 'overrides', 'variants.ts'),
      "export const overrideVariants = { class: 'override-variant rounded-md' };\n"
    );
    await writeFile(
      join(packageRoot, 'dist', 'admin', 'overrides', 'util.js'),
      "export const cn = (...values) => values.join(' ');\n"
    );
    await writeFile(
      join(packageRoot, 'dist', 'project', 'index.ts'),
      ["import './theme.css';", "export { default as ProjectPanel } from './ProjectPanel.svelte';", ''].join('\n')
    );
    await writeFile(join(packageRoot, 'dist', 'project', 'ProjectPanel.svelte'), '<div class="project-root"></div>\n');
    await writeFile(join(packageRoot, 'dist', 'project', 'theme.css'), '.project-theme { color: red; }\n');
    await writeFile(join(packageRoot, 'testing', 'dist', 'ignored.ts'), 'export const ignored = true;\n');

    process.chdir(repoRoot);
    await main(['--packages', 'packages/*/package.json', '--exports', 'admin,project']);

    const manifestContents = await readFile(join(packageRoot, 'dist', 'tailwind-sources.manifest.jsonc'), 'utf8');
    const manifest = parseTailwindSourceManifest(manifestContents) as {
      exports: Record<
        string,
        {
          classes: string[];
          sources: string[];
          symbols?: Record<string, { classes: string[]; sources: string[] }>;
        }
      >;
    };

    expect(manifestContents).toContain(
      '/* tailwind-manifest export "./project"; styles from: ./dist/project/theme.css */'
    );
    expect(manifestContents).toContain('/* tailwind-manifest symbol "AdminPanel"; styles from: inline-only */');
    expect(Object.keys(manifest.exports)).toEqual(['./admin', './admin/overrides', './project']);
    expect(manifest.exports['./admin']?.classes).toEqual(['admin-grid', 'gap-4']);
    expect(manifest.exports['./admin']?.symbols?.AdminPanel?.classes).toEqual(['admin-grid', 'gap-4']);
    expect(manifest.exports['./admin/overrides']?.classes).toEqual([
      'override-flex',
      'override-variant',
      'px-2',
      'rounded-md'
    ]);
    expect(manifest.exports['./project']?.classes).toEqual(['project-root']);
    expect(manifest.exports['./project']?.sources).toEqual(['./dist/project/theme.css']);
  });

  it('coerces legacy .json manifest overrides to .jsonc output', async () => {
    const repoRoot = await createTempDirectory('tailwind-manifest-json-override-');
    const packageRoot = join(repoRoot, 'package-a');

    await mkdir(join(packageRoot, 'dist'), { recursive: true });
    await writeJson(join(packageRoot, 'package.json'), {
      name: 'package-a',
      private: true,
      type: 'module',
      tailwindSources: './dist/custom-tailwind.manifest.json',
      exports: {
        './panel': './dist/panel.svelte'
      }
    });
    await writeFile(join(packageRoot, 'dist', 'panel.svelte'), '<div class="panel-root"></div>\n');

    process.chdir(packageRoot);
    await main([]);

    const jsoncPath = join(packageRoot, 'dist', 'custom-tailwind.manifest.jsonc');
    const manifestContents = await readFile(jsoncPath, 'utf8');
    const manifest = parseTailwindSourceManifest(manifestContents);

    expect(manifest.exports['./panel']?.classes).toEqual(['panel-root']);
  });

  it('resolves emitted .js export specifiers back to .ts and .svelte.ts source files', async () => {
    const repoRoot = await createTempDirectory('tailwind-manifest-emitted-js-');
    const packageRoot = join(repoRoot, 'packages', 'modules', 'contact');

    await mkdir(join(packageRoot, 'project', 'dist', 'contact', 'components'), { recursive: true });
    await mkdir(join(packageRoot, 'dist'), { recursive: true });

    await writeJson(join(packageRoot, 'package.json'), {
      name: 'contact-module',
      private: true,
      type: 'module',
      exports: {
        './project': './project/dist/index.ts'
      }
    });

    await writeFile(
      join(packageRoot, 'project', 'dist', 'index.ts'),
      [
        "export { contactClientApiRequest, contactClientForm } from './api.svelte.js';",
        "export * from './contact/index.js';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'api.svelte.ts'),
      "export const contactClientForm = { class: 'api-form-inline' };\n"
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'contact', 'index.ts'),
      [
        "export { default as Contact } from './components/Contact.svelte';",
        "export { default as ContactField } from './components/ContactField.svelte';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'contact', 'components', 'Contact.svelte'),
      '<div class="flex flex-col items-center gap-2"></div>\n'
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'contact', 'components', 'ContactField.svelte'),
      '<div class="self-start w-full z-5"></div>\n'
    );

    process.chdir(packageRoot);
    await main([]);

    const manifestContents = await readFile(join(packageRoot, 'dist', 'tailwind-sources.manifest.jsonc'), 'utf8');
    const manifest = parseTailwindSourceManifest(manifestContents) as {
      exports: Record<
        string,
        {
          classes: string[];
          sources: string[];
          symbols?: Record<string, { classes: string[]; sources: string[] }>;
        }
      >;
    };

    expect(manifest.exports['./project']?.classes).toEqual([
      'api-form-inline',
      'flex',
      'flex-col',
      'gap-2',
      'items-center',
      'self-start',
      'w-full',
      'z-5'
    ]);
    expect(manifest.exports['./project']?.symbols?.contactClientForm?.classes).toEqual(['api-form-inline']);
    expect(manifest.exports['./project']?.symbols?.Contact?.classes).toEqual([
      'flex',
      'flex-col',
      'gap-2',
      'items-center'
    ]);
    expect(manifest.exports['./project']?.symbols?.ContactField?.classes).toEqual(['self-start', 'w-full', 'z-5']);
  });

  it('ignores class examples inside svelte comments when collecting manifest classes', async () => {
    const repoRoot = await createTempDirectory('tailwind-manifest-svelte-comments-');
    const packageRoot = join(repoRoot, 'package-a');

    await mkdir(join(packageRoot, 'dist'), { recursive: true });
    await writeJson(join(packageRoot, 'package.json'), {
      name: 'package-a',
      private: true,
      type: 'module',
      exports: {
        './field': './dist/Field.svelte'
      }
    });

    await writeFile(
      join(packageRoot, 'dist', 'Field.svelte'),
      [
        '<!--',
        '```svelte',
        '<Field class="z-5 w-full self-start" />',
        '```',
        '-->',
        '<script lang="ts">',
        '  let className = "";',
        '</script>',
        '<div class={className}></div>',
        '<div class="self-start"></div>',
        ''
      ].join('\n')
    );

    process.chdir(packageRoot);
    await main([]);

    const manifestContents = await readFile(join(packageRoot, 'dist', 'tailwind-sources.manifest.jsonc'), 'utf8');
    const manifest = parseTailwindSourceManifest(manifestContents);

    expect(manifest.exports['./field']?.classes).toEqual(['self-start']);
  });

  it('collects any object properties whose names mention class from script files', async () => {
    const repoRoot = await createTempDirectory('tailwind-manifest-icon-props-');
    const packageRoot = join(repoRoot, 'package-a');

    await mkdir(join(packageRoot, 'dist'), { recursive: true });
    await writeJson(join(packageRoot, 'package.json'), {
      name: 'package-a',
      private: true,
      type: 'module',
      exports: {
        './admin': './dist/admin.ts'
      }
    });

    await writeFile(
      join(packageRoot, 'dist', 'admin.ts'),
      [
        "export const contrib = defineContrib('admin', {",
        '  headerItems: [',
        "    { title: 'Home', link: '/', iconClass: 'icon-[ic--round-home]' },",
        "    { title: 'Profile', link: '/profile/settings/', triggerClassName: 'icon-user icon-page' }",
        '  ]',
        '});',
        ''
      ].join('\n')
    );

    process.chdir(packageRoot);
    await main([]);

    const manifestContents = await readFile(join(packageRoot, 'dist', 'tailwind-sources.manifest.jsonc'), 'utf8');
    const manifest = parseTailwindSourceManifest(manifestContents);

    expect(manifest.exports['./admin']?.classes).toEqual(['icon-[ic--round-home]', 'icon-page', 'icon-user']);
  });
});
