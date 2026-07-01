import type { TailwindSourceManifestLeaf } from '../../vite/tailwind-sources-manifest.js';

export type GeneratorOptions = {
  exportFilters: string[];
};

export type GraphScan = {
  classes: Set<string>;
  sources: Set<string>;
};

export type CliOptions = {
  exportFilters: string[];
  packagePatterns: string[];
  watch: boolean;
};

export type SymbolManifest = Record<string, TailwindSourceManifestLeaf>;
