<script lang="ts" module>
  import { getContext, setContext, type Snippet } from 'svelte';
  import { type SortableItemChildProps } from './dnd-sortable-item.svelte';

  export type DragOverlayProps<T> = {
    child: Snippet<[activeType: string, activeItem: T, props: SortableItemChildProps]>;
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

<script lang="ts" generics="T">
  import { DragOverlay } from '@dnd-kit-svelte/core';
  import { useDnd } from './context.svelte';

  const dnd = useDnd<T>();

  setOverlayContext({
    isOverlay: true
  });

  let { child }: DragOverlayProps<T> = $props();
</script>

<DragOverlay>
  {@render child(dnd.activeType, dnd.activeItem, {
    isDragging: false,
    isSorting: false,
    isOver: false,
    isOverlay: true
  })}
</DragOverlay>
