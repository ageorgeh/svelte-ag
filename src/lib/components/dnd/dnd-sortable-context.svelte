<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export type SortableContextProps = {
    items: string[];
    children: Snippet<[]>;
  };
</script>

<script lang="ts">
  import { SortableContext, verticalListSortingStrategy } from '@dnd-kit-svelte/sortable';
  import type { HTMLDivAttributes } from '$utils/bits.js';

  let { items, children, class: className }: SortableContextProps & HTMLDivAttributes = $props();

  // TODO add a flag for the different strategies here
</script>

<SortableContext {items} strategy={verticalListSortingStrategy}>
  <div class={className}>
    {@render children()}
  </div>
</SortableContext>
