<script lang="ts" module>
  import { getContext, setContext, type Snippet } from 'svelte';

  export type DragOverlayProps<T> = {
    child: Snippet<[{ item: T } & SortableItemChildProps]>;
  };

  const overlaySymbolKey = 'drag-overlay';

  export type OverlayContext = {
    isOverlay: boolean;
  };

  export function setOverlayContext(item: OverlayContext) {
    setContext(Symbol.for(overlaySymbolKey), item);
  }

  export function getOverlayContext(): OverlayContext {
    return getContext(Symbol.for(overlaySymbolKey));
  }
</script>

<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import { DragOverlay } from '@dnd-kit-svelte/svelte';
  import { useDnd } from './context.svelte';
  import type { SortableItemChildProps } from './dnd-sortable-item.svelte';

  const dnd = useDnd<T>();

  // for the drag handle
  setOverlayContext({
    isOverlay: true
  });

  /**
   * Finds an item recursively through the dnd.items list and each item's children
   */
  function findItem(id: string | number, items: T[] = dnd.items): T | undefined {
    // if (id === undefined) throw new Error('PENIS');
    for (const item of items) {
      if (item.id === id) return item;
      else if (item.children && item.children.length > 0) {
        const found = findItem(id, item.children);
        if (found) return found;
      }
    }
  }

  let { child }: DragOverlayProps<T> = $props();
</script>

<DragOverlay>
  {#snippet children(source)}
    {@const item = findItem(source?.id)}
    {#if item}
      {@render child({
        item,
        isDragging: false,
        isOverlay: true
      })}
    {/if}
  {/snippet}
</DragOverlay>
