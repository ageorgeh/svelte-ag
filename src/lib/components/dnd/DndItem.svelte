<!--
@component
Draggable item. Provide a child to be rendered and modify behaviour based on 
the props provided to the child. 
You MUST @attach for it to work 

Usage: 
```svelte
<DndItem id={id}>
  {#snippet child(props)}
   <div
    bind:this={
      () => (props.isOverlay || props.isDragging ? null : listItems[item.id]),
      (v) => {
        if (props.isOverlay || props.isDragging) listItems[item.id] = null;
        else listItems[item.id] = v;
      }
    }
    {@attach props.draggable?.attach}
  >
  </div> 
  {/snippet}
</DndItem>
```
-->

<script module lang="ts">
  export type DndItemChildProps = {
    isDragging: boolean;
    isOverlay: boolean;
    draggable?: ReturnType<typeof createDraggable>;
  };

  export type DndItemProps = CreateDraggableInput & {
    child: Snippet<[DndItemChildProps]>;
  };
</script>

<script lang="ts">
  import { createDraggable, type CreateDraggableInput } from '@dnd-kit/svelte';
  import type { Snippet } from 'svelte';

  import { setItem } from './DndSortableItem.svelte';

  let { id, child, ...rest }: DndItemProps = $props();

  // svelte-ignore state_referenced_locally
  const draggable = createDraggable({
    get id() {
      return id;
    },
    ...rest
  });

  // These are used by the drag handle
  setItem({
    attachHandle: draggable.attachHandle,
    isDragging: draggable.isDragging
  });
</script>

{@render child?.({ draggable, isDragging: draggable.isDragging, isOverlay: false })}
