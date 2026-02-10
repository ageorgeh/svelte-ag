import type { WritableBox } from 'svelte-toolbelt';
import { KeyboardSensor, PointerSensor } from '@dnd-kit-svelte/svelte';
import { RestrictToWindowEdges } from '@dnd-kit-svelte/svelte/modifiers';

export const sensors = [KeyboardSensor, PointerSensor];
export const modifiers = [RestrictToWindowEdges];

// ---- Helpers ---- //
export function getTypeAndAccepts(active: Active, over: Over) {
  const activeType = active.data?.type as string;
  const overType = over?.data?.type as string | undefined;
  const accepts = (over?.data?.accepts ?? []) as string[];
  return { activeType, overType, accepts };
}

/**
 * Moves an item from an index to a different index inplace
 */
export function moveIndex<T>(arr: T[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;

  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
}

export type DataType = {
  type: WritableBox<string>;
  item: WritableBox<{ id: string } | { idx: number }>;
  parent: WritableBox<{ id: string; children: any[]; setChildren: (i: any[]) => void }>;
};

export type DataInputType = {
  type: string;
  item: { id: string } | { idx: number };
  parent: { id: string; children: any[]; setChildren: (i: any[]) => void };
};

// See dnd-sortable-item.svelte for the input type for this data
export function data(input: { data?: any }): DataType {
  const data = input.data as {
    type: WritableBox<string>;
    item: WritableBox<any>;
    parent: WritableBox<any>;
  };
  return {
    type: data.type,
    item: data.item,
    parent: data.parent
  };
}

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
