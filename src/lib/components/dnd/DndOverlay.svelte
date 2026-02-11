<script lang="ts" module>
  import { type Snippet } from 'svelte';

  export type DragOverlayProps<T> = {
    child: Snippet<[{ item: T } & SortableItemChildProps]>;
  };
</script>

<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import { DragOverlay } from '@dnd-kit-svelte/svelte';
  import { useDnd } from './DndContext.svelte';
  import type { SortableItemChildProps } from './DndSortableItem.svelte';
  import { findItem } from './utils.svelte.js';

  const dnd = useDnd<T>();

  let { child }: DragOverlayProps<T> = $props();
</script>

<DragOverlay>
  {#snippet children(source)}
    {@const item = findItem(source?.id, dnd.items.current)}
    {#if item}
      {@render child({
        item: item.item,
        isDragging: false,
        isOverlay: true
      })}
    {:else}
      oh dear
    {/if}
  {/snippet}
</DragOverlay>
