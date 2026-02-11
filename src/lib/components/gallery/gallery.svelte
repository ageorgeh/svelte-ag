<!-- src/lib/components/pages/GALLERY.svelte -->
<script lang="ts" generics="Item">
  import { onMount, type Snippet } from 'svelte';
  import { containerSize, cn, type HTMLDivAttributes } from '$utils/index.js';
  import type { Size } from './utils.js';
  import { packGrid, styleForSize } from './utils.js';
  import type { WithElementRef } from 'bits-ui';

  let {
    images = $bindable(),
    ref = $bindable(),
    maxCols = 4,
    class: className,
    child,
    ...restProps
  }: WithElementRef<HTMLDivAttributes> & {
    images: { large: Item[]; medium: Item[]; small: Item[] };
    maxCols?: number;
    child: Snippet<[{ props: { style: string }; item: ItemWithSize; index: number }]>;
  } = $props();

  type ItemWithSize = Item & { size: Size };

  let numCols = $derived(maxCols);

  onMount(() => {
    containerSize((size) => {
      let cols = Math.min(2, maxCols);
      if (size.width > 640) {
        cols = Math.min(3, maxCols);
      }
      if (size.width > 768) {
        cols = Math.min(4, maxCols);
      }
      numCols = cols;
    });
  });

  let large = $derived(images.large.map((img) => ({ ...img, size: 'L' as Size })));
  let medium = $derived(images.medium.map((img) => ({ ...img, size: 'M' as Size })));
  let small = $derived(images.small.map((img) => ({ ...img, size: 'S' as Size })));

  let allItems = $derived(
    packGrid($state.snapshot(small), $state.snapshot(medium), $state.snapshot(large), numCols)
  ) as ItemWithSize[];

  const gridClass = $derived(
    maxCols > 3
      ? `@vsm:grid-cols-3
      @vmd:grid-cols-4
      grid-cols-2`
      : maxCols > 2
        ? `@vsm:grid-cols-3
      grid-cols-2`
        : `grid-cols-2`
  );
  export { allItems };
</script>

<div bind:this={ref} class={cn(gridClass, `grid gap-2`, className)} {...restProps}>
  {#each allItems as o, i (i)}
    {@render child({ props: { style: styleForSize(o.size) }, item: o, index: i })}
  {/each}
</div>
