<!-- 
@component 
This is a wrapper around https://dndkit.com/svelte/components/drag-drop-provider/
It makes state handling and items sorting easier 
-->

<script lang="ts" module>
  import { createContext, type ComponentProps } from 'svelte';
  import type { WritableBox } from 'svelte-toolbelt';

  export type Item = { id: string; children?: Item[] };

  export type DndState = {
    items: WritableBox<Item[]>;
  };

  export type DndContextProps<T extends { id: string; children?: T[] }> = ComponentProps<typeof DragDropProvider> & {
    items: Item[];
  };

  export const [getDnd, setDnd] = createContext<DndState>();
</script>

<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import { DragDropProvider } from '@dnd-kit/svelte';
  // import { move } from '@dnd-kit/helpers';
  import { box } from 'svelte-toolbelt';

  import { findItem } from './utils.svelte';

  let { children, items = $bindable(), onDragOver, onDragEnd, onDragStart, ...rest }: DndContextProps<T> = $props();

  setDnd({
    items: box.with(
      () => items,
      (v) => (items = v)
    )
  });

  let snapshot: Item[] = [];
  let original: Item[] = [];

  type Event =
    | Parameters<NonNullable<DndContextProps<T>['onDragEnd']>>[0]
    | Parameters<NonNullable<DndContextProps<T>['onDragOver']>>[0];

  /**
   * Moves items based on the event in place in the snapshot array
   *
   * You should set the items array to equal `snapshot` after calling this
   */
  function myMove(e: Event) {
    const targetId = e.operation.target?.id;
    const sourceId = e.operation.source?.id;

    if (targetId && sourceId) {
      const isSortable =
        ('index' in e.operation.target! && e.operation.target!.index !== undefined) ||
        ('index' in e.operation.source! && e.operation.source!.index !== undefined);

      const source = findItem(sourceId, snapshot);
      const target = findItem(targetId, snapshot);

      if (!target || !source) return;
      if (isSortable) {
        if (source.list === target.list && source.index === target.index) return;

        const item = source.list.splice(source.index, 1)[0];
        target.list.splice(target.index, 0, item);
      } else {
        // Non sortable means targets are droppable areas so the list of items
        // to target is its children
        const targetList = target.item.children;
        if (targetList && targetList !== source.list) {
          const item = source.list.splice(source.index, 1)[0];
          targetList.push(item);
        }
      }
    }
  }
</script>

<DragDropProvider
  onDragStart={(e, m) => {
    snapshot = structuredClone($state.snapshot(items));
    original = structuredClone($state.snapshot(items));

    onDragStart?.(e, m);
  }}
  onDragOver={(e, m) => {
    myMove(e);
    items = structuredClone(snapshot);

    onDragOver?.(e, m);
  }}
  onDragEnd={(e, m) => {
    if (e.canceled) items = original;
    else {
      myMove(e);
      items = structuredClone(snapshot);
    }

    onDragEnd?.(e, m);
  }}
  {...rest}
>
  {@render children?.()}
</DragDropProvider>
