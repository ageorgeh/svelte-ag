import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit-svelte/core';
import { data, moveIndex } from './utils.svelte';
import type { DndState } from './context.svelte';

// --------------------- Handlers ---------------------

/**
 * Sets state for the active item when dragging starts
 */
function onDragStart({ active, dnd }: DragStartEvent & { dnd: DndState<any> }) {
  const d = data(active);
  dnd.activeType = d.type?.current;
  dnd.activeItem = d.item?.current;

  // console.log('Drag start', dnd.activeItem!.id);
}

export function onDragEnd({ active, over, dnd }: DragEndEvent & { dnd: DndState<any> }) {}

export function onDragOver({ active, over, dnd }: DragOverEvent & { dnd: DndState<any> }) {}

export default {
  onDragEnd,
  onDragOver,
  onDragStart
};
