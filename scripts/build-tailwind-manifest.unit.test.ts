import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
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

  it('generates manifests for matching package globs and filters export prefixes', async () => {
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
        '<script lang="ts">',
        "  import { cn } from './util.js';",
        '  let { class: className } = $props();',
        '</script>',
        "<div class={cn('override-flex px-2', className)}></div>",
        ''
      ].join('\n')
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
    await main(['--packages', 'packages/*', '--exports', 'admin,project']);

    const manifest = JSON.parse(
      await readFile(join(packageRoot, 'dist', 'tailwind-sources.manifest.json'), 'utf8')
    ) as {
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
    expect(manifest.exports['./admin']?.classes).toEqual(['admin-grid', 'gap-4']);
    expect(manifest.exports['./admin']?.symbols?.AdminPanel?.classes).toEqual(['admin-grid', 'gap-4']);
    expect(manifest.exports['./admin/overrides']?.classes).toEqual(['override-flex', 'px-2']);
    expect(manifest.exports['./project']?.classes).toEqual(['project-root']);
    expect(manifest.exports['./project']?.sources).toEqual(['./dist/project/theme.css']);
  });
});
