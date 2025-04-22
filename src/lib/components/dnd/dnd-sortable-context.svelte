<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export type SortableContextProps = {
    items: string[];
    children: Snippet<[]>;
  };
</script>

<script lang="ts">
  import { SortableContext } from '@dnd-kit-svelte/sortable';

  let { items, children }: SortableContextProps = $props();
</script>

<SortableContext {items}>
  {@render children()}
</SortableContext>
