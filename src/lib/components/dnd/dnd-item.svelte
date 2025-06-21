<script module lang="ts">
  export type ItemChildProps = {
    isDragging: boolean;
    isOverlay: boolean;
  };
</script>

<script lang="ts">
  /**
   * This component is a draggable element.
   * It places the necessary attributes on the div for tracking it.
   * It styles the position of the div while its being dragged.
   * Everything else about it needs to be done by the consumer
   *
   * It can either facilitate a drag handle with the item context
   * or it can be draggable itself
   */
  import { cn, type HTMLDivAttributes } from '$utils';
  import { useDraggable } from '@dnd-kit-svelte/core';
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';
  import { setItemContext } from './dnd-sortable-item.svelte';
  import type { Snippet } from 'svelte';
  import { box } from 'svelte-toolbelt';

  let {
    child,
    class: className,
    style: styleInput,
    dragHandle = true,
    id,
    item,
    ...rest
  }: Exclude<HTMLDivAttributes, 'children'> & {
    dragHandle?: boolean;
    child: Snippet<[{ isDragging: boolean; isOverlay: boolean }]>;
    item: any;
  } = $props();

  const { transform, listeners, attributes, node, isDragging, setActivatorNodeRef } = useDraggable({
    id: id ?? 'dnd-item',
    data: () => ({
      item: box.with(
        () => item,
        (v) => (item = v)
      )
    })
  });

  const style = $derived(
    styleObjectToString({
      transform: transform.current ? CSS.Translate.toString(transform.current) : undefined
    })
  );

  // These are used by the drag handle
  setItemContext({
    attributes,
    listeners,
    activatorNode: box.with(() => null as unknown as HTMLElement, setActivatorNodeRef)
  });
</script>

{#if dragHandle}
  <div class={cn(className)} style={`${style}; ${styleInput ?? ''}`} bind:this={node.current} {...rest}>
    {@render child?.({ isDragging: isDragging.current, isOverlay: false })}
  </div>
{:else}
  <div
    class={cn(className)}
    style={`${style}; ${styleInput ?? ''}`}
    bind:this={node.current}
    {...listeners.current}
    {...attributes.current}
    {...rest}
  >
    {@render child?.({ isDragging: isDragging.current, isOverlay: false })}
  </div>
{/if}
