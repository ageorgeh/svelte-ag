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
    class: className,
    child,
    ...restProps
  }: WithElementRef<HTMLDivAttributes> & {
    images: { large: Item[]; medium: Item[]; small: Item[] };
    child: Snippet<[{ props: { style: string }; item: Item; index: number }]>;
  } = $props();

  type ItemWithSize = Item & { size: Size };

  let numCols = $state(4);

  onMount(() => {
    containerSize((size) => {
      let cols = 2;
      if (size.width > 640) {
        cols = 3;
      }
      if (size.width > 768) {
        cols = 4;
      }
      numCols = cols;
    });
  });

  let large = $derived(images.large.map((img) => ({ ...img, size: 'L' as Size })));
  let medium = $derived(images.medium.map((img) => ({ ...img, size: 'M' as Size })));
  let small = $derived(images.small.map((img) => ({ ...img, size: 'S' as Size })));

  // $effect.pre(() => {
  //   allItems = packGrid($state.snapshot(small), $state.snapshot(medium), $state.snapshot(large), numCols);
  // });

  let allItems = $derived(
    packGrid($state.snapshot(small), $state.snapshot(medium), $state.snapshot(large), numCols)
  ) as ItemWithSize[];

  export { allItems };
</script>

<div
  bind:this={ref}
  class={cn(
    `
      grid grid-cols-2 gap-2
      @vsm:grid-cols-3
      @vmd:grid-cols-4
    `,
    className
  )}
  {...restProps}
>
  {#each allItems as o, i (i)}
    {@render child({ props: { style: styleForSize(o.size) }, item: o, index: i })}
  {/each}
</div>
