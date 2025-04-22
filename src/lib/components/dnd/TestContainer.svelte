<script lang="ts" module>
  export type NestedItem = {
    id: string;
    title: string;
    description: string;
  };

  export type ContainerItem = {
    data: NestedItem;
    nesteds: NestedItem[];
  };

  interface ItemProps {
    children: Snippet<[isDragging: boolean]>;
    data: NestedItem;
    type: 'item' | 'container';
    class?: string;
    accepts: string[];
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';
  import { useSortable } from '@dnd-kit-svelte/sortable';

  let { data, children, type, accepts = [], class: className }: ItemProps = $props();

  const { attributes, listeners, node, activatorNode, transform, transition, isDragging, isSorting } = useSortable({
    id: data.id,
    data: { type, accepts }
  });

  const style = $derived(
    styleObjectToString({
      transform: CSS.Transform.toString(transform.current),
      transition: isSorting.current ? transition.current : undefined,
      zIndex: isDragging.current ? 1 : undefined
    })
  );
</script>

<div class="relative" bind:this={node.current} {style}>
  <!-- Original element - becomes invisible during drag but maintains dimensions -->
  <div
    class={`
      bg-card rounded-3xl p-5 pt-6
      ${className ?? ''}
      ${isDragging.current ? 'invisible' : ''}
    `}
  >
    <div class="text-muted-foreground flex items-center justify-between">
      <div class="pl-[1.375rem]">
        <p class="relative flex items-start text-lg font-bold">
          <span class="bg-primary absolute -left-5 h-2.5 w-2.5 rounded-full"></span>
          {data.title}
        </p>
        <p class="text-sm font-medium">{data.description}</p>
      </div>

      <div class="cursor-pointer" bind:this={activatorNode.current} {...attributes.current} {...listeners.current}>
        <!-- Using standard icon approach instead of icon-[] notation -->
        <span class="icon-draghandle size-6"></span>
      </div>
    </div>

    <div class="mt-3 grid gap-2">
      {@render children(isDragging.current)}
    </div>
  </div>

  {#if isDragging.current}
    <div
      class="
        border-primary bg-primary/10 absolute inset-0 hidden rounded-3xl border border-dashed
        md:block
      "
    ></div>
  {/if}
</div>
