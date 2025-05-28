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

  const { activatorNode, attributes, listeners } = !isOverlay ? getItemContext() : {};
</script>

{#if isOverlay}
  <div class={className}>
    <span class="icon-draghandle text-muted-foreground size-6 cursor-pointer"></span>
  </div>
{:else}
  <div
    class={cn('flex', className)}
    bind:this={activatorNode!.current}
    {...attributes!.current}
    {...listeners!.current}
  >
    <span class="icon-draghandle text-muted-foreground size-6 cursor-pointer"></span>
  </div>
{/if}
