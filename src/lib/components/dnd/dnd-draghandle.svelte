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

  // svelte-ignore non_reactive_update
  let isOverlay = false;
  try {
    const overlay = getOverlayContext();
    isOverlay = overlay.isOverlay;
  } catch {}

  const { isDragging, activatorNode, attributes, listeners } = !isOverlay ? getItemContext() : {};

  let handleClass = $derived(
    cn(
      'icon-draghandle text-muted-foreground flex size-4',
      isDragging?.current ? `cursor-grabbing` : `cursor-grab`,
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
