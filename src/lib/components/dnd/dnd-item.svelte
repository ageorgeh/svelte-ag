<script module lang="ts">
  export type ItemChildProps = {
    isDragging: boolean;
    isOverlay: boolean;
  };

  export type DndItemProps = HTMLDivAttributes &
    UseDraggableInput & {
      child: Snippet<[ItemChildProps]>;
    };
</script>

<script lang="ts">
  /**
   * This component is a draggable element.
   * It places the necessary attributes on the div for tracking it.
   * It styles the position of the div while its being dragged.
   * Everything else about it needs to be done by the consumer
   *
   * It can either facilitate a drag handle with the item context
   * or it can be draggable itself
   * TODO make this able to be draggable without the handle
   */
  import { cn, type HTMLDivAttributes } from '$utils';
  import { useDraggable, type UseDraggableInput } from '@dnd-kit-svelte/svelte';
  import { setItemContext } from './dnd-sortable-item.svelte';
  import type { Snippet } from 'svelte';

  let { child, class: className, style: styleName, ...rest }: DndItemProps = $props();

  const { isDragging, ref, handleRef } = useDraggable({
    ...rest
  });

  // These are used by the drag handle
  setItemContext({
    isDragging,
    handleRef
  });
</script>

<div class={cn('relative', className)} style={styleName} {@attach ref}>
  {@render child?.({ isDragging: isDragging.current, isOverlay: false })}
</div>
