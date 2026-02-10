<script lang="ts" module>
  import { getContext, setContext, type Snippet } from 'svelte';

  export type SortableItemChildProps = {
    isDragging: boolean;
    isOverlay: boolean;
  };

  export type DndSortableItemProps = UseSortableInput &
    HTMLDivAttributes & {
      child: Snippet<[SortableItemChildProps]>;
    };

  const itemSymbolKey = 'sortable-item';

  export type ItemContext = {
    isDragging: ReturnType<typeof useSortable>['isDragging'];
    handleRef: Attachment<Element>;
  };

  export function setItemContext(item: ItemContext) {
    setContext(Symbol.for(itemSymbolKey), item);
  }

  export function getItemContext(): ItemContext {
    return getContext(Symbol.for(itemSymbolKey));
  }
</script>

<script lang="ts">
  import { useSortable, type UseSortableInput } from '@dnd-kit-svelte/svelte/sortable';
  import type { HTMLDivAttributes } from '$utils/bits.js';
  import { cn } from '$utils/utils.js';
  import type { Attachment } from 'svelte/attachments';

  let { class: className, child, ...rest }: DndSortableItemProps = $props();

  const { ref, handleRef, isDragging } = useSortable({ ...rest, feedback: 'move' });

  setItemContext({ handleRef, isDragging });
</script>

<div class={cn('relative', className)} {@attach ref}>
  {@render child({
    isDragging: isDragging.current,
    isOverlay: false
  })}
</div>
