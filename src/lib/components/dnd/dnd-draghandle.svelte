<script lang="ts" module>
  export type DragHandleProps = {
    class?: string;
  };
</script>

<script lang="ts">
  import { getItemContext } from './dnd-sortable-item.svelte';
  import { getOverlayContext } from './dnd-drag-overlay.svelte';
  import { cn } from '$utils/utils.js';
  let { class: className }: DragHandleProps = $props();

  let isOverlay = $state(false);
  try {
    const overlay = getOverlayContext();
    isOverlay = overlay.isOverlay;
  } catch {}

  const item = $derived(isOverlay ? getItemContext() : undefined);

  let handleClass = $derived(
    cn(
      `
        icon-draghandle text-muted-foreground flex size-4 transition-colors duration-150
        hover:text-foreground
      `,
      item?.isDragging?.current || isOverlay ? `cursor-grabbing` : `cursor-grab`,
      className
    )
  );
</script>

{#if isOverlay || !item}
  <div data-drag-handle class={cn(handleClass, className)}></div>
{:else}
  <div data-drag-handle class={cn(handleClass, className)} {@attach item!.handleRef}></div>
{/if}
