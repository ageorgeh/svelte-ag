import { KeyboardSensor, PointerSensor } from '@dnd-kit-svelte/svelte';
import { RestrictToWindowEdges } from '@dnd-kit-svelte/svelte/modifiers';

export const sensors = [KeyboardSensor, PointerSensor];
export const modifiers = [RestrictToWindowEdges];

/**
 * Finds an item recursively through the dnd.items list and each item's children
 */
export function findItem<T extends { id: string; children?: T[] }>(
  id: string | number,
  items: T[]
): { item: T; list: T[]; index: number } | undefined {
  for (let index = 0; index < items.length; index++) {
    const item = items[index];

    if (item.id === id) {
      return { item, list: items, index };
    }

    if (item.children?.length) {
      const found = findItem(id, item.children);
      if (found) return found;
    }
  }
}
