import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit-svelte/core';
import type { DndState } from './context.svelte';

export type DragEndProps = DragEndEvent & { dnd: DndState<any> };
export type DragOverProps = DragOverEvent & { dnd: DndState<any> };
export type DragStartProps = DragStartEvent & { dnd: DndState<any> };
export type DragMoveProps = DragStartEvent & { dnd: DndState<any> };
