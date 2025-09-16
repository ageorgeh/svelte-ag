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

  const { isDragging, activatorNode, attributes, listeners } = $derived(
    !isOverlay
      ? getItemContext()
      : { isDragging: { current: false }, activatorNode: undefined, attributes: undefined, listeners: undefined }
  );

  let handleClass = $derived(
    cn(
      `
        icon-draghandle text-muted-foreground flex size-4 transition-colors duration-150
        hover:text-foreground
      `,
      isDragging?.current || isOverlay ? `cursor-grabbing` : `cursor-grab`,
      className
    )
  );
</script>

{#if isOverlay}
  <div data-drag-handle class={cn(handleClass, className)}></div>
{:else}
  <div
    class={cn(handleClass, className)}
    bind:this={activatorNode!.current}
    {...attributes!.current}
    {...listeners!.current}
    data-drag-handle
  ></div>
{/if}
