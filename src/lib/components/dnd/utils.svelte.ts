import type { Active, Over } from '@dnd-kit-svelte/core';
import type { WritableBox } from 'svelte-toolbelt';

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
