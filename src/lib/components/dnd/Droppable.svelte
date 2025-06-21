<script lang="ts">
  import { cn } from '$utils/utils';
  /**
   * This is a component for a droppable region.
   * Rendering of the region and anything that is dropped in it is done separately to this
   */
  import { useDroppable, type UseDroppableArguments } from '@dnd-kit-svelte/core';
  import type { ClassValue } from 'clsx';
  import type { Snippet } from 'svelte';

  interface DroppableProps extends UseDroppableArguments {
    child?: Snippet<[{ isOver: boolean }]>;
    class?: ClassValue;
  }

  let { child, class: className, ...rest }: DroppableProps = $props();

  const { node, isOver } = useDroppable(rest);
</script>

<div class={cn(className, '')} bind:this={node.current}>
  {@render child?.({ isOver: isOver.current })}
</div>

<!-- Example -->
<!-- <Droppable id="container" data={{ accepts: ['container'] }}> -->
<!-- </Droppable> -->
