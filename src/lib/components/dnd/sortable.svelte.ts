import { data, moveIndex } from './utils.svelte';
import type { DragEndProps, DragOverProps, DragStartProps } from './types';

// TODO - cleanly add in a way to parse in an order and then sort it here, instead of sorting by drag
// Essentially this means only moving between lists - in the same list theyre pre sorted

// --------------------- Handlers ---------------------

/**
 * Sets state for the active item when dragging starts
 */
function onDragStart({ active, dnd }: DragStartProps) {
  const d = data(active);
  dnd.activeType = d.type.current;
  dnd.activeItem = d.item.current;
  dnd.activeParent = d.parent.current;
}

export function onDragEnd({ active, over, dnd }: DragEndProps) {
  if (!over) return;
  if (!dnd.activeParent) throw new Error('No active parent found');

  // const { activeType, overType, accepts } = getTypeAndAccepts(active, over);
  const activeData = data(active);
  const overData = data(over);
  // Add this in as well accepts.includes(activeType)

  // console.log('Acitve/over', $state.snapshot(activeData), $state.snapshot(overData));
  const usesId = 'id' in activeData.item.current;

  if (activeData.type.current === overData.type.current) {
    if (dnd.activeParent.id === overData.parent.current.id) {
      // Same containing list reorder
      const oldIndex = usesId
        ? dnd.activeParent.children.findIndex((item) => item.id === active.id)
        : activeData.item.current.idx;

      const newIndex = usesId
        ? overData.parent.current.children.findIndex((item) => item.id === over.id)
        : overData.item.current.idx;

      console.log('Drag end reorder', oldIndex, newIndex);

      if (oldIndex !== newIndex) moveIndex(dnd.activeParent.children, oldIndex, newIndex);

      // const arr = $state.snapshot(dnd.activeParent.children);
      // const [item] = arr.splice(oldIndex, 1);
      // arr.splice(newIndex, 0, item);
      // activeData.parent.current.setChildren(arr);
    } else {
      // Move between containing lists

      console.log('Drag end moving between lists', activeData.item.current.id, overData.item.current.id);
      const item = activeData.item;

      // Remove from the old list
      const list = dnd.activeParent.children;
      const index = list.indexOf(item);
      if (index !== -1) list.splice(index, 1);

      // Add to the new list
      const targetList = overData.parent.current.children;
      const insertIndex = targetList.findIndex((sibling) => sibling.id === over.id);
      overData.parent.current.children.splice(insertIndex, 0, item);

      dnd.activeParent = overData.parent.current;
    }
  }
}

export function onDragOver({ active, over, dnd }: DragOverProps) {
  if (!over) return;
  if (!dnd.activeParent) throw new Error('No active parent found');

  const activeData = data(active);
  const overData = data(over);

  const usesId = 'id' in activeData.item.current;

  // add this accepts.includes(activeType)

  if (usesId && activeData.item.current.id === overData.item.current.id) return;

  if (activeData.type.current === overData.type.current) {
    if (dnd.activeParent.id === overData.parent.current.id) {
      // console.log('Same list dragover');
      // Same list dragover - no action needed during dragover for same list
    } else {
      // console.log('Moving between lists', activeData.item.current.id, overData.item.current.id);
      // console.log(dnd.activeParent.id, overData.parent.current.id);

      // Move between containing lists during dragover

      // Find the item in the source list
      const item = activeData.item.current;

      // Remove from source list
      const sourceList = dnd.activeParent.children;
      const sourceIndex = sourceList.indexOf(item);
      const targetList = overData.parent.current.children;

      sourceList.splice(sourceIndex, 1);
      targetList.push(item);

      dnd.activeParent = overData.parent.current;
    }
  }
}

export default {
  onDragEnd,
  onDragOver,
  onDragStart
};
