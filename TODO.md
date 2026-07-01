1. Document carosel for using multiple symbols
2. Document sidebar for having both a left and right

- Add tasks in .vscode so that this can be run standalone for building etc


Prompt 1:
Single-Threaded Performance
You are working in /home/alex/code/svelte-ag.
Follow repo instructions:
Prefix every shell command with rtk.
Use distill for broad output, builds, tests, logs, or anything likely over 200 lines.
For validation, use pnpm check, pnpm build, and targeted manifest testing.
The real-world performance test is run from /home/alex/code/cmsWrapper/cms with:rtk pnpm svelte:manifest

Task: improve single-threaded performance of the Tailwind manifest generator. Do not implement worker threads in this pass.
Primary files:
src/lib/bin/build-tailwind-manifest/graph.ts
src/lib/bin/build-tailwind-manifest/manifest-generator.ts
src/lib/bin/build-tailwind-manifest/path-utils.ts only if needed
Current suspected issue:
scanFileGraph() and readEntrySymbolTargets() reread and reparse the same files many times. manifest-generator.ts calls scanFileGraph() once per export and again once per exported symbol target, so large overlapping graphs cause repeated filesystem reads, Svelte parses, OXC parses, and import resolution.
Implement the safest high-impact optimizations:
Add a per-package graph scanner/cache.
Create something like createGraphScanner(packageDir) in graph.ts.
It should return methods equivalent to:scanFileGraph(entryFiles: string[]): Promise<GraphScan>
readEntrySymbolTargets(entryFile: string): Promise<Map<string, string>>

Keep existing exported functions scanFileGraph(entryFiles, packageDir) and readEntrySymbolTargets(entryFile) working for compatibility, but internally they can create a temporary scanner.
Update manifest-generator.ts to create one scanner per generateTailwindManifestForPackage() call and reuse it for all export and symbol scans.

Cache direct per-file analysis.
Add an internal analyzeFile(filePath) cache keyed by absolute file path.
It should read the file once and return direct facts:class tokens found directly in the file
manifest CSS source path if the file is CSS
local import/export specifiers
module statements or enough export metadata for readEntrySymbolTargets()

Avoid parsing the same file separately for class collection and local specifier extraction.
Avoid parsing Svelte scripts more than once per file.

Cache transitive graph scans.
Add an internal cache for scanning from a root file.
If scanFileGraph([someFile]) is requested repeatedly, reuse the previously computed transitive GraphScan.
Be careful not to return mutable cached Sets directly if callers may mutate them. Either clone on return or merge into a fresh result.
Handle cycles safely with a visiting set, as the current implementation does.

Cache import resolution.
Memoize resolveLocalImportPath(specifier, importerPath) calls inside the scanner.
This avoids repeated sync existsSync/statSync candidate probing for the same import edges.
Do not globally cache forever unless you account for source changes. Prefer per-scanner/per-generation cache.

Preserve behavior.
Manifest output should remain semantically identical.
Keep sorting behavior for classes/sources/symbols.
Do not change manifest schema.
Do not add worker threads.
Do not broaden dependency traversal beyond current behavior.
Keep package boundary behavior: files outside packageDir should still be ignored during graph scans.

Be careful with stale cache behavior.
Use per-generation scanner caches, not long-lived module-global caches, unless the cache key includes file stat/source invalidation.
The manifest command may be run in watch mode, so stale module-level caches are risky.

Validation.
Run a focused manifest command from the consumer repo:cd /home/alex/code/cmsWrapper/cms
rtk pnpm svelte:manifest 2>&1 | distill "manifest generation result, errors, warnings, and runtime if shown"

Then from /home/alex/code/svelte-ag, run:rtk pnpm check 2>&1 | distill "typecheck result and errors"
rtk pnpm build 2>&1 | distill "build result and errors"

If there are relevant tests for this package, run the targeted tests first. Only run full pnpm test if reasonable.

