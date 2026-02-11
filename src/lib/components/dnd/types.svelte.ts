import type { DragDropProvider } from '@dnd-kit-svelte/svelte';

import type { ComponentProps } from 'svelte';

export type OnDragEnd = ComponentProps<DragDropProvider>['onDragEnd'];
export type OnDragOver = ComponentProps<DragDropProvider>['onDragOver'];
export type OnDragStart = ComponentProps<DragDropProvider>['onDragStart'];
export type OnDragMove = ComponentProps<DragDropProvider>['onDragMove'];

export type { DndContextProps } from './DndContext.svelte';
export type { DndItemProps, DndItemChildProps } from './DndItem.svelte';
export type { DndSortableItemProps } from './DndSortableItem.svelte';
