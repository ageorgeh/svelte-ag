import type { DragEndEvent, DragOverEvent } from '@dnd-kit-svelte/core';
import { data, moveIndex } from './utils.svelte';
import type { DndState } from './context.svelte';

// TODO - cleanly add in a way to parse in an order and then sort it here, instead of sorting by drag
// Essentially this means only moving between lists - in the same list theyre pre sorted

// --------------------- Handlers ---------------------

export function onDragEnd({ active, over, dnd }: DragEndEvent & { dnd: DndState<any> }) {
  if (!over) return;
  if (!dnd.activeParent) throw new Error('No active parent found');

  // const { activeType, overType, accepts } = getTypeAndAccepts(active, over);
  const activeData = data(active);
  const overData = data(over);
  // Add this in as well accepts.includes(activeType)
  if (activeData.type === overData.type) {
    if (dnd.activeParent.id === overData.parent.id) {
      // Same containing list reorder
      const oldIndex = dnd.activeParent.children.findIndex((item) => item.id === active.id);
      const newIndex = overData.parent.children.findIndex((item) => item.id === over.id);

      moveIndex(dnd.activeParent.children, oldIndex, newIndex);
    } else {
      // Move between containing lists

      const item = activeData.item;

      // Remove from the old list
      const list = dnd.activeParent.children;
      const index = list.indexOf(item);
      if (index !== -1) list.splice(index, 1);

      // Add to the new list
      const targetList = overData.parent.children;
      const insertIndex = targetList.findIndex((sibling) => sibling.id === over.id);
      overData.parent.children.splice(insertIndex, 0, item);

      dnd.activeParent = overData.parent;
    }
  }
}

export function onDragOver({ active, over, dnd }: DragOverEvent & { dnd: DndState<any> }) {
  if (!over) return;
  if (!dnd.activeParent) throw new Error('No active parent found');

  const activeData = data(active);
  const overData = data(over);

  //   dnd.activeType = activeType;

  // add this accepts.includes(activeType)

  if (activeData.type === overData.type) {
    if (dnd.activeParent.id === overData.parent.id) {
      // Same list dragover - no action needed during dragover for same list
    } else {
      // // Move between containing lists during dragover
      //
      // // Find the item in the source list
      // const item = activeData.item;
      // if (!item) return;
      //
      // // Remove from source list
      // const sourceList = dnd.activeParent.children;
      // const sourceIndex = sourceList.indexOf(item);
      // if (sourceIndex !== -1) {
      //   sourceList.splice(sourceIndex, 1);
      //
      //   // Add to target list
      //   const targetList = overData.parent.children;
      //   targetList.push(item);
      //
      //   dnd.activeParent = overData.parent;
      // }
    }
  }
}

export default {
  onDragEnd,
  onDragOver
};
