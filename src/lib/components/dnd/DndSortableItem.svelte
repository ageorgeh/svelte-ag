<script lang="ts" module>
  import { createContext, type Snippet } from 'svelte';

  export type SortableItemChildProps = {
    isDragging: boolean;
    isOverlay: boolean;
    sortable?: ReturnType<typeof createSortable>;
  };

  export type DndSortableItemProps = CreateSortableInput & {
    child: Snippet<[SortableItemChildProps]>;
  };

  export type ItemContext = {
    isDragging: ReturnType<typeof createSortable>['isDragging'];
    attachHandle: ReturnType<typeof createSortable>['attachHandle'];
  };

  export const [getItem, setItem] = createContext<ItemContext>();
</script>

<script lang="ts">
  import { createSortable, type CreateSortableInput } from '@dnd-kit/svelte/sortable';

  let { id, index, child, ...rest }: DndSortableItemProps = $props();

  const sortable = createSortable({
    get id() {
      return id;
    },
    transition: { idle: true },
    get index() {
      return index;
    },
    ...rest
  });

  setItem({
    attachHandle: sortable.attachHandle,
    isDragging: sortable.isDragging
  });
</script>

{@render child({
  sortable,
  isDragging: sortable.isDragging,
  isOverlay: false
})}
