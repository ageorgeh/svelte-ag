<script lang="ts">
  import { useDroppable, type UseDroppableArguments } from '@dnd-kit-svelte/core';
  import type { ClassValue } from 'clsx';
  import type { Snippet } from 'svelte';

  // This may come in handy for when sorting needs to be done manually
  // in a situation where i might want to sort the items myself based on another
  // method but still want to be able to drag items between regions?

  interface DroppableProps extends UseDroppableArguments {
    children: Snippet;
    class?: ClassValue;
  }

  let { children, class: className, ...rest }: DroppableProps = $props();

  const droppable = useDroppable(rest);
</script>

<div class={[className]} bind:this={droppable.node.current}>
  {@render children()}
</div>

<!-- <Droppable id="container" data={{ accepts: ['container'] }}> -->
<!-- </Droppable> -->
