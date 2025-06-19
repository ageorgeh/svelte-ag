<script lang="ts" module>
  import type { DataInputType, DataType } from './utils.svelte';
  import { getContext, onMount, setContext, type Snippet } from 'svelte';

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
    activatorNode: WritableBox<HTMLElement>;
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
  import type { HTMLDivAttributes } from '$utils/bits.js';
  import { cn } from '$utils/utils.js';
  let {
    item,
    parent,
    type,
    child,
    class: className,
    style: styleInput
  }: SortableItemProps & HTMLDivAttributes = $props();

  const { attributes, listeners, node, activatorNode, transform, transition, isDragging, isSorting, isOver } =
    useSortable({
      id: () => item.id,
      data: () => ({
        type: () => type,
        item: () => item,
        parent: () => parent
      })
    });

  setItemContext({
    attributes,
    listeners,
    activatorNode
  });

  function pos(v: number, scale: number) {
    if (scale >= 1) {
      return v;
    } else {
      return v;
    }
  }

  $inspect('tranform', CSS.Translate.toString(transform.current));
  const style = $derived(
    styleObjectToString({
      transform: CSS.Translate.toString(transform.current),
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
