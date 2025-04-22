<script lang="ts" module>
  export type DragHandleProps = {
    class?: string;
    isOverlay: boolean;
  };
</script>

<script lang="ts">
  import { getItemContext } from './dnd-sortable-item.svelte';
  let { class: className, isOverlay }: DragHandleProps = $props();

  const { activatorNode, attributes, listeners } = !isOverlay ? getItemContext() : {};

  // Maybe this needs to just get context from the overlay? that way we can
  // 'automatically' bind the stuff if its not overlay
</script>

{#if isOverlay}
  <div class={className}>
    <span class="icon-draghandle text-muted-foreground size-6 cursor-pointer"></span>
  </div>
{:else}
  <div class={className} bind:this={activatorNode!.current} {...attributes!.current} {...listeners!.current}>
    <span class="icon-draghandle text-muted-foreground size-6 cursor-pointer"></span>
  </div>
{/if}
