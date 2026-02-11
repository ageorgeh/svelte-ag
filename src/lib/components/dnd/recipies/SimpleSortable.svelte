<script lang="ts" module>
  import type { ComponentProps } from 'svelte';

  export type SimpleSortableProps<T extends { id: string; children?: T[] }> = {
    class?: ClassValue;
    item: Snippet<[{ item: T } & SortableItemChildProps]>;
    items: T[];
  } & ComponentProps<DragDropProvider>;
</script>

<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import type { ClassValue } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import Droppable from '../DndDroppable.svelte';
  import type { SortableItemChildProps } from '../DndSortableItem.svelte';
  import DndSortableItem from '../DndSortableItem.svelte';
  import DndContext from '../DndContext.svelte';
  import DndOverlay from '../DndOverlay.svelte';
  import type { DragDropProvider } from '@dnd-kit-svelte/svelte';

  let { class: className, item: itemSnippet, items = $bindable(), ...rest }: SimpleSortableProps<T> = $props();
</script>

<DndContext bind:items {...rest}>
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
      {@render itemSnippet(p as { item: T } & SortableItemChildProps)}
    {/snippet}
  </DndOverlay>
</DndContext>
