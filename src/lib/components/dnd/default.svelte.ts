import { data } from './utils.svelte';
import type { DragEndProps, DragOverProps, DragStartProps } from './types.js';

// --------------------- Handlers ---------------------

/**
 * Sets state for the active item when dragging starts
 */
function onDragStart({ active, dnd }: DragStartProps) {
  const d = data(active);
  dnd.activeType = d.type?.current;
  dnd.activeItem = d.item?.current;

  // console.log('Drag start', dnd.activeItem!.id);
}

export function onDragEnd({ active, over, dnd }: DragEndProps) {}

export function onDragOver({ active, over, dnd }: DragOverProps) {}

export default {
  onDragEnd,
  onDragOver,
  onDragStart
};
