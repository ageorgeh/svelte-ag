### Exports

There is a `browser.ts` and `index.ts` file. There are 2 for the case of things like the vite plugin which use node
utils.

Majority of other things will just have an index file eg `lib/api/index.ts` and its assumed that this is serving the
browser

Anything that is only for a node environment will be exported by the index.ts file and this file will only serve node
files.

Keeping these separate is required so that we dont have any issues with node trying to import svelte files or svelte
trying to import node stuff

### Typescript

Although shadcn exists here in the repo it is not shipped. This is simply for tooling and nothing else, as such in the
`svelte.config.js` the aliases are added just for typescript, so that they are not resolved by the packaging process.

This allows consumers to bring their own shadcn components just so long as they resolve `$shadcn`
