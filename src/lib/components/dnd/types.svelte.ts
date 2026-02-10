import type { DragDropProvider } from '@dnd-kit-svelte/svelte';

import type { DndState } from './context.svelte';
import type { ComponentProps } from 'svelte';

export type DragEndProps = Parameters<NonNullable<ComponentProps<DragDropProvider>['onDragEnd']>>[0];
export type DragOverProps = Parameters<NonNullable<ComponentProps<DragDropProvider>['onDragOver']>>[0];
export type DragStartProps = Parameters<NonNullable<ComponentProps<DragDropProvider>['onDragStart']>>[0];
export type DragMoveProps = Parameters<NonNullable<ComponentProps<DragDropProvider>['onDragMove']>>[0];

export type { DndContextProps } from './dnd-context.svelte';
export type { DndItemProps, DndItemChildProps } from './dnd-item.svelte';
export type { DndSortableItemProps } from './dnd-sortable-item.svelte';
