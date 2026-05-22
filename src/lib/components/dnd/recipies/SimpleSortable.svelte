<!--
@component
Sortable list of items. Provide an item to be rendered and modify behaviour based on 
the props provided to the item. 
You MUST @attach for it to work.

You'll often want to use a separate state for this (sortable_...) and then modify
the original state in `onDragEnd`

Usage: 
```svelte
<SimpleSortable
  bind:items={sortableTabs}
  onDragEnd={() => {
    reorderTabs(sortableTabs.map((i) => i.tabIndex));
  }}
>
  {#snippet item(p)}
    <li
      {@attach p.sortable?.attach}
    >
      <Button
        class={cn(
          p.isDragging && 'opacity-50',
          p.isOverlay &&
            `
              rounded-t-md drop-shadow-2xl
              data-[state=inactive]:rounded-b-md
            `
        )}
      >
        {p.item.summary?.name ?? '...'}
        <DndHandle />
      </Button>
    </li>
  {/snippet}
</SimpleSortable>
```
-->

<script lang="ts" module>
  export type SimpleSortableProps<T extends { id: string; children?: T[] }> = {
    class?: ClassValue;
    item: Snippet<[OverlayChildProps<T>]>;
    items: T[];
  } & DndContextProps<T>;
</script>

<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  import DndContext, { type DndContextProps } from '../DndContext.svelte';
  import DndOverlay, { type OverlayChildProps } from '../DndOverlay.svelte';
  import type { SortableItemChildProps } from '../DndSortableItem.svelte';
  import DndSortableItem from '../DndSortableItem.svelte';

  let { class: className, item: itemSnippet, items = $bindable(), ...rest }: SimpleSortableProps<T> = $props();
</script>

<DndContext bind:items {...rest}>
  <ul class={className}>
    {#each items as item, index (item.id)}
      <DndSortableItem id={item.id} {index}>
        {#snippet child(props)}
          {@render itemSnippet({ ...props, item })}
        {/snippet}
      </DndSortableItem>
    {/each}
  </ul>

  <DndOverlay>
    {#snippet child(p)}
      {@render itemSnippet(p as { item: T } & SortableItemChildProps)}
    {/snippet}
  </DndOverlay>
</DndContext>
