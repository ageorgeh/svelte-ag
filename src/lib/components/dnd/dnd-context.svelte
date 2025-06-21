<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit-svelte/core';

  export type ContextProps = {
    children: Snippet<[]>;
    onDragEnd?: (event: DragEndEvent & { dnd: DndState<any> }) => void;
    onDragOver?: (event: DragOverEvent & { dnd: DndState<any> }) => void;
    onDragStart?: (event: DragStartEvent & { dnd: DndState<any> }) => void;
  };
</script>

<script lang="ts" generics="T extends {id: string}">
  import { DndContext, useSensors, KeyboardSensor, MouseSensor, TouchSensor, useSensor } from '@dnd-kit-svelte/core';
  import type { DndState } from './context.svelte';
  import { setDnd, useDnd } from './context.svelte';

  setDnd<T>();

  const dnd = useDnd<T>();

  const sensors = useSensors(useSensor(TouchSensor), useSensor(KeyboardSensor), useSensor(MouseSensor));

  let { onDragEnd, onDragOver, onDragStart, children }: ContextProps = $props();
</script>

<DndContext
  {sensors}
  onDragStart={(e) => onDragStart?.({ ...e, dnd })}
  onDragEnd={(e) => onDragEnd?.({ ...e, dnd })}
  onDragOver={(e) => onDragOver?.({ ...e, dnd })}
>
  {@render children()}
</DndContext>
