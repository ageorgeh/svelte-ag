<script lang="ts" module>
  import { type Snippet } from 'svelte';
  import type { SortableItemChildProps } from './DndSortableItem.svelte';

  export type OverlayChildProps<T> = { item: T } & SortableItemChildProps;
  export type DragOverlayProps<T> = {
    child: Snippet<[OverlayChildProps<T>]>;
  };
</script>

<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import { DragOverlay } from '@dnd-kit/svelte';
  import { getDnd } from './DndContext.svelte';
  import { findItem } from './utils.svelte.js';

  const dnd = getDnd();

  let { child }: DragOverlayProps<T> = $props();
</script>

<DragOverlay>
  {#snippet children(source)}
    {@const item = findItem(source?.id, dnd.items.current)}
    {#if item}
      {@render child({
        item: item.item as unknown as T,
        isDragging: false,
        isOverlay: true
      })}
    {:else}Error{/if}
  {/snippet}
</DragOverlay>
