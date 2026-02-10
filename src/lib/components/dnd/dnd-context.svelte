<!-- https://next.dndkit.com/react/components/drag-drop-provider -->

<script lang="ts" module>
  import type { ComponentProps } from 'svelte';

  export type DndContextProps<T extends { id: string }> = ComponentProps<DragDropProvider> & { items: T[] };
</script>

<script lang="ts" generics="T extends {id: string; children?: T[]}">
  import { DragDropProvider } from '@dnd-kit-svelte/svelte';
  import { setDnd } from './context.svelte';
  import { RestrictToWindowEdges } from '@dnd-kit-svelte/svelte/modifiers';
  import { findItem, sensors } from './utils.svelte.js';

  let { children, items = $bindable(), ...rest }: DndContextProps<T> = $props();

  setDnd<T>({ items });
</script>

<DragDropProvider
  {sensors}
  modifiers={[RestrictToWindowEdges]}
  {...rest}
  onDragOver={(e) => {
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
  }}
>
  {@render children?.()}
</DragDropProvider>
