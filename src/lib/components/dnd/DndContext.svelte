<!-- https://next.dndkit.com/react/components/drag-drop-provider -->

<script lang="ts" module>
  import { DragDropProvider, type DragDropEvents } from '@dnd-kit-svelte/svelte';
  import { getContext, setContext, type Snippet } from 'svelte';
  import type { WritableBox } from 'svelte-toolbelt';

  export type DndContextProps<T extends { id: string }> = {
    children?: Snippet;
    onBeforeDragStart?: DragDropEvents<T>['beforedragstart'];
    onCollision?: DragDropEvents<T>['collision'];
    onDragStart?: DragDropEvents<T>['dragstart'];
    onDragMove?: DragDropEvents<T>['dragmove'];
    onDragOver?: DragDropEvents<T>['dragover'];
    onDragEnd?: DragDropEvents<T>['dragend'];
    items: T[];
  };

  export type DndState<T> = {
    items: WritableBox<T[]>;
  };

  const SYMBOL_KEY = 'dnd-context';

  /**
   * Instantiates a new `DndState` instance and sets it in the context.
   *
   * @param props The constructor props for the `DndState` class.
   * @returns  The `DndState` instance.
   */
  export function setDnd<T>(dnd: DndState<T>): DndState<T> {
    return setContext(Symbol.for(SYMBOL_KEY), dnd);
  }

  /**
   * Retrieves the `DndState` instance from the context. This is a class instance,
   * so you cannot destructure it.
   * @returns The `DndState` instance.
   */
  export function useDnd<T>(): DndState<T> {
    return getContext(Symbol.for(SYMBOL_KEY));
  }
</script>

<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import { RestrictToWindowEdges } from '@dnd-kit-svelte/svelte/modifiers';
  import { findItem, sensors } from './utils.svelte.js';
  import { box } from 'svelte-toolbelt';

  let { children, items = $bindable(), onDragEnd, ...rest }: DndContextProps<T> = $props();

  const dnd = setDnd<T>({
    items: box.with(
      () => items,
      (v) => (items = v)
    )
  });
</script>

<DragDropProvider
  {sensors}
  modifiers={[RestrictToWindowEdges]}
  onDragEnd={(e, m) => {
    const targetId = e.operation.target?.id;
    const sourceId = e.operation.source?.id;

    if (targetId && sourceId) {
      const sourceDetails = findItem(sourceId, dnd.items.current);
      const targetList =
        findItem(targetId, dnd.items.current)?.item.children ?? (targetId !== undefined ? items : undefined);

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
    onDragEnd?.(e, m);
  }}
  {...rest}
>
  {@render children?.()}
</DragDropProvider>
