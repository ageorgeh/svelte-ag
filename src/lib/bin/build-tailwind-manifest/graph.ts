import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  Visitor,
  parseSync,
  type CallExpression,
  type Expression,
  type ExpressionStatement,
  type Node,
  type ObjectProperty,
  type ParserOptions,
  type Program,
  type StringLiteral,
  type TemplateLiteral
} from 'oxc-parser';
import { parse as parseSvelte } from 'svelte/compiler';

import { ensureRelativeManifestSourcePath } from '../../vite/tailwind-sources-manifest.js';
import { isPathInside, isRelativeSpecifier, resolveLocalImportPath, toPosixPath } from './path-utils.js';
import type { GraphScan } from './types.js';

const CLASS_COLLECTOR_CALLS = new Set(['cn', 'clsx', 'cva', 'tv']);

type ModuleStatement = Extract<
  Program['body'][number],
  { type: 'ImportDeclaration' | 'ExportNamedDeclaration' | 'ExportAllDeclaration' }
>;
type ImportDeclarationNode = Extract<ModuleStatement, { type: 'ImportDeclaration' }>;
type ExportNamedDeclarationNode = Extract<ModuleStatement, { type: 'ExportNamedDeclaration' }>;
type ExportAllDeclarationNode = Extract<ModuleStatement, { type: 'ExportAllDeclaration' }>;

type IndirectExport =
  | { kind: 'all'; specifier: string }
  | { kind: 'namespace'; exportName: string; specifier: string }
  | { kind: 'named'; exportName: string; specifier: string };

type FileAnalysis = {
  classes: Set<string>;
  manifestSourcePath: string | null;
  localSpecifiers: string[];
  directLocalExports: Set<string>;
  importBindings: Map<string, string>;
  indirectExports: IndirectExport[];
  importedLocalExports: Map<string, string>;
};

export type GraphScanner = {
  scanFileGraph(entryFiles: string[]): Promise<GraphScan>;
  readEntrySymbolTargets(entryFile: string): Promise<Map<string, string>>;
};

