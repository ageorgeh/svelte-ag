<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export type SortableContextProps = {
    items: string[] | number[];
    children: Snippet<[]>;
  };
</script>

<script lang="ts">
  import {
    horizontalListSortingStrategy,
    SortableContext,
    verticalListSortingStrategy
  } from '@dnd-kit-svelte/sortable';
  import type { HTMLDivAttributes } from '$utils/bits.js';

  let {
    items,
    children,
    class: className,
    orientation = 'vertical'
  }: SortableContextProps & HTMLDivAttributes & { orientation?: 'vertical' | 'horizontal' } = $props();

  let strategy = $derived(orientation === 'vertical' ? verticalListSortingStrategy : horizontalListSortingStrategy);
</script>

<SortableContext {items} {strategy}>
  <div class={className}>
    {@render children()}
  </div>
</SortableContext>
