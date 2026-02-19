<script lang="ts">
  import { useDroppable, type UseDroppableInput } from '@dnd-kit-svelte/svelte';
  import type { ClassValue } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  interface DroppableProps extends UseDroppableInput {
    children: Snippet<[{ isDropTarget: boolean }]>;
    class?: ClassValue;
  }

  let { children, class: className, ...rest }: DroppableProps = $props();

  // svelte-ignore state_referenced_locally
  const { ref, isDropTarget } = useDroppable(rest);
</script>

<div class={className} {@attach ref}>
  {@render children({ isDropTarget: isDropTarget.current })}
</div>