export function createGraphScanner(packageDir: string): GraphScanner {
  const analysisCache = new Map<string, Promise<FileAnalysis>>();
  const graphScanCache = new Map<string, GraphScan>();
  const symbolTargetCache = new Map<string, Map<string, string>>();
  const resolvedImportCache = new Map<string, string | null>();

  const resolveCachedImportPath = (specifier: string, importerPath: string): string | null => {
    const cacheKey = `${importerPath}\0${specifier}`;
    const cached = resolvedImportCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const resolved = resolveLocalImportPath(specifier, importerPath);
    resolvedImportCache.set(cacheKey, resolved);
    return resolved;
  };

  const analyzeFile = (filePath: string): Promise<FileAnalysis> => {
    let cached = analysisCache.get(filePath);
    if (!cached) {
      cached = (async (): Promise<FileAnalysis> => {
        const source = await readFile(filePath, 'utf8');
        const classes = new Set<string>();
        const localSpecifiers = new Set<string>();
        const directLocalExports = new Set<string>();
        const importBindings = new Map<string, string>();
        const indirectExports: IndirectExport[] = [];
        const importedLocalExports = new Map<string, string>();

        collectClassNamesFromSource(filePath, source, classes);

        for (const statement of getModuleStatements(filePath, source)) {
          const specifier = getModuleRequest(statement);

          if (statement.type === 'ImportDeclaration') {
            if (specifier && isRelativeSpecifier(specifier) && statement.importKind !== 'type') {
              localSpecifiers.add(specifier);
            }

            collectImportBindings(statement, importBindings);
            continue;
          }

          if (specifier && isRelativeSpecifier(specifier) && statement.exportKind !== 'type') {
            localSpecifiers.add(specifier);

            if (statement.type === 'ExportAllDeclaration' && statement.exported === null) {
              indirectExports.push({ kind: 'all', specifier });
              continue;
            }

            if (statement.type === 'ExportAllDeclaration') {
              const exportName = getNodeName(statement.exported);
              if (exportName) {
                indirectExports.push({ kind: 'namespace', exportName, specifier });
              }
              continue;
            }

            for (const specifierNode of statement.specifiers) {
              if ('exportKind' in specifierNode && specifierNode.exportKind === 'type') continue;

              const exportName = getNodeName(specifierNode.exported) ?? getNodeName(specifierNode.local);
              if (exportName) {
                indirectExports.push({ kind: 'named', exportName, specifier });
              }
            }
            continue;
          }

          if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') {
            continue;
          }

          collectExportedDeclarationNames(statement.declaration, directLocalExports);

          for (const specifierNode of statement.specifiers) {
            if ('exportKind' in specifierNode && specifierNode.exportKind === 'type') continue;

            const exportName = getNodeName(specifierNode.exported) ?? getNodeName(specifierNode.local);
            const localName = getNodeName(specifierNode.local);
            if (exportName && localName) {
              importedLocalExports.set(exportName, localName);
              directLocalExports.add(exportName);
            }
          }
        }

        for (const match of source.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
          if (match[1] && isRelativeSpecifier(match[1])) {
            localSpecifiers.add(match[1]);
          }
        }

        return {
          classes,
          manifestSourcePath: filePath.endsWith('.css')
            ? ensureRelativeManifestSourcePath(toPosixPath(path.relative(packageDir, filePath)))
            : null,
          localSpecifiers: [...localSpecifiers],
          directLocalExports,
          importBindings,
          indirectExports,
          importedLocalExports
        };
      })();

      analysisCache.set(filePath, cached);
    }

    return cached;
  };

  const scanFromRoot = async (entryFile: string, visiting: Set<string>): Promise<GraphScan> => {
    if (visiting.has(entryFile) || !isPathInside(packageDir, entryFile)) {
      return createEmptyScan();
    }

    const cached = graphScanCache.get(entryFile);
    if (cached) {
      return cloneGraphScan(cached);
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(entryFile);

    const analysis = await analyzeFile(entryFile);
    const scan: GraphScan = {
      classes: new Set(analysis.classes),
      sources: analysis.manifestSourcePath ? new Set([analysis.manifestSourcePath]) : new Set<string>()
    };

    for (const specifier of analysis.localSpecifiers) {
      const resolvedPath = resolveCachedImportPath(specifier, entryFile);
      if (!resolvedPath) continue;

      mergeGraphScan(scan, await scanFromRoot(resolvedPath, nextVisiting));
    }

    graphScanCache.set(entryFile, cloneGraphScan(scan));
    return scan;
  };

  const readTargets = async (entryFile: string, visiting: Set<string>): Promise<Map<string, string>> => {
    if (visiting.has(entryFile)) return new Map();

    const cached = symbolTargetCache.get(entryFile);
    if (cached) {
      return new Map(cached);
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(entryFile);

    const analysis = await analyzeFile(entryFile);
    const symbolTargets = new Map<string, string>();

    for (const exportNode of analysis.indirectExports) {
      const targetFile = resolveCachedImportPath(exportNode.specifier, entryFile);
      if (!targetFile) continue;

      if (exportNode.kind === 'all') {
        for (const [symbolName, nestedTargetFile] of await readTargets(targetFile, nextVisiting)) {
          if (!symbolTargets.has(symbolName)) {
            symbolTargets.set(symbolName, nestedTargetFile);
          }
        }
        continue;
      }

      if (!symbolTargets.has(exportNode.exportName)) {
        symbolTargets.set(exportNode.exportName, targetFile);
      }
    }

    for (const [exportName, localName] of analysis.importedLocalExports) {
      const specifier = analysis.importBindings.get(localName);
      if (!specifier || symbolTargets.has(exportName)) continue;

      const targetFile = resolveCachedImportPath(specifier, entryFile);
      if (targetFile) {
        symbolTargets.set(exportName, targetFile);
      }
    }

    for (const exportName of analysis.directLocalExports) {
      if (!symbolTargets.has(exportName)) {
        symbolTargets.set(exportName, entryFile);
      }
    }

    symbolTargetCache.set(entryFile, new Map(symbolTargets));
    return symbolTargets;
  };

  return {
    async scanFileGraph(entryFiles: string[]): Promise<GraphScan> {
      const scan = createEmptyScan();

      for (const entryFile of entryFiles) {
        mergeGraphScan(scan, await scanFromRoot(entryFile, new Set()));
      }

      return scan;
    },
    async readEntrySymbolTargets(entryFile: string): Promise<Map<string, string>> {
      return readTargets(entryFile, new Set());
    }
  };
}

export async function readEntrySymbolTargets(
  entryFile: string,
  visited = new Set<string>()
): Promise<Map<string, string>> {
  if (visited.has(entryFile)) return new Map();
  void visited;

  const scanner = createGraphScanner(path.dirname(entryFile));
  return scanner.readEntrySymbolTargets(entryFile);
}

export async function scanFileGraph(entryFiles: string[], packageDir: string): Promise<GraphScan> {
  return createGraphScanner(packageDir).scanFileGraph(entryFiles);
}

function createEmptyScan(): GraphScan {
  return { classes: new Set<string>(), sources: new Set<string>() };
}

function cloneGraphScan(scan: GraphScan): GraphScan {
  return { classes: new Set(scan.classes), sources: new Set(scan.sources) };
}

function mergeGraphScan(target: GraphScan, source: GraphScan): void {
  for (const className of source.classes) target.classes.add(className);
  for (const sourcePath of source.sources) target.sources.add(sourcePath);
}

function collectClassNamesFromSource(filePath: string, source: string, out: Set<string>): void {
  const collectTailwindStrings = (snippet: string) => {
    const program = parseSync(filePath, snippet, getOxcParserOptions(filePath)).program;
    new Visitor({
      CallExpression(node) {
        const calleeName = getCallExpressionName(node);
        if (calleeName !== '' && CLASS_COLLECTOR_CALLS.has(calleeName)) {
          collectStringLiteralsFromExpression(node, out);
        }
      },
      Property(node) {
        if (!isObjectPropertyNode(node)) return;

        const keyName = getObjectPropertyKeyName(node);
        if (keyName && /class/i.test(keyName)) {
          collectStringLiteralsFromExpression(node.value, out);
        }
      }
    }).visit(program);
  };

  const markupSource = filePath.endsWith('.svelte') ? source.replace(/<!--[\s\S]*?-->/g, '') : source;

  for (const match of markupSource.matchAll(/(?:class|className)\s*=\s*(['"`])([\s\S]*?)\1/g)) {
    for (const token of (match[2] ?? '').split(/\s+/)) {
      if (token !== '' && !token.includes('${')) out.add(token);
    }
  }

  for (const match of markupSource.matchAll(/(?:class|className)\s*=\s*\{([\s\S]*?)\}/g)) {
    const expression = match[1]?.trim();
    if (expression) {
      collectTailwindStrings(`(${expression})`);
    }
  }

  for (const scriptBlock of getModuleSnippets(filePath, source)) {
    collectTailwindStrings(scriptBlock);
  }
}

function getModuleSnippets(filePath: string, source: string): string[] {
  if (!filePath.endsWith('.svelte')) {
    return [source];
  }

  try {
    const ast = parseSvelte(source, { filename: filePath, modern: true });
    return [ast.module, ast.instance].filter(Boolean).map((script) => {
      const content = script!.content as unknown as { start: number; end: number };
      return source.slice(content.start, content.end);
    });
  } catch {
    return [source];
  }
}

function getModuleStatements(filePath: string, source: string): ModuleStatement[] {
  return getModuleSnippets(filePath, source).flatMap((snippet) =>
    parseSync(filePath, snippet, getOxcParserOptions(filePath)).program.body.filter(isModuleStatement)
  );
}

function getOxcParserOptions(filePath: string): ParserOptions {
  return {
    lang:
      filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')
        ? 'js'
        : filePath.endsWith('.jsx')
          ? 'jsx'
          : filePath.endsWith('.tsx')
            ? 'tsx'
            : filePath.endsWith('.d.ts')
              ? 'dts'
              : 'ts',
    sourceType: 'module'
  };
}

function isModuleStatement(statement: Program['body'][number]): statement is ModuleStatement {
  return (
    statement.type === 'ImportDeclaration' ||
    statement.type === 'ExportNamedDeclaration' ||
    statement.type === 'ExportAllDeclaration'
  );
}

function collectExportedDeclarationNames(
  declaration: ExportNamedDeclarationNode['declaration'],
  exportNames: Set<string>
): void {
  if (!declaration) return;

  if ('id' in declaration && declaration.id) {
    const declarationName = getNodeName(declaration.id);
    if (declarationName) exportNames.add(declarationName);
    return;
  }

  if (declaration.type !== 'VariableDeclaration') return;

  for (const declarator of declaration.declarations) {
    collectBindingNames(declarator.id, exportNames);
  }
}

function collectBindingNames(node: Node, names: Set<string>): void {
  const nodeName = getNodeName(node);
  if (nodeName) {
    names.add(nodeName);
    return;
  }

  if ('properties' in node && Array.isArray(node.properties)) {
    for (const property of node.properties) {
      if (!property || typeof property !== 'object') continue;
      if ('value' in property && property.value && typeof property.value === 'object') {
        collectBindingNames(property.value as Node, names);
      } else if ('key' in property && property.key && typeof property.key === 'object') {
        collectBindingNames(property.key as Node, names);
      }
    }
  }

  if ('elements' in node && Array.isArray(node.elements)) {
    for (const element of node.elements) {
      if (element && typeof element === 'object') {
        collectBindingNames(element as Node, names);
      }
    }
  }
}

function collectImportBindings(statement: ImportDeclarationNode, importBindings: Map<string, string>): void {
  const specifier = getModuleRequest(statement);
  if (!specifier || !isRelativeSpecifier(specifier) || statement.importKind === 'type') return;

  for (const specifierNode of statement.specifiers ?? []) {
    if (specifierNode.type === 'ImportSpecifier' && specifierNode.importKind === 'type') {
      continue;
    }

    importBindings.set(specifierNode.local.name, specifier);
  }
}

function getModuleRequest(
  statement: ImportDeclarationNode | ExportNamedDeclarationNode | ExportAllDeclarationNode
): string | null {
  if (statement.source === null) return null;
  return typeof statement.source.value === 'string' ? statement.source.value : null;
}

function getNodeName(node: { type: string } | null): string | null {
  if (node === null) return null;
  if ('name' in node && typeof node.name === 'string') return node.name;
  if ('value' in node && typeof node.value === 'string') return node.value;
  return null;
}

function getCallExpressionName(node: CallExpression): string {
  if (node.callee.type === 'Identifier') {
    return node.callee.name;
  }

  if (node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.type === 'Identifier') {
    return node.callee.property.name;
  }

  return '';
}

function getObjectPropertyKeyName(node: ObjectProperty): string | null {
  if (node.key.type === 'Identifier') {
    return node.key.name;
  }

  if (node.key.type === 'Literal' && typeof node.key.value === 'string') {
    return node.key.value;
  }

  return null;
}

function isObjectPropertyNode(node: Node): node is ObjectProperty {
  return node.type === 'Property' && 'value' in node && 'method' in node;
}

function collectStringLiteralsFromExpression(expression: Expression, out: Set<string>): void {
  new Visitor({
    Literal(literal) {
      if (literal.type === 'Literal' && typeof literal.value === 'string') {
        addClassTokens(literal, out);
      }
    },
    TemplateLiteral(template) {
      if (template.expressions.length === 0) {
        addClassTokens(template, out);
      }
    }
  }).visit(createProgramFromExpression(expression));
}

function addClassTokens(node: StringLiteral | TemplateLiteral, out: Set<string>): void {
  const rawValue =
    node.type === 'Literal' ? node.value : node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');
  if (typeof rawValue !== 'string') return;

  for (const token of rawValue.split(/\s+/)) {
    if (token !== '' && !token.includes('${')) out.add(token);
  }
}

function createProgramFromExpression(expression: Expression): Program {
  const statement: ExpressionStatement = {
    type: 'ExpressionStatement',
    expression,
    directive: null,
    start: expression.start,
    end: expression.end
  };

  return {
    type: 'Program',
    body: [statement],
    sourceType: 'module',
    hashbang: null,
    start: expression.start,
    end: expression.end
  };
}
