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
  import { move } from '@dnd-kit/helpers';
  import { box } from 'svelte-toolbelt';
  import { findItem } from './utils.svelte';

  let { children, items = $bindable(), onDragEnd, ...rest }: DndContextProps<T> = $props();

  setDnd({
    items: box.with(
      () => items,
      (v) => (items = v)
    )
  });

  let snapshot: Item[] = [];

  function done(e: Parameters<NonNullable<DndContextProps<T>['onDragEnd']>>[0]) {
    const targetId = e.operation.target?.id;
    const sourceId = e.operation.source?.id;

    if (targetId && sourceId) {
      const sourceDetails = findItem(sourceId, items);
      const targetList = findItem(targetId, items)?.item.children ?? (targetId !== undefined ? items : undefined);

      if (sourceDetails && targetList) {
        const item = sourceDetails.list.splice(sourceDetails.index, 1)[0];

        if (e.operation.source && 'index' in e.operation.source && typeof e.operation.source.index === 'number') {
          // present in sorted lists
          targetList.splice(e.operation.source.index, 0, item);
        } else {
          targetList.push(item);
        }
      }
    }
  }
</script>

<DragDropProvider
  onDragStart={() => {
    snapshot = items.slice();
  }}
  onDragOver={(event) => {
    items = move(items, event);
  }}
  onDragEnd={(e, m) => {
    if (e.canceled) {
      items = snapshot;
    }
    done(e);
    onDragEnd?.(e, m);
  }}
  {...rest}
>
  {@render children?.()}
</DragDropProvider>
