<script lang="ts" module>
  export type IData = {
    id: string;
    title: string;
    description: string;
  };

  interface ItemProps {
    data: IData;
    type: 'item' | 'container';
  }
</script>

<script lang="ts">
  import { CSS, styleObjectToString } from '@dnd-kit-svelte/utilities';
  import { useSortable } from '@dnd-kit-svelte/sortable';

  let { data, type }: ItemProps = $props();

  const { attributes, listeners, node, activatorNode, transform, transition, isDragging, isSorting, isOver } =
    useSortable({
      id: data.id,
      data: { type }
    });

  const style = $derived(
    styleObjectToString({
      transform: CSS.Transform.toString(transform.current),
      transition: isSorting.current ? transition.current : undefined,
      zIndex: isDragging.current ? 1 : undefined
    })
  );
</script>

<div class="relative select-none" bind:this={node.current} {style}>
  <!-- Original element - becomes invisible during drag but maintains dimensions -->
  <div
    class={`
      bg-card flex items-center justify-between rounded-2xl p-3
      ${isDragging.current ? 'invisible' : ''}
      ${isOver.current ? `bg-primary/5` : ''}
    `}
  >
    <div>
      <p class="text-lg font-bold">{data.title}</p>
      <p class="text-muted-foreground text-sm">{data.description}</p>
    </div>

    <div class="" bind:this={activatorNode.current} {...attributes.current} {...listeners.current}>
      <span class="icon-draghandle text-muted-foreground size-6 cursor-pointer"></span>
    </div>
  </div>

  <!-- Drag placeholder -->
  {#if isDragging.current}
    <div class="absolute inset-0 flex items-center justify-center">
      <!-- You can put any content here for the dragging state -->
      <div
        class="
          border-primary bg-primary/10 flex h-full w-full items-center justify-center rounded-2xl border-2 border-dashed
        "
      >
        <span class="text-primary">Moving: {data.title}</span>
      </div>
    </div>
  {/if}
</div>
