import type { Active, Over } from '@dnd-kit-svelte/core';

// --------------------- Helpers ---------------------
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
  type: string;
  item: { id: string };
  parent: { id: string; children: any[] };
};

export type DataInputType = {
  type: string;
  item: { id: string };
  parent: { id: string; children: any[] };
};

// See dnd-sortable-item.svelte for the input type for this data
export function data(input: { data: any }): DataType {
  return {
    type: input.data?.type(),
    item: input.data?.item(),
    parent: input.data?.parent()
  };
}
