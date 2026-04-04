import ts from 'typescript';

const svelteModuleTsPattern = /\.svelte(?:\.[^./\\]+)*\.ts(?:[?#].*)?$/;

export function svelteModuleTsPlugin() {
  return {
    name: 'tsdown-plugin-svelte-module-ts',
    transform(code, id) {
      if (id.endsWith('.d.ts')) return null;
      if (!svelteModuleTsPattern.test(id)) return null;

      const result = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          isolatedModules: true,
          sourceMap: true,
          inlineSources: true,
          verbatimModuleSyntax: true
        },
        reportDiagnostics: true
      });

      const diagnostics = result.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
      );
      if (diagnostics && diagnostics.length > 0) {
        const host = {
          getCanonicalFileName: (fileName) => fileName,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => '\n'
        };

        this.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
      }

      return {
        code: result.outputText,
        map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null
      };
    }
  };
}
