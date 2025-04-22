<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import { type SortableItemChildProps } from './dnd-sortable-item.svelte';

  export type DragOverlayProps<T> = {
    child: Snippet<[activeType: string, activeItem: T, props: SortableItemChildProps]>;
  };
</script>

<script lang="ts" generics="T">
  import { DragOverlay } from '@dnd-kit-svelte/core';
  import { useDnd } from './context.svelte';

  const dnd = useDnd<T>();

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
