<script lang="ts" module>
  export type DragHandleProps = {
    class?: string;
  };
</script>

<script lang="ts">
  import { getItemContext } from './dnd-sortable-item.svelte';
  let { class: className }: DragHandleProps = $props();

  const { activatorNode, attributes, listeners } = getItemContext();
</script>

<div class={className} bind:this={activatorNode.current} {...attributes.current} {...listeners.current}>
  <span class="icon-draghandle text-muted-foreground size-6 cursor-pointer"></span>
</div>
