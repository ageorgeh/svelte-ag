<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { DragEndProps, DragStartProps, DragMoveProps, DragOverProps } from './types.js';

  export type ContextProps = {
    children: Snippet<[]>;
    onDragEnd?: (event: DragEndProps) => void;
    onDragOver?: (event: DragOverProps) => void;
    onDragStart?: (event: DragStartProps) => void;
    onDragMove?: (event: DragMoveProps) => void;
  };
</script>

<script lang="ts" generics="T extends {id: string}">
  import { DndContext, useSensors, KeyboardSensor, MouseSensor, TouchSensor, useSensor } from '@dnd-kit-svelte/core';
  import { setDnd, useDnd } from './context.svelte';

  setDnd<T>();

  const dnd = useDnd<T>();

  const sensors = useSensors(useSensor(TouchSensor), useSensor(KeyboardSensor), useSensor(MouseSensor));

  let { onDragEnd, onDragOver, onDragStart, onDragMove, children }: ContextProps = $props();
</script>

<DndContext
  {sensors}
  onDragStart={(e) => onDragStart?.({ ...e, dnd })}
  onDragEnd={(e) => onDragEnd?.({ ...e, dnd })}
  onDragOver={(e) => onDragOver?.({ ...e, dnd })}
  onDragMove={(e) => onDragMove?.({ ...e, dnd })}
>
  {@render children()}
</DndContext>
