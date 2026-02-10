<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import type { ClassValue } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import Droppable from '../Droppable.svelte';
  import type { SortableItemChildProps } from '../dnd-sortable-item.svelte';
  import DndSortableItem from '../dnd-sortable-item.svelte';
  import { DragOverlay } from '@dnd-kit-svelte/svelte';
  import { move } from '@dnd-kit/helpers';
  import DndContext from '../dnd-context.svelte';
  import DndOverlay from '../dnd-drag-overlay.svelte';

  let {
    class: className,
    item: itemSnippet,
    items = $bindable()
  }: {
    class?: ClassValue;
    item: Snippet<[{ item: T } & SortableItemChildProps]>;
    items: T[];
  } = $props();
</script>

<DndContext bind:items>
  <Droppable id="list">
    <div class={className}>
      {#each items as item, index (item.id)}
        <DndSortableItem id={item.id} index={() => index}>
          {#snippet child(props)}
            {@render itemSnippet({ ...props, item })}
          {/snippet}
        </DndSortableItem>
      {/each}
    </div>
  </Droppable>

  <DndOverlay>
    {#snippet child(p)}
      {@render itemSnippet(p)}
    {/snippet}
  </DndOverlay>
</DndContext>