Deliverable:
Implement the optimization.
Summarize which caches were added and where.
Mention whether the manifest output behavior was intended to be unchanged.
Report validation commands and results.
If you could not run a command, say exactly why.



Prompt 2: Worker Threads Later
You are working in /home/alex/code/svelte-ag.
Follow repo instructions:
Prefix every shell command with rtk.
Use distill for broad output, builds, tests, logs, or anything likely over 200 lines.
The real-world performance test is run from /home/alex/code/cmsWrapper/cms with:rtk pnpm svelte:manifest

Task: add a safe worker-thread implementation for the Tailwind manifest generator after single-threaded caching has already been optimized.
Primary files:
src/lib/bin/build-tailwind-manifest/manifest-generator.ts
src/lib/bin/build-tailwind-manifest/graph.ts
Add a new worker module only if needed, for example:src/lib/bin/build-tailwind-manifest/manifest-worker.ts

Goal:
Parallelize expensive manifest graph scans without changing manifest output. The best unit of work is probably each package export, or possibly each generateTailwindManifestForPackage() call if this generator is invoked over many packages. Prefer the simplest safe concurrency boundary.
Requirements:
Preserve behavior exactly.
Manifest schema must not change.
Classes/sources/symbols must remain sorted and deterministic.
Wildcard export skipping behavior must remain the same.
Package boundary traversal must remain the same.
Type-only imports/exports must remain ignored as before.
Errors should propagate clearly.

Choose a conservative worker boundary.
Preferred first approach: parallelize per export inside generateTailwindManifestForPackage().
Each worker receives:packageDir
exportKey
exportTarget
any needed options/filter data already resolved by the main thread

Each worker computes the manifest leaf and symbol manifest for that export, then returns serializable data:arrays, plain objects, strings
not Set, Map, class instances, or functions

Main thread assembles manifest.exports deterministically after all workers complete.

Limit concurrency.
Do not spawn unbounded workers for hundreds of exports.
Use a small worker pool or concurrency limiter.
Default should be something conservative like:Math.max(1, Math.min(os.availableParallelism?.() ?? os.cpus().length, exports.length, 4))

Consider allowing an option/env var override if the existing CLI options structure supports it cleanly, but do not overbuild config.

Keep single-threaded fallback.
If worker threads are disabled, unavailable, or export count is small, use the existing single-threaded path.
A reasonable threshold is to avoid workers for 0 or 1 export.
Add an env var escape hatch such as TAILWIND_MANIFEST_WORKERS=0 if appropriate.

Avoid sharing mutable process state.
Worker code should create its own per-package graph scanner/cache.
Do not rely on module-global caches across workers.
Do not mutate shared manifest objects from workers.

ESM/TypeScript runtime concerns.
Inspect how this CLI is built and executed before choosing worker module loading.
Use a worker entry path that works after build, not just in ts-node/dev.
If the package emits JS to dist, ensure worker URL/path resolves correctly in built output.
Prefer new Worker(new URL('./manifest-worker.js', import.meta.url), { workerData }) if the built format supports it.

Error handling.
Worker failures should reject the package generation with a useful error that includes export key/package dir.
Handle worker error, non-zero exit, and malformed messages.
Ensure workers are terminated when no longer needed.

Validation.
First compare single-threaded and worker output on the real consumer package if practical:cd /home/alex/code/cmsWrapper/cms
rtk TAILWIND_MANIFEST_WORKERS=0 pnpm svelte:manifest 2>&1 | distill "single-threaded manifest result, errors, warnings, and runtime if shown"
rtk pnpm svelte:manifest 2>&1 | distill "worker manifest result, errors, warnings, and runtime if shown"

Then from /home/alex/code/svelte-ag, run:rtk pnpm check 2>&1 | distill "typecheck result and errors"
rtk pnpm build 2>&1 | distill "build result and errors"

Run targeted tests if present. Run full pnpm test if reasonable.

Deliverable:
Implement worker-thread parallelism with bounded concurrency.
Keep deterministic output.
Include a fallback path.
Summarize worker boundary, concurrency limit, and validation results.