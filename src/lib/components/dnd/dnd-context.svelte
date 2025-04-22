<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import { DragOverlay, type DragStartEvent } from '@dnd-kit-svelte/core';

  export type ContextProps = {
    children: Snippet<[]>;
    onDragEnd: (event: DragEndEvent & { dnd: DndState<any> }) => void;
    onDragOver: (event: DragOverEvent & { dnd: DndState<any> }) => void;
  };
</script>

<script lang="ts" generics="T">
  import type { DragEndEvent, DragOverEvent } from '@dnd-kit-svelte/core';
  import { DndContext, useSensors, KeyboardSensor, MouseSensor, TouchSensor, useSensor } from '@dnd-kit-svelte/core';
  import type { DndState } from './context.svelte';
  import { setDnd, useDnd } from './context.svelte';
  import { data } from './utils.svelte';

  setDnd<T>();

  const dnd = useDnd<T>();

  /**
   * Sets state for the active item when dragging starts
   */
  function onDragStart({ active }: DragStartEvent) {
    const d = data(active);
    dnd.activeType = d.type;
    dnd.activeItem = d.item;
    dnd.activeParent = d.parent;
  }

  const sensors = useSensors(useSensor(TouchSensor), useSensor(KeyboardSensor), useSensor(MouseSensor));

  let { onDragEnd, onDragOver, children }: ContextProps = $props();
</script>

<DndContext
  {sensors}
  {onDragStart}
  onDragEnd={(e) => onDragEnd({ ...e, dnd })}
  onDragOver={(e) => onDragOver({ ...e, dnd })}
>
  {@render children()}
</DndContext>
