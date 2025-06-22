<script lang="ts" module>
  import type { DataInputType } from './utils.svelte';
  import { getContext, setContext, type Snippet } from 'svelte';

  export type SortableItemChildProps = {
    isDragging: boolean;
    isSorting: boolean;
    isOver: boolean;
    isOverlay: boolean;
  };

  export type SortableItemProps = DataInputType & {
    child: Snippet<[SortableItemChildProps]>;
  };

  const itemSymbolKey = 'sortable-item';

  export type ItemContext = {
    attributes: ReadableBox<DraggableAttributes>;
    listeners: ReadableBox<any>;
    activatorNode: WritableBox<HTMLElement | null>;
    isDragging: ReadableBox<boolean>;
  };

  export function setItemContext(item: ItemContext) {
    setContext(Symbol.for(itemSymbolKey), item);
  }

  export function getItemContext(): ItemContext {
    return getContext(Symbol.for(itemSymbolKey));
  }
</script>

<script lang="ts">
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';
  import { useSortable } from '@dnd-kit-svelte/sortable';
  import type { DraggableAttributes } from '@dnd-kit-svelte/core';
  import type { ReadableBox, WritableBox } from 'svelte-toolbelt';
  import { box } from 'svelte-toolbelt';
  import type { HTMLDivAttributes } from '$utils/bits.js';
  import { cn } from '$utils/utils.js';
  let {
    item = $bindable(),
    parent = $bindable(),
    type = $bindable(),
    child,
    class: className,
    style: styleInput
  }: SortableItemProps & HTMLDivAttributes = $props();

  const { attributes, listeners, node, activatorNode, transform, transition, isDragging, isSorting, isOver } =
    useSortable({
      id: () => item.id,
      data: () => ({
        type: box.with(
          () => type,
          (v) => (type = v)
        ),
        item: box.with(
          () => item,
          (v) => (item = v)
        ),
        parent: box.with(
          () => parent,
          (v) => (parent = v)
        )
      })
    });

  // These are used by the drag handle
  setItemContext({
    attributes,
    listeners,
    activatorNode,
    isDragging
  });

  const style = $derived(
    styleObjectToString({
      transform: CSS.Transform.toString(transform.current),
      transition: isSorting.current ? transition.current : undefined,
      zIndex: isDragging.current ? 1 : undefined
    })
  );
</script>

<div class={cn('relative', className)} bind:this={node.current} style={`${style}; ${styleInput ?? ''}`}>
  {@render child({
    isDragging: isDragging.current,
    isSorting: isSorting.current,
    isOver: isOver.current,
    isOverlay: false
  })}
</div>
