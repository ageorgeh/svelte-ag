<script lang="ts">
  import { createDroppable, type CreateDroppableInput } from '@dnd-kit/svelte';
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  interface DroppableProps extends CreateDroppableInput {
    children: Snippet<[{ isDropTarget: boolean }]>;
    class?: ClassValue;
  }

  let { children, class: className, ...rest }: DroppableProps = $props();

  // svelte-ignore state_referenced_locally
  const droppable = createDroppable(rest);
</script>

<div class={className} {@attach droppable.attach}>
  {@render children({ isDropTarget: droppable.isDropTarget })}
</div>
