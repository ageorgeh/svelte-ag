import type { DndContextProps } from './DndContext.svelte';

export type OnDragEnd = DndContextProps<any>['onDragEnd'];
export type OnDragOver = DndContextProps<any>['onDragOver'];
export type OnDragStart = DndContextProps<any>['onDragStart'];
export type OnDragMove = DndContextProps<any>['onDragMove'];

export type { DndContextProps } from './DndContext.svelte';
export type { DndItemProps, DndItemChildProps } from './DndItem.svelte';
export type { DndSortableItemProps } from './DndSortableItem.svelte';
