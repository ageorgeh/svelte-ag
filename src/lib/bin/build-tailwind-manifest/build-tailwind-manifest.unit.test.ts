import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseTailwindSourceManifest } from '../../vite/tailwind-sources-manifest.js';
import { main } from './cli.js';
import { createGraphScanner } from './graph.js';
import { generateTailwindManifestForPackage } from './manifest-generator.js';

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

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

  it('handles root package exports declared as a string or conditional object', async () => {
    const repoRoot = await createTempDirectory('tailwind-manifest-root-exports-');
    const stringExportRoot = join(repoRoot, 'packages', 'string-export');
    const conditionalExportRoot = join(repoRoot, 'packages', 'conditional-export');

    await mkdir(join(stringExportRoot, 'dist'), { recursive: true });
    await mkdir(join(conditionalExportRoot, 'dist'), { recursive: true });

    await writeJson(join(stringExportRoot, 'package.json'), {
      name: 'string-export',
      private: true,
      type: 'module',
      exports: './dist/index.ts'
    });
    await writeFile(join(stringExportRoot, 'dist', 'index.ts'), "export const rootCard = { class: 'root-card' };\n");

    await writeJson(join(conditionalExportRoot, 'package.json'), {
      name: 'conditional-export',
      private: true,
      type: 'module',
      exports: {
        types: './dist/index.d.ts',
        import: './dist/index.ts'
      }
    });
    await writeFile(
      join(conditionalExportRoot, 'dist', 'index.ts'),
      "export const conditionalCard = { class: 'conditional-card' };\n"
    );

    process.chdir(repoRoot);
    await main(['--packages', 'packages/*/package.json', '--exports', '.']);

    const stringManifest = parseTailwindSourceManifest(
      await readFile(join(stringExportRoot, 'dist', 'tailwind-sources.manifest.jsonc'), 'utf8')
    );
    const conditionalManifest = parseTailwindSourceManifest(
      await readFile(join(conditionalExportRoot, 'dist', 'tailwind-sources.manifest.jsonc'), 'utf8')
    );

    expect(Object.keys(stringManifest.exports)).toEqual(['.']);
    expect(stringManifest.exports['.']?.classes).toEqual(['root-card']);
    expect(Object.keys(conditionalManifest.exports)).toEqual(['.']);
    expect(conditionalManifest.exports['.']?.classes).toEqual(['conditional-card']);
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
        "export * from './direct.js';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'api.svelte.ts'),
      "export const contactClientForm = { class: 'api-form-inline' };\n"
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'direct.ts'),
      "export const contactChip = { class: 'contact-chip' };\n"
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
      'contact-chip',
      'flex',
      'flex-col',
      'gap-2',
      'items-center',
      'self-start',
      'w-full',
      'z-5'
    ]);
    expect(manifest.exports['./project']?.symbols?.contactChip?.classes).toEqual(['contact-chip']);
    expect(manifest.exports['./project']?.symbols?.contactClientForm?.classes).toEqual(['api-form-inline']);
    expect(manifest.exports['./project']?.symbols?.Contact?.classes).toEqual([
      'flex',
      'flex-col',
      'gap-2',
      'items-center'
    ]);
    expect(manifest.exports['./project']?.symbols?.ContactField?.classes).toEqual(['self-start', 'w-full', 'z-5']);
  });

  it('completes concurrent overlapping graph scans on a shared scanner', async () => {
    const repoRoot = await createTempDirectory('tailwind-manifest-concurrent-scanner-');
    const packageRoot = join(repoRoot, 'package-a');

    await mkdir(join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides'), { recursive: true });
    await mkdir(join(packageRoot, 'project', 'dist'), { recursive: true });

    await writeJson(join(packageRoot, 'package.json'), {
      name: 'package-a',
      private: true,
      type: 'module',
      exports: {
        './admin': './admin/dist/lib/index.ts',
        './admin/overrides': './admin/dist/lib/components/preview/overrides/index.ts',
        './project': './project/dist/index.ts'
      }
    });

    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'index.ts'),
      [
        "export { sharedBadge } from './shared.ts';",
        "export * from './components/preview/index.ts';",
        "export { default as AdminPanel } from './components/AdminPanel.svelte';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'shared.ts'),
      "export const sharedBadge = { class: 'shared-badge rounded-md' };\n"
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'AdminPanel.svelte'),
      '<div class="admin-grid gap-4"></div>\n'
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'index.ts'),
      [
        "export { default as PreviewPanel } from './PreviewPanel.svelte';",
        "export * from './overrides/index.ts';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'PreviewPanel.svelte'),
      '<div class="preview-shell"></div>\n'
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides', 'index.ts'),
      [
        "export { overrideVariants } from './variants.ts';",
        "export { default as PreviewOverride } from './PreviewOverride.svelte';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides', 'variants.ts'),
      "export const overrideVariants = { class: 'override-variant border-primary/80' };\n"
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides', 'PreviewOverride.svelte'),
      '<div class="override-flex px-2"></div>\n'
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'index.ts'),
      [
        "export { projectCard } from './projectCard.svelte.ts';",
        "export { sharedBadge } from '../../admin/dist/lib/shared.ts';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'projectCard.svelte.ts'),
      "export const projectCard = { class: 'project-card shadow-sm' };\n"
    );

    const scanner = createGraphScanner(packageRoot);
    const adminEntry = join(packageRoot, 'admin', 'dist', 'lib', 'index.ts');
    const overrideEntry = join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides', 'index.ts');
    const projectEntry = join(packageRoot, 'project', 'dist', 'index.ts');

    const [adminScan, overrideScan, projectScan, adminTargets] = await withTimeout(
      Promise.all([
        scanner.scanFileGraph([adminEntry]),
        scanner.scanFileGraph([overrideEntry]),
        scanner.scanFileGraph([projectEntry]),
        scanner.readEntrySymbolTargets(adminEntry)
      ])
    );

    expect([...adminScan.classes].sort()).toEqual([
      'admin-grid',
      'border-primary/80',
      'gap-4',
      'override-flex',
      'override-variant',
      'preview-shell',
      'px-2',
      'rounded-md',
      'shared-badge'
    ]);
    expect([...overrideScan.classes].sort()).toEqual([
      'border-primary/80',
      'override-flex',
      'override-variant',
      'px-2'
    ]);
    expect([...projectScan.classes].sort()).toEqual(['project-card', 'rounded-md', 'shadow-sm', 'shared-badge']);
    expect(adminTargets.get('PreviewOverride')).toBe(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides', 'PreviewOverride.svelte')
    );
    expect(adminTargets.get('sharedBadge')).toBe(join(packageRoot, 'admin', 'dist', 'lib', 'shared.ts'));
  });

  it('preserves all overlapping exports during package manifest generation', async () => {
    const repoRoot = await createTempDirectory('tailwind-manifest-overlapping-exports-');
    const packageRoot = join(repoRoot, 'package-a');

    await mkdir(join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides'), { recursive: true });
    await mkdir(join(packageRoot, 'project', 'dist'), { recursive: true });

    await writeJson(join(packageRoot, 'package.json'), {
      name: 'package-a',
      private: true,
      type: 'module',
      exports: {
        './admin': './admin/dist/lib/index.ts',
        './admin/overrides': './admin/dist/lib/components/preview/overrides/index.ts',
        './project': './project/dist/index.ts'
      }
    });

    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'index.ts'),
      [
        "export * from './components/preview/index.ts';",
        "export { default as AdminPanel } from './components/AdminPanel.svelte';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'AdminPanel.svelte'),
      '<div class="admin-grid gap-4"></div>\n'
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'index.ts'),
      [
        "export { default as PreviewPanel } from './PreviewPanel.svelte';",
        "export * from './overrides/index.ts';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'PreviewPanel.svelte'),
      '<div class="preview-shell"></div>\n'
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides', 'index.ts'),
      [
        "export { overrideVariants } from './variants.ts';",
        "export { default as PreviewOverride } from './PreviewOverride.svelte';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides', 'variants.ts'),
      "export const overrideVariants = { class: 'override-variant border-primary/80' };\n"
    );
    await writeFile(
      join(packageRoot, 'admin', 'dist', 'lib', 'components', 'preview', 'overrides', 'PreviewOverride.svelte'),
      '<div class="override-flex px-2"></div>\n'
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'index.ts'),
      [
        "export { default as ProjectPanel } from './ProjectPanel.svelte';",
        "export { default as PreviewOverrideProject } from '../../admin/dist/lib/components/preview/overrides/PreviewOverride.svelte';",
        ''
      ].join('\n')
    );
    await writeFile(
      join(packageRoot, 'project', 'dist', 'ProjectPanel.svelte'),
      '<div class="project-card shadow-sm"></div>\n'
    );

    const result = await withTimeout(
      generateTailwindManifestForPackage(packageRoot, { exportFilters: ['./admin', './project'] })
    );

    expect(result.exportCount).toBe(3);

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

    expect(Object.keys(manifest.exports)).toEqual(['./admin', './admin/overrides', './project']);
    expect(manifest.exports['./admin']?.symbols?.PreviewOverride?.classes).toEqual(['override-flex', 'px-2']);
    expect(manifest.exports['./admin/overrides']?.symbols?.overrideVariants?.classes).toEqual([
      'border-primary/80',
      'override-variant'
    ]);
    expect(manifest.exports['./project']?.symbols?.PreviewOverrideProject?.classes).toEqual(['override-flex', 'px-2']);
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
