<script lang="ts" module>
  export type DragHandleProps = {
    class?: string;
  };
</script>

<script lang="ts">
  import { getItemContext } from './DndSortableItem.svelte';
  import { cn } from '$utils/utils.js';
  let { class: className }: DragHandleProps = $props();

  const item = $derived(getItemContext());

  let handleClass = $derived(
    cn(
      `
        icon-draghandle flex size-4 text-muted-foreground transition-colors duration-150
        hover:text-foreground
      `,
      item?.isDragging?.current ? `cursor-grabbing` : `cursor-grab`,
      className
    )
  );
</script>

{#if !item}
  <div data-drag-handle class={cn(handleClass, className)}></div>
{:else}
  <div data-drag-handle class={cn(handleClass, className)} {@attach item!.handleRef}></div>
{/if}
